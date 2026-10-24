"use client";

// HRMP — شبكة الأمان الأخيرة (global-error): يلتقط ما لا يلتقطه error.tsx —
// أخطاء الـ root layout نفسه (src/app/layout.tsx) مثل فشل قراءة cookies. بوجوده
// لا يمكن أن تظهر صفحة Next.js الافتراضية «Application error: a server-side
// exception…» مهما انفجر الموضع، لأن هذا الحد يستبدل الجذر كله — ولذا يجب أن
// يضم <html> و<body> بنفسه (لا يرث شيئًا). الأنماط الحرجة inline (بلا افتراض
// جاهزية أي حزمة أو class) — الطبقات التزيينية فوقها فقط.
//
// i18n (بلاغ المالك 2026-10-19 «خلل في الترجمة»): هذا الحد معزول بنيويًا —
// مزوّد اللغة (I18nProvider داخل الـ root layout) مقلوع مع الجذر عند انفجاره،
// فلا سبيل إلى القواميس المشتركة. الاستثناء الموثق هنا: نسخة مصغرة مضمنة من
// مفاتيح errors.* باللغات الأربع، تُزامَن يدويًا مع src/i18n/dictionaries/*.json
// (المفاتيح المرادفة: errors.title / errors.platformHint / common.retry /
// errors.reload / errors.digestLabel — حدّثها مع القواميس معًا في أي تعديل).
// كشف اللغة: كوكي FWMS_LOCALE ← لغة المتصفح ← العربية (الافتراضية — SPEC §2)، عبر
// useSyncExternalStore (النمط القانوني لقراءة حالة خارجية) — بلا setState داخل
// effect (react-hooks/set-state-in-effect) وبلا تعارض hydration: لقطة الخادم «ar»
// ولوحة العميل تُقرأ عند الإقلاع فيرندر الإقلاع نفسه باللغة الصحيحة.
import { useEffect, useSyncExternalStore } from "react";

type ErrLocale = "ar" | "fr" | "en" | "es";

// مرادفة مفاتيح errors.* في القواميس — استثناء موثق (انظر التعليق أعلاه)
const ERROR_STRINGS: Record<
  ErrLocale,
  { title: string; hint: string; retry: string; reload: string; digest: string; dir: "rtl" | "ltr" }
> = {
  ar: {
    title: "حدث خطأ غير متوقع",
    hint: "وقعت مشكلة مؤقتة أثناء تحميل المنصة. جرّب إعادة المحاولة — إن تكررت فتواصل مع الدعم الفني مع رمز الخطأ أدناه.",
    retry: "إعادة المحاولة",
    reload: "تحديث الصفحة",
    digest: "رمز الخطأ للدعم",
    dir: "rtl",
  },
  fr: {
    title: "Une erreur inattendue s'est produite",
    hint: "Un problème temporaire est survenu lors du chargement de la plateforme. Réessayez ; si le problème persiste, contactez le support technique avec le code d'erreur ci-dessous.",
    retry: "Réessayer",
    reload: "Rafraîchir la page",
    digest: "Code d'erreur (support)",
    dir: "ltr",
  },
  en: {
    title: "An unexpected error occurred",
    hint: "A temporary issue occurred while loading the platform. Please try again; if it keeps happening, contact technical support with the error code below.",
    retry: "Try again",
    reload: "Reload page",
    digest: "Error code for support",
    dir: "ltr",
  },
  es: {
    title: "Ha ocurrido un error inesperado",
    hint: "Ocurrió un problema temporal al cargar la plataforma. Inténtalo de nuevo; si persiste, contacta con el soporte técnico con el código de error que aparece abajo.",
    retry: "Reintentar",
    reload: "Recargar la página",
    digest: "Código de error para soporte",
    dir: "ltr",
  },
};

const subscribeNoop = () => () => {}; // لا اشتراك — قراءة لمرة العرض (صفحة خطأ لا تعيد الرندر)

function detectLocale(): ErrLocale {
  try {
    const m = document.cookie.match(/(?:^|;\s*)FWMS_LOCALE=(ar|fr|en|es)(?:;|$)/);
    if (m) return m[1] as ErrLocale;
  } catch {
    /* كوكي غير متاح — نكمل إلى لغة المتصفح */
  }
  try {
    const nav = (navigator.language || "ar").slice(0, 2).toLowerCase();
    if (nav === "ar" || nav === "fr" || nav === "en" || nav === "es") return nav as ErrLocale;
  } catch {
    /* متصفح بلا لغة معلنة — الافتراضية */
  }
  return "ar";
}

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // اللغة: لقطة خارجية (كوكي/متصفح) — الخادم «ar» والعميل يقرأها عند الإقلاع
  const locale = useSyncExternalStore(
    subscribeNoop,
    () => detectLocale(),
    () => "ar" as ErrLocale
  );

  useEffect(() => {
    console.error("[HRMP][global-error] خطأ في جذر التخطيط:", error);
  }, [error]);

  const s = ERROR_STRINGS[locale];

  return (
    <html lang={locale} dir={s.dir} style={{ height: "100%" }}>
      <body
        style={{
          margin: 0,
          height: "100%",
          fontFamily:
            "system-ui, 'Segoe UI', 'Noto Sans Arabic', Tahoma, Arial, sans-serif",
          background:
            "linear-gradient(160deg, oklch(0.28 0.04 160) 0%, oklch(0.42 0.09 160) 55%, oklch(0.5 0.1 150) 100%)",
          color: "#fff",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "24px",
          boxSizing: "border-box",
        }}
      >
        <div style={{ maxWidth: 440, textAlign: "center" }}>
          <svg
            width="64"
            height="64"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#fde047"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 20h16a2 2 0 0 0 1.73-2Z" />
            <path d="M12 9v4" />
            <path d="M12 17h.01" />
          </svg>

          <h1 style={{ margin: "16px 0 8px", fontSize: 26, fontWeight: 800 }}>{s.title}</h1>
          <p style={{ margin: "0 0 20px", fontSize: 15, lineHeight: 1.8, opacity: 0.9 }}>
            {s.hint}
          </p>

          <button
            type="button"
            onClick={reset}
            style={{
              padding: "10px 28px",
              fontSize: 14,
              fontWeight: 700,
              color: "#14532d",
              background: "#fff",
              border: "none",
              borderRadius: 10,
              cursor: "pointer",
              boxShadow: "0 8px 24px rgba(0,0,0,0.25)",
            }}
          >
            {s.retry}
          </button>

          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              padding: "10px 24px",
              fontSize: 14,
              fontWeight: 600,
              color: "#fff",
              background: "transparent",
              border: "1px solid rgba(255,255,255,0.35)",
              borderRadius: 10,
              cursor: "pointer",
              marginInlineStart: 10,
            }}
          >
            {s.reload}
          </button>

          {error.digest ? (
            <p dir="ltr" style={{ margin: "20px 0 0", fontSize: 11, opacity: 0.55, fontFamily: "monospace" }}>
              {s.digest}: {error.digest}
            </p>
          ) : null}

          {process.env.NODE_ENV === "development" && error.message ? (
            <pre
              dir="ltr"
              style={{
                margin: "16px 0 0",
                maxWidth: 440,
                maxHeight: 120,
                overflow: "auto",
                textAlign: "left",
                fontSize: 11,
                opacity: 0.75,
                background: "rgba(0,0,0,0.3)",
                padding: 12,
                borderRadius: 8,
              }}
            >
              {error.message}
            </pre>
          ) : null}
        </div>
      </body>
    </html>
  );
}
