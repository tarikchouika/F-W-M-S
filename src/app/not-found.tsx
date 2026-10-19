// FWMS — صفحة 404 مترجمة (بلاغ المالك «خلل في الترجمة» 2026-10-19 — الجولة الثانية)
// ---------------------------------------------------------------------------
// كانت المنصة بلا not-found.tsx جذري، فكان أي رابط غير موجود يعرض صفحة Next.js
// الإنجليزية الافتراضية («This page could not be found») لكل اللغات — بما فيها
// العربية. الآن تُعرض من القاموس بلغة الزائر (كوكي FWMS_LOCALE — نمط الجذر نفسه).
// ملاحظة: not-found الجذري يُعرض داخل root layout فيبقى مزوّد اللغة والهوية متاحين.
import Link from "next/link";
import { cookies } from "next/headers";
import { FileQuestion, ArrowLeft, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LOCALE_COOKIE, localeDirection, resolveLocale } from "@/i18n/config";
import { getDictionary, tServer } from "@/i18n/get-dictionary";

export default async function NotFound() {
  const store = await cookies();
  const locale = resolveLocale(store.get(LOCALE_COOKIE)?.value);
  const dict = getDictionary(locale);
  const dir = localeDirection[locale];
  const BackArrow = dir === "rtl" ? ArrowRight : ArrowLeft;

  return (
    <main className="fwms-hero-gradient flex min-h-screen flex-col items-center justify-center gap-6 px-4 text-center">
      <div className="fwms-zellige absolute inset-0 opacity-50" aria-hidden />
      <div className="relative z-10 flex max-w-md flex-col items-center gap-5 rounded-2xl border border-white/20 bg-card/95 p-8 shadow-2xl backdrop-blur">
        <FileQuestion className="size-12 text-muted-foreground" aria-hidden />
        <div className="space-y-2">
          <h1 dir={dir} className="text-2xl font-bold text-card-foreground">
            {tServer(dict, "errors.notFoundTitle")}
          </h1>
          <p dir={dir} className="text-sm text-muted-foreground">
            {tServer(dict, "errors.notFoundHint")}
          </p>
        </div>
        <Button asChild className="gap-2">
          <Link href="/">
            <BackArrow className="size-4" aria-hidden />
            {tServer(dict, "errors.notFoundAction")}
          </Link>
        </Button>
      </div>
    </main>
  );
}
