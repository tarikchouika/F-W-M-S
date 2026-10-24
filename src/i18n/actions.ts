"use server";

// HRMP — إجراء خادمي لضبط لغة الواجهة في cookie (بديل نظيف عن document.cookie)
// (إعادة التسمية 2026-10-24): يكتب الكوكي الجديد HRMP_LOCALE + القديم في الانتقال
// (readLocaleCookie يقرأ الجديد أولًا — والكتابة المزدوجة تصون أي عميل قديم مخزَّن).
import { cookies } from "next/headers";
import { LOCALE_COOKIE, LEGACY_LOCALE_COOKIE, isLocale } from "./config";

export async function setLocaleAction(locale: string): Promise<void> {
  if (!isLocale(locale)) return;
  const store = await cookies();
  const opts = {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  } as const;
  store.set(LOCALE_COOKIE, locale, opts);
  store.set(LEGACY_LOCALE_COOKIE, locale, opts);
}
