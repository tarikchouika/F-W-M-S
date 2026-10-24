// HRMP — ترجمة عامل عرض المستندات إلى JavaScript صرف (render-worker.mjs)
// ---------------------------------------------------------------------------
// لماذا؟ (علاج بلاغ المالك 2026-10-19 «خلل في إصدار الوثائق وتحميلها»)
// العامل كان يُنفَّذ دائمًا بـ process.execPath عبر مصدره TypeScript:
//   • الهاتف (bun) يفهم .ts — يعمل.
//   • Vercel (node) لا ينفذ .ts أصلًا، والملف نفسه لم يكن مضموماً في تتبع
//     الحزمة (outputFileTracingIncludes) فيظهر «render_worker_missing» أو
//     فشل تنفيذ — وهذا هو جذر فشل توليد الوثائق عبر البوابة (Vercel خلفها).
// الحل: نترجمه بesbuild إلى ملف واحد ESM (.mjs) يعمله node وbun معًا.
//   • ما يُضمَّن داخل الحزمة: كل الكود المحلي (pdf/docx/png/i18n/qr/line-kinds)
//     والقواميس الأربع (استيراد ساكن في get-dictionary) وحزمتا docx وqrcode.
//   • ما يبقى خارجيًا (يُحل زمن التشغيل من node_modules):
//       - pdfkit: يُحمَّل عبر createRequire (داخل pdf.ts) لأن حزمته تقرأ
//         ملفات الخطوط/AFM من القرص — لا تُجمَّع (تحتاج مسارات الحزمة كما هي).
//       - sharp: وحدة أصلية (.node) — لا تُجمَّع أبدًا.
// التشغيل: node scripts/compile-render-worker.mjs — مضمن في «build» قبل next build
// (على Vercel والهاتف معًا) حتى يجده تتبع standalone فيضمّه.
// الملف الناتج مُتجاهَل في git (يُولَّد مع كل بناء) — انظر .gitignore.
import { build } from "esbuild";
import { rm } from "node:fs/promises";

const outfile = "src/lib/reports/render-worker.cjs";

try {
  await build({
    entryPoints: ["src/lib/reports/render-worker.ts"],
    outfile,
    bundle: true,
    platform: "node",
    format: "cjs", // درس الاختبار الأول: ESM يرمي «Dynamic require of "fs"» لمكتبات CJS المجمعة — cjs أصيل هنا
    target: "node18",
    external: ["pdfkit", "sharp"],
    sourcemap: false,
    minify: false,
    metafile: false,
    logLevel: "warning",
  });
  console.log(`✓ render-worker.cjs compiled (${outfile})`);
} catch (e) {
  // تنظيف أي ناتج ناقص كي لا يُشغَّل ملف ميت
  await rm(outfile, { force: true }).catch(() => undefined);
  console.error("✗ فشل ترجمة عامل العرض:", e);
  process.exit(1);
}
