import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
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
