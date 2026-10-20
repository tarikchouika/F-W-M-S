// FWMS — صفحة المراجع الرسمية المغربية (public)
// الروابط الرسمية المتحقَّق منها + نصوص القانون المتاحة للتحميل من مصادرها.
// الصفحة عامة (بلا جلسة) — تُبنى من قاموس اللغة + بيانات `src/lib/references.ts`.
import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { ExternalLink, FileDown, Landmark, Scale, ShieldCheck } from "lucide-react";
import { LOCALE_COOKIE, resolveLocale } from "@/i18n/config";
import { getDictionary, tServer } from "@/i18n/get-dictionary";
import { PublicLegalShell } from "@/components/fwms/public-legal-shell";
import { CATEGORY_ORDER, LAW_FILES, OFFICIAL_SOURCES, VERIFIED_ON } from "@/lib/references";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const TITLE_KEY = "references.title";

export async function generateMetadata(): Promise<Metadata> {
  const store = await cookies();
  const dict = getDictionary(resolveLocale(store.get(LOCALE_COOKIE)?.value));
  return { title: tServer(dict, TITLE_KEY) };
}

export default async function ReferencesPage() {
  const store = await cookies();
  const locale = resolveLocale(store.get(LOCALE_COOKIE)?.value);
  const dict = getDictionary(locale);
  const tr = (key: string) => tServer(dict, key);

  return (
    <PublicLegalShell>
      <div className="mx-auto w-full max-w-4xl space-y-8 py-6">
        <header className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="gap-1.5">
              <ShieldCheck className="size-3" aria-hidden />
              {tr("references.sourcesCount")}: {OFFICIAL_SOURCES.length}
            </Badge>
            <Badge variant="outline" className="gap-1.5">
              <Scale className="size-3" aria-hidden />
              {tr("references.lawsCount")}: {LAW_FILES.length}
            </Badge>
            <Badge variant="outline">{tr("references.verified")}: {VERIFIED_ON}</Badge>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            {tr("references.title")}
          </h1>
          <p className="text-sm leading-7 text-muted-foreground">{tr("references.subtitle")}</p>
        </header>

        {/* ── الجهات الرسمية ── */}
        <section className="space-y-4">
          <div className="space-y-1">
            <h2 className="flex items-center gap-2 text-lg font-bold text-foreground">
              <Landmark className="size-5 text-primary" aria-hidden />
              {tr("references.orgsTitle")}
            </h2>
            <p className="text-sm text-muted-foreground">{tr("references.orgsSubtitle")}</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {CATEGORY_ORDER.flatMap((cat) =>
              OFFICIAL_SOURCES.filter((s) => s.category === cat).map((s) => (
                <Card key={s.id} className="border-border/70">
                  <CardContent className="space-y-2 p-5">
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="text-base font-bold leading-snug text-card-foreground">{s.org}</h3>
                      <Badge variant="secondary" className="shrink-0 text-[10px]">
                        {tr(`references.cat.${cat}`)}
                      </Badge>
                    </div>
                    <p className="text-sm leading-6 text-muted-foreground">{tr(`references.use.${s.id}`)}</p>
                    <div className="flex flex-wrap items-center gap-3 pt-1">
                      <a
                        href={s.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary underline-offset-4 hover:underline"
                      >
                        {tr("references.open")}
                        <ExternalLink className="size-3" aria-hidden />
                      </a>
                      {s.fileUrl ? (
                        <a
                          href={s.fileUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                        >
                          <FileDown className="size-3" aria-hidden />
                          {tr("references.download")}
                        </a>
                      ) : null}
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </section>

        {/* ── نصوص القانون ── */}
        <section className="space-y-4">
          <div className="space-y-1">
            <h2 className="flex items-center gap-2 text-lg font-bold text-foreground">
              <Scale className="size-5 text-primary" aria-hidden />
              {tr("references.lawsTitle")}
            </h2>
            <p className="text-sm text-muted-foreground">{tr("references.lawsSubtitle")}</p>
          </div>
          <div className="space-y-3">
            {LAW_FILES.map((law) => (
              <Card key={law.id} className="border-border/70">
                <CardContent className="space-y-2 p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <h3 className="text-sm font-bold leading-6 text-card-foreground" dir="auto">
                      {law.title}
                    </h3>
                    <Badge variant="outline" className="shrink-0 text-[10px]">
                      {law.org}
                    </Badge>
                  </div>
                  <p className="text-xs leading-5 text-muted-foreground" dir="auto">
                    {law.citation}
                  </p>
                  <p className="text-sm leading-6 text-foreground/85">{tr(`references.laws.${law.id}`)}</p>
                  <a
                    href={law.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary underline-offset-4 hover:underline"
                  >
                    {law.direct ? tr("references.download") : tr("references.open")}
                    {law.direct ? (
                      <FileDown className="size-3" aria-hidden />
                    ) : (
                      <ExternalLink className="size-3" aria-hidden />
                    )}
                  </a>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        <p className="rounded-xl border border-border/70 bg-secondary/40 p-4 text-xs leading-6 text-muted-foreground">
          {tr("references.disclaimer")}
        </p>

        <p className="pb-4 text-center text-xs text-muted-foreground">
          <Link href="/" className="underline-offset-4 hover:text-foreground hover:underline">
            {tr("landing.ctaSecondary")}
          </Link>
        </p>
      </div>
    </PublicLegalShell>
  );
}
