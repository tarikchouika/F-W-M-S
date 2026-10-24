// HRMP — إشعارات المشرف عبر Telegram (طلب المالك 2026-10-24)
// ---------------------------------------------------------------------------
// البوت لا يرسل OTP إلى الباحثين: تيليغرام لا يملك أرقام هواتفهم ولا يستطيع
// إرسال SMS. وظيفته هنا إشعار المشرف (Super Admin) عند اكتمال توثيق باحث
// (بريد + هاتف + وثيقة) ليراجعه من لوحة التحكم، وأوامر حالة قصيرة (/pending,
// /status). الإرسال لا يرمي أبدًا ولا يُفشل العملية الأصلية.
import { db } from "@/lib/db";

// نوع بيئي محلي: المشروع لا يحمّل @types/node في تحقق الأنواع (خط الأساس 120)
declare const process: { env: Record<string, string | undefined> };
const env = process.env;

function botBase(): string | null {
  const token = env.TELEGRAM_BOT_TOKEN;
  return token ? `https://api.telegram.org/bot${token}` : null;
}

export function telegramConfigured(): boolean {
  return !!(env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_ADMIN_CHAT_ID);
}

/** إرسال نص إلى محادثة محددة — يعيد نجاح الإرسال فقط */
export async function sendTelegramTo(chatId: string, text: string): Promise<boolean> {
  const base = botBase();
  if (!base || !chatId) return false;
  try {
    const res = await fetch(`${base}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        disable_web_page_preview: true,
      }),
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error(`[HRMP][telegram] sendMessage ${res.status}: ${detail.slice(0, 200)}`);
      return false;
    }
    return true;
  } catch (error) {
    console.error("[HRMP][telegram] send failed:", error instanceof Error ? error.message : error);
    return false;
  }
}

export async function sendTelegramAdmin(text: string): Promise<boolean> {
  const chatId = env.TELEGRAM_ADMIN_CHAT_ID;
  if (!chatId) return false;
  return sendTelegramTo(chatId, text);
}

/**
 * إشعار المشرف حين يصبح الباحث جاهزًا للمصادقة فعلًا:
 * status=pending + بريد موثّق + هاتف موثّق + وثيقة مرفوعة.
 * يُكتب قيد AuditLog عند نجاح الإرسال فقط، فيمنع تكرار الإشعار عند إعادة الرفع.
 */
export async function notifySeekerReady(seekerId: string): Promise<void> {
  if (!telegramConfigured()) return;
  try {
    const already = await db.auditLog.findFirst({
      where: { action: "recruitment.review.notified", entityId: seekerId },
      select: { id: true },
    });
    if (already) return;

    const seeker = await db.jobSeeker.findUnique({
      where: { id: seekerId },
      select: {
        fullName: true,
        email: true,
        phone: true,
        status: true,
        emailVerifiedAt: true,
        phoneVerifiedAt: true,
        documentType: true,
      },
    });
    if (
      !seeker ||
      seeker.status !== "pending" ||
      !seeker.emailVerifiedAt ||
      !seeker.phoneVerifiedAt ||
      !seeker.documentType
    ) {
      return;
    }

    const text = [
      "🔔 HRMP — باحث جاهز للمصادقة",
      `الاسم: ${seeker.fullName}`,
      `البريد: ${seeker.email}`,
      `الهاتف: +${seeker.phone}`,
      "الوثيقة: مرفوعة ومُتحقَّق منها آليًا",
      "المراجعة: https://hrmp.pages.dev/dashboard/seekers",
    ].join("\n");

    if (await sendTelegramAdmin(text)) {
      // كتابة مباشرة بدل writeAudit: هذه مهمة خلفية بلا سياق طلب (requestMeta)
      await db.auditLog.create({
        data: {
          action: "recruitment.review.notified",
          entity: "JobSeeker",
          entityId: seekerId,
          afterJson: JSON.stringify({ channel: "telegram" }),
        },
      });
    }
  } catch (error) {
    console.error("[HRMP][telegram] notifySeekerReady failed:", error instanceof Error ? error.message : error);
  }
}
