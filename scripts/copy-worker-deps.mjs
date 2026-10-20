// FWMS — نسخ شجرة تبعيات عامل عرض الوثائق إلى حزمة standalone
// ---------------------------------------------------------------------------
// لماذا سكربت بدل قائمة يدوية في package.json؟
//   القائمة اليدوية كانت تنقص حزمًا (مثل detect-libc) ⇒ sharp/png يرميان في
//   الإنتاج ⇒ **الشعار والـPNG لا يُنتجان على الخادم/standalone**.
//   الحل: حساب **الغلقة الكاملة** من node_modules نفسه (كم يفعل next.config.ts
//   لأغراض التتبّع) ⇒ لا حزمة تنقص مهما تغيّرت التبعيات.
import { readFileSync, cpSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOTS = ["pdfkit", "sharp"];
const DEST = join(".next", "standalone", "node_modules");

function depsOf(name) {
  try {
    const pkg = JSON.parse(readFileSync(join("node_modules", name, "package.json"), "utf8"));
    return [...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.optionalDependencies ?? {})];
  } catch {
    return [];
  }
}

const seen = new Set();
const queue = [...ROOTS];
while (queue.length) {
  const name = queue.shift();
  if (seen.has(name)) continue;
  seen.add(name);
  for (const dep of depsOf(name)) if (!seen.has(dep)) queue.push(dep);
}

let copied = 0;
for (const name of seen) {
  const src = join("node_modules", name);
  if (!existsSync(src)) continue;
  const dest = join(DEST, name);
  mkdirSync(join(dest, ".."), { recursive: true });
  rmSync(dest, { recursive: true, force: true });
  cpSync(src, dest, { recursive: true, dereference: true });
  copied += 1;
}

console.log(`✓ ${copied} حزمة نُسخت إلى ${DEST} (غلقة: ${ROOTS.join(" + ")})`);
