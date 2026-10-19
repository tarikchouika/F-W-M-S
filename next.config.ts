import type { NextConfig } from "next";

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
      "./node_modules/@react-pdf/renderer/**",
      "./node_modules/@react-pdf/font/**",
      "./node_modules/@react-pdf/layout/**",
      "./node_modules/@react-pdf/render/**",
      "./node_modules/@react-pdf/pdfkit/**",
      "./node_modules/@react-pdf/image/**",
      "./node_modules/@react-pdf/primitives/**",
      "./node_modules/@react-pdf/reconciler/**",
      "./node_modules/@react-pdf/stylesheet/**",
      "./node_modules/@react-pdf/svg/**",
      "./node_modules/@react-pdf/types/**",
      "./node_modules/@react-pdf/textkit/**",
      "./node_modules/fontkit/**",
      "./node_modules/pdfkit/**",
      "./node_modules/yoga-layout/**",
      "./node_modules/sharp/**",
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
