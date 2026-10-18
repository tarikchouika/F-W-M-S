import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Noto_Sans_Arabic } from "next/font/google";
import { cookies } from "next/headers";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { ThemeProvider } from "next-themes";
import { I18nProvider } from "@/i18n/provider";
import { ServiceWorkerRegister } from "@/components/fwms/sw-register";
import { LOCALE_COOKIE, localeDirection, resolveLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/get-dictionary";

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

export const metadata: Metadata = {
  title: {
    default: "FWMS — نظام إدارة القوى العاملة الميدانية",
    template: "%s | FWMS",
  },
  description:
    "منصة مغربية متعددة الشركات لإدارة العمالة الميدانية: حضور جغرافي، جدولة، أجور بقواعد مدونة الشغل (CNSS/AMO/IR)، وتصاريح رسمية — بأربع لغات.",
  keywords: ["FWMS", "workforce", "Morocco", "CNSS", "AMO", "IR", "geofencing", "payroll"],
  manifest: "/manifest.json",
  icons: { icon: "/logo.svg", apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  // لون شريط المتصفح يتبع مخطط النظام (لا يقرأ localStorage — قيد metadata):
  // الفاتح أخضر الهوية #14532d (مطابق لـ manifest) والقاتم خلفية .dark (#07100b).
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#14532d" },
    { media: "(prefers-color-scheme: dark)", color: "#07100b" },
  ],
  width: "device-width",
  initialScale: 1,
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
        </ThemeProvider>
      </body>
    </html>
  );
}
