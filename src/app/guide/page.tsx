// FWMS — صفحة عامة (جولة 2026-10-19): دليل الاستخدام بأربع لغات و?lang= عبر الوسيط
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { LOCALE_COOKIE, resolveLocale } from "@/i18n/config";
import { getDictionary, tServer } from "@/i18n/get-dictionary";
import { PublicLegalShell } from "@/components/fwms/public-legal-shell";
import { LegalSections } from "@/components/fwms/legal-sections";

const TITLE_KEY = "guide.title";

export async function generateMetadata(): Promise<Metadata> {
  const store = await cookies();
  const dict = getDictionary(resolveLocale(store.get(LOCALE_COOKIE)?.value));
  return { title: tServer(dict, TITLE_KEY) };
}

export default async function GuidePage() {
  const store = await cookies();
  const locale = resolveLocale(store.get(LOCALE_COOKIE)?.value);
  const dict = getDictionary(locale);
  return (
    <PublicLegalShell>
      <LegalSections tree={dict.guide} />
    </PublicLegalShell>
  );
}
