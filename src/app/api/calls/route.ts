// FWMS — الاتصال المباشر (بلاغ المالك 2026-10-24): صوت وصورة آني بين مستخدمَين
// «الإتصال المباشر صوت و صورة يجب إستهلاكه بشكل أني بين المرسل و المتلقي
//  و لايتم تخزينه في المنصة»
// ---------------------------------------------------------------------------
// البنية: WebRTC نظير-إلى-نظير — الوسائط (صوت/فيديو) تتدفق مباشرة بين
// المتصفحَين مشفّرة (DTLS-SRTP) ولا تمرّ بالخادم ولا تُخزَّن إطلاقًا. الخادم
// يدير التأشير وحده (ring/offer/answer/ice/end/decline) عبر جدول CallSignal
// قصير العمر (يُحذف خلال دقائق) وتوصله قناة SSE الآنية (~2ث).
// الوصول: نفس عزل المراسلة (direct-messaging.ts) — العضو داخل فريقه، والإشراف
// يخاطب الجميع؛ لا اتصال مع من لا يجوز محادثته نصيًا.
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { AccessError, roleHas } from "@/lib/rbac";
import { hasPermission } from "@/lib/delegations";
import { rateLimit } from "@/lib/rate-limit";
import { writeAudit } from "@/lib/audit";
import { localizedName } from "@/lib/localized-name";
import { getUiLocale } from "@/i18n/ui-locale";
import { canConverseWith, canOpenThread, messagingAccess } from "@/lib/direct-messaging";

const startSchema = z.object({
  to: z.string().min(1).max(64),
  media: z.enum(["audio", "video"]),
});

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) throw new AccessError(401, "unauthenticated");
    const canUse = roleHas(session.role, "voice.use") || (await hasPermission(session as never, "voice.use"));
    if (!canUse) throw new AccessError(403, "forbidden");

    // حدّ معقول: 20 محاولة اتصال/10 دقائق — الاتصال ليس قناة إزعاج
    const rl = rateLimit(`call:${session.sub}`, 20, 10 * 60 * 1000);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "rate_limited", retryAfterMs: rl.retryAfterMs },
        { status: 429, headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) } },
      );
    }

    const body = await req.json().catch(() => null);
    const parsed = startSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });
    const { to, media } = parsed.data;
    if (to === session.sub) return NextResponse.json({ error: "self_call" }, { status: 422 });

    // نفس عزل المراسلة: فريق مشترك أو إشراف أو خيط قائم مع طرف مخوّل
    const access = await messagingAccess(session);
    const conversable = await canConverseWith(access, session, to);
    const openThread = conversable ? true : await canOpenThread(access, session, to);
    if (!openThread) throw new AccessError(403, "forbidden");

    // الطرف الآخر في الشركة ونشط؟
    const other = await db.userMembership.findFirst({
      where: { companyId: session.companyId, userId: to, revokedAt: null, user: { isActive: true } },
      select: { id: true },
    });
    if (!other) return NextResponse.json({ error: "user_not_found" }, { status: 404 });

    // مشغول؟ اتصال جارٍ لي أو عليه (ringing/active خلال آخر 3 دقائق)
    const now = new Date();
    const busyWindow = new Date(now.getTime() - 3 * 60 * 1000);
    const busy = await db.callSession.findFirst({
      where: {
        OR: [{ callerId: to }, { calleeId: to }],
        status: { in: ["ringing", "active"] },
        createdAt: { gte: busyWindow },
      },
      select: { id: true },
    });
    if (busy) return NextResponse.json({ error: "callee_busy" }, { status: 409 });

    // اسم المتصل بلغة واجهة الطرف الآخر (عرض شاشة الاتصال الوارد)
    const locale = await getUiLocale();
    const me = await db.user.findUnique({ where: { id: session.sub }, select: { fullName: true, names: true } });
    const callerName = me ? localizedName(me, locale, "fullName") : session.name || session.email;

    const call = await db.callSession.create({
      data: { companyId: session.companyId, callerId: session.sub, calleeId: to, media, status: "ringing" },
      select: { id: true, createdAt: true },
    });

    // إشارة الرن: اسم المتصل ووسيطه — تصل للمتلقّي عبر SSE خلال ~2ث
    await db.callSignal.create({
      data: {
        companyId: session.companyId,
        callId: call.id,
        fromUserId: session.sub,
        toUserId: to,
        kind: "ring",
        payloadJson: JSON.stringify({ media, callerName }),
      },
    });

    await writeAudit({
      companyId: session.companyId,
      userId: session.sub,
      action: "call.started",
      entity: "call_session",
      entityId: call.id,
      after: { calleeId: to, media },
    });

    return NextResponse.json({ ok: true, callId: call.id }, { status: 201 });
  } catch (error) {
    if (error instanceof AccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[calls POST]", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
