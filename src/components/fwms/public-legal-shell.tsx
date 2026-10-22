// FWMS — هيكل الصفحات العامة (قانونية/دليل): ترويسة بهوية المنصة + تذييل بروابط
// (جولة 2026-10-19): صفحات قانونية وتوضيحية لكل اللغات بهوية بصرية منسجمة.
"use client";

import Link from "next/link";
import { useI18n } from "@/i18n/provider";
import { LangSwitcher } from "@/components/fwms/lang-switcher";
import { ThemeSwitcher } from "@/components/fwms/theme-switcher";
import { FwmsLogo, FwmsMark } from "@/components/fwms/logo";
import { Separator } from "@/components/ui/separator";
import { APP_VERSION } from "@/lib/version";

export function PublicLegalShell({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();
  const links: { href: string; label: string }[] = [
    { href: "/legal/terms", label: t("legal.terms.title") },
    { href: "/legal/privacy", label: t("legal.privacy.title") },
    { href: "/legal/safety", label: t("legal.safety.title") },
    { href: "/legal/rights", label: t("legal.rights.title") },
    { href: "/guide", label: t("guide.title") },
  ];
  // ⚠️ الخلفية **فاتحة** لا fwms-hero-gradient (الأخضر الداكن):
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
          <Link href="/" className="flex items-center gap-2" aria-label="FWMS">
            <FwmsLogo className="size-8" />
            <span className="text-sm font-semibold text-foreground">FWMS</span>
          </Link>
          <div className="flex items-center gap-1.5">
            <LangSwitcher />
            <ThemeSwitcher />
          </div>
        </div>
      </header>

      <main className="container flex-1 px-4 pb-12 pt-2 sm:px-6">{children}</main>

      <footer className="fwms-footer-band relative overflow-hidden border-t-2 border-[var(--fwms-gold)]/60">
        <div className="fwms-zellige pointer-events-none absolute inset-0 opacity-30" aria-hidden />
        <FwmsMark className="pointer-events-none absolute -end-16 -bottom-20 w-64 select-none opacity-[0.07]" aria-hidden />
        <div className="container relative space-y-3 px-4 py-7 sm:px-6">
          <div className="flex items-center gap-3">
            <FwmsLogo className="size-10 shrink-0" />
            <p className="text-sm font-semibold text-[var(--fwms-gold)]" dir="ltr">
              FWMS
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
            FWMS · v{process.env.NEXT_PUBLIC_APP_VERSION ?? "0.11.0"} —{" "}
            {t("legal.rights.subtitle")}
          </p>
        </div>
      </footer>
    </div>
  );
}
