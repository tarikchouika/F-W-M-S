// HRMP — ترجمة محتوى المستندات (SPEC §4.4.1: التقارير باللغات الأربع)
// يستخدم القواميس الأربعة نفسها (src/i18n/dictionaries) — فحص التكافؤ في CI يشمل نصوص المستندات
// الأرقام غربية (لاتينية) في كل اللغات — عرف المغرب الرسمي في الوثائق المالية
import { getDictionary, tServer } from "../../i18n/get-dictionary";
import type { Locale } from "../../i18n/config";
import type { ReportLanguage } from "./types";

export type ReportDict = ReturnType<typeof getDictionary>;

export function reportDict(language: ReportLanguage): ReportDict {
  return getDictionary(language);
}

export function tr(dict: ReportDict, key: string, params?: Record<string, string | number>): string {
  return tServer(dict, key, params);
}

/** اسم الشهر من قاموس المستندات (12 × 4) — بلا Intl: نفس الناتج على node/bun/الهاتف */
export function monthLabel(dict: ReportDict, year: number, month: number): string {
  const name = tr(dict, `reports.month.${month}`);
  const safe = name === `reports.month.${month}` ? String(month) : name;
  return `${safe} ${year}`;
}

/** تنسيق مال المستندات: سنتيم → "1 234,50 د.م." (ar) / "1 234,50 MAD" (غيره) */
export function docMoney(cents: number, language: ReportLanguage): string {
  const sign = cents < 0 ? "−" : "";
  const abs = Math.abs(cents);
  const whole = Math.floor(abs / 100);
  const frac = String(abs % 100).padStart(2, "0");
  // تجميع الآلاف بمسافة رقيقة (NBSP) — ثابت عبر البيئات، بلا Intl
  const wholeStr = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, "\u00A0");
  const currency = language === "ar" ? "د.م." : "MAD";
  return `${sign}${wholeStr},${frac}\u00A0${currency}`;
}

/** دقائق → "173:30" (ثابت LTR في الأرقام) */
export function docHours(minutes: number): string {
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}`;
}

/** تاريخ ISO → "17/10/2026" */
export function docDate(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getUTCFullYear()}`;
}

/** تاريخ ووقت ISO → "17/10/2026 14:05" */
export function docDateTime(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mi = String(d.getUTCMinutes()).padStart(2, "0");
  return `${docDate(d)} ${hh}:${mi}`;
}

/** "2026-10" → ملصق الفترة بأسماء الشهور المحلية من القاموس */
export function periodKeyLabel(dict: ReportDict, periodKey: string): string {
  const [y, m] = periodKey.split("-");
  const month = Number(m);
  if (!y || !month || month < 1 || month > 12) return periodKey;
  return monthLabel(dict, Number(y), month);
}

/** اتجاه المستند */
export function isRtl(language: ReportLanguage): boolean {
  return language === "ar";
}

export type { Locale };
