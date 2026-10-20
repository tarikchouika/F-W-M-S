// FWMS — اختبار محرّك Bidi (src/lib/reports/bidi.ts)
// التشغيل: bun tests/reports-bidi.ts   (بلا اعتماديات خارجية — مخرج 0 = نجاح)
// لماذا اختبار مستقل: الترتيب البصري هو أساس صحّة العربية في PDF؛ خطأ واحد
// (مستوى خاطئ أو عكس خاطئ) يعيد «معكوسة» صامتة بلا أي خطأ في السجلّات.
import { bidiLevels, bidiPieces, hasArabic, mirrorChars } from "../src/lib/reports/bidi";

let pass = 0;
let fail = 0;

function check(name: string, actual: unknown, expected: unknown): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    pass += 1;
    console.log(`✓ ${name}`);
  } else {
    fail += 1;
    console.error(`✗ ${name}\n    المتوقّع: ${e}\n    الفعلي  : ${a}`);
  }
}

/** نصّ المقاطع بترتيبها البصري (من اليسار لليمين) */
function visual(text: string, rtl = true): string {
  return bidiPieces(text, rtl).map((p) => p.text).join("|");
}

check("عربي خالص: مقطع واحد", bidiPieces("قسيمة الأجر", true).length, 1);
check("عربي خالص: اتجاه RTL", bidiPieces("قسيمة الأجر", true)[0].rtl, true);
check("عربي خالص: الخط العربي", bidiPieces("قسيمة الأجر", true)[0].arabic, true);

// الرقم اللاتيني داخل فقرة عربية: يبقى LTR لكن يسبق العربية بصريًّا
check(
  "مقطع مختلط: الرقم يسبق العربية بصريًّا",
  visual("الفترة: أكتوبر 2026"),
  "2026|الفترة: أكتوبر "
);

// الجزء اللاتيني في نهاية سطر عربي
// المحايد بين عربي ولاتيني (النقطة «•») takes مستوى الفقرة ⇒ يبقى مع المقطع العربي
check(
  "مقطع مختلط: اللاتيني في الآخر",
  visual("شركة الأمن  •  ICE: 001234567000089"),
  "ICE: 001234567000089|شركة الأمن  •  "
);

// النص اللاتيني وحده في فقرة عربية: مستوى 2 (لا ينعكس)
check("لاتيني بحت: اتجاه LTR", bidiPieces("Hello", true)[0].rtl, false);

// الفقرة اللاتينية: الترتيب المنطقي محفوظ
check("فقرة LTR: الترتيب المنطقي", visual("Hello World", false), "Hello World");

// المسافات محفوظة داخل المقطع العربي (لا تُبتلع)
check(
  "المسافة بين كلمتين عربيّتين محفوظة",
  bidiPieces("الفترة: أكتوبر 2026", true)[1].text.includes("أكتوبر "),
  true
);

// الأقواس تُعكس في المقاطع RTL (قاعدة L4)
check("مرآة الأقواس", mirrorChars("(IR)"), ")IR(");

// المستويات: العربية 1 (فردي) واللاتيني 2 (زوجي)
check("مستوى الحرف العربي", bidiLevels("ا", true)[0], 1);
check("مستوى الحرف اللاتيني في فقرة عربية", bidiLevels("a", true)[0], 2);
check("مستوى الحرف اللاتيني في فقرة لاتينية", bidiLevels("a", false)[0], 0);

// العلامة المركّبة (الهمزة تحت الألف) يجب أن تبقى مع حرفها:
// انفصالها يُرسم منفردة ⇒ مربّع بدل الهمزة (بلاغ بصري في «إجمالي تكلفة المشغّل»)
check("الهمزة تحت الألف تبقى مع حرفها", bidiPieces("إجمالي", true).length, 1);
check("الهمزة تحت الألف: النص كامل", bidiPieces("إجمالي", true)[0].text, "إجمالي");
check("كلمة بهمزة في وسطها", bidiPieces("الإجمالي", true).length, 1);

// كشف العربية
check("hasArabic عربي", hasArabic("د.م."), true);
check("hasArabic لاتيني", hasArabic("MAD"), false);

console.log(`\n${pass} نجح · ${fail} فشل`);
if (fail > 0) process.exit(1);
