// HRMP — تجهيز حزمة standalone (أصول ثابتة + شجرة التشغيل)
// ─────────────────────────────────────────────────────────────────────────────
// لماذا سكربت بدل سلسلة `cp` في package.json؟
//   1) **مسار standalone غير ثابت**: Next يضعه في `.next/standalone/` أو في
//      `.next/standalone/<اسم-التطبيق>/` (حسب جذر التتبّع) ⇒ السلسلة القديمة
//      كانت تنسخ إلى موضع خاطئ ⇒ **الأصول الثابتة (CSS/JS) غائبة** ⇒
//      التطبيق يُخدَم **بلا تنسيق إطلاقًا** (بلاغ المالك 2026-10-20: «الصفحة
//      الرئيسية وفوترها مشوّهان»).
//   2) `cp -r src dst` إذا وُجد dst ينسخ *داخله* ⇒Results اعتماد على وجوده.
//   ⇒ الحل: اكتشاف جذر standalone فعليًا ونسخ كل شيء إلى مساره الصحيح،
//     مع **تحقّق** بعد النسخ (فشل ⇒ خروج غير صفري ⇒ لا ينشر بناء ناقص).
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const NEXT = join(ROOT, ".next");
const STANDALONE_BASE = join(NEXT, "standalone");

/** جذر standalone: إمّا الجذر نفسه أو مجلد التطبيق داخله */
function findStandaloneRoot() {
  if (!existsSync(STANDALONE_BASE)) return null;
  // 1) server.js مباشرةً
  if (existsSync(join(STANDALONE_BASE, "server.js"))) return STANDALONE_BASE;
  // 2) مجلد واحد داخله يحوي server.js
  for (const entry of ["F-W-M-S", ...readDirSafe(STANDALONE_BASE)]) {
    const candidate = join(STANDALONE_BASE, entry);
    if (existsSync(join(candidate, "server.js"))) return candidate;
  }
  return null;
}

function readDirSafe(dir) {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}

const STANDALONE = findStandaloneRoot();
if (!STANDALONE) {
  // لا حزمة standalone (نشر Vercel مثلًا: يتولّى Next/Vercel التتبّع بنفسه)
  // ⇒ لا شيء لنسخه، والبناء صحيح. **ليس خطأ** — الخروج بصفر.
  console.log("· لا حزمة standalone (نشر سحابي) — تُخطّى تجهيز الأصول");
  process.exit(0);
}

function copyInto(srcRel, destRel) {
  const src = join(ROOT, srcRel);
  if (!existsSync(src)) return false;
  const dest = join(STANDALONE, destRel);
  rmSync(dest, { recursive: true, force: true });
  mkdirSync(join(dest, ".."), { recursive: true });
  cpSync(src, dest, { recursive: true, dereference: true });
  return true;
}

const steps = [
  [".next/static", ".next/static"],
  ["public", "public"],
  ["src/lib/reports", "src/lib/reports"],
  ["src/i18n", "src/i18n"],
];

for (const [src, dest] of steps) {
  const ok = copyInto(src, dest);
  console.log(`${ok ? "✓" : "·"} ${src} → ${dest}`);
}

// ── شجرة تبعيات عامل العرض (pdfkit + sharp) ──
function depsOf(name) {
  try {
    const pkg = JSON.parse(readFileSync(join(ROOT, "node_modules", name, "package.json"), "utf8"));
    return [...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.optionalDependencies ?? {})];
  } catch {
    return [];
  }
}
const seen = new Set();
const queue = ["pdfkit", "sharp"];
while (queue.length) {
  const name = queue.shift();
  if (seen.has(name)) continue;
  seen.add(name);
  for (const dep of depsOf(name)) if (!seen.has(dep)) queue.push(dep);
}
let copied = 0;
for (const name of seen) {
  const src = join(ROOT, "node_modules", name);
  if (!existsSync(src)) continue;
  const dest = join(STANDALONE, "node_modules", name);
  rmSync(dest, { recursive: true, force: true });
  mkdirSync(join(dest, ".."), { recursive: true });
  cpSync(src, dest, { recursive: true, dereference: true });
  copied += 1;
}
console.log(`✓ ${copied} حزمة نُسخت إلى node_modules (غلقة: pdfkit + sharp)`);

// ── تحقّق: الأصول الثابتة يجب أن تكون موجودة وأن تحوي CSS ──
const cssDir = join(STANDALONE, ".next", "static", "chunks");
if (!existsSync(cssDir)) {
  console.error("✗ الأصول الثابتة غير موجودة في حزمة standalone — بناء ناقص");
  process.exit(1);
}
const cssFiles = readdirSync(cssDir).filter((f) => f.endsWith(".css"));
if (cssFiles.length === 0) {
  console.error("✗ لا توجد ملفات CSS في حزمة standalone — بناء ناقص");
  process.exit(1);
}
const bytes = cssFiles.reduce((s, f) => s + statSync(join(cssDir, f)).size, 0);
console.log(`✓ تحقّق: ${cssFiles.length} ملف CSS (${Math.round(bytes / 1024)} كيلوبايت) في ${cssDir}`);
console.log(`✓ standalone: ${STANDALONE}`);
