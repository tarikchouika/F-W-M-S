"use client";

// FWMS — مزامنة لغة رابط الدخول مع الكوكي (بلاغ «خلل في الترجمة» 2026-10-19)
// ---------------------------------------------------------------------------
// /login?lang=fr كان يُعرض عربيًّا (الصفحة تقرأ الكوكي فقط) بينما /verify تدعم
// المعامل منذ v0.10.3. نموذج الدخول مكوّن عميل يقرأ لغته من I18nProvider (كوكي)،
// فهذه النواة الصغيرة تستدعي إجراء الخادم الموثّق setLocaleAction مرة واحدة عند
// الإقلاع إن اختلف معامل الرابط عن لغة المزوّد — فيتحدّث العرض كله (SSR + العميل).
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
