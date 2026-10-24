// HRMP — مولّد PDF للتقارير (SPEC §4.4.1) على محرّك pdfkit + محرّك Bidi داخلي
// ─────────────────────────────────────────────────────────────────────────────
// لماذا تبديل المحرّك؟ (بلاغ المالك 2026-10-20: «الوثائق بصيغة PDF مشوّهة
// والعربية معكوسة»، والـDOCX سليم)
//   @react-pdf/renderer 4.9.0 يكسر العربية في ثلاث مواضع داخل @react-pdf/textkit:
//   (1) layoutRun يُجبر fontkit على direction='ltr' ⇒ ينقطع الوصل العكسي،
//   (2) resolve/slice تُسقط أول محرف mark في كل مقطع (نقط الحروف)،
//   (3) reverseRun يعكس المحارف فينحرف موضع النقط عن أساسها.
//   النتيجة المُثبتة بصريًا: «سـيـمـة» بدل «قسيمة» ونقاط معلّقة في الفراغ.
//   ⇒ pdfkit (fontkit أصيل) يُشكّل العربية صحيحًا؛ نضيف عليه محرّك Bidi خاصًّا
//   (bidi.ts) لأن pdfkit لا يعيد ترتيب المقاطع المختلطة.
//   مكسب إضافي: خفّة الحزمة (حُذف @react-pdf/renderer) وسرعة البناء.
//
// التصميم: هوية المنصة (أخضر مغربي عميق + ذهب) — لا الكحلي القديم.
// ─────────────────────────────────────────────────────────────────────────────
import { createRequire } from "node:module";
import { join } from "node:path";
import type { AnyReportData, PayslipReportData, ReportBranding, ReportLanguage, ReportOptions } from "./types";
import { fontsDir, FONT_FILES } from "./fonts";
import { reportDict, tr, docMoney, docHours, monthLabel, isRtl } from "./i18n";
import type { ReportDict } from "./i18n";
import { qrDataUrl } from "./qr";
import { LINE_KIND_MAP } from "./line-kinds";
import { markPng } from "./logo";
import { bidiPieces } from "./bidi";

const require_ = createRequire(join(process.cwd(), "package.json"));
type Doc = import("pdfkit").PDFDocument;

let PDFDocumentCtor: (new (options?: unknown) => Doc) | null = null;
/** محمّل pdfkit: الوحدة نفسها مُصدَّرة كـ PDFDocument (وPDFDocument.PDFDocument أيضًا) */
function pdfkitDocument(): new (options?: unknown) => Doc {
  if (!PDFDocumentCtor) {
    const mod = require_("pdfkit") as unknown as {
      PDFDocument?: new (options?: unknown) => Doc;
      default?: { PDFDocument?: new (options?: unknown) => Doc };
    };
    const ctor = mod.PDFDocument ?? mod.default?.PDFDocument;
    if (!ctor) throw new Error("pdfkit_load_failed");
    PDFDocumentCtor = ctor;
  }
  return PDFDocumentCtor;
}

// ─── السياق ────────────────────────────────────────────────────────────────

export type PdfRenderMeta = {
  refNumber: string;
  contentHash: string;
  verifyUrl: string;
  verifyUrls?: string[]; // بوابات التحقق العامة المطبوعة (صفحة/فيرسل) — أولها محتوى QR
  generatedAt: string;
  generatedBy: string;
  qrData: string;
};

type Ctx = {
  lang: ReportLanguage;
  dict: ReportDict;
  rtl: boolean;
  options: ReportOptions;
  meta: PdfRenderMeta;
  branding: ReportBranding;
  logoMark: Buffer | null; // العلامة الذهبية الشفافة (PNG) — الشعار المعتمد 2026-10-21
};

// ─── لوحة الهوية (globals.css — oklch محوَّل إلى hex) ──────────────────────
const BRAND = "#0f2242"; // --primary (كحلي عميق — لون أرضية اللوغو)
const BRAND_SOFT = "#eef1f7"; // --secondary
const BRAND_TINT = "#f5f7fb"; // مسحة كحلية فاتحة
const GOLD = "#d4a437"; // --hrmp-gold
const INK = "#101722"; // --foreground
const BODY = "#2b3342";
const MUTED = "#5a6478"; // --muted-foreground
const LINE = "#e2e6ef";
const PAPER = "#ffffff";
const WARN_BG = "#fdf6e7";
const WARN_BAR = "#d99b2b";
const WARN_INK = "#6b4a10";

// ─── المقاسات ──────────────────────────────────────────────────────────────
const PAGE_W = 595.28; // A4
const PAGE_H = 841.89;
const M_X = 44; // هامش جانبي
const BAND_H = 58; // ارتفاع شريط الهوية
const TOP = BAND_H + 26; // أعلى منطقة المحتوى
const BOTTOM = PAGE_H - 58; // حدّ المحتوى السفلي
const CONTENT_W = PAGE_W - M_X * 2;

const FS = { h1: 16.5, h2: 10.8, body: 9.2, small: 8.2, tiny: 7.2, net: 15 };

// ─── الخطوط ────────────────────────────────────────────────────────────────
type FontName = "naskh" | "naskhBold" | "sans" | "sansBold";

const FONT_KEYS: Record<FontName, string> = {
  naskh: FONT_FILES.naskhRegular,
  naskhBold: FONT_FILES.naskhBold,
  sans: FONT_FILES.sansRegular,
  sansBold: FONT_FILES.sansBold,
};

function registerFonts(doc: Doc): void {
  const dir = fontsDir();
  for (const [name, file] of Object.entries(FONT_KEYS) as [FontName, string][]) {
    doc.registerFont(name, join(dir, file));
  }
}

// ─── النص (Bidi-aware) ─────────────────────────────────────────────────────

type TextOpts = {
  size?: number;
  bold?: boolean;
  color?: string;
  align?: "start" | "end" | "center";
  width?: number;
  maxLines?: number;
};

/** كلمة/فراغ داخل مقطع — تُرسم كلمةً كلمة (pdfkit يكسر النص إلى كلمات ويسرّبها LTR) */
type Token = { text: string; font: FontName; isSpace: boolean; width: number };
type Measured = { tokens: Token[]; width: number; rtl: boolean; arabic: boolean };

function fontFor(arabic: boolean, bold: boolean): FontName {
  if (arabic) return bold ? "naskhBold" : "naskh";
  return bold ? "sansBold" : "sans";
}

/** اتجاه الفقرة — الفقرة الواحدة اتجاه واحد (مضبوط قبل كل رسم) */
let docRtl = true;

/** تقسيم المقطع إلى كلمات وفراغات مع قياس كلٍّ بخطّه */
function tokenize(doc: Doc, text: string, font: FontName, size: number): Token[] {
  const parts = text.split(/(\s+)/).filter((p) => p.length > 0);
  const out: Token[] = [];
  for (const p of parts) {
    doc.font(font).fontSize(size);
    out.push({ text: p, font, isSpace: p.trim() === "", width: doc.widthOfString(p) });
  }
  return out;
}

function measurePieces(doc: Doc, text: string, o: TextOpts): Measured[] {
  const size = o.size ?? FS.body;
  return bidiPieces(text, docRtl).map((p) => {
    const font = fontFor(p.arabic, o.bold === true);
    const tokens = tokenize(doc, p.text, font, size);
    return {
      tokens,
      width: tokens.reduce((s, t) => s + t.width, 0),
      rtl: p.rtl,
      arabic: p.arabic,
    };
  });
}

function piecesWidth(pieces: Measured[]): number {
  return pieces.reduce((s, p) => s + p.width, 0);
}

/**
 * يرسم سطرًا واحدًا (مقاطع بصرية) — يعيد عرضه.
 * ⚠️ لماذا كلمةً كلمة؟ pdfkit يكسر النص إلى كلمات ويسرّبها من اليسار لليمين
 * (الـLineWrapper) — فالنص العربي متعدد الكلمات يخرج معكوسًا. الرسم يدويًا
 * لكل كلمة (مع ترتيبها حسب اتجاه المقطع) يحفظ التشكيل والاتجاه معًا.
 */
function drawLine(doc: Doc, pieces: Measured[], x: number, y: number, o: TextOpts): number {
  const size = o.size ?? FS.body;
  const color = o.color ?? BODY;
  const box = o.width ?? CONTENT_W;
  const total = piecesWidth(pieces);
  let cursor = x;
  if (o.align === "center") cursor = x + (box - total) / 2;
  else if (o.align === "end") cursor = x + box - total;
  for (const p of pieces) {
    let c = p.rtl ? cursor + p.width : cursor;
    for (const t of p.tokens) {
      if (!t.isSpace) {
        doc
          .font(t.font)
          .fontSize(size)
          .fillColor(color)
          .text(t.text, p.rtl ? c - t.width : c, y, { lineBreak: false });
      }
      c += p.rtl ? -t.width : t.width;
    }
    cursor += p.width;
  }
  return total;
}

/** لفّ النص إلى أسطر — يعيد الأسطر دون رسم */
function wrapLines(doc: Doc, text: string, width: number, o: TextOpts): string[] {
  const parts = text.split(/(\s+)/);
  const lines: string[] = [];
  let current = "";
  for (const part of parts) {
    if (part.length === 0) continue;
    if (part.trim() === "") {
      if (current !== "") current += part;
      continue;
    }
    const candidate = current === "" ? part : `${current} ${part}`;
    if (piecesWidth(measurePieces(doc, candidate, o)) > width && current !== "") {
      lines.push(current.trimEnd());
      current = part;
    } else {
      current = candidate;
    }
  }
  if (current.trim() !== "") lines.push(current.trimEnd());
  return lines.length > 0 ? lines : [""];
}

/** فقرة ملتفّة — ترسمها وتعيد ارتفاعها */
function drawParagraph(doc: Doc, text: string, x: number, y: number, o: TextOpts): number {
  const width = o.width ?? CONTENT_W;
  const size = o.size ?? FS.body;
  const lh = lineH(size);
  const lines = wrapLines(doc, text, width, o);
  const shown = o.maxLines ? lines.slice(0, o.maxLines) : lines;
  shown.forEach((line, i) => {
    drawLine(doc, measurePieces(doc, line, o), x, y + i * lh, o);
  });
  return Math.max(shown.length, 1) * lh;
}

/** ارتفاع سطر واحد */
function lineH(size: number): number {
  return size * 1.52;
}

// ─── أشكال ─────────────────────────────────────────────────────────────────
function rect(doc: Doc, x: number, y: number, w: number, h: number, color: string): void {
  doc.rect(x, y, w, h).fill(color);
}
function hLine(doc: Doc, x: number, y: number, w: number, color: string, thickness = 0.7): void {
  doc.save().moveTo(x, y).lineTo(x + w, y).lineWidth(thickness).strokeColor(color).stroke().restore();
}

// ─── الشعار (رسم متجهي — حاد في أي حجم) ───────────────────────────────────
/** مسار الدبوس في فضاء 64×64 (نفس public/logo.svg) */
const LOGO_PIN_PATH =
  "M32 48.23C30.3 43.73 22.4 33.2 22.4 26.5A9.6 9.6 0 1 1 41.6 26.5C41.6 33.2 33.7 43.73 32 48.23Z";

/** شعار HRMP: العلامة الذهبية المعتمدة (PNG شفاف) فوق شريط الهوية الكحلي.
 *  الاحتياطي المتجهي (نجمة زليج + دبوس) يُرسم فقط إن تعذّر تحميل الصورة (بيئة بلا public/). */
function drawLogo(doc: Doc, x: number, y: number, size: number, star: string, pin: string, hole: string, mark?: Buffer | null): void {
  if (mark && mark.length > 0) {
    try {
      doc.image(mark, x, y, { width: size, height: size });
      return;
    } catch {
      /* يسقط إلى الرسم المتجهي أدناه */
    }
  }
  const s = size / 64;
  const cx = 32;
  const cy = 32;
  const R = 29.5;
  const r = R * 0.55;
  doc.save().translate(x, y).scale(s);
  const pts: [number, number][] = [];
  for (let i = 0; i < 16; i++) {
    const angle = ((-90 + i * 22.5) * Math.PI) / 180;
    const rr = i % 2 === 0 ? R : r;
    pts.push([cx + rr * Math.cos(angle), cy + rr * Math.sin(angle)]);
  }
  doc.polygon(...pts).fill(star);
  doc.path(LOGO_PIN_PATH).fill(pin);
  doc.circle(32, 26.5, 3.9).fill(hole);
  doc.restore();
}

// ─── التدفّق (صفحات) ────────────────────────────────────────────────────────
type Flow = { doc: Doc; ctx: Ctx; y: number };

function newPage(flow: Flow): void {
  flow.doc.addPage({ size: "A4", margin: 0 });
  drawBrandBand(flow.doc, flow.ctx);
  flow.y = TOP;
}

/** يضمن وجود مساحة قبل الرسم — يضيف صفحة عند الحاجة */
function ensure(flow: Flow, h: number): void {
  if (flow.y + h > BOTTOM) newPage(flow);
}

// ─── عناصر التخطيط ─────────────────────────────────────────────────────────

/** شريط الهوية أعلى كل صفحة */
function drawBrandBand(doc: Doc, ctx: Ctx): void {
  rect(doc, 0, 0, PAGE_W, BAND_H, BRAND);
  rect(doc, 0, BAND_H, PAGE_W, 2.6, GOLD);
  const logoSize = 31;
  const logoX = ctx.rtl ? PAGE_W - M_X - logoSize : M_X;
  drawLogo(doc, logoX, (BAND_H - logoSize) / 2, logoSize, GOLD, PAPER, BRAND, ctx.logoMark);

  const company = ctx.branding.displayName || ctx.branding.legalName;
  const namePieces = measurePieces(doc, company, { size: 11.5, bold: true, color: PAPER });
  const nameW = piecesWidth(namePieces);
  const nameX = ctx.rtl ? logoX - 11 - nameW : logoX + logoSize + 11;
  drawLine(doc, namePieces, nameX, 14.5, { size: 11.5, bold: true, color: PAPER });

  const legalPieces = measurePieces(doc, ctx.branding.legalName, { size: 7.4, color: "#c7d3e8" });
  const legalW = piecesWidth(legalPieces);
  const legalX = ctx.rtl ? logoX - 11 - legalW : logoX + logoSize + 11;
  drawLine(doc, legalPieces, legalX, 32.5, { size: 7.4, color: "#c7d3e8" });
}

/** تذييل كل صفحة */
function drawFooter(doc: Doc, ctx: Ctx, pageNumber: number, totalPages: number): void {
  const y = PAGE_H - 40;
  hLine(doc, M_X, y, CONTENT_W, LINE);
  const size = FS.tiny;
  const color = MUTED;

  const brand = ctx.branding.footerText ?? ctx.branding.legalName;
  const label = tr(ctx.dict, "reports.doc.footerOfficial");
  const lp = measurePieces(doc, `${label} — ${brand}`, { size, color });
  const lw = Math.min(piecesWidth(lp), CONTENT_W * 0.46);
  drawLine(doc, lp, ctx.rtl ? PAGE_W - M_X - lw : M_X, y + 8, { size, color });

  const rp = measurePieces(doc, ctx.meta.refNumber, { size, color });
  const rw = piecesWidth(rp);
  drawLine(doc, rp, ctx.rtl ? M_X : PAGE_W - M_X - rw, y + 8, { size, color });

  const page = `${tr(ctx.dict, "reports.doc.page")} ${pageNumber} / ${totalPages}`;
  const pp = measurePieces(doc, page, { size, color });
  const pw = piecesWidth(pp);
  drawLine(doc, pp, PAGE_W / 2 - pw / 2, y + 8, { size, color });
}

/** عنوان قسم + شريط ذهبي */
function sectionTitle(doc: Doc, ctx: Ctx, text: string, y: number): number {
  const barW = 3;
  const barH = 13;
  const x = ctx.rtl ? PAGE_W - M_X - barW : M_X;
  doc.save().rect(x, y + 1, barW, barH).fill(GOLD).restore();
  const pieces = measurePieces(doc, text, { size: FS.h2, bold: true, color: BRAND });
  const w = piecesWidth(pieces);
  drawLine(doc, pieces, ctx.rtl ? x - barW - 8 - w : x + barW + 8, y, { size: FS.h2, bold: true, color: BRAND });
  return y + barH + 6;
}

/** ترويسة المستند: العنوان الكبير + سطر البيانات + خط ذهبي */
function drawDocTitle(doc: Doc, ctx: Ctx, title: string, metaLine: string, y: number): number {
  const pieces = measurePieces(doc, title, { size: FS.h1, bold: true, color: INK });
  drawLine(doc, pieces, ctx.rtl ? PAGE_W - M_X - piecesWidth(pieces) : M_X, y, {
    size: FS.h1,
    bold: true,
    color: INK,
  });
  let yy = y + lineH(FS.h1) + 1;
  const metaPieces = measurePieces(doc, metaLine, { size: FS.small, color: MUTED });
  drawLine(doc, metaPieces, ctx.rtl ? PAGE_W - M_X - piecesWidth(metaPieces) : M_X, yy, {
    size: FS.small,
    color: MUTED,
  });
  yy += lineH(FS.small) + 2;
  hLine(doc, M_X, yy, CONTENT_W, LINE);
  hLine(doc, ctx.rtl ? PAGE_W - M_X - 46 : M_X, yy, 46, GOLD, 2);
  return yy + 13;
}

// ─── الجداول ───────────────────────────────────────────────────────────────
type Col = { flex: number; align?: "start" | "end" | "center" };

function colWidths(cols: Col[]): number[] {
  const gap = 9;
  const totalFlex = cols.reduce((s, c) => s + c.flex, 0);
  const usable = CONTENT_W - gap * (cols.length - 1);
  return cols.map((c) => (usable * c.flex) / totalFlex);
}

function drawTable(
  flow: Flow,
  cols: Col[],
  head: string[],
  rows: string[][],
  opts: { zebra?: boolean; small?: boolean } = {}
): void {
  const { doc, ctx } = flow;
  const widths = colWidths(cols);
  const size = opts.small ? FS.small : FS.body;
  const padX = 8;
  const rowPad = 6;
  const gap = 9;

  /** الحافة اليسرى للخلية i (في RTL: العمود 0 على اليمين) */
  const cellOrigin = (i: number): number => {
    if (ctx.rtl) {
      let right = PAGE_W - M_X;
      for (let k = 0; k < i; k++) right -= widths[k] + gap;
      return right - widths[i];
    }
    let x = M_X;
    for (let k = 0; k < i; k++) x += widths[k] + gap;
    return x;
  };

  // ── صفّ الرأس (يتكرّر على كل صفحة) — يلفّ العنوان الطويل بدل أن يفيض ──
  const drawHead = (): void => {
    const headLines = head.map((text, i) => wrapLines(doc, text, widths[i] - padX * 2, { size, bold: true }));
    const headH = Math.max(...headLines.map((l) => l.length), 1) * lineH(size) + 10;
    rect(doc, M_X, flow.y, CONTENT_W, headH, BRAND_SOFT);
    rect(doc, ctx.rtl ? PAGE_W - M_X - 2.6 : M_X, flow.y, 2.6, headH, GOLD);
    headLines.forEach((lines, i) => {
      const w = widths[i];
      const x = cellOrigin(i);
      const align = cols[i].align ?? "start";
      lines.forEach((line, li) => {
        const pieces = measurePieces(doc, line, { size, bold: true, color: BRAND });
        const tw = piecesWidth(pieces);
        let tx = x + padX;
        if (align === "center") tx = x + (w - tw) / 2;
        else if (align === "end") tx = ctx.rtl ? x : x + w - padX - tw;
        else tx = ctx.rtl ? x + w - padX - tw : x + padX;
        drawLine(doc, pieces, tx, flow.y + 5 + li * lineH(size), { size, bold: true, color: BRAND });
      });
    });
    flow.y += headH;
  };

  ensure(flow, 40);
  drawHead();

  // ── الصفوف ──
  rows.forEach((row, r) => {
    const cellLines = row.map((text, i) => wrapLines(doc, text, widths[i] - padX * 2, { size }));
    const rowLines = Math.max(...cellLines.map((l) => l.length), 1);
    const h = rowLines * lineH(size) + rowPad * 2;
    ensure(flow, h + 24);
    if (r % 2 === 1) rect(doc, M_X, flow.y, CONTENT_W, h, BRAND_TINT);
    row.forEach((text, i) => {
      const w = widths[i];
      const x = cellOrigin(i);
      const align = cols[i].align ?? "start";
      cellLines[i].forEach((line, li) => {
        const pieces = measurePieces(doc, line, { size });
        const tw = piecesWidth(pieces);
        let tx = x + padX;
        if (align === "center") tx = x + (w - tw) / 2;
        else if (align === "end") tx = ctx.rtl ? x : x + w - padX - tw;
        else tx = ctx.rtl ? x + w - padX - tw : x + padX;
        drawLine(doc, pieces, tx, flow.y + rowPad + li * lineH(size), { size });
      });
    });
    hLine(doc, M_X, flow.y + h, CONTENT_W, LINE, 0.6);
    flow.y += h;
  });
}

// ─── بطاقات القيم (label/value) ───────────────────────────────────────────
type KvItem = { label: string; value: string; bold?: boolean };

/** لوحة واحدة (عمود واحد) من بطاقات label/value */
function drawKvPanel(
  doc: Doc,
  ctx: Ctx,
  items: KvItem[],
  x: number,
  w: number,
  top: number,
  h: number
): void {
  const cardPad = 13;
  rect(doc, x, top, w, h, BRAND_TINT);
  rect(doc, ctx.rtl ? x + w - 2.6 : x, top, 2.6, h, GOLD);
  const colW = w - cardPad * 2;
  const cellX = ctx.rtl ? x + w - cardPad - colW : x + cardPad;
  items.forEach((item, i) => {
    const cy = top + cardPad + i * 29;
    const labelPieces = measurePieces(doc, item.label, { size: FS.small, color: MUTED });
    const lw = piecesWidth(labelPieces);
    drawLine(doc, labelPieces, ctx.rtl ? cellX + colW - lw : cellX, cy, { size: FS.small, color: MUTED });
    const valuePieces = measurePieces(doc, item.value, {
      size: FS.body,
      bold: item.bold === true,
      color: INK,
    });
    const vw = piecesWidth(valuePieces);
    drawLine(doc, valuePieces, ctx.rtl ? cellX + colW - vw : cellX, cy + lineH(FS.small), {
      size: FS.body,
      bold: item.bold === true,
      color: INK,
    });
    hLine(doc, cellX, cy + 23, colW, "#dde3ee", 0.5);
  });
}

/**
 * شبكة بطاقات label/value داخل إطار خفيف.
 * كل خلية: التسمية في سطر والقيمة تحتها (محاذاة واحدة = بداية اتجاه القراءة)
 * ⇒ لا تداخل بين قيمة خلية وتسمية جارتها (العيب القديم في تخطيط «سطر واحد»).
 */
function drawKvCard(
  flow: Flow,
  items: KvItem[],
  cols: 1 | 2,
  opts: { x?: number; width?: number } = {}
): void {
  const { doc, ctx } = flow;
  const gap = 12;
  const cardPad = 13;
  const cardX = opts.x ?? M_X;
  const cardW = opts.width ?? CONTENT_W;
  const colW = (cardW - gap * (cols - 1) - cardPad * 2) / cols;
  const rowH = 29;
  const rows = Math.max(Math.ceil(items.length / cols), 1);
  const cardH = rows * rowH + cardPad * 2 - 8;
  ensure(flow, cardH + 8);

  const top = flow.y;
  rect(doc, cardX, top, cardW, cardH, BRAND_TINT);
  rect(doc, ctx.rtl ? cardX + cardW - 2.6 : cardX, top, 2.6, cardH, GOLD);

  items.forEach((item, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const cellX = ctx.rtl
      ? cardX + cardW - cardPad - colW - col * (colW + gap)
      : cardX + cardPad + col * (colW + gap);
    const cy = top + cardPad + row * rowH;

    const labelPieces = measurePieces(doc, item.label, { size: FS.small, color: MUTED });
    const lw = piecesWidth(labelPieces);
    drawLine(doc, labelPieces, ctx.rtl ? cellX + colW - lw : cellX, cy, { size: FS.small, color: MUTED });

    const valuePieces = measurePieces(doc, item.value, {
      size: FS.body,
      bold: item.bold === true,
      color: INK,
    });
    const vw = piecesWidth(valuePieces);
    drawLine(doc, valuePieces, ctx.rtl ? cellX + colW - vw : cellX, cy + lineH(FS.small), {
      size: FS.body,
      bold: item.bold === true,
      color: INK,
    });

    hLine(doc, cellX, cy + rowH - 6, colW, "#dde3ee", 0.5);
  });
  flow.y = top + cardH;
}

// ─── كتلة QR ───────────────────────────────────────────────────────────────
function drawQrBlock(flow: Flow): void {
  const { doc, ctx } = flow;
  const cardH = 78;
  const pad = 12;
  ensure(flow, cardH + 8);
  const top = flow.y;
  rect(doc, M_X, top, CONTENT_W, cardH, BRAND_TINT);
  const qrSize = 54;
  const qrX = ctx.rtl ? PAGE_W - M_X - pad - qrSize : M_X + pad;
  const qrY = top + (cardH - qrSize) / 2;
  doc.image(ctx.meta.qrData, qrX, qrY, { width: qrSize, height: qrSize });

  // حافة الإرساء: في RTL يقع النص يسار الـQR (يُحاذى لليمين) وفي LTR يمينه
  const anchor = ctx.rtl ? qrX - 14 : qrX + qrSize + 14;
  const put = (pieces: Measured[], y: number): void => {
    drawLine(doc, pieces, ctx.rtl ? anchor - piecesWidth(pieces) : anchor, y, {});
  };
  const cap = tr(ctx.dict, "reports.doc.qrCaption");
  const capPieces = measurePieces(doc, cap, { size: FS.body, bold: true, color: INK });
  drawLine(doc, capPieces, ctx.rtl ? anchor - piecesWidth(capPieces) : anchor, top + 14, {
    size: FS.body,
    bold: true,
    color: INK,
  });
  const hashPieces = measurePieces(doc, ctx.meta.contentHash.slice(0, 32), { size: 7, color: MUTED });
  drawLine(doc, hashPieces, ctx.rtl ? anchor - piecesWidth(hashPieces) : anchor, top + 32, {
    size: 7,
    color: MUTED,
  });
  // رابطان تحقق عامّان (pages.dev + vercel.app) — بلاغ المالك 2026-10-23
  const links = (ctx.meta.verifyUrls?.length ? ctx.meta.verifyUrls : [ctx.meta.verifyUrl]).slice(0, 2);
  links.forEach((link, i) => {
    const urlPieces = measurePieces(doc, link.replace(/^https?:\/\//, ""), { size: 7, color: BRAND });
    drawLine(doc, urlPieces, ctx.rtl ? anchor - piecesWidth(urlPieces) : anchor, top + 44 + i * 12, {
      size: 7,
      color: BRAND,
    });
  });
  void put;
  flow.y = top + cardH;
}

/** شريط تحذير / إشعار */
function drawNotice(flow: Flow, text: string, tone: "warn" | "ok"): void {
  const { doc, ctx } = flow;
  const size = FS.small;
  const lines = wrapLines(doc, text, CONTENT_W - 28, { size });
  const h = lines.length * lineH(size) + 16;
  ensure(flow, h + 8);
  const top = flow.y;
  rect(doc, M_X, top, CONTENT_W, h, tone === "warn" ? WARN_BG : BRAND_TINT);
  rect(doc, ctx.rtl ? PAGE_W - M_X - 3 : M_X, top, 3, h, tone === "warn" ? WARN_BAR : BRAND);
  const color = tone === "warn" ? WARN_INK : BRAND;
  lines.forEach((line, i) => {
    const pieces = measurePieces(doc, line, { size, color });
    const w = piecesWidth(pieces);
    drawLine(doc, pieces, ctx.rtl ? PAGE_W - M_X - 15 - w : M_X + 15, top + 8 + i * lineH(size), { size, color });
  });
  flow.y = top + h;
}

/** كتلة الملاحظة الإدارية (تُطبع في المستند — تعديلها يُنشئ نسخة جديدة) */
function drawNote(flow: Flow): void {
  const note = flow.ctx.options.note;
  if (!note) return;
  const { doc, ctx } = flow;
  const size = FS.small;
  const label = tr(ctx.dict, "reports.noteLabel");
  const lines = wrapLines(doc, note, CONTENT_W - 34, { size });
  const h = lines.length * lineH(size) + 30;
  ensure(flow, h + 10);
  const top = flow.y;
  rect(doc, M_X, top, CONTENT_W, h, "#f7f2e6");
  rect(doc, ctx.rtl ? PAGE_W - M_X - 3 : M_X, top, 3, h, GOLD);
  const labelPieces = measurePieces(doc, label, { size: FS.tiny, bold: true, color: "#8a6a1f" });
  drawLine(doc, labelPieces, ctx.rtl ? PAGE_W - M_X - 14 - piecesWidth(labelPieces) : M_X + 14, top + 7, {
    size: FS.tiny,
    bold: true,
    color: "#8a6a1f",
  });
  lines.forEach((line, i) => {
    const pieces = measurePieces(doc, line, { size });
    const w = piecesWidth(pieces);
    drawLine(doc, pieces, ctx.rtl ? PAGE_W - M_X - 14 - w : M_X + 14, top + 20 + i * lineH(size), { size });
  });
  flow.y = top + h + 12;
}

/** شريط الصافي (خضراء) */
function drawNetBox(flow: Flow, label: string, amount: string, width: number): void {
  const { doc, ctx } = flow;
  const h = 40;
  ensure(flow, h + 12);
  const x = ctx.rtl ? PAGE_W - M_X - width : M_X;
  const y = flow.y;
  rect(doc, x, y, width, h, BRAND);
  rect(doc, ctx.rtl ? PAGE_W - M_X - 3 : x, y, 3, h, GOLD);

  const lp = measurePieces(doc, label, { size: 10.5, bold: true, color: PAPER });
  drawLine(doc, lp, ctx.rtl ? PAGE_W - M_X - 16 - piecesWidth(lp) : x + 16, y + 13, {
    size: 10.5,
    bold: true,
    color: PAPER,
  });
  const ap = measurePieces(doc, amount, { size: FS.net, bold: true, color: PAPER });
  drawLine(doc, ap, ctx.rtl ? x + 16 : x + width - 16 - piecesWidth(ap), y + 9, {
    size: FS.net,
    bold: true,
    color: PAPER,
  });
  flow.y = y + h;
}

// ─── تسميات ───────────────────────────────────────────────────────────────
function lineKindLabel(ctx: Ctx, kind: string): string {
  const key = LINE_KIND_MAP[kind] ?? "payroll.lineUnknown";
  const val = tr(ctx.dict, key);
  return val === key ? kind : val;
}
function payTypeLabelKey(payType: string): string {
  if (payType === "hourly") return "payroll.payTypeHourly";
  if (payType === "daily") return "payroll.payTypeDaily";
  if (payType === "monthly") return "payroll.payTypeMonthly";
  return "";
}
function dictOr(ctx: Ctx, key: string, fallback: string): string {
  const val = tr(ctx.dict, key);
  return val === key ? fallback : val;
}

// ─── الصفحات ───────────────────────────────────────────────────────────────

function payslipPage(flow: Flow, data: PayslipReportData): void {
  const { doc, ctx } = flow;
  const L = (k: string) => tr(ctx.dict, k);
  const money = (c: number) => docMoney(c, ctx.lang);
  const showEmployer = ctx.options.includeEmployerShare === true;
  const [py, pm] = data.periodLabel.split("-");
  const periodLabel = monthLabel(ctx.dict, Number(py), Number(pm));

  const lines = data.lines.filter((l) => showEmployer || !l.kind.startsWith("employer_"));

  flow.y = drawDocTitle(
    doc,
    ctx,
    L("reports.doc.payslipTitle"),
    `${L("reports.doc.period")}: ${periodLabel}  •  ${L("reports.doc.ref")}: ${data.refNumber}`,
    flow.y
  );

  // بطاقتان متجاورتان: بيانات العامل + الساعات
  const gap = 12;
  const halfW = (CONTENT_W - gap) / 2;
  const workerItems: KvItem[] = [{ label: L("reports.doc.worker"), value: data.worker.fullName, bold: true }];
  if (data.worker.cin) workerItems.push({ label: L("reports.doc.cin"), value: data.worker.cin });
  if (data.worker.cnssNumber) workerItems.push({ label: L("reports.doc.cnssNumber"), value: data.worker.cnssNumber });
  workerItems.push({
    label: L("reports.doc.payType"),
    value: dictOr(ctx, payTypeLabelKey(data.worker.payType), data.worker.payType),
  });
  workerItems.push({ label: L("reports.doc.dependents"), value: String(data.worker.dependentsCount) });

  const hourItems: KvItem[] = [{ label: L("reports.doc.workedMinutes"), value: docHours(data.totals.workedMinutes) }];
  if (data.totals.overtimeMinutes > 0)
    hourItems.push({ label: L("reports.doc.overtimeMinutes"), value: docHours(data.totals.overtimeMinutes) });
  hourItems.push({ label: L("reports.doc.workedDays"), value: String(data.totals.workedDays) });
  if (data.totals.breakMinutes > 0)
    hourItems.push({ label: L("reports.doc.breakMinutes"), value: docHours(data.totals.breakMinutes) });

  // بطاقتان متجاورتان: بيانات العامل (بداية القراءة) والساعات (نهايتها)
  const panelW = (CONTENT_W - gap) / 2;
  const panelRows = Math.max(workerItems.length, hourItems.length);
  const panelH = panelRows * 29 + 18;
  ensure(flow, panelH + 16);
  const top = flow.y;
  const workerX = ctx.rtl ? PAGE_W - M_X - panelW : M_X;
  const hoursX = ctx.rtl ? M_X : M_X + panelW + gap;
  drawKvPanel(doc, ctx, workerItems, workerX, panelW, top, panelH);
  drawKvPanel(doc, ctx, hourItems, hoursX, panelW, top, panelH);
  flow.y = top + panelH + 16;

  // بنود الكشف
  flow.y = sectionTitle(doc, ctx, L("reports.doc.linesSection"), flow.y);
  drawTable(
    flow,
    [
      { flex: 4 },
      { flex: 1.5, align: "center" },
      { flex: 1.5, align: "center" },
      { flex: 2.2, align: "end" },
    ],
    [
      L("reports.doc.colItem"),
      L("reports.doc.colHours"),
      L("reports.doc.colRate"),
      L("reports.doc.colAmount"),
    ],
    lines.map((l) => [
      l.label || lineKindLabel(ctx, l.kind),
      l.minutes !== null ? docHours(l.minutes) : "—",
      l.rateBp !== null ? `${(l.rateBp / 10000).toFixed(2)}%` : "—",
      money(l.amountCents),
    ])
  );
  flow.y += 16;

  // الإجماليات
  flow.y = sectionTitle(doc, ctx, L("reports.doc.totalsSection"), flow.y);
  const totalItems: KvItem[] = [
    { label: L("reports.doc.gross"), value: money(data.totals.grossCents), bold: true },
    { label: L("reports.doc.cnss"), value: money(-data.totals.cnssEmployeeCents) },
    { label: L("reports.doc.amo"), value: money(-data.totals.amoEmployeeCents) },
    { label: L("reports.doc.ir"), value: money(-data.totals.irNetCents) },
  ];
  if (showEmployer) {
    totalItems.push({ label: L("reports.doc.employerCost"), value: money(data.totals.employerCostCents) });
    totalItems.push({ label: L("reports.doc.totalCost"), value: money(data.totals.totalCostCents), bold: true });
  }
  drawKvCard(flow, totalItems, 2);
  flow.y += 14;

  if (!showEmployer) {
    drawNotice(flow, L("reports.doc.employerShareNote"), "ok");
    flow.y += 10;
  }
  if (data.smigBreached) {
    drawNotice(flow, L("reports.doc.smigWarning"), "warn");
    flow.y += 10;
  }

  drawNote(flow);

  // الصافي + QR مصغّرة
  const netW = CONTENT_W - 92;
  ensure(flow, 60);
  const boxY = flow.y;
  drawNetBox(flow, L("reports.doc.net"), money(data.totals.netCents), netW);
  const qrSize = 54;
  const qrX = ctx.rtl ? M_X + 8 : PAGE_W - M_X - qrSize - 8;
  doc.image(ctx.meta.qrData, qrX, boxY + 4, { width: qrSize, height: qrSize });
  const hashPieces = measurePieces(doc, ctx.meta.contentHash.slice(0, 12), { size: 6.4, color: MUTED });
  const hw = piecesWidth(hashPieces);
  drawLine(doc, hashPieces, qrX + (qrSize - hw) / 2, boxY + 60, { size: 6.4, color: MUTED });
}

function payrollSummaryPage(flow: Flow, data: Extract<AnyReportData, { kind: "payroll_summary" }>): void {
  const { doc, ctx } = flow;
  const L = (k: string) => tr(ctx.dict, k);
  const money = (c: number) => docMoney(c, ctx.lang);
  const [py, pm] = data.periodLabel.split("-");
  const periodLabel = monthLabel(ctx.dict, Number(py), Number(pm));

  flow.y = drawDocTitle(
    doc,
    ctx,
    L("reports.doc.summaryTitle"),
    `${L("reports.doc.period")}: ${periodLabel}  •  ${L("reports.doc.workersCount")}: ${data.workersCount}`,
    flow.y
  );

  const totals: KvItem[] = [
    { label: L("reports.doc.workersCount"), value: String(data.workersCount) },
    { label: L("reports.doc.workedMinutes"), value: docHours(data.totals.workedMinutes) },
  ];
  if (data.totals.overtimeMinutes > 0)
    totals.push({ label: L("reports.doc.overtimeMinutes"), value: docHours(data.totals.overtimeMinutes) });
  totals.push({ label: L("reports.doc.gross"), value: money(data.totals.grossCents), bold: true });
  totals.push({ label: L("reports.doc.cnss"), value: money(-data.totals.cnssEmployeeCents) });
  totals.push({ label: L("reports.doc.amo"), value: money(-data.totals.amoEmployeeCents) });
  totals.push({ label: L("reports.doc.ir"), value: money(-data.totals.irNetCents) });
  totals.push({ label: L("reports.doc.employerCost"), value: money(data.totals.employerCostCents) });
  totals.push({ label: L("reports.doc.totalCost"), value: money(data.totals.totalCostCents), bold: true });
  drawKvCard(flow, totals, 2);
  flow.y += 18;

  flow.y = sectionTitle(doc, ctx, L("reports.doc.workersSection"), flow.y);
  drawTable(
    flow,
    [
      { flex: 3 },
      { flex: 1.9 },
      { flex: 1.2, align: "center" },
      { flex: 1.7, align: "end" },
      { flex: 1.4, align: "end" },
      { flex: 1.3, align: "end" },
      { flex: 1.3, align: "end" },
      { flex: 1.7, align: "end" },
    ],
    [
      L("reports.doc.worker"),
      L("reports.doc.colRef"),
      L("reports.doc.colHours"),
      L("reports.doc.gross"),
      "CNSS",
      "AMO",
      "IR",
      L("reports.doc.net"),
    ],
    data.rows.map((r) => [
      r.fullName,
      r.refNumber,
      docHours(r.workedMinutes),
      money(r.grossCents),
      money(-r.cnssEmployeeCents),
      money(-r.amoEmployeeCents),
      money(-r.irNetCents),
      money(r.netCents),
    ]),
    { small: true }
  );
  flow.y += 18;
  drawNote(flow);
  drawQrBlock(flow);
}

function attendancePage(
  flow: Flow,
  data: Extract<AnyReportData, { kind: "attendance_statement" | "hours_statement" }>
): void {
  const { doc, ctx } = flow;
  const L = (k: string) => tr(ctx.dict, k);
  const [py, pm] = data.rangeLabel.split("-");
  const rangeLabel = monthLabel(ctx.dict, Number(py), Number(pm));
  const title = data.kind === "hours_statement" ? L("reports.doc.hoursTitle") : L("reports.doc.attendanceTitle");

  flow.y = drawDocTitle(
    doc,
    ctx,
    title,
    `${L("reports.doc.worker")}: ${data.workerName}  •  ${L("reports.doc.period")}: ${rangeLabel}`,
    flow.y
  );

  drawKvCard(
    flow,
    [
      { label: L("reports.doc.attendancePresentDays"), value: String(data.totals.presentDays), bold: true },
      { label: L("reports.doc.attendanceTotalMinutes"), value: docHours(data.totals.totalMinutes) },
    ],
    2
  );
  flow.y += 18;

  flow.y = sectionTitle(doc, ctx, L("reports.doc.attendanceSection"), flow.y);
  drawTable(
    flow,
    [
      { flex: 1.9 },
      { flex: 1.4, align: "center" },
      { flex: 1.4, align: "center" },
      { flex: 1.5, align: "center" },
      { flex: 1.9 },
    ],
    [
      L("reports.doc.attendanceColDate"),
      L("reports.doc.attendanceColIn"),
      L("reports.doc.attendanceColOut"),
      L("reports.doc.attendanceColMinutes"),
      L("reports.doc.attendanceColStatus"),
    ],
    data.rows.map((r) => [
      r.localDate,
      r.inLabel ?? "—",
      r.outLabel ?? "—",
      docHours(r.minutes),
      dictOr(ctx, `reports.doc.attendanceStatus.${r.status}`, r.status),
    ])
  );
  if (data.rows.length === 0) {
    flow.y += 10;
    drawNotice(flow, L("reports.doc.noRows"), "ok");
  }
  flow.y += 18;
  drawNote(flow);
  drawQrBlock(flow);
}

function declarationsSummaryPage(flow: Flow, data: Extract<AnyReportData, { kind: "declarations_summary" }>): void {
  const { doc, ctx } = flow;
  const L = (k: string) => tr(ctx.dict, k);
  const money = (c: number | null) => (c === null ? "—" : docMoney(c, ctx.lang));

  flow.y = drawDocTitle(
    doc,
    ctx,
    L("reports.doc.declSummaryTitle"),
    `${L("reports.doc.period")}: ${data.periodLabel}`,
    flow.y
  );
  flow.y = sectionTitle(doc, ctx, L("reports.doc.declSection"), flow.y);
  drawTable(
    flow,
    [
      { flex: 1.2 },
      { flex: 1.9 },
      { flex: 1.4 },
      { flex: 1.7 },
      { flex: 1.8, align: "end" },
      { flex: 1.4, align: "end" },
      { flex: 1.8, align: "end" },
    ],
    [
      L("reports.doc.colAuthority"),
      L("reports.doc.colDeclKind"),
      L("reports.doc.period"),
      L("reports.doc.colDeclStatus"),
      L("reports.doc.gross"),
      "IR",
      L("reports.doc.net"),
    ],
    data.rows.map((r) => [
      r.authority.toUpperCase(),
      dictOr(ctx, `specRegistry.kinds.${r.kind}`, r.kind),
      r.periodKey,
      dictOr(ctx, `declarations.statuses.${r.status}`, r.status),
      money(r.grossCents),
      money(r.irNetCents),
      money(r.netCents),
    ])
  );
  if (data.rows.length === 0) {
    flow.y += 10;
    drawNotice(flow, L("reports.doc.noRows"), "ok");
  }
  flow.y += 18;
  drawNote(flow);
  drawQrBlock(flow);
}

function compliancePage(flow: Flow, data: Extract<AnyReportData, { kind: "compliance_report" }>): void {
  const { doc, ctx } = flow;
  const L = (k: string) => tr(ctx.dict, k);
  const money = (c: number) => docMoney(c, ctx.lang);

  flow.y = drawDocTitle(
    doc,
    ctx,
    L("reports.doc.complianceTitle"),
    `${data.declarationLabel}  •  ${L("reports.doc.colDeclStatus")}: ${dictOr(ctx, `declarations.statuses.${data.status}`, data.status)}`,
    flow.y
  );
  flow.y += drawParagraph(doc, L("reports.doc.complianceIntro"), M_X, flow.y, { size: FS.small, color: MUTED });
  flow.y += 10;

  flow.y = sectionTitle(doc, ctx, L("reports.doc.complianceTable"), flow.y);
  const fieldLabel = (f: string) =>
    f === "workers"
      ? L("reports.doc.workersCount")
      : f === "grossCents"
        ? L("reports.doc.gross")
        : f === "cnssEmployeeCents"
          ? L("reports.doc.cnss")
          : f === "amoEmployeeCents"
            ? L("reports.doc.amo")
            : f === "irNetCents"
              ? L("reports.doc.ir")
              : L("reports.doc.net");
  const fieldText = (f: string, v: number) => (f === "workers" ? String(v) : money(v));

  drawTable(
    flow,
    [
      { flex: 2.6 },
      { flex: 2.2, align: "end" },
      { flex: 2.2, align: "end" },
      { flex: 1.9, align: "end" },
    ],
    [
      L("reports.doc.colField"),
      L("reports.doc.colPayslips"),
      L("reports.doc.colDeclaration"),
      L("reports.doc.colDiff"),
    ],
    data.diffs.map((d) => [
      fieldLabel(d.field),
      fieldText(d.field, d.payslipCents),
      d.declarationCents !== null ? fieldText(d.field, d.declarationCents) : "—",
      d.field === "workers" ? String(d.diffCents) : money(d.diffCents),
    ])
  );
  flow.y += 12;

  if (data.diffs.length === 0) {
    drawNotice(flow, L("reports.doc.complianceNoFile"), "warn");
  } else if (data.diffs.every((d) => d.diffCents === 0)) {
    drawNotice(flow, L("reports.doc.complianceMatch"), "ok");
  } else {
    drawNotice(flow, L("reports.doc.complianceDiff"), "warn");
  }
  flow.y += 10;

  if (data.fileHash) {
    flow.y = sectionTitle(doc, ctx, L("reports.doc.officialFile"), flow.y);
    const items: KvItem[] = [{ label: "SHA-256", value: data.fileHash }];
    if (data.specVersion !== null) items.push({ label: L("reports.doc.specVersion"), value: `v${data.specVersion}` });
    drawKvCard(flow, items, 1);
    flow.y += 12;
  }
  drawNote(flow);
  drawQrBlock(flow);
}

function platformSummaryPage(flow: Flow, data: Extract<AnyReportData, { kind: "platform_summary" }>): void {
  const { doc, ctx } = flow;
  const L = (k: string) => tr(ctx.dict, k);
  const money = (c: number) => docMoney(c, ctx.lang);

  flow.y = drawDocTitle(
    doc,
    ctx,
    L("reports.doc.platformTitle"),
    `${L("reports.doc.companiesCount")}: ${data.companiesCount}`,
    flow.y
  );
  flow.y = sectionTitle(doc, ctx, L("reports.doc.companiesSection"), flow.y);
  drawTable(
    flow,
    [
      { flex: 3.2 },
      { flex: 1.4, align: "center" },
      { flex: 1.4, align: "center" },
      { flex: 2, align: "end" },
      { flex: 2.2, align: "end" },
    ],
    [
      L("reports.doc.company"),
      L("reports.doc.workersCount"),
      L("reports.doc.periodsCount"),
      L("reports.doc.net"),
      L("reports.doc.totalCost"),
    ],
    data.rows.map((r) => [
      r.legalName,
      String(r.workersCount),
      String(r.approvedPeriods),
      money(r.netCents),
      money(r.totalCostCents),
    ])
  );
  if (data.rows.length === 0) {
    flow.y += 10;
    drawNotice(flow, L("reports.doc.noRows"), "ok");
  }
  flow.y += 18;
  drawNote(flow);
  drawQrBlock(flow);
}

// ─── نقطة الدخول ───────────────────────────────────────────────────────────

export async function renderReportPdf(
  data: AnyReportData,
  language: ReportLanguage,
  options: ReportOptions,
  metaInput: Omit<PdfRenderMeta, "qrData">
): Promise<Uint8Array> {
  const meta: PdfRenderMeta = { ...metaInput, qrData: await qrDataUrl(metaInput.verifyUrl, 220) };
  const ctx: Ctx = {
    lang: language,
    dict: reportDict(language),
    rtl: isRtl(language),
    options,
    meta,
    branding: data.branding,
    logoMark: await markPng(),
  };
  docRtl = ctx.rtl;

  const Document = pdfkitDocument();
  const doc = new Document({
    size: "A4",
    margins: { top: 0, right: 0, bottom: 0, left: 0 },
    bufferPages: true,
    autoFirstPage: false, // نضيف الصفحة الأولى بأنفسنا (وإلّا سبقتنا صفحة فارغة)
    info: {
      Title: meta.refNumber,
      Author: meta.generatedBy,
      Creator: "HRMP",
      Subject: meta.verifyUrl,
    },
  });
  registerFonts(doc);

  const flow: Flow = { doc, ctx, y: TOP };
  doc.addPage({ size: "A4", margin: 0 });
  drawBrandBand(doc, ctx);

  switch (data.kind) {
    case "payslip":
      payslipPage(flow, data);
      break;
    case "payroll_summary":
      payrollSummaryPage(flow, data);
      break;
    case "attendance_statement":
    case "hours_statement":
      attendancePage(flow, data);
      break;
    case "declarations_summary":
      declarationsSummaryPage(flow, data);
      break;
    case "compliance_report":
      compliancePage(flow, data);
      break;
    case "platform_summary":
      platformSummaryPage(flow, data);
      break;
    default:
      throw new Error(`pdf_unknown_kind:${(data as { kind: string }).kind}`);
  }

  // التذييل على كل صفحة
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    drawFooter(doc, ctx, i + 1, range.count);
  }
  doc.flushPages();

  const chunks: Buffer[] = [];
  await new Promise<void>((resolve, reject) => {
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve());
    doc.on("error", (e: Error) => reject(e));
    doc.end();
  });
  return new Uint8Array(Buffer.concat(chunks));
}
