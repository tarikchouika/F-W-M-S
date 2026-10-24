// HRMP — الصوتيات المؤقتة (بلاغ المالك 2026-10-24)
// «الرسائل الصوتية تخزن مؤقتا وتمسح بعد إستهلاكها من المتلقي أو المعني بالأمر»
// ---------------------------------------------------------------------------
// السياسة:
//  - الاستهلاك = أول تشغيل من المستقبِل (listenedAt) أو من مشرف voice.admin
//    (المعني بالأمر) ⇒ محتوى الصوت (BLOB) يُفرَّغ فورًا وبصمة المسح تُوثَّق.
//  - ما لم يُستهلك يُمسح بعد 72 ساعة (TTL) — مسح كسول عند القراءات لا يحتاج
//    مجدولًا خارجيًا (متوافق مع البيئات السائلة serverless).
//  - السجل الوصفي (المرسل/المستقبِل/المدة/الأوقات) يبقى للتدقيق — بلا أي صوت،
//    والبث بعدها يرجع 410 Gone.
// حذار: هذه الحدود تخص المحتوى الصوتي وحده — لا علاقة لها بالوسائط المرئية
// (DirectMessage) ولا بالاتصال المباشر (WebRTC — لا يُخزَّن أصلًا).
import { db } from "@/lib/db";

/** عمر الرسالة الصوتية غير المستهلكة قبل المسح التلقائي */
export const VOICE_TTL_MS = 72 * 60 * 60 * 1000; // 72 ساعة

const EMPTY_BYTES = Buffer.alloc(0);

/** مسح محتوى رسالة صوتية واحدة (إن لم تُمسح سابقًا) — بمن مسحها */
export async function purgeVoiceMessage(id: string, byUserId: string): Promise<boolean> {
  const res = await db.voiceMessage.updateMany({
    where: { id, purgedAt: null },
    data: { audio: EMPTY_BYTES, purgedAt: new Date(), purgedBy: byUserId },
  });
  return res.count > 0;
}

/** المسح الكسول لكل الرسائل منتهية العمر غير المستهلكة — يُستدعى عند القراءات
 *  (خيوط المحادثة/تصفح الإشراف). رخيصة: عمود purgedAt مفهرس وشروطها انتقائية. */
export async function purgeExpiredVoiceMessages(): Promise<number> {
  const cutoff = new Date(Date.now() - VOICE_TTL_MS);
  const res = await db.voiceMessage.updateMany({
    where: { purgedAt: null, createdAt: { lt: cutoff } },
    data: { audio: EMPTY_BYTES, purgedAt: new Date(), purgedBy: "ttl" },
  });
  return res.count;
}
