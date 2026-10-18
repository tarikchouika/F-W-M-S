import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { ShieldCheck } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LangSwitcher } from "@/components/fwms/lang-switcher";
import { FwmsLogo } from "@/components/fwms/logo";
import { LoginForm } from "@/components/fwms/login-form";
import { getSession } from "@/lib/auth/session";
import { getPlatformBranding } from "@/lib/branding";
import { APP_VERSION } from "@/lib/version";
import { LOCALE_COOKIE, resolveLocale } from "@/i18n/config";
import { getDictionary, tServer } from "@/i18n/get-dictionary";

export async function generateMetadata(): Promise<Metadata> {
  const store = await cookies();
  const dict = getDictionary(resolveLocale(store.get(LOCALE_COOKIE)?.value));
  return { title: tServer(dict, "auth.loginTitle") };
}

export default async function LoginPage() {
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

  const store = await cookies();
  const dict = getDictionary(resolveLocale(store.get(LOCALE_COOKIE)?.value));
  // هوية مالك المنصة (white-label — SPEC §3.2): الاسم المعروض من القاعدة لا ثابت كود
  const branding = await getPlatformBranding();

  return (
    <div className="fwms-hero-gradient relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-4 py-10">
      <div className="fwms-zellige absolute inset-0 opacity-50" aria-hidden />

      <div className="absolute top-4 end-4 z-10">
        <LangSwitcher variant="secondary" />
      </div>

      <div className="relative z-10 flex w-full max-w-sm flex-col items-center gap-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <FwmsLogo className="size-14 drop-shadow-lg" />
          <div className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-white/90 backdrop-blur">
            <ShieldCheck className="size-3.5" aria-hidden />
            <span dir="ltr">{branding.displayName} · v{APP_VERSION}</span>
          </div>
        </div>

        <Card className="w-full border-white/20 bg-white/95 shadow-2xl backdrop-blur">
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
    </div>
  );
}
