// HRMP — هيكل الصفحات العامة (قانونية/دليل): ترويسة بهوية المنصة + تذييل بروابط
// (جولة 2026-10-19): صفحات قانونية وتوضيحية لكل اللغات بهوية بصرية منسجمة.
"use client";

import Link from "next/link";
import { useI18n } from "@/i18n/provider";
import { LangSwitcher } from "@/components/hrmp/lang-switcher";
import { ThemeSwitcher } from "@/components/hrmp/theme-switcher";
import { HrmpLogo, HrmpMark } from "@/components/hrmp/logo";
import { Separator } from "@/components/ui/separator";
// (تدقيق 2026-10-24): الإصدار من مصدره الواحد version.ts — كان يقرأ
// NEXT_PUBLIC_APP_VERSION وهي غير معرّفة في أي مكان ⇒ احتياطي «0.11.0» متقادم
// ظاهر في تذييل كل الصفحات القانونية بينما المنصة على 0.12.2 (خلل خفي من
// نوع «إصدار قديم غير مكتمل» — درس 2026-10-18).
import { APP_VERSION } from "@/lib/version";

export function PublicLegalShell({
  children,
  headerActions,
}: {
  children: React.ReactNode;
  headerActions?: React.ReactNode;
}) {
  const { t } = useI18n();
  const links: { href: string; label: string }[] = [
    { href: "/legal/terms", label: t("legal.terms.title") },
    { href: "/legal/privacy", label: t("legal.privacy.title") },
    { href: "/legal/safety", label: t("legal.safety.title") },
    { href: "/legal/rights", label: t("legal.rights.title") },
    { href: "/guide", label: t("guide.title") },
    // (بلاغ المالك 2026-10-24): اختصار تطبيق أندرويد على كل الصفحات العامة
    { href: "/app", label: t("nav.appDownload") },
    // (طلب المالك 2026-10-24): قسم الوظائف العامة في تذييل كل الصفحات
    { href: "/jobs", label: t("jobs.title") },
  ];
  // ⚠️ الخلفية **فاتحة** لا hrmp-hero-gradient (الأخضر الداكن):
  // محتوى هذه الصفحات (نص foreground داكن) كان يُرسم على تدرّج أخضر داكن ⇒
  // عنوان الصفحة غير مقروء (بلاغ المالك 2026-10-20). الآن: سطح فاتح + شريط
  // علوي رفيع بلون الهوية (كحلي/ذهبي) يبقى التوقيع البصري.
  //
  // px-4 (بلاغ المالك 2026-10-22 «غير متناسب مع الحواسيب» + حواف الجوال):
  // صنف container في Tailwind 4 لم يعد يحمل حشوة أفقية افتراضية — كانت النصوص
  // تلتصق بحواف الشاشة على الجوال، والمحتوى بلا تنفّس على الحواسيب.
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="border-b border-border/60 bg-background/90 backdrop-blur">
        <div className="container flex h-16 items-center justify-between gap-3 px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2" aria-label="HRMP">
            <HrmpLogo className="size-8" />
            <span className="text-sm font-semibold text-foreground">HRMP</span>
          </Link>
          <div className="flex items-center gap-1.5">
            {headerActions}
            <LangSwitcher />
            <ThemeSwitcher />
          </div>
        </div>
      </header>

      <main className="container flex-1 px-4 pb-12 pt-2 sm:px-6">{children}</main>

      <footer className="hrmp-footer-band relative overflow-hidden border-t-2 border-[var(--hrmp-gold)]/60">
        <div className="hrmp-zellige pointer-events-none absolute inset-0 opacity-30" aria-hidden />
        <HrmpMark className="pointer-events-none absolute -end-16 -bottom-20 w-64 select-none opacity-[0.07]" aria-hidden />
        <div className="container relative space-y-3 px-4 py-7 sm:px-6">
          <div className="flex items-center gap-3">
            <HrmpLogo className="size-10 shrink-0" />
            <p className="text-sm font-semibold text-[var(--hrmp-gold)]" dir="ltr">
              HRMP
            </p>
          </div>
          <nav className="flex flex-wrap items-center gap-x-4 gap-y-2">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="text-xs text-white/75 underline-offset-4 hover:text-white hover:underline"
              >
                {l.label}
              </Link>
            ))}
          </nav>
          <Separator className="bg-white/15 opacity-60" />
          <p className="text-[11px] text-white/65" dir="ltr">
            HRMP · v{APP_VERSION} — {t("legal.rights.subtitle")}
          </p>
        </div>
      </footer>
    </div>
  );
}
