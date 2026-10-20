"use client";

// FWMS — صفحة الهبوط: الهوية الرسمية للمنصة (SPEC §1: المكونات والقرارات المعتمدة)
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
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { LangSwitcher } from "@/components/fwms/lang-switcher";
import { FwmsLogo } from "@/components/fwms/logo";
import { useI18n } from "@/i18n/provider";

type Feature = {
  titleKey: string;
  descKey: string;
  icon: LucideIcon;
};

const FEATURES: Feature[] = [
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
      <div className="fwms-gold-line mx-auto mt-6 w-24" aria-hidden />
    </div>
  );
}

function Stat({ valueKey, labelKey }: { valueKey: string; labelKey: string }) {
  const { t } = useI18n();
  return (
    <div className="fwms-glass rounded-xl px-4 py-3 text-center min-w-28">
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
    <div className="flex min-h-screen flex-col bg-background">
      {/* ── الترويسة ── */}
      <header className="sticky top-0 z-50 border-b border-border/60 bg-background/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5" aria-label="FWMS">
            <FwmsLogo className="size-9" />
            <div className="flex flex-col leading-none">
              <span className="text-lg font-extrabold tracking-tight text-primary">FWMS</span>
              <span className="hidden text-[11px] text-muted-foreground sm:block">{t("app.fullName")}</span>
            </div>
          </Link>
          <nav className="flex items-center gap-2" aria-label="main">
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
        <section className="fwms-hero-gradient relative overflow-hidden">
          <div className="fwms-zellige absolute inset-0 opacity-60" aria-hidden />
          <div className="relative mx-auto flex max-w-4xl flex-col items-center px-4 py-20 text-center sm:px-6 sm:py-28">
            <Badge variant="secondary" className="fwms-glass mb-6 border-none text-white/90 hover:bg-white/10">
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
                <Link href="/login">{t("landing.ctaSecondary")}</Link>
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
              <Card key={f.titleKey} className="fwms-card-hover group border-border/70 bg-card">
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
              <div key={point.titleKey} className="fwms-card-hover rounded-xl border border-border/70 bg-card p-5">
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
                  className="fwms-card-hover rounded-xl border border-border/70 bg-card p-5"
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
          البنية: عمودان واضحان (الهوية في بداية القراءة · الروابط في نهايتها)
          مع فاصل ذهبي — التذييل القديم كان يخلط الشعار بالعبارة اللاتينية
          فبدا «مشوّهًا» في الاتجاه العربي (بلاغ المالك 2026-10-20). ── */}
      <footer className="mt-auto border-t border-border/60 bg-background">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:px-6 md:grid-cols-[1fr_auto] md:items-start md:gap-12">
          <div className="flex items-start gap-3">
            <FwmsLogo className="size-9 shrink-0" />
            <div className="space-y-1">
              <p className="text-sm font-bold text-primary" dir="ltr">
                FWMS
              </p>
              <p className="max-w-md text-xs leading-6 text-muted-foreground">{t("app.tagline")}</p>
            </div>
          </div>

          <nav className="flex flex-col gap-3 text-xs text-muted-foreground md:items-end">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 md:justify-end">
              <Link href="/references" className="inline-flex items-center gap-1.5 underline-offset-4 hover:text-foreground hover:underline">
                <Scale className="size-3.5" aria-hidden />
                {t("landing.referencesCta")}
              </Link>
              <Link href="/guide" className="underline-offset-4 hover:text-foreground hover:underline">
                {t("guide.title")}
              </Link>
              <Link href="/legal/terms" className="underline-offset-4 hover:text-foreground hover:underline">
                {t("legal.terms.title")}
              </Link>
              <Link href="/legal/privacy" className="underline-offset-4 hover:text-foreground hover:underline">
                {t("legal.privacy.title")}
              </Link>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 md:justify-end">
              <a
                href="https://github.com/tarikchouika/F-W-M-S"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 underline-offset-4 hover:text-foreground hover:underline"
              >
                <Github className="size-3.5 shrink-0" aria-hidden />
                <span dir="ltr">tarikchouika/F-W-M-S</span>
              </a>
              <span aria-hidden>·</span>
              <span>{t("landing.footerRights")}</span>
            </div>
          </nav>
        </div>
        <div className="h-1 w-full bg-gradient-to-l from-primary via-[var(--fwms-gold)] to-primary opacity-70" aria-hidden />
      </footer>
    </div>
  );
}
