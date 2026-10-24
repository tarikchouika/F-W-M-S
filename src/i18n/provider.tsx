"use client";

// HRMP i18n — مزوّد اللغة للعميل: t() بمفاتيح شجرة النقاط + اتجاه ديناميكي
import { createContext, useCallback, useContext, useMemo } from "react";
import type { Locale } from "./config";
import { localeDirection } from "./config";
import type { Dictionary } from "./get-dictionary";

type I18nContextValue = {
  locale: Locale;
  dir: "rtl" | "ltr";
  dict: Dictionary;
  t: (key: string, params?: Record<string, string | number>) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({
  locale,
  dict,
  children,
}: {
  locale: Locale;
  dict: Dictionary;
  children: React.ReactNode;
}) {
  const t = useCallback(
    (key: string, params?: Record<string, string | number>): string => {
      const value = key.split(".").reduce<unknown>((acc, part) => {
        if (acc && typeof acc === "object" && part in (acc as Record<string, unknown>)) {
          return (acc as Record<string, unknown>)[part];
        }
        return undefined;
      }, dict as unknown);
      if (typeof value !== "string") return key;
      if (!params) return value;
      // استيفاء بسيط {name} — كافٍ لكل نصوص المنصة (أرقام لاتينية وأسماء)
      return value.replace(/\{(\w+)\}/g, (match, name: string) =>
        name in params ? String(params[name]) : match
      );
    },
    [dict]
  );

  const value = useMemo<I18nContextValue>(
    () => ({ locale, dir: localeDirection[locale], dict, t }),
    [locale, dict, t]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within I18nProvider");
  return ctx;
}
