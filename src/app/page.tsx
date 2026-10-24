"use client";

// HRMP — صفحة الهبوط: الهوية الرسمية للمنصة (SPEC §1: المكونات والقرارات المعتمدة)
import Link from "next/link";
import {
  CalendarClock,
  MapPin,
  Calculator,
  Landmark,
  FileText,
  ShieldCheck,
  Cloud,
  Database,
  ScrollText,
  // Globe بدل Languages: أيقونة lucide «Languages» ترسم حرفًا صينيًا (文) بجانب A —
  // استُبدلت في كل المواضع بعد بلاغ المالك 2026-10-18 (كلمة صينية تظهر في الواجهة).
  Globe,
  ArrowLeft,
  ArrowRight,
  LogIn,
  Github,
  Scale,
  FileDown,
  // (طلب المالك 2026-10-24): بطاقة الاستقطاب والتوظيف في الوحدات الوظيفية
  Briefcase,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { LangSwitcher } from "@/components/hrmp/lang-switcher";
import { HrmpLogo, HrmpMark } from "@/components/hrmp/logo";
import { useI18n } from "@/i18n/provider";
// (بلاغ المالك 2026-10-24): اختصار تحميل تطبيق أندرويد من الرابط الدائم —
// زر مباشر على التطبيق + رابط دليل التثبيت وتجاوز Play Protect (/app).
import { Smartphone, Download } from "lucide-react";
import { APP_DOWNLOAD_URL } from "@/lib/app-download";

type Feature = {
  titleKey: string;
  descKey: string;
  icon: LucideIcon;
};

const FEATURES: Feature[] = [
  { titleKey: "landing.featureRecruitmentTitle", descKey: "landing.featureRecruitmentDesc", icon: Briefcase },
  { titleKey: "landing.featureSchedulingTitle", descKey: "landing.featureSchedulingDesc", icon: CalendarClock },
  { titleKey: "landing.featureGeofencingTitle", descKey: "landing.featureGeofencingDesc", icon: MapPin },
  { titleKey: "landing.featurePayrollTitle", descKey: "landing.featurePayrollDesc", icon: Calculator },
  { titleKey: "landing.featureDeclarationsTitle", descKey: "landing.featureDeclarationsDesc", icon: Landmark },
  { titleKey: "landing.featureReportsTitle", descKey: "landing.featureReportsDesc", icon: FileText },
  { titleKey: "landing.featureSecurityTitle", descKey: "landing.featureSecurityDesc", icon: ShieldCheck },
];

// ثلاث نقاط عن المراجع الرسمية (تُغذّى من القاموس)
const REFERENCE_POINTS: Feature[] = [
  { titleKey: "landing.refPoint1Title", descKey: "landing.refPoint1Desc", icon: Landmark },
  { titleKey: "landing.refPoint2Title", descKey: "landing.refPoint2Desc", icon: Scale },
  { titleKey: "landing.refPoint3Title", descKey: "landing.refPoint3Desc", icon: FileDown },
];

const TECH: Feature[] = [
  { titleKey: "landing.techItem1Title", descKey: "landing.techItem1Desc", icon: Cloud },
  { titleKey: "landing.techItem2Title", descKey: "landing.techItem2Desc", icon: Database },
  { titleKey: "landing.techItem3Title", descKey: "landing.techItem3Desc", icon: ScrollText },
  { titleKey: "landing.techItem4Title", descKey: "landing.techItem4Desc", icon: Globe },
];

function SectionHeading({ titleKey, subtitleKey }: { titleKey: string; subtitleKey?: string }) {
  const { t } = useI18n();
  return (
    <div className="mx-auto max-w-2xl text-center">
      <h2 className="text-balance text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
        {t(titleKey)}
      </h2>
      {subtitleKey && (
        <p className="mt-4 text-pretty text-base text-muted-foreground sm:text-lg">{t(subtitleKey)}</p>
      )}
      <div className="hrmp-gold-line mx-auto mt-6 w-24" aria-hidden />
    </div>
  );
}

function Stat({ valueKey, labelKey }: { valueKey: string; labelKey: string }) {
  const { t } = useI18n();
  return (
    <div className="hrmp-glass rounded-xl px-4 py-3 text-center min-w-28">
      <div className="text-xl font-bold text-white sm:text-2xl" dir="ltr">
        {t(valueKey)}
      </div>
      <div className="mt-1 text-xs text-white/75 sm:text-sm">{t(labelKey)}</div>
    </div>
  );
}

export default function LandingPage() {
  const { t, dir } = useI18n();
  const ForwardArrow = dir === "rtl" ? ArrowLeft : ArrowRight;

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      {/* ── الترويسة ── */}
      <header className="hrmp-sticky-top sticky top-0 z-50 border-b border-border/60 bg-background/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5" aria-label="HRMP">
            <HrmpLogo className="size-9" />
            <div className="flex flex-col leading-none">
              <span className="text-lg font-extrabold tracking-tight text-primary" dir="ltr">
                HRMP
              </span>
              <span className="hidden text-[11px] text-muted-foreground sm:block">{t("app.fullName")}</span>
            </div>
          </Link>
          <nav className="flex items-center gap-2" aria-label="main">
            <Button asChild variant="ghost" size="sm" className="hidden font-medium sm:inline-flex">
              <Link href="/jobs">{t("jobs.title")}</Link>
            </Button>
            <LangSwitcher />
            <Button asChild variant="outline" size="sm" className="gap-2 font-medium">
              <Link href="/login">
                <LogIn className="size-4" aria-hidden />
                <span className="hidden sm:inline">{t("nav.login")}</span>
                <span className="sm:hidden">↵</span>
              </Link>
            </Button>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        {/* ── البطل ── */}
        <section className="hrmp-hero-gradient relative overflow-hidden">
          <div className="hrmp-zellige absolute inset-0 opacity-60" aria-hidden />
          {/* العلامة المائية داخل البطل — لوغو ذهبي كبير بخفّة منخفضة (توقيع الهوية) */}
          <HrmpMark
            className="pointer-events-none absolute left-1/2 top-1/2 w-[30rem] max-w-[120%] -translate-x-1/2 -translate-y-1/2 select-none opacity-[0.08] sm:w-[34rem]"
            aria-hidden
          />
          <div className="relative mx-auto flex max-w-4xl flex-col items-center px-4 py-20 text-center sm:px-6 sm:py-28">
            <Badge variant="secondary" className="hrmp-glass mb-6 border-none text-white/90 hover:bg-white/10">
              {t("landing.badge")}
            </Badge>
            <h1 className="text-balance text-4xl font-extrabold leading-[1.2] tracking-tight text-white sm:text-5xl lg:text-6xl">
              {t("landing.heroTitle")}
            </h1>
            <p className="mt-6 max-w-2xl text-pretty text-base leading-relaxed text-white/85 sm:text-lg">
              {t("landing.heroSubtitle")}
            </p>
            <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
              <Button asChild size="lg" variant="secondary" className="gap-2 bg-white font-bold text-primary hover:bg-white/90">
                <Link href="/login">
                  {t("landing.ctaPrimary")}
                  <ForwardArrow className="size-4" aria-hidden />
                </Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="gap-2 border-white/30 bg-transparent font-semibold text-white hover:bg-white/10 hover:text-white"
              >
                <Link href="/jobs">
                  <Briefcase className="size-4" aria-hidden />
                  {t("jobs.me.browseCta")}
                </Link>
              </Button>
            </div>
            <div className="mt-12 flex flex-wrap items-center justify-center gap-3">
              <Stat valueKey="landing.statsCompaniesValue" labelKey="landing.statsCompanies" />
              <Stat valueKey="landing.statsLanguagesValue" labelKey="landing.statsLanguages" />
              <Stat valueKey="landing.statsPayrollValue" labelKey="landing.statsPayroll" />
              <Stat valueKey="landing.statsOfflineValue" labelKey="landing.statsOffline" />
            </div>
          </div>
        </section>

        {/* ── الوحدات الوظيفية ── */}
        <section id="features" className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-24">
          <SectionHeading titleKey="landing.featuresTitle" subtitleKey="landing.featuresSubtitle" />
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <Card key={f.titleKey} className="hrmp-card-hover group border-border/70 bg-card">
                <CardContent className="flex h-full flex-col gap-4 p-6">
                  <div className="flex size-12 items-center justify-center rounded-xl bg-secondary text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                    <f.icon className="size-6" aria-hidden />
                  </div>
                  <h3 className="text-lg font-bold leading-snug text-card-foreground">{t(f.titleKey)}</h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">{t(f.descKey)}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* ── المراجع الرسمية (روابط موثّقة + نصوص قانون للتحميل) ── */}
        <section id="references" className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-24">
          <SectionHeading titleKey="landing.referencesTitle" subtitleKey="landing.referencesSubtitle" />
          <div className="mt-12 grid gap-5 sm:grid-cols-3">
            {REFERENCE_POINTS.map((point) => (
              <div key={point.titleKey} className="hrmp-card-hover rounded-xl border border-border/70 bg-card p-5">
                <point.icon className="size-7 text-primary" aria-hidden />
                <h3 className="mt-4 text-base font-bold text-card-foreground">{t(point.titleKey)}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t(point.descKey)}</p>
              </div>
            ))}
          </div>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
            <Button asChild size="lg" variant="outline" className="gap-2">
              <Link href="/references">
                {t("landing.referencesCta")}
                <ForwardArrow className="size-4" aria-hidden />
              </Link>
            </Button>
          </div>
        </section>

        {/* ── البنية المرنة ── */}
        <section className="border-y border-border/60 bg-secondary/40">
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-24">
            <SectionHeading titleKey="landing.techTitle" subtitleKey="landing.techSubtitle" />
            <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {TECH.map((item) => (
                <div
                  key={item.titleKey}
                  className="hrmp-card-hover rounded-xl border border-border/70 bg-card p-5"
                >
                  <item.icon className="size-7 text-primary" aria-hidden />
                  <h3 className="mt-4 text-base font-bold text-card-foreground">{t(item.titleKey)}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t(item.descKey)}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      {/* ── التذييل ──
          البنية: شريط كحلي عميق (لون أرضية اللوغو) يحمل الشعار والعبارة، ثم
          الروابط — مع خط ذهبي علوي يفصله عن المحتوى (توقيع الهوية الجديدة). ── */}
      <footer className="hrmp-footer-band relative mt-auto overflow-hidden border-t-2 border-[var(--hrmp-gold)]/60">
        <div className="hrmp-zellige pointer-events-none absolute inset-0 opacity-40" aria-hidden />
        {/* العلامة المائية في الفوتر — لوغو ذهبي كبير بخفّة منخفضة */}
        <HrmpMark
          className="pointer-events-none absolute -end-20 -bottom-24 w-80 select-none opacity-[0.07] sm:-end-28 sm:w-96"
          aria-hidden
        />
        <div className="relative mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:px-6 md:grid-cols-[1fr_auto] md:items-start md:gap-12">
          <div className="space-y-6">
            <div className="flex items-start gap-4">
              <HrmpLogo className="size-14 shrink-0" />
              <div className="space-y-1.5">
                <p className="text-lg font-extrabold tracking-tight text-[var(--hrmp-gold)]" dir="ltr">
                  HRMP
                </p>
                <p className="max-w-md text-xs leading-6 text-white/75">{t("app.tagline")}</p>
              </div>
            </div>
            {/* اختصار التحميل المباشر (بلاغ المالك 2026-10-24): زر من الرابط الدائم + رابط الدليل */}
            <div className="flex flex-wrap items-center gap-3">
              <a
                href={APP_DOWNLOAD_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-[var(--hrmp-gold)] px-4 text-sm font-bold text-[#0f2242] shadow-lg transition-transform hover:scale-[1.02] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--hrmp-gold)]"
              >
                <Download className="size-4" aria-hidden />
                {t("appPage.downloadCta")}
              </a>
              <Link
                href="/app"
                className="inline-flex h-10 items-center gap-2 rounded-lg border border-white/25 bg-white/10 px-4 text-sm font-semibold text-white/90 backdrop-blur transition-colors hover:bg-white/20 hover:text-white"
              >
                <Smartphone className="size-4" aria-hidden />
                {t("nav.appDownload")}
              </Link>
            </div>
          </div>

          <nav className="flex flex-col gap-3 text-xs text-white/70 md:items-end">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 md:justify-end">
              <Link href="/jobs" className="inline-flex items-center gap-1.5 underline-offset-4 hover:text-white hover:underline">
                <Briefcase className="size-3.5 shrink-0" aria-hidden />
                {t("jobs.title")}
              </Link>
              <Link href="/references" className="inline-flex items-center gap-1.5 underline-offset-4 hover:text-white hover:underline">
                <Scale className="size-3.5" aria-hidden />
                {t("landing.referencesCta")}
              </Link>
              <Link href="/guide" className="underline-offset-4 hover:text-white hover:underline">
                {t("guide.title")}
              </Link>
              <Link href="/legal/terms" className="underline-offset-4 hover:text-white hover:underline">
                {t("legal.terms.title")}
              </Link>
              <Link href="/legal/privacy" className="underline-offset-4 hover:text-white hover:underline">
                {t("legal.privacy.title")}
              </Link>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 md:justify-end">
              <a
                href="https://github.com/tarikchouika/HRMP"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 underline-offset-4 hover:text-white hover:underline"
              >
                <Github className="size-3.5 shrink-0" aria-hidden />
                <span dir="ltr">tarikchouika/HRMP</span>
              </a>
              <span aria-hidden>·</span>
              <span>{t("landing.footerRights")}</span>
            </div>
          </nav>
        </div>
        <div className="h-1 w-full bg-gradient-to-l from-transparent via-[var(--hrmp-gold)] to-transparent opacity-80" aria-hidden />
      </footer>
    </div>
  );
}
