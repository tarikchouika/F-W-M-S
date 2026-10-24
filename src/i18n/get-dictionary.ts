// HRMP i18n — محمّل القواميس في الخادم (استيراد ثابت = يعمل على Vercel وTermux معًا)
import type { Locale } from "./config";
import ar from "./dictionaries/ar.json";
import fr from "./dictionaries/fr.json";
import en from "./dictionaries/en.json";
import es from "./dictionaries/es.json";

export type Dictionary = typeof ar;

const dictionaries: Record<Locale, Dictionary> = {
  ar,
  fr: fr as unknown as Dictionary,
  en: en as unknown as Dictionary,
  es: es as unknown as Dictionary,
};

export function getDictionary(locale: Locale): Dictionary {
  return dictionaries[locale] ?? dictionaries.ar;
}

/** الترجمة داخل الخادم بمفتاح شجرة نقاط: t(dict, "nav.login") — مع استيفاء {param} اختياري */
export function tServer(dict: Dictionary, key: string, params?: Record<string, string | number>): string {
  const value = key.split(".").reduce<unknown>((acc, part) => {
    if (acc && typeof acc === "object" && part in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[part];
    }
    return undefined;
  }, dict as unknown);
  if (typeof value !== "string") return key;
  if (!params) return value;
  return value.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match
  );
}
