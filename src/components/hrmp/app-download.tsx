"use client";

// HRMP — صفحة تحميل تطبيق أندرويد الرسمي (بلاغ المالك 2026-10-24):
// «اختصار مباشر لتحميل التطبيق من الرابط الدائم + شرح بسيط لطريقة التحميل
// والتثبيت وتجاوز Play Protect». كل النصوص من القواميس الأربع (بلا حرف مثبّت)
// والرابط من src/lib/app-download.ts (مصدر واحد).
import {
  Smartphone,
  Download,
  ShieldAlert,
  ShieldCheck,
  RefreshCw,
  KeyRound,
  ExternalLink,
  BadgeCheck,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { HrmpLogo } from "@/components/hrmp/logo";
import { useI18n } from "@/i18n/provider";
import { APP_DOWNLOAD_URL, APP_RELEASES_URL } from "@/lib/app-download";
import { APP_VERSION } from "@/lib/version";

type Step = { icon: LucideIcon; titleKey: string; bodyKey: string };

const STEPS: Step[] = [
  { icon: Download, titleKey: "appPage.s1t", bodyKey: "appPage.s1b" },
  { icon: ShieldCheck, titleKey: "appPage.s2t", bodyKey: "appPage.s2b" },
  { icon: Smartphone, titleKey: "appPage.s3t", bodyKey: "appPage.s3b" },
];

export function AppDownload() {
  const { t, dir } = useI18n();
  const isRtl = dir === "rtl";

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 py-6 lg:max-w-5xl">
      {/* ── العنوان ── */}
      <header className="space-y-3 pb-2 pt-4">
        <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-4xl">
          {t("appPage.title")}
        </h1>
        <p className="text-base leading-8 text-muted-foreground sm:text-lg">{t("appPage.subtitle")}</p>
        <div className="h-1 w-24 rounded-full bg-gold" aria-hidden />
      </header>

      {/* ── بطاقة التحميل المباشر: الرابط الدائم ── */}
      <Card className="hrmp-hero-gradient relative overflow-hidden border-border/70">
        <div className="hrmp-zellige pointer-events-none absolute inset-0 opacity-40" aria-hidden />
        <CardContent className="relative flex flex-col items-center gap-5 p-6 text-center sm:p-8">
          <div className="flex items-center gap-3">
            <HrmpLogo className="size-12 drop-shadow-lg sm:size-16" />
            <div className="flex flex-col items-start" dir="ltr">
              <span className="text-xl font-extrabold tracking-tight text-white sm:text-2xl">HRMP</span>
              <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-0.5 text-[11px] font-medium text-white/90 backdrop-blur">
                <BadgeCheck className="size-3" aria-hidden />
                <span dir="ltr">v{APP_VERSION}</span>
              </span>
            </div>
          </div>

          <p className="max-w-xl text-pretty text-sm leading-7 text-white/85">{t("appPage.downloadSub")}</p>

          <div className="flex flex-wrap items-center justify-center gap-3">
            <Button
              asChild
              size="lg"
              className="gap-2 bg-white font-bold text-primary hover:bg-white/90"
            >
              <a href={APP_DOWNLOAD_URL} target="_blank" rel="noopener noreferrer">
                <Download className="size-4" aria-hidden />
                {t("appPage.downloadCta")}
              </a>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="gap-2 border-white/30 bg-transparent font-semibold text-white hover:bg-white/10 hover:text-white"
            >
              <a href={APP_RELEASES_URL} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="size-4" aria-hidden />
                {t("appPage.releasesLink")}
              </a>
            </Button>
          </div>
          <p className="text-[11px] leading-5 text-white/70" dir="ltr">
            HRMP.apk — {t("appPage.permanentNote")}
          </p>
        </CardContent>
      </Card>

      {/* ── التثبيت في 3 خطوات ── */}
      <section className="space-y-4">
        <h2 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
          {t("appPage.stepsTitle")}
        </h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {STEPS.map((s, i) => (
            <Card key={s.titleKey} className="hrmp-card-hover border-border/70 bg-card">
              <CardContent className="flex h-full flex-col gap-3 p-5">
                <div className="flex items-center justify-between gap-2">
                  <s.icon className="size-6 text-primary" aria-hidden />
                  <span
                    className="inline-flex size-7 items-center justify-center rounded-lg bg-gold/15 text-sm font-extrabold tabular-nums text-gold"
                    aria-hidden
                  >
                    {i + 1}
                  </span>
                </div>
                <h3 className="text-base font-bold leading-snug text-card-foreground">{t(s.titleKey)}</h3>
                <p className="text-sm leading-7 text-muted-foreground">{t(s.bodyKey)}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* ── تجاوز Play Protect ── */}
      <Card className="border-border/70 bg-card">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-start gap-3 text-base font-bold sm:text-lg">
            <ShieldAlert className="mt-0.5 size-6 shrink-0 text-gold" aria-hidden />
            <span className="leading-8">{t("appPage.ppTitle")}</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-[15px] leading-8 text-foreground/90">{t("appPage.ppBody")}</p>
          <ol className="space-y-2.5 ps-0">
            {["appPage.pp1", "appPage.pp2", "appPage.pp3"].map((k, i) => (
              <li key={k} className="flex items-start gap-2.5 text-[15px] leading-7 text-foreground/85">
                <span
                  className="mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-extrabold text-primary"
                  aria-hidden
                >
                  {i + 1}
                </span>
                <span>{t(k)}</span>
              </li>
            ))}
          </ol>
          <p className="rounded-lg bg-secondary/50 p-3 text-xs leading-6 text-muted-foreground">
            {t("appPage.ppReassure")}
          </p>
        </CardContent>
      </Card>

      {/* ── التحديثات + الحساب ── */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="hrmp-card-hover border-border/70 bg-card">
          <CardContent className="flex h-full flex-col gap-3 p-5">
            <RefreshCw className="size-6 text-primary" aria-hidden />
            <h3 className="text-base font-bold text-card-foreground">{t("appPage.updatesTitle")}</h3>
            <p className="text-sm leading-7 text-muted-foreground">{t("appPage.updatesBody")}</p>
          </CardContent>
        </Card>
        <Card className="hrmp-card-hover border-border/70 bg-card">
          <CardContent className="flex h-full flex-col gap-3 p-5">
            <KeyRound className="size-6 text-primary" aria-hidden />
            <h3 className="text-base font-bold text-card-foreground">{t("appPage.accountTitle")}</h3>
            <p className="text-sm leading-7 text-muted-foreground">{t("appPage.accountBody")}</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
