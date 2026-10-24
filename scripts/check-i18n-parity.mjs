// HRMP — فحص تطابق مفاتيح الترجمة بين القواميس الأربعة (ar/fr/en/es)
// SPEC §2: CI يفشل إن نقص مفتاح في أي لغة — هذا هو الفحص الفعلي.
// التشغيل: node scripts/check-i18n-parity.mjs  (أو bun scripts/check-i18n-parity.mjs)
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const LOCALES = ["ar", "fr", "en", "es"];
const here = dirname(fileURLToPath(import.meta.url));
const dictDir = join(here, "..", "src", "i18n", "dictionaries");

function flatKeys(obj, prefix = "") {
  return Object.entries(obj).flatMap(([k, v]) =>
    v !== null && typeof v === "object" ? flatKeys(v, `${prefix}${k}.`) : [`${prefix}${k}`]
  );
}

const keySets = {};
const values = {};
for (const locale of LOCALES) {
  const raw = readFileSync(join(dictDir, `${locale}.json`), "utf8");
  const dict = JSON.parse(raw);
  keySets[locale] = new Set(flatKeys(dict));
  values[locale] = dict;
}

const base = keySets.ar;
let failed = false;

for (const locale of LOCALES.filter((l) => l !== "ar")) {
  const missing = [...base].filter((k) => !keySets[locale].has(k));
  const extra = [...keySets[locale]].filter((k) => !base.has(k));
  if (missing.length > 0 || extra.length > 0) {
    failed = true;
    console.error(`✗ ${locale}:`);
    if (missing.length) console.error(`   missing (${missing.length}): ${missing.join(", ")}`);
    if (extra.length) console.error(`   extra (${extra.length}): ${extra.join(", ")}`);
  } else {
    console.log(`✓ ${locale}: ${keySets[locale].size} مفتاحًا متطابقًا مع ar`);
  }
}

// قيم فارغة أو null
for (const locale of LOCALES) {
  const bad = flatKeys(values[locale]).filter((k) => {
    const v = k.split(".").reduce((acc, part) => acc?.[part], values[locale]);
    return typeof v !== "string" || v.trim().length === 0;
  });
  if (bad.length) {
    failed = true;
    console.error(`✗ ${locale}: قيم غير نصية/فارغة: ${bad.join(", ")}`);
  }
}

if (failed) {
  console.error("فشل فحص تطابق القواميس — أكمل المفاتيح الناقصة قبل الدفع.");
  process.exit(1);
}
console.log(`✓ القواميس الأربعة متطابقة (${base.size} مفتاحًا لكل لغة)`);
