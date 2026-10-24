// HRMP i18n — الإعدادات المركزية (SPEC §2: أربع لغات، العربية RTL افتراضية)
export const locales = ["ar", "fr", "en", "es"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "ar";

export const localeDirection: Record<Locale, "rtl" | "ltr"> = {
  ar: "rtl",
  fr: "ltr",
  en: "ltr",
  es: "ltr",
};

export const localeLabels: Record<Locale, string> = {
  ar: "العربية",
  fr: "Français",
  en: "English",
  es: "Español",
};

// (إعادة التسمية 2026-10-24 FWMS→HRMP): كوكي اللغة الجديد باسم المنصة الجديدة،
// مع سقوط آمن إلى الكوكي القديم لسنة انتقالية — زوار اختاروا لغة قبل التسمية
// لا يفقدون تفضيلهم (الكوكي عمره سنة، فالقراءة المزدوجة تصون تجربتهم).
export const LOCALE_COOKIE = "HRMP_LOCALE";
export const LEGACY_LOCALE_COOKIE = "FWMS_LOCALE";

/** بنية الكوكي القرائية (next/headers بنيةً لا استيرادًا — يصلح للخادم والعميل) */
type CookieStoreLike = { get(name: string): { value?: string } | undefined };

/** قراءة لغة الواجهة من الكوكي: الجديد أولًا ثم القديم (انتقال إعادة التسمية) */
export function readLocaleCookie(store: CookieStoreLike): string | undefined {
  return store.get(LOCALE_COOKIE)?.value ?? store.get(LEGACY_LOCALE_COOKIE)?.value;
}

export function isLocale(value: string | undefined | null): value is Locale {
  return !!value && (locales as readonly string[]).includes(value);
}

export function resolveLocale(value: string | undefined | null): Locale {
  return isLocale(value) ? value : defaultLocale;
}
