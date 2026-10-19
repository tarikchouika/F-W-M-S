// FWMS — هيكل الصفحات العامة (قانونية/دليل): ترويسة بهوية المنصة + تذييل بروابط
// (جولة 2026-10-19): صفحات قانونية وتوضيحية لكل اللغات بهوية بصرية منسجمة.
"use client";

import Link from "next/link";
import { useI18n } from "@/i18n/provider";
import { LangSwitcher } from "@/components/fwms/lang-switcher";
import { ThemeSwitcher } from "@/components/fwms/theme-switcher";
import { FwmsLogo } from "@/components/fwms/logo";
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
  return (
    <div className="fwms-hero-gradient flex min-h-screen flex-col">
      <header className="container flex h-16 items-center justify-between gap-3">
        <Link href="/" className="flex items-center gap-2" aria-label="FWMS">
          <FwmsLogo className="size-8" />
          <span className="text-sm font-semibold text-foreground">FWMS</span>
        </Link>
        <div className="flex items-center gap-1.5">
          <LangSwitcher />
          <ThemeSwitcher />
        </div>
      </header>

      <main className="container flex-1 pb-10">{children}</main>

      <footer className="border-t border-border/60 bg-background/80 py-6">
        <div className="container space-y-3">
          <nav className="flex flex-wrap items-center gap-x-4 gap-y-2">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              >
                {l.label}
              </Link>
            ))}
          </nav>
          <Separator className="opacity-40" />
          <p className="text-[11px] text-muted-foreground" dir="ltr">
            FWMS · v{process.env.NEXT_PUBLIC_APP_VERSION ?? "0.11.0"} —{" "}
            {t("legal.rights.subtitle")}
          </p>
        </div>
      </footer>
    </div>
  );
}
