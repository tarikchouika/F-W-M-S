// HRMP — محرّك الاتجاه ثنائي الاتجاه (UAX #9 مبسّط) لعرض العربية في PDF
// ─────────────────────────────────────────────────────────────────────────────
// لماذا هذا الملف؟
//   pdfkit (المحرّك الجديد للـPDF) يُشكّل العربية صحيحًا عبر fontkit (وصل/حروف
//   متصلة)، لكنه **لا يطبّق خوارزمية Bidi**: المقاطع اللاتينية داخل سطر عربي
//   تبقى في موضعها المنطقي بدل أن تنتقل إلى الطرف الصحيح.
//   @react-pdf/renderer كان يطبّق Bida عبر textkit — لكن مساره كان مُعطّلًا:
//   (1) fontkit يُجبَر على direction='ltr' فيقطع الوصل العكسي،
//   (2) textkit يُسقط أول محرفmark في كل مقطع (resolve/slice)،
//   (3) يُعيد ترتيب المحارف فيتعطّل موضع النقط.
//   النتيجة: «معكوسة» ومشوّهة (مُثبت بصريًا — انظر docs/WORKLOG).
//   ⇒ القرار: نطبّق Bidi بأنفسنا على مستوى المحارف (UAX #9: W1–W7، N1–N2، I1–I2،
//   L1، L2، L4) ونرسم كل مقطع بخطّه.
//
// المخرج: مقاطع بترتيب بصري (من اليسار لليمين) + اتجاه كل مقطع + هل هو عربي.
// ─────────────────────────────────────────────────────────────────────────────

// ─── أنواع المحارف (Bidi_Class مبسّط) ───────────────────────────────────────
const L = 0; // Strong LTR (لاتيني/أوروبي)
const R = 1; // Strong RTL (عربي/عبري)
const EN = 2; // European Number
const AN = 3; // Arabic Number
const ES = 4; // European Separator (+ −)
const ET = 5; // European Terminator (٪ $ #)
const CS = 6; // Common Separator (٫ ، . / : …)
const NSM = 7; // Non-Spacing Mark
const BN = 8; // Boundary Neutral
const B = 9; // Paragraph Separator
const S = 10; // Segment Separator
const WS = 11; // Whitespace
const ON = 12; // Other Neutral

function isWhitespaceCp(cp: number): boolean {
  return (
    cp === 0x0020 ||
    cp === 0x1680 ||
    (cp >= 0x2000 && cp <= 0x200a) ||
    cp === 0x202f ||
    cp === 0x205f ||
    cp === 0x3000
  );
}

/** تصنيف محرف واحد حسب Bidi_Class (النطاق العربي مطابق لـ UAX #9) */
export function charType(cp: number): number {
  if (cp === 0x000a || cp === 0x000d || cp === 0x001c || cp === 0x001d || cp === 0x0085) return B;
  if (cp === 0x0009 || cp === 0x000b || cp === 0x001f) return S;
  if (isWhitespaceCp(cp)) return WS;

  // الأرقام
  if (cp >= 0x0030 && cp <= 0x0039) return EN;
  if ((cp >= 0x0660 && cp <= 0x0669) || (cp >= 0x06f0 && cp <= 0x06f9)) return AN;

  // الحروف اللاتينية واليونانية والأرمنية
  if ((cp >= 0x0041 && cp <= 0x005a) || (cp >= 0x0061 && cp <= 0x007a)) return L;
  if (cp >= 0x00c0 && cp <= 0x02af) return L; // Latin-1/Extended
  if (cp >= 0x0370 && cp <= 0x058f) return L; // Greek/Cyrillic/Armenian
  if (cp >= 0x1e00 && cp <= 0x1fff) return L; // Latin Extended Additional
  if (cp >= 0x2c60 && cp <= 0x2c7f) return L; // Latin Extended-C
  if (cp >= 0xa720 && cp <= 0xa7ff) return L; // Latin Extended-D

  // العبري
  if (cp >= 0x0590 && cp <= 0x05ff) return R;
  if (cp >= 0x07c0 && cp <= 0x08ff) return R; // NKo/Samaritan/Arabic Extended-A

  // العربي
  if (cp >= 0x0600 && cp <= 0x06ff) {
    if (cp >= 0x0600 && cp <= 0x0605) return AN; // ٠..٥ وأرقام عربية-هندية
    if (cp >= 0x0660 && cp <= 0x0669) return AN;
    if (cp >= 0x06f0 && cp <= 0x06f9) return AN;
    if (cp >= 0x064b && cp <= 0x065f) return NSM; // التشكيل
    if (cp === 0x0670) return NSM;
    if (cp >= 0x0606 && cp <= 0x060f) return ON;
    if (cp >= 0x0610 && cp <= 0x061a) return AN; // علامات أرقام عربية
    if (cp >= 0x06dd || cp === 0x08e2) return AN;
    return R;
  }
  if (cp >= 0x0750 && cp <= 0x077f) return R; // Arabic Supplement
  if (cp >= 0xfb50 && cp <= 0xfdff) return R; // Presentation Forms-A
  if (cp >= 0xfe70 && cp <= 0xfeff) return R; // Presentation Forms-B
  if (cp >= 0x08a0 && cp <= 0x08ff) return R;

  // علامات الاتجاه الصريحة
  if (cp === 0x200e) return L; // LRM
  if (cp === 0x200f || cp === 0x061c) return R; // RLM / ALM
  if (cp >= 0x202a && cp <= 0x202e) return R; // LRE..RLO (معالجة مبسّطة)
  if (cp >= 0x2066 && cp <= 0x2069) return R; // LRI..PDI
  if (cp === 0x200b || cp === 0x200c || cp === 0x200d || cp === 0xfeff) return BN;

  // الفواصل
  if (cp === 0x002b || cp === 0x002d) return ES;
  if (cp === 0x0023 || cp === 0x0024 || cp === 0x0025 || cp === 0x00a5 || cp === 0x00b0) return ET;
  if (cp === 0x002c || cp === 0x002e || cp === 0x002f || cp === 0x003a || cp === 0x037e) return CS;
  if (cp === 0x00a0) return CS; // NBSP
  if (cp === 0x060c) return CS; // ،
  if (cp === 0x066b || cp === 0x066c) return AN; // ٫ ٬
  if (cp === 0x2013 || cp === 0x2014) return ON; // – —
  if (cp === 0x2022) return ON; // •
  if (cp >= 0x2018 && cp <= 0x201f) return ON; // « » “ ” ‘ ’
  if (cp >= 0x2212 && cp <= 0x2212) return ES; // −

  // محارف تحكّم/تنسيق
  if (cp < 0x0020 || (cp >= 0x007f && cp <= 0x009f)) return BN;

  // افتراض: محرف محايد
  return ON;
}

/** هل المحرف عربي (يستدعي خط Naskh)؟ */
export function isArabicCp(cp: number): boolean {
  const t = charType(cp);
  return t === R || t === AN;
}

// ─── المرايا (L4) ───────────────────────────────────────────────────────────
const MIRROR: Record<string, string> = {
  "(": ")",
  ")": "(",
  "[": "]",
  "]": "[",
  "{": "}",
  "}": "{",
  "<": ">",
  ">": "<",
  "«": "»",
  "»": "«",
  "‹": "›",
  "›": "‹",
  "≤": "≥",
  "≥": "≤",
};

/** يعكس محارف القوس في مقطع RTL (UAX #9 قاعدة L4) */
export function mirrorChars(text: string): string {
  let out = "";
  for (const ch of text) out += MIRROR[ch] ?? ch;
  return out;
}

// ─── حساب المستويات (W1–W7 · N1–N2 · I1–I2 · L1) ────────────────────────────
/**
 * مستويات Bidi لكل محرف.
 * @param text نص الفقرة (سطر واحد)
 * @param baseRtl اتجاه الفقرة (true = عربي)
 */
export function bidiLevels(text: string, baseRtl: boolean): number[] {
  const cps = Array.from(text);
  const n = cps.length;
  if (n === 0) return [];
  const base = baseRtl ? 1 : 0;
  const types = cps.map((ch) => charType(ch.codePointAt(0)!));

  // sos / eos حسب اتجاه الفقرة
  const sos = baseRtl ? R : L;
  const eos = baseRtl ? R : L;

  // ── W1: NSM يأخذ نوع المحرف السابق (أو sos) ──
  for (let i = 0; i < n; i++) {
    if (types[i] === NSM) types[i] = i === 0 ? sos : types[i - 1];
  }

  // ── W2: EN بعد محرف عربي قوي ⇒ AN ──
  let lastStrong = sos;
  for (let i = 0; i < n; i++) {
    const t = types[i];
    if (t === L || t === R) lastStrong = t;
    else if (t === EN && lastStrong === R) types[i] = AN;
  }

  // ── W3: AL → R (العربية R أصلًا في تصنيفنا) ──

  // ── W4: فاصل بين رقمين ──
  for (let i = 1; i < n - 1; i++) {
    const t = types[i];
    if (t !== ES && t !== CS) continue;
    const prev = types[i - 1];
    const next = types[i + 1];
    if (prev === EN && next === EN) types[i] = EN;
    else if (prev === AN && next === AN) types[i] = AN;
  }

  // ── W5: مصطلح أوروبي ملاصق لرقم ⇒ رقم ──
  for (let i = 0; i < n; i++) {
    if (types[i] !== ET) continue;
    let j = i;
    while (j < n && types[j] === ET) j++;
    const before = i > 0 ? types[i - 1] : sos;
    const after = j < n ? types[j] : eos;
    if (before === EN || after === EN) for (let k = i; k < j; k++) types[k] = EN;
    i = j - 1;
  }

  // ── W6: ما تبقّى من ES/ET/CS ⇒ محايد ──
  for (let i = 0; i < n; i++) {
    if (types[i] === ES || types[i] === ET || types[i] === CS) types[i] = ON;
  }

  // ── W7: EN بعد محرف لاتيني قوي ⇒ L ──
  lastStrong = sos;
  for (let i = 0; i < n; i++) {
    const t = types[i];
    if (t === L || t === R) lastStrong = t;
    else if (t === EN && lastStrong === L) types[i] = L;
  }

  // ── N1/N2: المحايدات ──
  const isNeutral = (t: number) => t === B || t === S || t === WS || t === ON;
  const strongOf = (t: number) => (t === L ? L : R); // EN/AN تُحسب R هنا
  for (let i = 0; i < n; i++) {
    if (!isNeutral(types[i])) continue;
    let j = i;
    while (j < n && isNeutral(types[j])) j++;
    const before = i > 0 ? strongOf(types[i - 1]) : sos;
    const after = j < n ? strongOf(types[j]) : eos;
    const resolved = before === after ? before : base === 1 ? R : L;
    for (let k = i; k < j; k++) types[k] = resolved === L ? L : R;
    i = j - 1;
  }

  // ── I1/I2: المستويات الضمنية ──
  const levels = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    const t = types[i];
    let lvl = base;
    if (base % 2 === 0) {
      if (t === R) lvl += 1;
      else if (t === AN || t === EN) lvl += 2;
    } else {
      if (t === L || t === EN || t === AN) lvl += 1;
    }
    levels[i] = lvl;
  }

  // ── L1: المسافات والفواصل في نهاية السطر تُعاد إلى مستوى الفقرة ──
  for (let i = n - 1; i >= 0; i--) {
    const t = types[i];
    if (t === WS || t === B || t === S) levels[i] = base;
    else break;
  }
  for (let i = 0; i < n; i++) {
    if (types[i] === WS) {
      // مسافة تسبق فاصلًا ⇒ تُعاد إلى مستوى الفقرة
      let j = i;
      while (j < n && types[j] === WS) j++;
      if (j < n && (types[j] === B || types[j] === S)) {
        for (let k = i; k < j; k++) levels[k] = base;
      }
    }
  }

  return levels;
}

// ─── الترتيب البصري (L2) ───────────────────────────────────────────────────
/** ترتيب بصري للمقاطع (مستويات متساوية) — معكوسة داخل المقاطع الفردية (L2) */
function reorderRuns(runs: { level: number }[]): number[] {
  const order = runs.map((_, i) => i);
  let max = 0;
  let minOdd = Number.POSITIVE_INFINITY;
  for (const r of runs) {
    if (r.level > max) max = r.level;
    if (r.level % 2 === 1 && r.level < minOdd) minOdd = r.level;
  }
  if (!Number.isFinite(minOdd)) return order;
  for (let level = max; level >= minOdd; level--) {
    let i = 0;
    while (i < order.length) {
      if (runs[order[i]].level < level) {
        i += 1;
        continue;
      }
      let j = i + 1;
      while (j < order.length && runs[order[j]].level >= level) j += 1;
      const seg = order.slice(i, j).reverse();
      for (let k = 0; k < seg.length; k++) order[i + k] = seg[k];
      i = j;
    }
  }
  return order;
}

// ─── المقاطع المرئية ───────────────────────────────────────────────────────
export type BiPiece = {
  /** النص المنطقي للمقطع (يُشكَّل بخطه ثم يُرسم) */
  text: string;
  /** اتجاه المقطع بصريًا */
  rtl: boolean;
  /** هل يحتوي محارف عربية (⇒ خط Naskh) */
  arabic: boolean;
};

/**
 * يقسّم نصًّا إلى مقاطع بترتيب بصري (من اليسار إلى اليمين) جاهزة للرسم.
 * @param text النص
 * @param baseRtl اتجاه الفقرة (true = عربي ⇒ الفقرة تبدأ من اليمين)
 */
export function bidiPieces(text: string, baseRtl: boolean): BiPiece[] {
  if (!text) return [];
  const chars = Array.from(text);
  const levels = bidiLevels(text, baseRtl);

  // المقاطع المنطقية: جيران بمستوى واحد
  type Run = { start: number; end: number; level: number };
  const runs: Run[] = [];
  for (let i = 0; i < chars.length; i++) {
    const last = runs[runs.length - 1];
    if (last && last.level === levels[i]) last.end = i + 1;
    else runs.push({ start: i, end: i + 1, level: levels[i] });
  }

  const visual = reorderRuns(runs);
  const pieces: BiPiece[] = [];
  for (const ri of visual) {
    const run = runs[ri];
    const rtl = run.level % 2 === 1;
    // تقسيم داخلي: عربية / غير عربية (لاختيار الخط) والمحايدات ترث المقطع الجاري
    let curStart = run.start;
    let curArabic = false;
    let started = false;
    const flush = (end: number) => {
      if (end <= curStart) return;
      const slice = chars.slice(curStart, end).join("");
      if (rtl) pieces.push({ text: mirrorChars(slice), rtl: true, arabic: curArabic });
      else pieces.push({ text: slice, rtl: false, arabic: curArabic });
    };
    for (let i = run.start; i < run.end; i++) {
      const cp = chars[i].codePointAt(0)!;
      const strong = charType(cp);
      const isArabic = strong === R || strong === AN;
      // ⚠️ NSM (علامات مركّبة: الهمزة تحت الألف…) وBN محايدتان **-finуча**:
      // فاصلُ المقطع عندهما يفصل العلامة عن أساسها ⇒ تُرسم منفردة (بلا قاعدة)
      // فيشوّهها fontkit (مربّع بدل الهمزة). العلامة يجب أن تبقى مع حرفها.
      const isNeutral =
        strong === ON ||
        strong === WS ||
        strong === B ||
        strong === S ||
        strong === ES ||
        strong === ET ||
        strong === CS ||
        strong === NSM ||
        strong === BN;
      if (!started) {
        curArabic = isArabic;
        started = true;
        continue;
      }
      if (isArabic !== curArabic && !isNeutral) {
        flush(i);
        curStart = i;
        curArabic = isArabic;
      }
    }
    flush(run.end);
  }
  return pieces;
}

/** هل يحتوي النص محارف عربية؟ (لاختيار الخط على مستوى السطر) */
export function hasArabic(text: string): boolean {
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    if (isArabicCp(cp)) return true;
  }
  return false;
}
