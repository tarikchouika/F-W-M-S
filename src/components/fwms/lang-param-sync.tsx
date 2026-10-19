"use client";

// FWMS — شبكة أمان لمزامنة لغة رابط الدخول مع الكوكي (بلاغ «خلل في الترجمة» 2026-10-19)
// ---------------------------------------------------------------------------
// **الآلية الأساسية الآن هي الوسيط الجذري `src/middleware.ts`** (جولة 2026-10-19
// الثالثة): يضبط كوكي الطلب قبل الـSSR فيرى الجذرُ والمزوّد لغةَ الرابط من أول
// رندر — وبذلك يصبح هذا المكوّن **no-op** في المسار الطبيعي (لغة المزوّد تطابق
// لغة الرابط منذ البداية). يُبقى كشبكة أمان: إن أُقصي الوسيط من النطاق مستقبلًا
// (config.matcher) أو فشل، يظل هذا المزامن يجعل العميل يلحق باللغة عبر إجراء
// الخادم الموثّق + router.refresh.
// لا حالة محلية: عمل واحد ثم ينتهي (لا يثير react-hooks/set-state-in-effect).
import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/i18n/provider";
import { setLocaleAction } from "@/i18n/actions";

export function LangParamSync({ paramLocale }: { paramLocale: string }) {
  const { locale } = useI18n();
  const router = useRouter();
  const applied = useRef(false);

  useEffect(() => {
    if (applied.current) return;
    if (paramLocale === locale) return;
    applied.current = true;
    setLocaleAction(paramLocale)
      .then(() => router.refresh())
      .catch(() => null); // فشل المزامنة ليس خطأ يمنع الدخول — الكوكي يبقى كما كان
  }, [paramLocale, locale, router]);

  return null;
}
