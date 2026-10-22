"use client";

// FWMS — حد أخطاء العرض العام (بلاغ المالك 2026-10-19 «صفحة خطأ عند تسجيل الدخول»):
// بدون هذا الملف، أي استثناء غير ملتقط خلال SSR (مثل فشل قاعدة عابر) يعرض للمستخدم
// صفحة Next.js الافتراضية الإنجليزية «Application error: a server-side exception has
// occurred … Digest: N» — انظر بلا الدخول إلى المنصة أصلًا. هذا الحد يلتقط أي خطأ
// في أي صفحة تحت الجذر (عدا أخطاء الـ root layout نفسها — يلتقطها global-error.tsx)
// ويعرض صفحة أنيقة بهوية FWMS مع إعادة المحاولة بدل الرفض الكامل.
//
// i18n (بلاغ المالك 2026-10-19 «خلل في الترجمة»): النصوص كلها من القواميس الأربع
// (ar/fr/en/es) عبر useI18n — الحد يُعرض داخل الـ root layout فيظل مزوّد اللغة
// متاحًا له (الأخطاء التي تقلع الجذر كله يعالجها global-error.tsx بنسخته المضمنة).
// الاتجاه (rtl/ltr) واللغة من المزوّد نفسه — لا نصوص مثبتة في الكود إطلاقًا.
import { useEffect } from "react";
import { useI18n } from "@/i18n/provider";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { t, locale, dir } = useI18n();

  useEffect(() => {
    // الخطأ يُسجَّل دائمًا للسجلات (Vercel) — التفاصيل أدناه للبيئة التطويرية فقط
    console.error("[FWMS][error-boundary] خطأ عرض غير ملتقط:", error);
  }, [error]);

  return (
    <div
      dir={dir}
      lang={locale}
      className="fwms-hero-gradient relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-4 py-10"
      style={{
        background:
          "linear-gradient(160deg, oklch(0.28 0.04 160) 0%, oklch(0.42 0.09 160) 55%, oklch(0.5 0.1 150) 100%)",
      }}
    >
      <div className="fwms-zellige absolute inset-0 opacity-50" aria-hidden />

      <div className="relative z-10 flex w-full max-w-md flex-col items-center gap-6 text-center">
        {/* أيقونة تحذير مضمّنة — بلا اعتماد على أي حزمة حتى في أسوأ الحالات */}
        <svg
          width="64"
          height="64"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-amber-300 drop-shadow-lg"
          aria-hidden
        >
          <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 20h16a2 2 0 0 0 1.73-2Z" />
          <path d="M12 9v4" />
          <path d="M12 17h.01" />
        </svg>

        <div className="space-y-2">
          <h1 className="text-balance text-2xl font-bold text-white sm:text-3xl">
            {t("errors.title")}
          </h1>
          <p className="text-pretty text-sm leading-relaxed text-white/85 sm:text-base">
            {t("errors.pageHint")}
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={reset}
            className="rounded-lg bg-white px-6 py-2.5 text-sm font-bold text-primary shadow-lg transition-colors hover:bg-white/90"
          >
            {t("common.retry")}
          </button>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-lg border border-white/30 bg-transparent px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-white/10"
          >
            {t("errors.reload")}
          </button>
        </div>

        {error.digest ? (
          <p dir="ltr" className="font-mono text-[11px] text-white/55">
            {t("errors.digestLabel")}: {error.digest}
          </p>
        ) : null}

        {process.env.NODE_ENV === "development" && error.message ? (
          <pre
            dir="ltr"
            className="max-h-32 w-full overflow-auto rounded-lg bg-black/30 p-3 text-left font-mono text-[11px] text-white/75"
          >
            {error.message}
          </pre>
        ) : null}
      </div>
    </div>
  );
}
