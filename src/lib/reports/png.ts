// HRMP — مولّد PNG للتقارير (SPEC §4.4.1: «لقطة بدقة مناسبة للهاتف — للقسيمة والملخصات القصيرة فقط»)
// المسار: SVG (نص direction:rtl مع text-anchor=start للحواف اليمنى) → sharp → PNG
// الخطوط من مجلد المشروع عبر FONTCONFIG_FILE (بلا خطوط نظام) — تشكيل العربية مثبت بصريًا
// يدعم الأنواع القصيرة فقط: payslip | platform_summary (البقية pdf/docx حصرًا)
import type { AnyReportData, ReportBranding, ReportLanguage, ReportOptions } from "./types";
import { ensureFontconfig } from "./fonts";
import { reportDict, tr, docMoney, docHours, monthLabel } from "./i18n";
import type { ReportDict } from "./i18n";
import { qrPngBuffer } from "./qr";
import { LINE_KIND_MAP } from "./line-kinds";
import { markPng } from "./logo";

export type PngRenderMeta = {
  refNumber: string;
  contentHash: string;
  verifyUrl: string;
  verifyUrls?: string[]; // بوابات التحقق العامة المطبوعة (pages.dev + vercel.app)
  generatedAt: string;
  generatedBy: string;
};

type Ctx = {
  lang: ReportLanguage;
  dict: ReportDict;
  rtl: boolean;
  options: ReportOptions;
  meta: PngRenderMeta;
  branding: ReportBranding; // هوية مالك المنصة (white-label — SPEC §3.2)
  logoMarkB64: string | null; // العلامة الذهبية الشفافة (data URI) — الشعار المعتمد 2026-10-21
};

/** تذييل الهوية — سطران مستققلان لتفادي مزج الأبجديات في عنصر واحد (درس المرحلة 7):
 * سطر اسم المالك (بخط أبجديّته) فوق سطر المرجع */
function brandFooter(ctx: Ctx, bottomY: number, refLine: string): string {
  const name = ctx.branding.displayName;
  const arabic = /[\u0600-\u06FF]/.test(name);
  return (
    `<text x="${W / 2}" y="${bottomY - 13}" text-anchor="middle" ${arabic ? 'direction="rtl" font-family="Noto Naskh Arabic"' : 'direction="ltr" font-family="Noto Sans"'} font-size="9" fill="${MUTED}">${esc(name)}</text>\n` +
    `<text x="${W / 2}" y="${bottomY}" text-anchor="middle" direction="ltr" font-family="Noto Sans" font-size="9" fill="${MUTED}">${esc(refLine)}</text>`
  );
}
const W = 860; // عرض أساس — density 144 يعطي دقة مشاركة جيدة بالهاتف
const LEFT_PAD = 50; // هامش الصفحة (يطابق LEFT المحلي في بنّاءي الصفحة)
const BRAND = "#0f2242"; // كحلي عميق — لون أرضية اللوغو
const GOLD = "#d4a437";
const INK = "#101722";
const MUTED = "#5a6478";
const LINE_C = "#e2e6ef";
const HEAD_BG = "#eef1f7";

/**
 * شريط التحقق السفلي — **مشترك بين بنّاءي PNG** (القسيمة وملخص المنصة):
 * QR + المرجع + البصمة + ترجمة التحقق + **رابطا التحقق العامّان**
 * (pages.dev + vercel.app) — بلاغ المالك 2026-10-23: «الوثيقة المصدرة يجب أن
 * تصدر برابطين». كان بنّاء ملخص المنصة يطبع QR + الفوتر بلا رابط إطلاقًا،
 * وبنّاء القسيمة يطبع رابطًا واحدًا — الآن مسار واحد يضمن الاثنين في كل وثيقة.
 * الهندسة (مقاس QR وموضعه) تختلف قليلًا بين البنّاءين فتُمرَّر من المتصل.
 */
function verificationFooter(
  ctx: Ctx,
  body: string[],
  qrB64: string,
  o: { height: number; qrSize: number; qrX: number; refText: string }
): void {
  const L = (k: string) => tr(ctx.dict, k);
  const { height, qrSize, qrX, refText } = o;
  const refX = ctx.rtl ? W - LEFT_PAD - 6 : LEFT_PAD + 6;
  // المعرّف والبصمة والروابط نصوص ltr بمحاذاة فيزيائية: في مستند rtl تنتهي عند
  // الحافة اليمنى (لا تُثبَّت هناك ثم تخرج)، وترجمة التحقق تتبع اتجاه المستند.
  const latinAnchor = ctx.rtl ? "end" : "start";
  body.push(
    `<image href="data:image/png;base64,${qrB64}" x="${qrX}" y="${height - (qrSize + 38)}" width="${qrSize}" height="${qrSize}"/>`
  );
  body.push(`<text x="${refX}" y="${height - 112}" text-anchor="${latinAnchor}" direction="ltr" font-family="Noto Sans" font-size="12" fill="${INK}">${esc(refText)}</text>`);
  body.push(`<text x="${refX}" y="${height - 96}" text-anchor="${latinAnchor}" direction="ltr" font-family="Noto Sans" font-size="10" fill="${MUTED}">${esc(ctx.meta.contentHash.slice(0, 24))}</text>`);
  body.push(`<text x="${refX}" y="${height - 80}" text-anchor="start" ${ctxDirection()} font-family="Noto Naskh Arabic" font-size="10" fill="${MUTED}">${esc(L("reports.doc.qrCaption"))}</text>`);
  // الرابطان سطران متتاليان نازلان (لا متراكبان): الأول على -64 والثاني على -50
  const links = (ctx.meta.verifyUrls?.length ? ctx.meta.verifyUrls : [ctx.meta.verifyUrl]).slice(0, 2);
  links.forEach((link, i) => {
    body.push(`<text x="${refX}" y="${height - 64 + i * 14}" text-anchor="${latinAnchor}" direction="ltr" font-family="Noto Sans" font-size="9" fill="${MUTED}">${esc(link.replace(/^https?:\/\//, ""))}</text>`);
  });
  body.push(brandFooter(ctx, height - 20, ctx.meta.refNumber));
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** سطر بمحاذاة **فيزيائية** داخل الصفحة (إصلاح قصّ الحواف — المسألة 4):
 * - "start" = النص ينبت من الإحداثي ويمتد يمينًا (عمود اليسار)
 * - "end"   = النص ينتهي عند الإحداثي ويمتد يسارًا (عمود اليمين)
 * - "middle" = الإحداثي مركز النص
 * المحاذاة تُترجم إلى `text-anchor` حسب اتجاه السطر، وإلا خرج النص من حافة الصفحة:
 * `text-anchor` في SVG محاذاة **نسبية للاتجاه** (في rtl يعني "start" الحافة اليمنى)،
 * فكانت الأسطر اللاتينية في مستند rtl تُثبَّت عند الحافة اليمنى ثم تمتد خارجها،
 * والعكس تمامًا لأعمدة اليسار في اللغتين (لقطات الحواف قبل الإصلاح).
 * خط السطر يتبع لغة المستند: عربي → Naskh + rtl، وإلا Noto Sans + ltr (docFontFamily). */
function line(x: number, y: number, text: string, o?: { size?: number; bold?: boolean; color?: string; align?: "start" | "middle" | "end" }): string {
  const rtl = currentRtl;
  const font = rtl ? "Noto Naskh Arabic" : "Noto Sans";
  const dirAttr = rtl ? 'direction="rtl"' : 'direction="ltr"';
  const align = o?.align ?? "start";
  let anchorAttr: string;
  if (align === "middle") anchorAttr = "middle";
  else if (align === "start") anchorAttr = rtl ? "end" : "start"; // ينبت من x ويمتد يمينًا
  else anchorAttr = rtl ? "start" : "end"; // ينتهي عند x ويمتد يسارًا
  return `<text x="${x}" y="${y}" text-anchor="${anchorAttr}" ${dirAttr} font-family="${font}" font-size="${o?.size ?? 15}" ${o?.bold ? 'font-weight="700"' : ""} fill="${o?.color ?? INK}">${esc(text)}</text>`;
}

let currentRtl = true;
function ctxDirection(): string {
  return currentRtl ? 'direction="rtl"' : 'direction="ltr"';
}

function lineKindLabel(dict: ReportDict, kind: string): string {
  const key = LINE_KIND_MAP[kind] ?? "payroll.lineUnknown";
  const val = tr(dict, key);
  return val === key ? kind : val;
}

function dictOr(dict: ReportDict, key: string, fallback: string): string {
  const val = tr(dict, key);
  return val === key ? fallback : val;
}

// ─── بطاقة القسيمة ───────────────────────────────────────────

function payslipSvg(ctx: Ctx, data: Extract<AnyReportData, { kind: "payslip" }>, qrB64: string): string {
  const L = (k: string) => tr(ctx.dict, k);
  const money = (c: number) => docMoney(c, ctx.lang);
  const showEmployer = ctx.options.includeEmployerShare === true;
  const [y, m] = data.periodLabel.split("-");
  const periodLabel = monthLabel(ctx.dict, Number(y), Number(m));
  const lines = data.lines.filter((l) => showEmployer || !l.kind.startsWith("employer_"));

  const RIGHT = W - 50;
  const LEFT = 50;
  let cursor = 0;
  const body: string[] = [];

  // رأس
  body.push(`<rect x="0" y="0" width="${W}" height="92" fill="${BRAND}"/>`);
  body.push(`<rect x="0" y="92" width="${W}" height="3" fill="${GOLD}"/>`);
  const logoSize = 46;
  const logoX = ctx.rtl ? W - 50 - logoSize : 50;
  body.push(logoSvg(logoX, (92 - logoSize) / 2, logoSize, GOLD, "#ffffff", ctx.logoMarkB64));
  const titleX = ctx.rtl ? logoX - 14 : logoX + logoSize + 14;
  body.push(
    `<text x="${titleX}" y="42" text-anchor="start" ${ctxDirection()} font-family="Noto Naskh Arabic" font-size="24" font-weight="700" fill="#ffffff">${esc(L("reports.doc.payslipTitle"))}</text>`
  );
  body.push(
    `<text x="${titleX}" y="70" text-anchor="start" ${ctxDirection()} font-family="Noto Naskh Arabic" font-size="13" fill="#c7d3e8">${esc(data.company.tradeName || data.company.legalName)}</text>`
  );

  cursor = 124;
  // العامل والفترة
  body.push(line(RIGHT, cursor, `${L("reports.doc.worker")}: ${data.worker.fullName}`, { size: 16, bold: true, align: "end" }));
  body.push(line(LEFT, cursor, `${L("reports.doc.period")}: ${periodLabel}`, { size: 13, color: MUTED, align: "start" }));
  cursor += 24;
  const metaBits = [data.worker.cin ? `${L("reports.doc.cin")}: ${data.worker.cin}` : null, data.worker.cnssNumber ? `CNSS: ${data.worker.cnssNumber}` : null].filter(Boolean);
  if (metaBits.length > 0) body.push(line(RIGHT, cursor, metaBits.join("  •  "), { size: 12, color: MUTED, align: "end" }));
  if (metaBits.length > 0) cursor += 20;

  // الساعات
  cursor += 8;
  body.push(line(RIGHT, cursor, `${L("reports.doc.workedMinutes")}: ${docHours(data.totals.workedMinutes)}`, { size: 14, align: "end" }));
  body.push(line(LEFT, cursor, `${L("reports.doc.workedDays")}: ${data.totals.workedDays}`, { size: 14, color: MUTED, align: "start" }));
  if (data.totals.overtimeMinutes > 0) {
    cursor += 22;
    body.push(line(RIGHT, cursor, `${L("reports.doc.overtimeMinutes")}: ${docHours(data.totals.overtimeMinutes)}`, { size: 14, align: "end" }));
  }

  // جدول البنود
  cursor += 26;
  const rowH = 30;
  const tableTop = cursor;
  body.push(`<rect x="${LEFT}" y="${tableTop}" width="${W - 100}" height="${rowH}" fill="${HEAD_BG}"/>`);
  const colItem = ctx.rtl ? W - 60 : LEFT + 10; // عمود البند: يمين في rtl
  const colAmountX = ctx.rtl ? LEFT + 10 : W - 60;
  const headAnchorItem = ctx.rtl ? "start" : "start";
  body.push(`<text x="${colItem}" y="${tableTop + 20}" text-anchor="${headAnchorItem}" ${ctxDirection()} font-family="Noto Naskh Arabic" font-size="13" font-weight="700" fill="${BRAND}">${esc(L("reports.doc.colItem"))}</text>`);
  body.push(`<text x="${colAmountX}" y="${tableTop + 20}" text-anchor="${ctx.rtl ? "start" : "end"}" direction="ltr" font-family="Noto Sans" font-size="13" font-weight="700" fill="${BRAND}">${esc(L("reports.doc.colAmount"))}</text>`);
  cursor += rowH;

  const maxLines = 12;
  for (const l of lines.slice(0, maxLines)) {
    body.push(`<line x1="${LEFT}" y1="${cursor}" x2="${W - LEFT}" y2="${cursor}" stroke="${LINE_C}" stroke-width="1"/>`);
    body.push(`<text x="${colItem}" y="${cursor + 20}" text-anchor="start" ${ctxDirection()} font-family="Noto Naskh Arabic" font-size="13" fill="${INK}">${esc(l.label || lineKindLabel(ctx.dict, l.kind))}</text>`);
    body.push(`<text x="${colAmountX}" y="${cursor + 20}" text-anchor="${ctx.rtl ? "start" : "end"}" direction="ltr" font-family="Noto Sans" font-size="13" fill="${l.amountCents < 0 ? "#b91c1c" : INK}">${esc(money(l.amountCents))}</text>`);
    cursor += rowH;
  }
  if (lines.length > maxLines) {
    body.push(`<text x="${colItem}" y="${cursor + 20}" text-anchor="start" ${ctxDirection()} font-family="Noto Naskh Arabic" font-size="12" fill="${MUTED}">${esc(L("reports.doc.moreLines").replace("{n}", String(lines.length - maxLines)))}</text>`);
    cursor += rowH;
  }

  // الإجماليات
  cursor += 12;
  const totals: [string, string][] = [
    [L("reports.doc.gross"), money(data.totals.grossCents)],
    [L("reports.doc.cnss"), money(-data.totals.cnssEmployeeCents)],
    [L("reports.doc.amo"), money(-data.totals.amoEmployeeCents)],
    [L("reports.doc.ir"), money(-data.totals.irNetCents)],
  ];
  if (showEmployer) totals.push([L("reports.doc.totalCost"), money(data.totals.totalCostCents)]);
  for (const [label, value] of totals) {
    body.push(`<text x="${colItem}" y="${cursor}" text-anchor="start" ${ctxDirection()} font-family="Noto Naskh Arabic" font-size="13" fill="${MUTED}">${esc(label)}</text>`);
    body.push(`<text x="${colAmountX}" y="${cursor}" text-anchor="${ctx.rtl ? "start" : "end"}" direction="ltr" font-family="Noto Sans" font-size="13" fill="${INK}">${esc(value)}</text>`);
    cursor += 24;
  }

  // الصافي
  cursor += 6;
  body.push(`<rect x="${LEFT}" y="${cursor}" width="${W - 100}" height="52" fill="${BRAND}"/>`);
  body.push(`<text x="${colItem}" y="${cursor + 33}" text-anchor="start" ${ctxDirection()} font-family="Noto Naskh Arabic" font-size="18" font-weight="700" fill="#ffffff">${esc(L("reports.doc.net"))}</text>`);
  body.push(`<text x="${colAmountX}" y="${cursor + 33}" text-anchor="${ctx.rtl ? "start" : "end"}" direction="ltr" font-family="Noto Sans" font-size="20" font-weight="700" fill="#ffffff">${esc(money(data.totals.netCents))}</text>`);
  cursor += 78;

  // الملاحظة الإدارية (إن وُجدت)
  cursor = noteSvg(ctx, body, cursor);

  const height = Math.max(cursor + 200, 660);
  verificationFooter(ctx, body, qrB64, {
    height,
    qrSize: 92,
    qrX: ctx.rtl ? LEFT + 6 : W - LEFT - 96,
    refText: data.refNumber,
  });

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${height}" viewBox="0 0 ${W} ${height}">
  <rect width="${W}" height="${height}" fill="#ffffff"/>
  ${body.join("\n")}
</svg>`;
}

/** مسار نجمة الزليج الثمانية في فضاء 64×64 (نفس public/logo.svg) */
const LOGO_STAR_PATH =
  "M32 2.5 38.21 17.01 52.86 11.14 46.99 25.79 61.5 32 46.99 38.21 52.86 52.86 38.21 46.99 32 61.5 25.79 46.99 11.14 52.86 17.01 38.21 2.5 32 17.01 25.79 11.14 11.14 25.79 17.01Z";
/** مسار الدبوس المفرّغ في فضاء 64×64 */
const LOGO_PIN_PATH = "M32 48.23C30.3 43.73 22.4 33.2 22.4 26.5A9.6 9.6 0 1 1 41.6 26.5C41.6 33.2 33.7 43.73 32 48.23Z";

/** الشعار في SVG: العلامة الذهبية المعتمدة (صورة PNG شفافة مضمّنة) فوق الشريط الكحلي.
 *  الاحتياطي المتجهي (نجمة زليج + دبوس) يُرسم فقط إن تعذّر تحميل الصورة. */
function logoSvg(x: number, y: number, size: number, star: string, pin: string, markB64?: string | null): string {
  if (markB64) {
    return (
      `<image x="${x}" y="${y}" width="${size}" height="${size}" ` +
      `preserveAspectRatio="xMidYMid meet" href="data:image/png;base64,${markB64}"/>`
    );
  }
  const s = size / 64;
  return (
    `<g transform="translate(${x} ${y}) scale(${s})">` +
    `<path fill="${star}" d="${LOGO_STAR_PATH}"/>` +
    `<path fill="${pin}" d="${LOGO_PIN_PATH}"/>` +
    `<circle cx="32" cy="26.5" r="3.9" fill="${star}"/>` +
    `</g>`
  );
}

/** كتلة الملاحظة الإدارية في SVG (بطاقتا القسيمة وملخص المنصة) */
function noteSvg(ctx: Ctx, body: string[], cursor: number): number {
  const note = ctx.options.note;
  if (!note) return cursor;
  const L = (k: string) => tr(ctx.dict, k);
  const LEFT = 50;
  const lines: string[] = [];
  // لفّ بسيط: كل 78 محرفًا سطرًا (عرض البطاقة 860 ⇒ خط 12)
  const words = note.split(/\s+/);
  let current = "";
  for (const w of words) {
    const candidate = current ? `${current} ${w}` : w;
    if (candidate.length > 78 && current) {
      lines.push(current);
      current = w;
    } else current = candidate;
  }
  if (current) lines.push(current);
  const shown = lines.slice(0, 4);
  const boxH = shown.length * 20 + 34;
  body.push(`<rect x="${LEFT}" y="${cursor}" width="${W - 100}" height="${boxH}" fill="#f7f2e6"/>`);
  body.push(`<rect x="${ctx.rtl ? W - LEFT - 3 : LEFT}" y="${cursor}" width="3" height="${boxH}" fill="${GOLD}"/>`);
  // ⚠️ المرتكز في SVG **منطقي**: «start» = بداية السطر (الحافة اليمنى في rtl).
  // استعمال «end» في rtl يجعل النص ينطلق خارج البطاقة (يتجاوز حافتها) — عيب صُوّر.
  const noteX = ctx.rtl ? W - LEFT - 12 : LEFT + 12;
  body.push(
    `<text x="${noteX}" y="${cursor + 20}" text-anchor="start" ${ctxDirection()} font-family="Noto Naskh Arabic" font-size="11" font-weight="700" fill="#8a6a1f">${esc(L("reports.noteLabel"))}</text>`
  );
  shown.forEach((ln, i) => {
    body.push(
      `<text x="${noteX}" y="${cursor + 38 + i * 20}" text-anchor="start" ${ctxDirection()} font-family="Noto Naskh Arabic" font-size="12" fill="${INK}">${esc(ln)}</text>`
    );
  });
  return cursor + boxH + 12;
}

// ─── بطاقة ملخص المنصة ────────────────────────────────────────

function platformSvg(ctx: Ctx, data: Extract<AnyReportData, { kind: "platform_summary" }>, qrB64: string): string {
  const L = (k: string) => tr(ctx.dict, k);
  const money = (c: number) => docMoney(c, ctx.lang);

  const RIGHT = W - 50;
  const LEFT = 50;
  const body: string[] = [];

  body.push(`<rect x="0" y="0" width="${W}" height="92" fill="${BRAND}"/>`);
  body.push(`<rect x="0" y="92" width="${W}" height="3" fill="${GOLD}"/>`);
  const logoSize = 46;
  const logoX = ctx.rtl ? W - 50 - logoSize : 50;
  body.push(logoSvg(logoX, (92 - logoSize) / 2, logoSize, GOLD, "#ffffff", ctx.logoMarkB64));
  const titleX = ctx.rtl ? logoX - 14 : logoX + logoSize + 14;
  body.push(
    `<text x="${titleX}" y="42" text-anchor="start" ${ctxDirection()} font-family="Noto Naskh Arabic" font-size="24" font-weight="700" fill="#ffffff">${esc(L("reports.doc.platformTitle"))}</text>`
  );
  body.push(
    `<text x="${titleX}" y="70" text-anchor="start" ${ctxDirection()} font-family="Noto Naskh Arabic" font-size="13" fill="#c7d3e8">${esc(`${L("reports.doc.companiesCount")}: ${data.companiesCount}`)}</text>`
  );

  let cursor = 130;
  const rowH = 34;
  const colName = ctx.rtl ? W - 60 : LEFT + 10;
  const colNet = ctx.rtl ? LEFT + 10 : W - 60;

  body.push(`<rect x="${LEFT}" y="${cursor - 22}" width="${W - 100}" height="${rowH}" fill="${HEAD_BG}"/>`);
  body.push(`<text x="${colName}" y="${cursor}" text-anchor="start" ${ctxDirection()} font-family="Noto Naskh Arabic" font-size="13" font-weight="700" fill="${BRAND}">${esc(L("reports.doc.company"))}</text>`);
  body.push(`<text x="${colNet}" y="${cursor}" text-anchor="${ctx.rtl ? "start" : "end"}" direction="ltr" font-family="Noto Sans" font-size="13" font-weight="700" fill="${BRAND}">${esc(L("reports.doc.net"))}</text>`);
  cursor += rowH;

  for (const r of data.rows.slice(0, 8)) {
    body.push(`<line x1="${LEFT}" y1="${cursor - 24}" x2="${W - LEFT}" y2="${cursor - 24}" stroke="${LINE_C}" stroke-width="1"/>`);
    body.push(`<text x="${colName}" y="${cursor}" text-anchor="start" ${ctxDirection()} font-family="Noto Naskh Arabic" font-size="13" fill="${INK}">${esc(r.legalName)}</text>`);
    body.push(`<text x="${colNet}" y="${cursor}" text-anchor="${ctx.rtl ? "start" : "end"}" direction="ltr" font-family="Noto Sans" font-size="13" fill="${INK}">${esc(money(r.netCents))}</text>`);
    cursor += rowH;
  }

  // الملاحظة الإدارية (إن وُجدت)
  cursor = noteSvg(ctx, body, cursor);

  const height = Math.max(cursor + 150, 520);
  verificationFooter(ctx, body, qrB64, {
    height,
    qrSize: 80,
    qrX: ctx.rtl ? LEFT + 6 : W - LEFT - 80,
    refText: ctx.meta.refNumber,
  });

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${height}" viewBox="0 0 ${W} ${height}">
  <rect width="${W}" height="${height}" fill="#ffffff"/>
  ${body.join("\n")}
</svg>`;
}

// ─── نقطة الدخول ─────────────────────────────────────────────

export async function renderReportPng(
  data: AnyReportData,
  language: ReportLanguage,
  options: ReportOptions,
  meta: PngRenderMeta
): Promise<Uint8Array> {
  if (data.kind !== "payslip" && data.kind !== "platform_summary") {
    throw new Error(`png_not_supported:${data.kind}`);
  }
  const ok = await ensureFontconfig();
  if (!ok) throw new Error("png_fontconfig_unavailable");
  const { default: sharp } = await import("sharp");

  currentRtl = language === "ar";
  const markBuf = await markPng();
  const ctx: Ctx = {
    lang: language,
    dict: reportDict(language),
    rtl: currentRtl,
    options,
    meta,
    branding: data.branding,
    logoMarkB64: markBuf ? markBuf.toString("base64") : null,
  };
  const qrBuf = await qrPngBuffer(meta.verifyUrl, 240);
  const qrB64 = qrBuf.toString("base64");

  const svg =
    data.kind === "payslip"
      ? payslipSvg(ctx, data as Extract<AnyReportData, { kind: "payslip" }>, qrB64)
      : platformSvg(ctx, data as Extract<AnyReportData, { kind: "platform_summary" }>, qrB64);

  const png = await sharp(Buffer.from(svg), { density: 144 }).png().toBuffer();
  return new Uint8Array(png);
}
