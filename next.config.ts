import type { NextConfig } from "next";


// ─── غلق تبعيات عامل عرض المستندات زمن التشغيل (علاج بلاغ الوثائق 2026-10-19) ───
// العامل (render-worker.cjs) يحمّل خارجيًا: @react-pdf/renderer (+react كندّ)
// وsharp (وحدة أصلية). القوائم اليدوية السابقة كانت تنقصها شجرة كاملة
// (linebreak/base64-js/pako/bidi-js…) فانكسر توليد PDF — الحل: حساب الغلقة
// الكاملة من node_modules نفسه عند كل بناء، فلا تعود حزمة تنقص أبدًا.
import { readFileSync } from "node:fs";

function depsOf(name: string): string[] {
  try {
    const pkg = JSON.parse(readFileSync(`node_modules/${name}/package.json`, "utf8"));
    return [...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.peerDependencies ?? {})];
  } catch {
    return [];
  }
}

function depClosure(roots: string[]): string[] {
  const seen = new Set<string>();
  const queue = [...roots];
  while (queue.length) {
    const name = queue.shift()!;
    if (seen.has(name)) continue;
    seen.add(name);
    for (const dep of depsOf(name)) if (!seen.has(dep)) queue.push(dep);
  }
  return [...seen];
}

// @react-pdf/renderer (بشجرته كلها) + react (ندّه) + sharp — تُضمّن لغرض /api/reports/**
const WORKER_RUNTIME_PACKAGES = depClosure(["@react-pdf/renderer", "react", "sharp"])
  .map((name) => `./node_modules/${name}/**`);


const nextConfig: NextConfig = {
  output: "standalone",
  // إجراءات الخادم خلف بوابة عكسية (بلاغ المالك 2026-10-19 «خلل في تغيير لغة الموقع» — الجولة الرابعة):
  // حماية CSRF في Next تقارن ترويسة Origin مع x-forwarded-host ثم Host. بوابة Pages
  // (fwms-dg8.pages.dev) تعيد كتابة Host إلى أصل Vercel، وVercel بدوره يستبدل
  // x-forwarded-host بقيمته هو — فلا يرى التطبيق المضيف العام أبدًا ⇒ كل POST لإجراء
  // خادمي يُرفض بخطأ E80 «Invalid Server Actions request» (500) — ومنه setLocaleAction
  // فلا تتبدل اللغة إطلاقًا عبر البوابة مهما صحّ الكود. allowedOrigins هي الآلية الموثّقة
  // في Next لهذه الحالة بالضبط («reverse proxy in front of your app») — تُقبل هذه المضيفين
  // كأصول صالحة، وتبقى الأصول الأجنبية مرفوضة (الأمان محفوظ).
  // عند إضافة نطاق مخصص للبوابة مستقبلًا: أضفه هنا أيضًا (راجع docs/DEPLOYMENT.md §3.2).
  // ملاحظة: بوابة الهاتف (fwms.tarikc.workers.dev) لا تحتاج إدراجًا — تمرر Host العام كما
  // هو فيتطابق مع Origin أصلًا.
  experimental: {
    serverActions: {
      allowedOrigins: ["fwms-dg8.pages.dev"],
    },
  },
  // ترويسات أمنية (SPEC §6 + docs/SECURITY.md — المرحلة 8): HSTS (النفق/الوكيل HTTPS دائمًا)
  // ومنع التأطير والتخمين بنوع المحتوى وسياسة الإحالة الصارمة
  poweredByHeader: false,
  async headers() {
    // سياسة أمن المحتوى (CSP) — فحص أمني 2026-10-19
    // ─────────────────────────────────────────────────────────────────────
    // لماذا CSP ثابتة (لا nonce)؟ نسخة nonce الموثّقة في Next تتطلّب تصييرًا
    // ديناميكيًا لكل صفحة، وهي تكسر: (1) سمات style="" المضمّنة (الواجهة تستعملها
    // كثيرًا) ما لم يُضَف 'unsafe-inline'|style-src (فينهار الـnonce نفسه)،
    // (2) الصفحات الساكنة (القانونية/الدليل) لا تُصيَّر ديناميكيًا ⇒ لا يُحقن
    // nonce في سكربتاتها ⇒ يُحجب السكربت. لذلك: CSP ثابتة تحجب المصادر
    // الخارجية والمحقنات والـbase tag والتأطير وتسريب النماذج، وتترك
    // 'unsafe-inline' للسكربتات المضمّنة التي يولّدها Next/React.
    // ملاحظة: 'unsafe-eval' للتطوير فقط (React يحتاجه في dev) — الإنتاج بلاه.
    const isDev = process.env.NODE_ENV !== "production";
    const csp = [
      "default-src 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "frame-ancestors 'none'",
      "form-action 'self'",
      `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      "connect-src 'self' https: wss:",
      "media-src 'self' blob: data:",
      "worker-src 'self' blob:",
      "manifest-src 'self'",
      "upgrade-insecure-requests",
    ].join("; ");
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "X-DNS-Prefetch-Control", value: "off" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains",
          },
          { key: "Content-Security-Policy", value: csp },
        ],
      },
    ];
  },
  // حزم خادمية ثقيلة لا تُحزَّم (sharp وحدة أصلية) — react-pdf يُحمَّل عبر createRequire
  serverExternalPackages: ["@react-pdf/renderer", "sharp"],
  // تتبع ملفات standalone: الحزم المحمّلة ديناميكيًا (createRequire/dynamic import)
  // لا تراها أداة التتبع تلقائيًا — تُضمَّن صراحة مع شجراتها
  outputFileTracingIncludes: {
    // لقطة قاعدة المعاينة (Vercel — docs/DEPLOYMENT.md §2): كل مسار يلمس القاعدة
    // يضمّها في حزمته — على Vercel تُحزَّم الدوال كلٌّ على حدة، فلا يكفي تضمينها
    // لمسار واحد. تُنسخ عند الإقلاع إلى /tmp (src/lib/db.ts). خارج Vercel لا تُستعمل.
    "/": ["./infra/vercel/preview.db"],
    "/login": ["./infra/vercel/preview.db"],
    "/dashboard/**": ["./infra/vercel/preview.db"],
    "/verify/**": ["./infra/vercel/preview.db"],
    "/api/**": ["./infra/vercel/preview.db"],
    "/api/reports/**": [
      // عامل العرض (المترجم .cjs + المصدر .ts) — بدون ضمّه هنا كان الملف غائبًا
      // عن حزمة Vercel فيفشل التوليد بـ render_worker_missing (بلاغ 2026-10-19).
      // docx وqrcode والقواميس الأربع تُضمَّن داخل .cjs المُجمَّع (compile-render-worker).
      "./src/lib/reports/**",
      // شجرة @react-pdf + react + sharp كاملة (محسوبة أعلاه — لا قوائم يدوية بعدها)
      ...WORKER_RUNTIME_PACKAGES,
      "./node_modules/@img/**",
      "./public/fonts/**",
    ],
  },
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
};

export default nextConfig;
