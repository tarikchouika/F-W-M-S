// HRMP — الاستقطاب والتوظيف: الثوابت والتطبيع والتحقق الشكلي (طلب المالك 2026-10-24)
// ---------------------------------------------------------------------------
// القواعد النافذة (AGENTS §1): لا نصوص واجهة في الكود (كلها i18n) · المال بالسنتيم ·
// التحقق من الصلاحيات في الخادم دائمًا · UTC في التخزين. القيم النصية للحوامل
// (status/employmentType/...) تُتحقق هنا لا في Prisma (SQLite بلا enums — المخطط).

export const SEEKER_STATUSES = ["pending", "approved", "rejected"] as const;
export type SeekerStatus = (typeof SEEKER_STATUSES)[number];

export const DOCUMENT_TYPES = ["national_id", "passport", "driver_license"] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export const VACANCY_STATUSES = ["draft", "published", "closed"] as const;
export type VacancyStatus = (typeof VACANCY_STATUSES)[number];

export const EMPLOYMENT_TYPES = ["full_time", "part_time", "temporary", "seasonal", "internship"] as const;
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];

export const APPLICATION_STATUSES = [
  "submitted",
  "viewed",
  "shortlisted",
  "rejected",
  "hired",
  "withdrawn",
] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export function isSeekerStatus(v: string): v is SeekerStatus {
  return (SEEKER_STATUSES as readonly string[]).includes(v);
}
export function isDocumentType(v: string): v is DocumentType {
  return (DOCUMENT_TYPES as readonly string[]).includes(v);
}
export function isVacancyStatus(v: string): v is VacancyStatus {
  return (VACANCY_STATUSES as readonly string[]).includes(v);
}
export function isEmploymentType(v: string): v is EmploymentType {
  return (EMPLOYMENT_TYPES as readonly string[]).includes(v);
}
export function isApplicationStatus(v: string): v is ApplicationStatus {
  return (APPLICATION_STATUSES as readonly string[]).includes(v);
}

// ─── الحدود الأمنية للتسجيل العام (حدود مقيسة لا تخمين) ────────────────────────
export const DOC_MAX_BYTES = 5 * 1024 * 1024; // 5MB — صورة هواتف حديثة بلا تضخيم
export const DOC_ACCEPTED_MIMES = ["image/jpeg", "image/png", "image/webp"] as const;
export const OTP_TTL_MS = 10 * 60 * 1000; // 10 دقائق لعمر الرمز
export const OTP_MAX_ATTEMPTS = 5; // ثم يُبطَل الرمز ويُطلب رمز جديد
export const OTP_CODE_DIGITS = 6;
export const COVER_NOTE_MAX = 2000;
export const VACANCY_TITLE_MAX = 120;
export const VACANCY_DESC_MAX = 6000;
export const SALARY_MIN_CENTIMES = 0;
export const SALARY_MAX_CENTIMES = 100_000_000; // مليون درهم بالسنتيم — سقف شكلي سخي
export const OPENINGS_MIN = 1;
export const OPENINGS_MAX = 999;

// ─── تطبيع الهاتف المغربي → صيغة دولية موحّدة E.164 بلا "+" ────────────────────
// يقبل: 0612345678 / 612345678 / +212612345678 / 00212612345678 / 212612345678
// الأرقام المغربية المحمولة تبدأ بـ 6 أو 7 بعد رمز الدولة (مجموع 9 أرقام وطنيًا).
export function normalizeMoroccanPhone(raw: string): string | null {
  let digits = raw.replace(/[\s\-().]/g, "");
  if (digits.startsWith("+")) digits = digits.slice(1);
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("0")) digits = `212${digits.slice(1)}`;
  if (!/^212[67]\d{8}$/.test(digits)) return null;
  return digits;
}

/** الهاتف للعرض: +212 6XX XXX XXX (قارئ في كل اللغات) */
export function formatPhoneDisplay(e164noPlus: string): string {
  const m = /^(\d{3})(\d{2})(\d{3})(\d{3})$/.exec(e164noPlus);
  if (!m) return e164noPlus;
  return `+${m[1]} ${m[2]} ${m[3]} ${m[4]}`.trimEnd();
}

/** تطبيع البريد: أحرف صغيرة + قصّ */
export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

/** استبعاد انتحال معرّفات البذور الداخلية في التسجيل العام (owner@fwms.local
 *  ونطاقه — حسابات تشغيلية داخلية لا يُسمح للعموم بالتسجيل بها) */
export function isInternalSeedEmail(email: string): boolean {
  return email.endsWith("@fwms.local");
}

/** كلمة مرور التسجيل العام: نفس عتبة المنصة (≥10 مع حرف ورقم) — متسقة مع فحص
 *  الدخول الداخلي، وموثّقة في الواجهة برسالة i18n صريحة */
export function isAcceptablePassword(pw: string): boolean {
  return pw.length >= 10 && /[a-zA-Z]/.test(pw) && /\d/.test(pw);
}
