// HRMP — أدوات المال (SPEC §4.3 و§11.1): كل المبالغ Int بالسنتيم، التقريب في نهاية الخط فقط
import type { Locale } from "@/i18n/config";

/** سنتيم ← نص منسق حسب اللغة: 123450 → «1 234,50 د.م.» (ar) / "1 234,50 MAD" (en) */
export function formatMoney(cents: number, locale: Locale = "ar"): string {
  const intlLocale =
    locale === "ar" ? "ar-MA" : locale === "fr" ? "fr-MA" : locale === "es" ? "es-MA" : "en-MA";
  const amount = cents / 100;
  const formatted = new Intl.NumberFormat(intlLocale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
  return locale === "ar" ? `${formatted} د.م.` : `${formatted} MAD`;
}

/** تقريب إلى أقرب سنتيم (نصف للأعلى) — يُستخدم في نهاية خط الحساب فقط */
export function roundToCents(value: number): number {
  return Math.round(value);
}

/** نسبة مخزنة بنقاط أساس x10000 (4.48% → 44800) ← تطبيقها على أساس بالسنتيم */
export function applyBasisPoints(baseCents: number, basisPoints: number, capCents?: number): number {
  const effective = capCents !== undefined ? Math.min(baseCents, capCents) : baseCents;
  return roundToCents((effective * basisPoints) / 10000);
}

/** درهم ← سنتيم (للإدخال اليدوي في الواجهات) */
export function dirhamsToCents(dirhams: number): number {
  return roundToCents(dirhams * 100);
}
