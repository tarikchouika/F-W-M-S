// HRMP — صفحة عامة (جولة 2026-10-19): السلامة بأربع لغات و?lang= عبر الوسيط
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { readLocaleCookie, resolveLocale } from "@/i18n/config";
import { getDictionary, tServer } from "@/i18n/get-dictionary";
import { PublicLegalShell } from "@/components/hrmp/public-legal-shell";
import { LegalSections } from "@/components/hrmp/legal-sections";

const TITLE_KEY = "legal.safety.title";

export async function generateMetadata(): Promise<Metadata> {
  const store = await cookies();
  const dict = getDictionary(resolveLocale(readLocaleCookie(store)));
  return { title: tServer(dict, TITLE_KEY) };
}

export default async function SafetyPage() {
  const store = await cookies();
  const locale = resolveLocale(readLocaleCookie(store));
  const dict = getDictionary(locale);
  return (
    <PublicLegalShell>
      <LegalSections tree={dict.legal.safety} />
    </PublicLegalShell>
  );
}
