import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { ShieldCheck, ShieldX, SearchX } from "lucide-react";
import { LOCALE_COOKIE, localeDirection, localeLabels, resolveLocale } from "@/i18n/config";
import { getDictionary, tServer } from "@/i18n/get-dictionary";
import { verifyDocumentByRef } from "@/lib/reports/generate";
import { getPlatformBranding } from "@/lib/branding";

type Props = {
  params: Promise<{ ref: string }>;
  searchParams: Promise<{ h?: string; lang?: string }>;
};

/** لغة الصفحة من معامل lang ثم كوكي FWMS_LOCALE — نفس أولوية الصفحة نفسها */
async function resolvePageLocale(searchParams: { h?: string; lang?: string }) {
  const { lang } = searchParams;
  const store = await cookies();
  const cookieLocale = resolveLocale(store.get(LOCALE_COOKIE)?.value);
  return lang === "ar" || lang === "fr" || lang === "en" || lang === "es" ? lang : cookieLocale;
}

/** i18n (بلاغ المالك 2026-10-19 «خلل في الترجمة»): عنوان التبويب كان عربيًا مثبتًا
 *  لكل اللغات — صار من القاموس بلغة الزائر (نمط صفحة الدخول نفسه) */
export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const sp = await searchParams;
  const dict = getDictionary(await resolvePageLocale(sp));
  return {
    title: tServer(dict, "reports.verify.title"),
    robots: { index: false, follow: false },
  };
}


/** صفحة عامة بلا مصادقة: طرف ثالث يمسح QR من قسيمة ورقية ويتحقق من أصالتها (SPEC §4.4.1)
 *  تعرض الحد الأدنى الآمن: الأصالة والمرجع والجهة المصدرة — بلا أي مبلغ */
export default async function VerifyPage({ params, searchParams }: Props) {
  const { ref } = await params;
  const { h } = await searchParams;

  const locale = await resolvePageLocale(await searchParams);
  const dict = getDictionary(locale);
  const t = (key: string, params_?: Record<string, string | number>) => tServer(dict, key, params_);
  const dir = localeDirection[locale];

  const result = await verifyDocumentByRef(decodeURIComponent(ref), h ?? null);
  // هوية مالك المنصة (white-label — SPEC §3.2): صفحة عامة تعرض اسم المالك لا اسم المنتج
  const branding = await getPlatformBranding();

  return (
    <main dir={dir} className="mx-auto flex min-h-[80vh] max-w-lg flex-col items-center justify-center gap-6 p-6">
      <div className="w-full rounded-xl border bg-card p-6 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                { }
                <svg viewBox="0 0 24 24" className="size-5" aria-hidden fill="currentColor">
                  <path d="M12 2 3 6v6c0 5 3.8 9.3 9 10 5.2-.7 9-5 9-10V6l-9-4z" />
                </svg>
                FWMS
              </div>
              <span className="rounded-full bg-muted px-2.5 py-0.5 text-[11px] text-muted-foreground">
                {t("reports.verify.publicBadge")}
              </span>
            </div>

            <h1 className="text-xl font-bold">{t("reports.verify.title")}</h1>
            <p className="mt-1 text-xs text-muted-foreground">{branding.displayName}</p>
            <p dir="ltr" className="mt-1 font-mono text-sm text-muted-foreground">
              {decodeURIComponent(ref)}
            </p>

            {result.valid ? (
              <div className="mt-5 rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-900 dark:bg-green-950">
                <div className="flex items-center gap-2 font-semibold text-green-700 dark:text-green-400">
                  <ShieldCheck className="size-5" aria-hidden />
                  {t("reports.verify.valid")}
                </div>
                <dl className="mt-4 space-y-2 text-sm">
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">{t("reports.verify.company")}</dt>
                    <dd className="font-medium">{result.companyLegalName}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">{t("reports.selectKind")}</dt>
                    <dd className="font-medium">{t(`reports.kind.${result.kind}`)}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">{t("reports.colVersion")}</dt>
                    <dd dir="ltr" className="font-mono font-medium">v{result.version}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">{t("reports.verify.generatedAt")}</dt>
                    <dd dir="ltr" className="font-medium">{result.generatedAt.slice(0, 10)}</dd>
                  </div>
                </dl>
                <div className="mt-4 border-t pt-3">
                  <p className="text-[11px] text-muted-foreground">{t("reports.verify.verifyNote")}</p>
                  <p dir="ltr" className="mt-1 break-all font-mono text-[11px] text-muted-foreground">
                    {result.contentHash.slice(0, 32)}
                  </p>
                </div>
              </div>
            ) : result.reason === "hash_mismatch" ? (
              <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950">
                <div className="flex items-center gap-2 font-semibold text-amber-700 dark:text-amber-400">
                  <ShieldX className="size-5" aria-hidden />
                  {t("reports.verify.hashMismatch")}
                </div>
              </div>
            ) : (
              <div className="mt-5 rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950">
                <div className="flex items-center gap-2 font-semibold text-red-700 dark:text-red-400">
                  <SearchX className="size-5" aria-hidden />
                  {t("reports.verify.notFound")}
                </div>
              </div>
            )}

            <div className="mt-6 flex items-center justify-between text-sm">
              <Link href="/" className="text-primary underline-offset-4 hover:underline">
                {t("reports.verify.backHome")}
              </Link>
              <div className="flex gap-1.5 text-[11px] text-muted-foreground">
                {(["ar", "fr", "en", "es"] as const).map((l) => (
                  <Link
                    key={l}
                    href={`/verify/${ref}?h=${h ?? ""}&lang=${l}`}
                    className={`rounded px-1.5 py-0.5 hover:bg-muted ${l === locale ? "bg-muted font-medium" : ""}`}
                  >
                    {localeLabels[l]}
                  </Link>
                ))}
              </div>
            </div>
      </div>
    </main>
  );
}
