// HRMP — تأشير اتصال مباشر (بلاغ المالك 2026-10-24): offer/answer/ice/end/decline
// إشارات تأسيس WebRTC وحدها تمرّ هنا — SDP ومرشحو ICE، أجسام JSON صغيرة قصيرة
// العمر. الوسائط نفسها تتدفق نظير-إلى-نظير ولا تلمس الخادم أبدًا.
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { AccessError } from "@/lib/rbac";
import { rateLimit } from "@/lib/rate-limit";

// ICE كثيرة بطبيعتها (تتقاطر أثناء الاكتشاف) — الحدّ يمنع إغراق الجدول
const SIGNAL_RATE_LIMIT = 240;
const SIGNAL_RATE_WINDOW_MS = 60_000;

const signalSchema = z.object({
  kind: z.enum(["offer", "answer", "ice", "end", "decline"]),
  payload: z.unknown().optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSession();
    if (!session) throw new AccessError(401, "unauthenticated");

    const { id } = await params;
    const body = await req.json().catch(() => null);
    const parsed = signalSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });
    const { kind } = parsed.data;
    const payload = parsed.data.payload ?? {};

    // حجب الإغراق: مرشحو ICE قد يكونون عشرات في الثانية الأولى
    const rl = rateLimit(`sig:${session.sub}`, SIGNAL_RATE_LIMIT, SIGNAL_RATE_WINDOW_MS);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "rate_limited", retryAfterMs: rl.retryAfterMs },
        { status: 429, headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) } },
      );
    }

    // الاتصال موجود وأنا أحد طرفيه (في شركتي)
    const call = await db.callSession.findFirst({
      where: { id, companyId: session.companyId },
      select: { id: true, callerId: true, calleeId: true, status: true, media: true, startedAt: true },
    });
    if (!call) return NextResponse.json({ error: "not_found" }, { status: 404 });
    if (call.callerId !== session.sub && call.calleeId !== session.sub) {
      throw new AccessError(403, "forbidden");
    }

    const toUserId = call.callerId === session.sub ? call.calleeId : call.callerId;
    const now = new Date();

    // إنهاء/رفض: تحديث حالة الجلسة (للتدقيق) ثم إشارة للطرف الآخر
    if (kind === "end" || kind === "decline") {
      const status = kind === "decline" ? "declined" : call.startedAt ? "ended" : "missed";
      await db.callSession.update({
        where: { id: call.id },
        data: { status, endedAt: now },
      });
      await db.callSignal.create({
        data: {
          companyId: session.companyId,
          callId: call.id,
          fromUserId: session.sub,
          toUserId,
          kind,
          payloadJson: JSON.stringify({}),
        },
      });
      return NextResponse.json({ ok: true, status });
    }

    // انشغال: المتلقّي على اتصال آخر جارٍ (يرفض الاستلام بلطف)
    if (kind === "answer" && call.status === "ended") {
      return NextResponse.json({ error: "call_ended" }, { status: 409 });
    }

    // أول إجابة = الوسائط اتصلت فعليًا (startedAt للتدقيق — لا محتوى هنا أبدًا)
    if (kind === "answer" && !call.startedAt) {
      await db.callSession.update({
        where: { id: call.id },
        data: { status: "active", startedAt: now },
      });
    }

    await db.callSignal.create({
      data: {
        companyId: session.companyId,
        callId: call.id,
        fromUserId: session.sub,
        toUserId,
        kind,
        payloadJson: JSON.stringify(payload).slice(0, 16_000), // SDP/ICE صغيرة أصلًا — حارس
      },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof AccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[calls/signal POST]", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
