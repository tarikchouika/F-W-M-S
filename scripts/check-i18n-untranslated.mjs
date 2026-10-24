// HRMP — كشف قيم القواميس غير المترجمة/المتسربة بين اللغات
// 1) قيمة fr/en/es مطابقة تماماً لقيمة ar (نص عربي تسرب للغات الأخرى)
// 2) قيمة ar تحتوي نصاً لاتينياً واسعاً (نص أجنبي داخل العربية)
// 3) قيمة fr/en/es مطابقة لقيمة en (قيم منسوخة بلا ترجمة بين اللغات اللاتينية)
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const LOCALES = ["ar", "fr", "en", "es"];
const here = dirname(fileURLToPath(import.meta.url));
const dictDir = join(here, "..", "src", "i18n", "dictionaries");

function flat(obj, prefix = "") {
  return Object.entries(obj).flatMap(([k, v]) =>
    v !== null && typeof v === "object" ? flat(v, `${prefix}${k}.`) : [[`${prefix}${k}`, v]]
  );
}

const dicts = {};
for (const l of LOCALES) {
  dicts[l] = Object.fromEntries(flat(JSON.parse(readFileSync(join(dictDir, `${l}.json`), "utf8"))));
}

const arabicRe = /[\u0600-\u06FF]/;
const latinWordRe = /[A-Za-z]{4,}/; // كلمة لاتينية من 4 أحرف فأكثر

// أسماء علم/مختصات مقبولة في العربية (لا تُعد خللاً)
const whitelistAr = /^(MAD|CNSS|AMO|IR|DGI|SIM|CNIE|CIN|PDF|XML|XSD|JSON|CSV|QR|URL|API|HRMP|SMIG|SMAG|ISO|UTC|OK|ID|SSN|NNI|RIP|RSSB|RC|ICE|IFU|TP|Patente|true|false|week|month|day)$/i;

let issues = 0;

// (1) تسرب عربي إلى fr/en/es
for (const l of ["fr", "en", "es"]) {
  for (const [k, v] of Object.entries(dicts[l])) {
    if (typeof v === "string" && arabicRe.test(v)) {
      console.log(`[ARABIC-LEAK] ${l}.${k} = "${v.slice(0, 80)}"`);
      issues++;
    }
  }
}

// (2) نص لاتيني واسع داخل ar (استبعاد المختصات والقيم الرقمية والاستيفاء)
for (const [k, v] of Object.entries(dicts.ar)) {
  if (typeof v !== "string") continue;
  const latinWords = v.match(/[A-Za-z]+/g) || [];
  const realWords = latinWords.filter((w) => !whitelistAr.test(w) && !/^[A-Z]{1,3}$/.test(w));
  if (realWords.length >= 2 && !arabicRe.test(v)) {
    console.log(`[NOT-ARABIC] ar.${k} = "${v.slice(0, 90)}"`);
    issues++;
  } else if (realWords.length >= 3) {
    console.log(`[MIXED?] ar.${k} = "${v.slice(0, 90)}"`);
    issues++;
  }
}

// (3) قيم fr/es مطابقة لـ en (نسخ بلا ترجمة) — طويلة فقط لتجنب الكلمات المشروعة
for (const l of ["fr", "es"]) {
  let copied = [];
  for (const [k, v] of Object.entries(dicts[l])) {
    if (typeof v === "string" && v.length >= 25 && v === dicts.en[k]) {
      copied.push(k);
    }
  }
  if (copied.length) {
    console.log(`[SAME-AS-EN] ${l}: ${copied.length} قيمة مطابقة للإنجليزية (نسخ بلا ترجمة):`);
    for (const k of copied.slice(0, 30)) console.log(`   ${l}.${k} = "${String(dicts[l][k]).slice(0, 70)}"`);
    issues += copied.length;
  }
}

console.log(issues === 0 ? "\n✓ لا قيم غير مترجمة مكتشفة" : `\n✗ ${issues} مشكلة محتملة`);
