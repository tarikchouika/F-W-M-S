// FWMS — لغة الواجهة من كوكي اللغة (مصدر العرض الفوري — علاج أسماء الكيانات 2026-10-19)
// ملاحظة معمارية: setLocaleAction يضبط الكوكي فقط ولا يعيد توقيع JWT،
// فأي عرض يعتمد session.locale يظل على لغة الدخول المتقادمة بعد التبديل.
// هذا الملف يستورده الخادم حصرًا (لا يستورده عامل العرض ولا reports/*).
import { cookies } from "next/headers";
import { LOCALE_COOKIE, isLocale, type Locale } from "./config";

export async function getUiLocale(): Promise<Locale> {
  const store = await cookies();
  const value = store.get(LOCALE_COOKIE)?.value;
  return isLocale(value) ? value : "ar";
}
