// FWMS — الإشعارات (SPEC §4.1 و§8 — المرحلة 5): سجل داخل التطبيق + محوّل دفع قابل للتبديل
// المبدأ (SPEC §7): لا خدمة سحابية مغلقة — Web Push معيار مفتوح (RFC 8030 + VAPID)،
// ومحوّل FCM/APNs للتطبيقات المحمولة المستقبلية يُضاف خلف الواجهة نفسها دون تغيير المستهلكين.
// الاستطلاع: الواجهة تسأل كل 20ث (مرئية) / 120ث (مخفية) — مثبت عبر /api/notifications.
import { db } from "@/lib/db";

// ── أنواع الإشعارات المعروفة (i18n في الواجهة — النص يُبنى محليًا) ──

export const NOTIFICATION_TYPES = [
  "shift_replacement_assigned", // وردية تغطية أُسندت إليك
  "payslip_approved", // كشف أجرك للفترة اعتُمد وجاهز في «أجوري» (المرحلة 6أ/6ب)
  "declaration_review_requested", // تصريح CNSS/DGI جاهز لمراجعتك (المرحلة 6ج — للمحاسب)
  "team_member_left_zone", // (المرحلة 9) عضو فريقك غادر منطقة الفريق أثناء الجلسة
  "team_member_entered_zone", // (المرحلة 9) عضو عاد إلى منطقة الفريق
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export type ReplacementPayload = {
  siteName: string;
  localDate: string; // "YYYY-MM-DD" بتوقيت الشركة
  startLabel: string; // "HH:MM"
  endLabel: string; // "HH:MM"
  previousWorkerName?: string;
  shiftId: string;
};

export type PayslipApprovedPayload = {
  periodLabel: string; // "2026-10"
  refNumber: string; // رقم الكشف المرجعي
};

export type DeclarationReviewPayload = {
  declarationId: string;
  authority: string; // cnss | dgi
  periodKey: string;
};

export type TeamPresencePayload = {
  memberName: string;
  groupName: string;
  zoneRadiusM: number;
  distanceM: number;
  at: string; // ISO
};

export type NotificationRecord = {
  id: string;
  type: string;
  payload: ReplacementPayload | PayslipApprovedPayload | DeclarationReviewPayload | TeamPresencePayload | null;
  readAt: string | null;
  createdAt: string;
};

/** إنشاء إشعار + محاولة الدفع الفوري — لا ترمي أبدًا كي لا تُفشل العملية الأصلية (نمط writeAudit) */
export async function createNotification(input: {
  companyId: string;
  userId: string;
  type: NotificationType;
  payload: ReplacementPayload | PayslipApprovedPayload | DeclarationReviewPayload | TeamPresencePayload;
}): Promise<string | null> {
  try {
    const record = await db.notification.create({
      data: {
        companyId: input.companyId,
        userId: input.userId,
        type: input.type,
        payloadJson: JSON.stringify(input.payload),
      },
    });
    // الدفع في الخلفية — فشله لا يمسّ السجل داخل التطبيق (قناة ثانية مستقلة)
    void dispatchWebPush(input.userId, input.type, input.payload).catch((e) =>
      console.error("[notifications] web-push dispatch failed:", e?.message ?? e),
    );
    return record.id;
  } catch (error) {
    console.error("[notifications] failed to create:", error);
    return null;
  }
}

/** قائمة إشعارات المستخدم نفسه (take=30 الأحدث) + عدد غير المقروء */
export async function listNotifications(userId: string): Promise<{
  unreadCount: number;
  notifications: NotificationRecord[];
}> {
  const [rows, unreadCount] = await Promise.all([
    db.notification.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
    db.notification.count({ where: { userId, readAt: null } }),
  ]);
  return {
    unreadCount,
    notifications: rows.map((n) => ({
      id: n.id,
      type: n.type,
      payload: safeParse(n.payloadJson),
      readAt: n.readAt ? n.readAt.toISOString() : null,
      createdAt: n.createdAt.toISOString(),
    })),
  };
}

/** تعليم مقروء: معرفات محددة أو الكل */
export async function markNotificationsRead(
  userId: string,
  ids?: string[]
): Promise<number> {
  const where =
    ids && ids.length > 0
      ? { userId, id: { in: ids } }
      : { userId };
  const result = await db.notification.updateMany({
    where: { ...where, readAt: null },
    data: { readAt: new Date() },
  });
  return result.count;
}

function safeParse(json: string | null): ReplacementPayload | TeamPresencePayload | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as ReplacementPayload | TeamPresencePayload;
  } catch {
    return null;
  }
}

// ── محوّل Web Push (VAPID) — يعمل فقط عند ضبط المفاتيح في .env، وإلا no-op موثَّق ──

function vapidConfig(): { publicKey: string; privateKey: string; subject: string } | null {
  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  const subject = process.env.VAPID_SUBJECT?.trim() || "mailto:owner@fwms.local";
  if (!publicKey || !privateKey) return null;
  return { publicKey, privateKey, subject };
}

/**
 * إرسال push لكل أجهزة المستخدم النشطة.
 * اشتراك مات (404/410) → يُعطَّل (isActive=false) لا يُحذف (SPEC §11.7 روح الحفاظ على الأثر).
 */
export async function dispatchWebPush(
  userId: string,
  type: string,
  payload: ReplacementPayload | PayslipApprovedPayload | DeclarationReviewPayload | TeamPresencePayload,
): Promise<{ sent: number; deactivated: number }> {
  const cfg = vapidConfig();
  const devices = await db.device.findMany({ where: { userId, isActive: true }, take: 20 });
  if (!cfg || devices.length === 0) {
    if (!cfg) console.log("[notifications] web-push غير مفعّل (VAPID غير مضبوط) — الإشعار داخل التطبيق فقط");
    return { sent: 0, deactivated: 0 };
  }

  const webpush = (await import("web-push")).default;
  webpush.setVapidDetails(cfg.subject, cfg.publicKey, cfg.privateKey);

  let sent = 0;
  let deactivated = 0;
  for (const device of devices) {
    try {
      await webpush.sendNotification(
        { endpoint: device.endpoint, keys: { p256dh: device.p256dh, auth: device.auth } },
        JSON.stringify({ type, payload }),
        { TTL: 3600, urgency: "high" },
      );
      sent += 1;
    } catch (error) {
      const status = (error as { statusCode?: number })?.statusCode;
      if (status === 404 || status === 410) {
        await db.device.update({ where: { id: device.id }, data: { isActive: false } }).catch(() => {});
        deactivated += 1;
      }
      // أخطاء الشبكة المؤقتة تُتجاهل — الاستطلاع داخل التطبيق قناة موثوقة ثانية
    }
  }
  return { sent, deactivated };
}

/** مفتاح VAPID العام للواجهة (null = الدفع غير مفعّل في هذه البيئة) */
export function vapidPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY?.trim() || null;
}
