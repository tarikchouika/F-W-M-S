// FWMS — نبضات الموقع الأني (المرحلة 9): العضو يرسل موقعه أثناء فتح اللوحة،
// والخادم يقيّم الانتقالات على كل فرقه ويخطر قادة الفرق فورًا.
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth/session";
import { AccessError } from "@/lib/rbac";
import { recordPingAndEvaluate } from "@/lib/team-presence";
import { rateLimit } from "@/lib/rate-limit";

// تحديد معدل النبضات (فحص أمني 2026-10-19): المسار يكتب صفًا في كل طلب
// (MemberLocationPing) ⇒ أمطار النبضات تستهلك كاتب SQLite الوحيد (~38 كتابة/ث)
// وتضخّم الجدول بلا حدّ. المراقب (watcher) يرسل كل 15-60 ثانية ⇒ 120/دقيقة
// هامش واسع فوق السلوك الطبيعي.
const PING_RATE_LIMIT = 120;
const PING_RATE_WINDOW_MS = 60_000;

const pingSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  accuracyM: z.number().min(0).max(100000).nullish(),
  source: z.enum(["watcher", "manual"]).default("watcher"),
});

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) throw new AccessError(401, "unauthenticated");

    const rl = rateLimit(`location-pings:${session.sub}`, PING_RATE_LIMIT, PING_RATE_WINDOW_MS);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "rate_limited", retryAfterMs: rl.retryAfterMs },
        { status: 429, headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) } },
      );
    }

    const parsed = pingSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "invalid_input" }, { status: 400 });
    }

    const result = await recordPingAndEvaluate({
      companyId: session.companyId,
      userId: session.sub,
      lat: parsed.data.lat,
      lng: parsed.data.lng,
      accuracyM: parsed.data.accuracyM ?? null,
      source: parsed.data.source,
    });

    return NextResponse.json({
      ok: true,
      pingId: result.pingId,
      evaluations: result.evaluations,
    });
  } catch (error) {
    if (error instanceof AccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[location-pings]", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
