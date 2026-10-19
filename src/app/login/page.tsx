import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { ShieldCheck } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LangSwitcher } from "@/components/fwms/lang-switcher";
import { ThemeSwitcher } from "@/components/fwms/theme-switcher";
import { FwmsLogo } from "@/components/fwms/logo";
import { LoginForm } from "@/components/fwms/login-form";
import { getSession } from "@/lib/auth/session";
import { getPlatformBranding } from "@/lib/branding";
import { APP_VERSION } from "@/lib/version";
import { LOCALE_COOKIE, localeDirection, resolveLocale } from "@/i18n/config";
import { getDictionary, tServer } from "@/i18n/get-dictionary";
import { LangParamSync } from "@/components/fwms/lang-param-sync";

type LoginProps = {
  searchParams: Promise<{ lang?: string }>;
};

/** لغة صفحة الدخول من معامل lang ثم كوكي FWMS_LOCALE — نفس أولوية صفحة /verify
 *  (v0.10.3). بلاغ «خلل الترجمة» 2026-10-19: /login?lang=fr كان يُعرض عربيًّا. */
async function resolvePageLocale(searchParams: { lang?: string }) {
  const { lang } = searchParams;
  const store = await cookies();
  const cookieLocale = resolveLocale(store.get(LOCALE_COOKIE)?.value);
  return lang === "ar" || lang === "fr" || lang === "en" || lang === "es" ? lang : cookieLocale;
}

export async function generateMetadata({ searchParams }: LoginProps): Promise<Metadata> {
  const dict = getDictionary(await resolvePageLocale(await searchParams));
  return { title: tServer(dict, "auth.loginTitle") };
}

export default async function LoginPage({ searchParams }: LoginProps) {
  // مسجَّل الدخول مسبقًا؟ إلى لوحة التحكم مباشرة
  //
  // محصّنة (بلاغ المالك 2026-10-19 «صفحة خطأ عند تسجيل الدخول» — Application error:
  // a server-side exception + Digest): getSession تلمس القاعدة خلال SSR — أي فشل
  // عابر فيها كان يرمي فتنهار صفحة الدخول كلها ويُمنع المستخدم من الدخول أصلًا.
  // فشل عابر = «لا جلسة» فيُعرض نموذج الدخول (الأصل) بدل صفحة خطأ. لا نلمس
  // getSession ذاتها: حراسة المسارات الأخرى (API/لوحة) تبقى صريحة كما هي.
  let session: Awaited<ReturnType<typeof getSession>> = null;
  try {
    session = await getSession();
  } catch (e) {
    console.error("[FWMS][login] فشل عابر في قراءة الجلسة — نتابع كـ «لا جلسة»:", e);
  }
  if (session) redirect("/dashboard");

  const pageLocale = await resolvePageLocale(await searchParams);
  const dict = getDictionary(pageLocale);
  // هوية مالك المنصة (white-label — SPEC §3.2): الاسم المعروض من القاعدة لا ثابت كود
  const branding = await getPlatformBranding();

  return (
    <div
      dir={localeDirection[pageLocale]}
      className="fwms-hero-gradient relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-4 py-10 lg:px-8"
    >
      <div className="fwms-zellige absolute inset-0 opacity-50" aria-hidden />

      {/* لغة الرابط (?lang=) تُطبّق على الكوكي مرة واحدة فيتحدّث نموذج الدخول (عميل) —
          لا شيء يُعرض من هذا المكوّن */}
      <LangParamSync paramLocale={pageLocale} />

      <div className="absolute top-4 end-4 z-10 flex items-center gap-2">
        {/* زجاجي فوق التدرّج: يعمل في الوضعين (الفاتح والقاتم) بلا اعتماد على secondary */}
        <LangSwitcher variant="secondary" className="border-white/25 bg-white/12 text-white backdrop-blur hover:bg-white/20 hover:text-white focus-visible:ring-white/40" />
        <ThemeSwitcher variant="secondary" className="border-white/25 bg-white/12 text-white backdrop-blur hover:bg-white/20 hover:text-white focus-visible:ring-white/40" />
      </div>

      {/* الحاسوب: عمودان — لوحة الهوية + بطاقة الدخول (يُملآن الشاشة بدل ترك مساحة ميتة) — الجوال: مكدّستان في عمود */}
      <div className="relative z-10 grid w-full max-w-5xl items-center gap-8 lg:grid-cols-2 lg:gap-16">
        {/* لوحة الهوية — بلا أي نص مثبّت: الاسم من القاعدة (white-label) والإصدار من version.ts */}
        <div className="flex flex-col items-center gap-4 text-center lg:items-start lg:text-start">
          <FwmsLogo className="size-14 drop-shadow-lg lg:size-20" />
          <div className="text-2xl font-bold text-white drop-shadow lg:text-3xl" dir="ltr">
            {branding.displayName}
          </div>
          <div className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-white/90 backdrop-blur">
            <ShieldCheck className="size-3.5" aria-hidden />
            <span dir="ltr">v{APP_VERSION}</span>
          </div>
        </div>

        {/* bg-card/95 بدل أبيض مثبّت: فاتح = أبيض فوق التدرّج، قاتم = أخضر داكن أوضح منه */}
        <Card className="w-full max-w-md justify-self-center border-white/20 bg-card/95 shadow-2xl backdrop-blur lg:max-w-none">
          <CardHeader className="text-center">
            <CardTitle className="text-xl font-bold text-card-foreground">
              {tServer(dict, "auth.loginTitle")}
            </CardTitle>
            <CardDescription>{tServer(dict, "auth.loginSubtitle")}</CardDescription>
          </CardHeader>
          <CardContent>
            <LoginForm />
          </CardContent>
        </Card>
      </div>

      {/* (جولة 2026-10-19): روابط الصفحات القانونية والدليل — بكل لغات الواجهة */}
      <nav className="relative z-10 mt-6 flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
        {[
          { href: "/legal/terms", label: tServer(dict, "legal.terms.title") },
          { href: "/legal/privacy", label: tServer(dict, "legal.privacy.title") },
          { href: "/legal/safety", label: tServer(dict, "legal.safety.title") },
          { href: "/legal/rights", label: tServer(dict, "legal.rights.title") },
          { href: "/guide", label: tServer(dict, "guide.title") },
        ].map((l) => (
          <a
            key={l.href}
            href={l.href}
            className="text-xs text-white/80 underline-offset-4 hover:text-white hover:underline"
          >
            {l.label}
          </a>
        ))}
      </nav>
    </div>
  );
}
