"use client";

// FWMS — شبكة الأمان الأخيرة (global-error): يلتقط ما لا يلتقطه error.tsx —
// أخطاء الـ root layout نفسه (src/app/layout.tsx) مثل فشل قراءة cookies. بوجوده
// لا يمكن أن تظهر صفحة Next.js الافتراضية «Application error: a server-side
// exception…» مهما انفجر الموضع، لأن هذا الحد يستبدل الجذر كله — ولذا يجب أن
// يضم <html> و<body> بنفسه (لا يرث شيئًا). الأنماط الحرجة inline (بلا افتراض
// جاهزية أي حزمة أو class) — الطبقات التزيينية فوقها فقط.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  if (typeof window !== "undefined") {
    console.error("[FWMS][global-error] خطأ في جذر التخطيط:", error);
  }

  return (
    <html lang="ar" dir="rtl" style={{ height: "100%" }}>
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

          <h1 style={{ margin: "16px 0 8px", fontSize: 26, fontWeight: 800 }}>
            حدث خطأ غير متوقع
          </h1>
          <p style={{ margin: "0 0 6px", fontSize: 15, lineHeight: 1.8, opacity: 0.9 }}>
            وقعت مشكلة مؤقتة أثناء تحميل المنصة. جرّب إعادة المحاولة — إن تكررت
            فتواصل مع الدعم الفني مع رمز الخطأ أدناه.
          </p>
          <p dir="ltr" style={{ margin: "0 0 20px", fontSize: 12, opacity: 0.65 }}>
            An unexpected error occurred. Please try again.
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
            إعادة المحاولة
          </button>

          {error.digest ? (
            <p
              dir="ltr"
              style={{
                marginTop: 18,
                fontFamily: "ui-monospace, monospace",
                fontSize: 11,
                opacity: 0.6,
              }}
            >
              Error digest: {error.digest}
            </p>
          ) : null}
        </div>
      </body>
    </html>
  );
}
