// FWMS — قناة الأحداث الآنية (SSE) للمراسلة والحضور (بلاغ المالك 2026-10-24)
// ---------------------------------------------------------------------------
// «خاصيات المراسلة الصوتية والبصرية والموقع الجغرافي بين المستخدمين يجب
//  مزامنتها بشكل أني عبر المنصة بشكل مباشر حسب الصلاحيات» — بدل الاستطلاع
// الثابت (15ث صوتيات · 30ث حضور · 20ث إشعارات) تصل الأحداث لحظة وقوعها:
//  - event: voice    رسالة صوتية جديدة تخصّني
//  - event: dm       رسالة مرئية/موقعية جديدة تخصّني
//  - event: notif    إشعار جديد يخصّني
//  - event: presence نبضة موقع من أحد أفراد فرقي (للقائد/الإشراف)
//  - event: call     إشارة اتصال مباشر تخصّني (ring/offer/answer/ice/end/decline)
//                    — بلاغ المالك 2026-10-24: تأشير WebRTC فقط؛ الوسائط
//                    تتدفق P2P ولا تمرّ هنا أبدًا.
// عند انقطاع الاتصال يعيد العميل الاتصال مع ?since=<ISO> فيُلحق ما فاته
// (catch-up) ثم يستمر حيًّا — لا حدث يضيع. البث heartbeat كل 15ث يبقي
// الوسطاء (بوابة Pages/النفق) من إغلاق الاتصال، وX-Accel-Buffering: no
// يمنع التخزين المؤقت. المؤقتات: فحص كل 2ث (فهارس مركّبة — رخيص على WAL).
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { AccessError, roleHas } from "@/lib/rbac";
import { hasPermission } from "@/lib/delegations";
import { messagingAccess } from "@/lib/direct-messaging";

export const maxDuration = 60; // ألف الثانية (حوسبة Vercel السائلة) — إعادة الاتصال تلقائية

const TICK_MS = 2_000;
const HEARTBEAT_MS = 15_000;
const CATCHUP_MAX_MS = 10 * 60 * 1000; // أقصى نافذة لحاق (بعدها يبدأ من الآن)
// إشارات الاتصال قصيرة العمر: ما تجاوز دقيقتين انتهى غرضه (الاتصال إما تم
// أو فات) — الحذف الكسول في كل جولة يبقي الجدول صغيرًا بلا مجدول خارجي
const SIGNAL_TTL_MS = 2 * 60 * 1000;

const sse = (event: string, data: unknown) =>
  `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

const meta = (m: { id: string; senderId?: string; userId?: string; groupId?: string | null; createdAt: Date; reportedAt?: Date }) => ({
  id: m.id,
  from: m.senderId ?? m.userId ?? null,
  groupId: m.groupId ?? null,
  at: (m.createdAt ?? m.reportedAt)?.toISOString?.() ?? null,
});

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) throw new AccessError(401, "unauthenticated");
    const me = session.sub;
    const companyId = session.companyId;

    // فرق «الاهتمام» للحضور: التي أقودها؛ وللإشراف كل فرق الشركة
    const admin = roleHas(session.role, "voice.admin") || (await hasPermission(session as never, "voice.admin"));
    const access = await messagingAccess(session);
    const isAdminMode = admin || access.admin;
    const presenceGroups = await db.workerGroup.findMany({
      where: isAdminMode
        ? { companyId, status: "active" }
        : { companyId, leaderUserId: me, status: "active" },
      select: { id: true },
    });
    const presenceGroupIds = presenceGroups.map((g) => g.id);

    // نافذة اللحاق: ?since=ISO (من العميل عند إعادة الاتصال) وإلا الآن
    const sinceParam = new URL(req.url).searchParams.get("since");
    let cursor: Date;
    if (sinceParam) {
      const t = Date.parse(sinceParam);
      cursor = Number.isFinite(t) && Date.now() - t <= CATCHUP_MAX_MS ? new Date(t) : new Date();
    } else {
      cursor = new Date();
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        let closed = false;
        let tickTimer: ReturnType<typeof setInterval> | null = null;
        let beatTimer: ReturnType<typeof setInterval> | null = null;
        let busy = false;
        const push = (chunk: string) => {
          if (!closed) controller.enqueue(encoder.encode(chunk));
        };
        const finish = () => {
          if (closed) return;
          closed = true;
          if (tickTimer) clearInterval(tickTimer);
          if (beatTimer) clearInterval(beatTimer);
          try { controller.close(); } catch { /* مُغلقة فعلًا */ }
        };
        req.signal.addEventListener("abort", finish);

        push(`retry: 3000\n`);
        push(sse("hello", { since: cursor.toISOString(), presenceGroups: presenceGroupIds.length }));

        // لحاق أولي بما فات قبل فتح القناة (إعادة اتصال)
        async function sweep(): Promise<Date> {
          let latest = cursor;
          try {
            const [voices, dms, notifs, pings, signals] = await Promise.all([
              db.voiceMessage.findMany({
                where: { recipientId: me, createdAt: { gt: cursor } },
                orderBy: { createdAt: "asc" },
                take: 25,
                select: { id: true, senderId: true, createdAt: true },
              }),
              db.directMessage.findMany({
                where: { recipientId: me, createdAt: { gt: cursor } },
                orderBy: { createdAt: "asc" },
                take: 25,
                select: { id: true, senderId: true, kind: true, createdAt: true },
              }),
              db.notification.findMany({
                where: { userId: me, createdAt: { gt: cursor } },
                orderBy: { createdAt: "asc" },
                take: 25,
                select: { id: true, type: true, createdAt: true },
              }),
              presenceGroupIds.length
                ? db.memberLocationPing.findMany({
                    where: { reportedAt: { gt: cursor }, groupId: { in: presenceGroupIds }, userId: { not: me } },
                    orderBy: { reportedAt: "asc" },
                    take: 25,
                    select: { id: true, userId: true, groupId: true, reportedAt: true },
                  })
                : Promise.resolve([] as { id: string; userId: string; groupId: string | null; reportedAt: Date }[]),
              // تأشير الاتصال الموجه إليّ (بلاغ المالك 2026-10-24)
              db.callSignal.findMany({
                where: { toUserId: me, createdAt: { gt: cursor } },
                orderBy: { createdAt: "asc" },
                take: 50,
                select: { id: true, callId: true, fromUserId: true, kind: true, payloadJson: true, createdAt: true },
              }).catch(() => [] as { id: string; callId: string; fromUserId: string; kind: string; payloadJson: string; createdAt: Date }[]),
            ]);
            for (const m of [...voices, ...dms, ...notifs, ...signals]) {
              const at = m.createdAt;
              if (at > latest) latest = at;
            }
            for (const p of pings) {
              if (p.reportedAt > latest) latest = p.reportedAt;
            }
            if (voices.length) push(sse("voice", { items: voices.map((v) => ({ ...meta(v), kind: "voice" })) }));
            if (dms.length) push(sse("dm", { items: dms.map((d) => ({ ...meta(d), kind: d.kind })) }));
            if (notifs.length) push(sse("notif", { items: notifs.map((n) => ({ id: n.id, at: n.createdAt.toISOString() })) }));
            if (pings.length) push(sse("presence", { items: pings.map((p) => ({ id: p.id, from: p.userId, groupId: p.groupId, at: p.reportedAt.toISOString() })) }));
            // إشارات الاتصال تصل كلٌّ على حدة (تشغيل فوري في العميل) — والحمولة
            // JSON صغيرة تمرّ كما هي (SDP/ICE — لا وسائط هنا أبدًا)
            for (const s of signals) {
              let payload: unknown = {};
              try {
                payload = JSON.parse(s.payloadJson);
              } catch {
                payload = {};
              }
              push(sse("call", { items: [{ id: s.id, callId: s.callId, from: s.fromUserId, kind: s.kind, payload, at: s.createdAt.toISOString() }] }));
            }
            // تنظيف كسول لإشارات انتهت صلاحيتها (انتهى غرض التأشير)
            if (signals.length > 0 || Math.random() < 0.05) {
              await db.callSignal.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - SIGNAL_TTL_MS) } } }).catch(() => null);
            }
          } catch {
            // خطأ في هذه الجولة — الجولة التالية تعيد المحاولة؛ القناة لا تُسقط
          }
          return latest;
        }

        cursor = await sweep();
        tickTimer = setInterval(async () => {
          if (closed || busy) return;
          if (req.signal.aborted) { finish(); return; }
          busy = true;
          try {
            cursor = await sweep();
          } finally {
            busy = false;
          }
        }, TICK_MS);
        beatTimer = setInterval(() => {
          if (closed) { finish(); return; }
          push(`: hb\n\n`);
        }, HEARTBEAT_MS);
      },
    });

    return new Response(stream, {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    if (error instanceof AccessError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    console.error("[realtime GET]", error);
    return Response.json({ error: "internal_error" }, { status: 500 });
  }
}
