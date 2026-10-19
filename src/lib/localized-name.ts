// FWMS — تدويل أسماء الكيانات (علاج بلاغ المالك 2026-10-19 «خلل الترجمة في أسماء
// المواقع والشركات والمشاريع»): الاسم الأساسي يُدخله المالك بلغة واحدة، والعمود
// names (JSON اختياري {ar,fr,en,es}) يوفر عرضًا يتبع لغة الواجهة — مع سقوط آمن
// إلى الاسم الأساسي عند غياب الترجمة (البيانات بيانات: لا نترجم ما أدخله المستخدم).
import { z } from "zod";

export const LOCALE_CODES = ["ar", "fr", "en", "es"] as const;
export type LocaleCode = (typeof LOCALE_CODES)[number];

export type NamedRow = { names?: string | null } & Record<string, unknown>;

/** فك حقل names بأمان — أي تلف يعني «لا أسماء محلية» لا انفجارًا */
export function parseNames(raw: string | null | undefined): Partial<Record<LocaleCode, string>> | null {
  if (!raw) return null;
  try {
    const obj = JSON.parse(raw);
    if (obj && typeof obj === "object" && !Array.isArray(obj)) {
      const out: Partial<Record<LocaleCode, string>> = {};
      for (const code of LOCALE_CODES) {
        const v = (obj as Record<string, unknown>)[code];
        if (typeof v === "string" && v.trim()) out[code] = v.trim();
      }
      return Object.keys(out).length ? out : null;
    }
    return null;
  } catch {
    return null;
  }
}

/** الاسم المعروض للكيان بحسب لغة الواجهة: names[locale] وإلا الحقل الأساسي */
export function localizedName<T extends NamedRow>(
  row: T,
  locale: string | null | undefined,
  fallback: keyof T
): string {
  const map = parseNames(row.names);
  const hit = map?.[locale as LocaleCode];
  if (hit) return hit;
  const base = row[fallback];
  return typeof base === "string" ? base : "";
}

/** سلسلة صلاحية zod لحقول الأسماء المحلية في نماذج الإنشاء/التعديل */
export const localeNamesSchema = z
  .object({
    ar: z.string().trim().max(120).optional(),
    fr: z.string().trim().max(120).optional(),
    en: z.string().trim().max(120).optional(),
    es: z.string().trim().max(120).optional(),
  })
  .transform((v) => {
    // الفراغ يعني غياب الاسم في تلك اللغة — نُسقطه
    const out: Record<string, string> = {};
    for (const [k, val] of Object.entries(v)) {
      if (val && val.trim()) out[k] = val.trim();
    }
    return out;
  });

/** تحويل كائن الأسماء إلى قيمة العمود: JSON أو null إن خلت */
export function namesColumnValue(names: unknown): string | null {
  if (!names || typeof names !== "object") return null;
  const entries = Object.entries(names as Record<string, unknown>).filter(
    ([, v]) => typeof v === "string" && v.trim()
  );
  return entries.length ? JSON.stringify(Object.fromEntries(entries)) : null;
}

/**
 * نسخة صف جاهزة للعرض من الواجهة: حقل الاسم يُستبدل بترجمته حسب لغة الجلسة،
 * والاسم الخام يُحفظ في baseName (لنماذج التعديل كي لا تتلوث بلغة الواجهة).
 * استعمالها في طبقة API بعد الجلب: rows.map((r) => localizeRow(r, locale, "name"))
 */
export function localizeRow<T extends NamedRow, K extends keyof T>(
  row: T,
  locale: string | null | undefined,
  fallback: K
): T & { baseName: string } {
  const base = row[fallback];
  const baseStr = typeof base === "string" ? base : "";
  const localized = localizedName(row, locale, fallback);
  if (localized === baseStr || !localized) {
    return { ...row, baseName: baseStr };
  }
  return { ...row, [fallback]: localized, baseName: baseStr } as T & { baseName: string };
}

/** نسخة آمنة للعلاقات المتداخلة (site/branch/project داخل صفوف أخرى) */
export function localizeNested<T extends NamedRow, K extends keyof T>(
  row: T | null | undefined,
  locale: string | null | undefined,
  fallback: K
): (T & { baseName: string }) | null {
  if (!row) return null;
  return localizeRow(row, locale, fallback);
}
