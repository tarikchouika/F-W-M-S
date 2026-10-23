// FWMS — صفحة عامة (جولة 2026-10-24): تحميل تطبيق أندرويد الرسمي — زر مباشر
// من الرابط الدائم + دليل التثبيت وتجاوز Play Protect، بأربع لغات و?lang= عبر الوسيط
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { LOCALE_COOKIE, resolveLocale } from "@/i18n/config";
import { getDictionary, tServer } from "@/i18n/get-dictionary";
import { PublicLegalShell } from "@/components/fwms/public-legal-shell";
import { AppDownload } from "@/components/fwms/app-download";

const TITLE_KEY = "appPage.title";

export async function generateMetadata(): Promise<Metadata> {
  const store = await cookies();
  const dict = getDictionary(resolveLocale(store.get(LOCALE_COOKIE)?.value));
  return { title: tServer(dict, TITLE_KEY) };
}

export default function AppPage() {
  // اللغة من مزوّد الواجهة (كوكي) داخل المكوّنات — الوسيط يضبط ?lang= قبل الوصول
  return (
    <PublicLegalShell>
      <AppDownload />
    </PublicLegalShell>
  );
}
