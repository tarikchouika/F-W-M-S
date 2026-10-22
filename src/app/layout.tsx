import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Noto_Sans_Arabic } from "next/font/google";
import { cookies } from "next/headers";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { ThemeProvider } from "next-themes";
import { I18nProvider } from "@/i18n/provider";
import { ServiceWorkerRegister } from "@/components/fwms/sw-register";
import { NativeShell } from "@/components/fwms/native-shell";
import { LOCALE_COOKIE, localeDirection, resolveLocale } from "@/i18n/config";
import { getDictionary, tServer } from "@/i18n/get-dictionary";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const notoArabic = Noto_Sans_Arabic({
  variable: "--font-noto-arabic",
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "700"],
});

// i18n (بلاغ المالك «خلل الترجمة» 2026-10-19 — الجولة الثانية): العنوان الافتراضي والوصف
// كانا عربيين مثبتين لكل اللغات — صارا من القاموس بلغة الزائر (كوكي FWMS_LOCALE).
// generateMetadata بدل metadata الثابتة — نفس نمط كل صفحات المنصة.
export async function generateMetadata(): Promise<Metadata> {
  const store = await cookies();
  const dict = getDictionary(resolveLocale(store.get(LOCALE_COOKIE)?.value));
  return {
    title: {
      default: tServer(dict, "meta.title"),
      template: "%s | FWMS",
    },
    description: tServer(dict, "meta.description"),
    keywords: ["FWMS", "workforce", "Morocco", "CNSS", "AMO", "IR", "geofencing", "payroll"],
    manifest: "/manifest.json",
    // الفافكون — من اللوغو المعتمد 2026-10-21 (توليد: scripts/gen-brand-assets.mjs)
    icons: {
      icon: [
        { url: "/favicon.ico", sizes: "48x48" },
        { url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" },
        { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      ],
      apple: "/icons/apple-touch-icon.png",
    },
  };
}

export const viewport: Viewport = {
  // لون شريط المتصفح يتبع الهوية الجديدة (كحلي — لون أرضية اللوغو)
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#0f2242" },
    { media: "(prefers-color-scheme: dark)", color: "#0b1b33" },
  ],
  width: "device-width",
  initialScale: 1,
  // الغلاف الأصلي (تطبيق أندرويد): viewport-fit=cover ضروري لتفعيل
  // env(safe-area-inset-*) وحافة-لحافة — بلاغ المالك 2026-10-23
  viewportFit: "cover",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // اللغة من cookie (تحددها واجهة تبديل اللغة) — العربية افتراضياً (SPEC §2)
  const store = await cookies();
  const locale = resolveLocale(store.get(LOCALE_COOKIE)?.value);
  const dict = getDictionary(locale);

  return (
    <html lang={locale} dir={localeDirection[locale]} suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${notoArabic.variable} antialiased bg-background text-foreground`}
      >
        {/* المظهر: next-themes يضبط `.dark` على <html> قبل الرسم الأول (بلا وميض) —
            <html> يحمل suppressHydrationWarning أصلًا (شرط هذا النمط). */}
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <I18nProvider locale={locale} dict={dict}>
            {children}
          </I18nProvider>
          <Toaster />
          <ServiceWorkerRegister />
          <NativeShell />
        </ThemeProvider>
      </body>
    </html>
  );
}
