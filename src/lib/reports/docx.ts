// FWMS — مولّد DOCX للتقارير (SPEC §4.4.1: قابل للتحرير مع RTL حقيقي bidi)
// إستراتيجية العرض (مثبتة بصريًا): bidi قسم + فقرات bidirectional + runs rightToLeft
// + عكس ترتيب أعمدة الجداول يدويًا (bidiVisual غير موثوق عبر العارضات) + خط مضمّن بالملف
import {
  AlignmentType,
  BorderStyle,
  CharacterSet,
  Document,
  Footer,
  HeadingLevel,
  ImageRun,
  Packer,
  PageNumber,
  PageOrientation,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import type { AnyReportData, ReportBranding, ReportLanguage, ReportOptions } from "./types";
import { readFont, FONT_FILES } from "./fonts";
import { reportDict, tr, docMoney, docHours, monthLabel, isRtl } from "./i18n";
import type { ReportDict } from "./i18n";
import { qrPngBuffer } from "./qr";
import { LINE_KIND_MAP } from "./line-kinds";
import { logoPng } from "./logo";

export type DocxRenderMeta = {
  refNumber: string;
  contentHash: string;
  verifyUrl: string;
  generatedAt: string;
  generatedBy: string;
};

type Ctx = {
  lang: ReportLanguage;
  dict: ReportDict;
  rtl: boolean;
  options: ReportOptions;
  meta: DocxRenderMeta;
  branding: ReportBranding; // هوية مالك المنصة (white-label — SPEC §3.2)
  logo: Buffer | null; // شعار المنصة PNG (ترويسة الوثيقة) — null إن تعذّر التحويل
};

// لوحة هوية المنصة (globals.css — oklch محوَّل إلى hex): أخضر مغربي عميق + ذهب
const INK = "101911";
const MUTED = "5C675D";
const LINE_C = "E4E6E1";
const BRAND = "0C5C3C";
const GOLD = "E1A035";
const BRAND_SOFT = "ECF4EE";

// ─── أدوات ────────────────────────────────────────────────────

function makeCtx(
  language: ReportLanguage,
  options: ReportOptions,
  meta: DocxRenderMeta,
  branding: ReportBranding,
  logo: Buffer | null
): Ctx {
  return { lang: language, dict: reportDict(language), rtl: isRtl(language), options, meta, branding, logo };
}

/** فقرة نصية بالاتجاه الصحيح — الأرقام والعزوف اللاتيني run منفصل LTR */
function p(ctx: Ctx, text: string, o?: { bold?: boolean; size?: number; color?: string; align?: (typeof AlignmentType)[keyof typeof AlignmentType]; latin?: boolean }): Paragraph {
  const runs = o?.latin
    ? [new TextRun({ text, bold: o?.bold, size: (o?.size ?? 11) * 2, color: o?.color ?? INK, font: "Noto Sans" })]
    : [new TextRun({
        text,
        bold: o?.bold,
        size: (o?.size ?? 11) * 2,
        color: o?.color ?? INK,
        rightToLeft: ctx.rtl,
        font: ctx.rtl ? "Noto Naskh Arabic" : "Noto Sans",
      })];
  return new Paragraph({
    bidirectional: ctx.rtl,
    alignment: o?.align ?? AlignmentType.START,
    children: runs,
  });
}

function kvRow(ctx: Ctx, label: string, value: string, opts?: { bold?: boolean; latinValue?: boolean }): Paragraph {
  // سطر «تسمية: قيمة» — الأرقام/المراجع اللاتينية داخل run LTR مضمن
  const valueRuns = opts?.latinValue
    ? [
        new TextRun({ text: " " }),
        new TextRun({ text: value, bold: opts?.bold, size: 22, font: "Noto Sans", color: INK }),
      ]
    : [new TextRun({ text: ` ${value}`, bold: opts?.bold, size: 22, rightToLeft: ctx.rtl, font: ctx.rtl ? "Noto Naskh Arabic" : "Noto Sans", color: INK })];
  return new Paragraph({
    bidirectional: ctx.rtl,
    alignment: AlignmentType.START,
    spacing: { after: 60 },
    children: [
      new TextRun({ text: `${label}:`, bold: opts?.bold, size: 22, color: MUTED, rightToLeft: ctx.rtl, font: ctx.rtl ? "Noto Naskh Arabic" : "Noto Sans" }),
      ...valueRuns,
    ],
  });
}

function sectionTitle(ctx: Ctx, text: string): Paragraph {
  return new Paragraph({
    bidirectional: ctx.rtl,
    spacing: { before: 160, after: 80 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: GOLD, space: 4 } },
    children: [new TextRun({ text, bold: true, size: 24, color: BRAND, rightToLeft: ctx.rtl, font: ctx.rtl ? "Noto Naskh Arabic" : "Noto Sans" })],
  });
}

const CELL_BORDERS = {
  top: { style: BorderStyle.SINGLE, size: 1, color: LINE_C },
  bottom: { style: BorderStyle.SINGLE, size: 1, color: LINE_C },
  left: { style: BorderStyle.SINGLE, size: 1, color: LINE_C },
  right: { style: BorderStyle.SINGLE, size: 1, color: LINE_C },
};

type Col = { text: string; widthPct: number; head?: boolean; bold?: boolean; latin?: boolean; align?: "start" | "end" | "center" };

/** جدول بالاتجاه الصحيح — في RTL تُعكس الأعمدة يدويًا (البند أول منطقيًا = يمينًا بصريًا) */
function table(ctx: Ctx, header: Col[], rows: Col[][]): Table {
  const ordered = (cols: Col[]): Col[] => (ctx.rtl ? [...cols].reverse() : cols);
  const alignOf = (a: Col["align"]) =>
    a === "end" ? (ctx.rtl ? AlignmentType.LEFT : AlignmentType.RIGHT) : a === "center" ? AlignmentType.CENTER : ctx.rtl ? AlignmentType.RIGHT : AlignmentType.LEFT;

  const mkRow = (cols: Col[], head: boolean) =>
    new TableRow({
      tableHeader: head,
      children: ordered(cols).map(
        (c) =>
          new TableCell({
            width: { size: c.widthPct, type: WidthType.PERCENTAGE },
            shading: head ? { fill: BRAND_SOFT } : undefined,
            children: [
              new Paragraph({
                bidirectional: ctx.rtl && !c.latin,
                alignment: alignOf(c.align),
                children: [
                  new TextRun({
                    text: c.text,
                    bold: head || c.bold,
                    size: c.head || head ? 18 : 19,
                    color: head ? BRAND : c.bold ? INK : MUTED,
                    rightToLeft: ctx.rtl && !c.latin,
                    font: c.latin || !ctx.rtl ? "Noto Sans" : "Noto Naskh Arabic",
                  }),
                ],
              }),
            ],
          })
      ),
    });

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: { ...CELL_BORDERS, insideHorizontal: CELL_BORDERS.top, insideVertical: CELL_BORDERS.left },
    rows: [mkRow(header, true), ...rows.map((r) => mkRow(r, false))],
  });
}

function lineKindLabel(ctx: Ctx, kind: string): string {
  const key = LINE_KIND_MAP[kind] ?? "payroll.lineUnknown";
  const val = tr(ctx.dict, key);
  return val === key ? kind : val;
}

function dictOr(ctx: Ctx, key: string, fallback: string): string {
  const val = tr(ctx.dict, key);
  return val === key ? fallback : val;
}

function payTypeLabelKey(payType: string): string {
  if (payType === "hourly") return "payroll.payTypeHourly";
  if (payType === "daily") return "payroll.payTypeDaily";
  if (payType === "monthly") return "payroll.payTypeMonthly";
  return "";
}

// ─── ترويسة/تذييل/QR ─────────────────────────────────────────

function headerBlock(
  ctx: Ctx,
  company: { legalName: string; tradeName: string | null; taxId: string | null; cnssNumber: string | null },
  title: string,
  metaLine: string,
  logo: Buffer | null
): Paragraph[] {
  const L = (k: string) => tr(ctx.dict, k);
  const ids: string[] = [];
  if (company.taxId) ids.push(`${L("reports.doc.ice")}: ${company.taxId}`);
  if (company.cnssNumber) ids.push(`${L("reports.doc.cnssAff")}: ${company.cnssNumber}`);
  const brandRuns = [
    ...(logo ? [new ImageRun({ type: "png", data: logo, transformation: { width: 44, height: 44 } })] : []),
    new TextRun({ text: company.tradeName || company.legalName, bold: true, size: 30, color: BRAND, rightToLeft: ctx.rtl, font: ctx.rtl ? "Noto Naskh Arabic" : "Noto Sans" }),
  ];
  return [
    new Paragraph({
      bidirectional: ctx.rtl,
      alignment: AlignmentType.START,
      spacing: { after: 40 },
      children: brandRuns,
    }),
    new Paragraph({
      bidirectional: ctx.rtl,
      alignment: AlignmentType.START,
      spacing: { after: 120 },
      children: [new TextRun({ text: [company.legalName, ...ids].join("  •  "), size: 17, color: MUTED, rightToLeft: ctx.rtl, font: ctx.rtl ? "Noto Naskh Arabic" : "Noto Sans" })],
    }),
    new Paragraph({
      bidirectional: ctx.rtl,
      alignment: AlignmentType.START,
      heading: HeadingLevel.HEADING_1,
      spacing: { after: 60 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: GOLD, space: 6 } },
      children: [new TextRun({ text: title, bold: true, size: 34, color: INK, rightToLeft: ctx.rtl, font: ctx.rtl ? "Noto Naskh Arabic" : "Noto Sans" })],
    }),
    new Paragraph({
      bidirectional: ctx.rtl,
      alignment: AlignmentType.START,
      spacing: { after: 160 },
      children: [new TextRun({ text: metaLine, size: 18, color: MUTED, rightToLeft: ctx.rtl, font: ctx.rtl ? "Noto Naskh Arabic" : "Noto Sans" })],
    }),
  ];
}

function pageFooter(ctx: Ctx): Footer {
  const L = (k: string) => tr(ctx.dict, k);
  // تذييل مخصص للمالك (white-label — SPEC §3.2): footerText أو الاسم القانوني
  const brand = ctx.branding.footerText ?? ctx.branding.legalName;
  const brandArabic = /[\u0600-\u06FF]/.test(brand);
  return new Footer({
    children: [
      new Paragraph({
        bidirectional: ctx.rtl,
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({ text: `${ctx.meta.refNumber}  •  `, size: 15, color: MUTED, font: "Noto Sans" }),
          new TextRun({ text: L("reports.doc.page"), size: 15, color: MUTED, rightToLeft: ctx.rtl, font: ctx.rtl ? "Noto Naskh Arabic" : "Noto Sans" }),
          new TextRun({ children: [PageNumber.CURRENT], size: 15, color: MUTED, font: "Noto Sans" }),
          new TextRun({ text: ` ${L("reports.doc.of")} `, size: 15, color: MUTED, rightToLeft: ctx.rtl, font: ctx.rtl ? "Noto Naskh Arabic" : "Noto Sans" }),
          new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 15, color: MUTED, font: "Noto Sans" }),
          new TextRun({ text: `  •  ${L("reports.doc.footerOfficial")} — `, size: 15, color: MUTED, rightToLeft: ctx.rtl, font: ctx.rtl ? "Noto Naskh Arabic" : "Noto Sans" }),
          new TextRun({
            text: brand,
            size: 15,
            color: MUTED,
            rightToLeft: ctx.rtl && brandArabic,
            font: brandArabic ? "Noto Naskh Arabic" : "Noto Sans",
          }),
        ],
      }),
    ],
  });
}

/** الملاحظة الإدارية (تُطبع في المستند) */
function noteBlock(ctx: Ctx): Paragraph[] {
  const note = ctx.options.note;
  if (!note) return [];
  const L = (k: string) => tr(ctx.dict, k);
  return [
    new Paragraph({
      bidirectional: ctx.rtl,
      spacing: { before: 200, after: 40 },
      children: [new TextRun({ text: L("reports.noteLabel"), bold: true, size: 16, color: "8A6A1F", rightToLeft: ctx.rtl, font: ctx.rtl ? "Noto Naskh Arabic" : "Noto Sans" })],
    }),
    new Paragraph({
      bidirectional: ctx.rtl,
      alignment: AlignmentType.START,
      spacing: { after: 120 },
      children: [new TextRun({ text: note, size: 19, color: INK, rightToLeft: ctx.rtl, font: ctx.rtl ? "Noto Naskh Arabic" : "Noto Sans" })],
    }),
  ];
}

function qrBlock(ctx: Ctx, qrPng: Buffer): Paragraph[] {
  const L = (k: string) => tr(ctx.dict, k);
  return [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 240 },
      children: [new ImageRun({ type: "png", data: qrPng, transformation: { width: 110, height: 110 } })],
    }),
    new Paragraph({
      bidirectional: ctx.rtl,
      alignment: AlignmentType.CENTER,
      spacing: { after: 40 },
      children: [new TextRun({ text: L("reports.doc.qrCaption"), bold: true, size: 17, color: INK, rightToLeft: ctx.rtl, font: ctx.rtl ? "Noto Naskh Arabic" : "Noto Sans" })],
    }),
    new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: ctx.meta.contentHash.slice(0, 32), size: 13, color: MUTED, font: "Noto Sans" })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: ctx.meta.verifyUrl.replace(/^https?:\/\//, ""), size: 13, color: MUTED, font: "Noto Sans" })] }),
  ];
}

// ─── صفحات الأنواع ───────────────────────────────────────────

function payslipChildren(ctx: Ctx, data: Extract<AnyReportData, { kind: "payslip" }>, qrPng: Buffer): (Paragraph | Table)[] {
  const L = (k: string) => tr(ctx.dict, k);
  const money = (c: number) => docMoney(c, ctx.lang);
  const showEmployer = ctx.options.includeEmployerShare === true;
  const [y, m] = data.periodLabel.split("-");
  const periodLabel = monthLabel(ctx.dict, Number(y), Number(m));
  const lines = data.lines.filter((l) => showEmployer || !l.kind.startsWith("employer_"));

  const out: (Paragraph | Table)[] = [
    ...headerBlock(ctx, data.company, L("reports.doc.payslipTitle"), `${L("reports.doc.period")}: ${periodLabel}`, ctx.logo),

    sectionTitle(ctx, L("reports.doc.workerSection")),
    kvRow(ctx, L("reports.doc.worker"), data.worker.fullName, { bold: true }),
    ...(data.worker.cin ? [kvRow(ctx, L("reports.doc.cin"), data.worker.cin, { latinValue: true })] : []),
    ...(data.worker.cnssNumber ? [kvRow(ctx, L("reports.doc.cnssNumber"), data.worker.cnssNumber, { latinValue: true })] : []),
    kvRow(ctx, L("reports.doc.payType"), dictOr(ctx, payTypeLabelKey(data.worker.payType), data.worker.payType)),
    kvRow(ctx, L("reports.doc.dependents"), String(data.worker.dependentsCount)),

    sectionTitle(ctx, L("reports.doc.hoursSection")),
    kvRow(ctx, L("reports.doc.workedMinutes"), docHours(data.totals.workedMinutes), { latinValue: true }),
    ...(data.totals.overtimeMinutes > 0
      ? [kvRow(ctx, L("reports.doc.overtimeMinutes"), docHours(data.totals.overtimeMinutes), { latinValue: true })]
      : []),
    kvRow(ctx, L("reports.doc.workedDays"), String(data.totals.workedDays), { latinValue: true }),
    ...(data.totals.breakMinutes > 0
      ? [kvRow(ctx, L("reports.doc.breakMinutes"), docHours(data.totals.breakMinutes), { latinValue: true })]
      : []),

    sectionTitle(ctx, L("reports.doc.linesSection")),
    table(
      ctx,
      [
        { text: L("reports.doc.colItem"), widthPct: 40, head: true },
        { text: L("reports.doc.colHours"), widthPct: 14, head: true, latin: true, align: "center" },
        { text: L("reports.doc.colRate"), widthPct: 14, head: true, latin: true, align: "center" },
        { text: L("reports.doc.colAmount"), widthPct: 22, head: true, latin: true, align: "end" },
      ],
      lines.map((l) => [
        { text: l.label || lineKindLabel(ctx, l.kind), widthPct: 40 },
        { text: l.minutes !== null ? docHours(l.minutes) : "—", widthPct: 14, latin: true, align: "center" },
        { text: l.rateBp !== null ? `${(l.rateBp / 10000).toFixed(2)}%` : "—", widthPct: 14, latin: true, align: "center" },
        { text: money(l.amountCents), widthPct: 22, latin: true, align: "end", bold: l.amountCents < 0 },
      ])
    ),

    sectionTitle(ctx, L("reports.doc.totalsSection")),
    kvRow(ctx, L("reports.doc.gross"), money(data.totals.grossCents), { bold: true, latinValue: true }),
    kvRow(ctx, L("reports.doc.cnss"), money(-data.totals.cnssEmployeeCents), { latinValue: true }),
    kvRow(ctx, L("reports.doc.amo"), money(-data.totals.amoEmployeeCents), { latinValue: true }),
    kvRow(ctx, L("reports.doc.ir"), money(-data.totals.irNetCents), { latinValue: true }),
    ...(showEmployer
      ? [
          kvRow(ctx, L("reports.doc.employerCost"), money(data.totals.employerCostCents), { latinValue: true }),
          kvRow(ctx, L("reports.doc.totalCost"), money(data.totals.totalCostCents), { bold: true, latinValue: true }),
        ]
      : [p(ctx, L("reports.doc.employerShareNote"), { size: 8, color: MUTED })]),

    ...(data.smigBreached ? [p(ctx, L("reports.doc.smigWarning"), { bold: true, color: "92400E" })] : []),

    kvRow(ctx, L("reports.doc.net"), money(data.totals.netCents), { bold: true, latinValue: true }),
    ...noteBlock(ctx),
    ...qrBlock(ctx, qrPng),
  ];
  return out;
}

function payrollSummaryChildren(ctx: Ctx, data: Extract<AnyReportData, { kind: "payroll_summary" }>, qrPng: Buffer): (Paragraph | Table)[] {
  const L = (k: string) => tr(ctx.dict, k);
  const money = (c: number) => docMoney(c, ctx.lang);
  const [y, m] = data.periodLabel.split("-");
  const periodLabel = monthLabel(ctx.dict, Number(y), Number(m));

  return [
    ...headerBlock(ctx, data.company, L("reports.doc.summaryTitle"), `${L("reports.doc.period")}: ${periodLabel}  •  ${L("reports.doc.workersCount")}: ${data.workersCount}`, ctx.logo),

    sectionTitle(ctx, L("reports.doc.totalsSection")),
    kvRow(ctx, L("reports.doc.workersCount"), String(data.workersCount), { latinValue: true }),
    kvRow(ctx, L("reports.doc.workedMinutes"), docHours(data.totals.workedMinutes), { latinValue: true }),
    kvRow(ctx, L("reports.doc.gross"), money(data.totals.grossCents), { bold: true, latinValue: true }),
    kvRow(ctx, L("reports.doc.cnss"), money(-data.totals.cnssEmployeeCents), { latinValue: true }),
    kvRow(ctx, L("reports.doc.amo"), money(-data.totals.amoEmployeeCents), { latinValue: true }),
    kvRow(ctx, L("reports.doc.ir"), money(-data.totals.irNetCents), { latinValue: true }),
    kvRow(ctx, L("reports.doc.employerCost"), money(data.totals.employerCostCents), { latinValue: true }),
    kvRow(ctx, L("reports.doc.totalCost"), money(data.totals.totalCostCents), { bold: true, latinValue: true }),

    sectionTitle(ctx, L("reports.doc.workersSection")),
    table(
      ctx,
      [
        { text: L("reports.doc.worker"), widthPct: 22, head: true },
        { text: L("reports.doc.colRef"), widthPct: 15, head: true, latin: true },
        { text: L("reports.doc.colHours"), widthPct: 10, head: true, latin: true, align: "center" },
        { text: L("reports.doc.gross"), widthPct: 13, head: true, latin: true, align: "end" },
        { text: "CNSS", widthPct: 11, head: true, latin: true, align: "end" },
        { text: "AMO", widthPct: 10, head: true, latin: true, align: "end" },
        { text: "IR", widthPct: 9, head: true, latin: true, align: "end" },
        { text: L("reports.doc.net"), widthPct: 13, head: true, latin: true, align: "end" },
      ],
      data.rows.map((r) => [
        { text: r.fullName, widthPct: 22 },
        { text: r.refNumber, widthPct: 15, latin: true },
        { text: docHours(r.workedMinutes), widthPct: 10, latin: true, align: "center" },
        { text: money(r.grossCents), widthPct: 13, latin: true, align: "end" },
        { text: money(-r.cnssEmployeeCents), widthPct: 11, latin: true, align: "end" },
        { text: money(-r.amoEmployeeCents), widthPct: 10, latin: true, align: "end" },
        { text: money(-r.irNetCents), widthPct: 9, latin: true, align: "end" },
        { text: money(r.netCents), widthPct: 13, latin: true, align: "end", bold: true },
      ])
    ),
    ...noteBlock(ctx),
    ...qrBlock(ctx, qrPng),
  ];
}

function attendanceChildren(
  ctx: Ctx,
  data: Extract<AnyReportData, { kind: "attendance_statement" | "hours_statement" }>,
  qrPng: Buffer
): (Paragraph | Table)[] {
  const L = (k: string) => tr(ctx.dict, k);
  const [y, m] = data.rangeLabel.split("-");
  const rangeLabel = monthLabel(ctx.dict, Number(y), Number(m));
  const title = data.kind === "hours_statement" ? L("reports.doc.hoursTitle") : L("reports.doc.attendanceTitle");

  return [
    ...headerBlock(ctx, data.company, title, `${L("reports.doc.worker")}: ${data.workerName}  •  ${L("reports.doc.period")}: ${rangeLabel}`, ctx.logo),

    sectionTitle(ctx, L("reports.doc.totalsSection")),
    kvRow(ctx, L("reports.doc.attendancePresentDays"), String(data.totals.presentDays), { latinValue: true }),
    kvRow(ctx, L("reports.doc.attendanceTotalMinutes"), docHours(data.totals.totalMinutes), { latinValue: true }),

    sectionTitle(ctx, L("reports.doc.attendanceSection")),
    table(
      ctx,
      [
        { text: L("reports.doc.attendanceColDate"), widthPct: 22, head: true, latin: true },
        { text: L("reports.doc.attendanceColIn"), widthPct: 16, head: true, latin: true, align: "center" },
        { text: L("reports.doc.attendanceColOut"), widthPct: 16, head: true, latin: true, align: "center" },
        { text: L("reports.doc.attendanceColMinutes"), widthPct: 16, head: true, latin: true, align: "center" },
        { text: L("reports.doc.attendanceColStatus"), widthPct: 22, head: true },
      ],
      data.rows.map((r) => [
        { text: r.localDate, widthPct: 22, latin: true },
        { text: r.inLabel ?? "—", widthPct: 16, latin: true, align: "center" },
        { text: r.outLabel ?? "—", widthPct: 16, latin: true, align: "center" },
        { text: docHours(r.minutes), widthPct: 16, latin: true, align: "center" },
        { text: dictOr(ctx, `reports.doc.attendanceStatus.${r.status}`, r.status), widthPct: 22 },
      ])
    ),
    ...(data.rows.length === 0 ? [p(ctx, L("reports.doc.noRows"), { size: 8, color: MUTED })] : []),
    ...noteBlock(ctx),
    ...qrBlock(ctx, qrPng),
  ];
}

function declarationsSummaryChildren(ctx: Ctx, data: Extract<AnyReportData, { kind: "declarations_summary" }>, qrPng: Buffer): (Paragraph | Table)[] {
  const L = (k: string) => tr(ctx.dict, k);
  const money = (c: number | null) => (c === null ? "—" : docMoney(c, ctx.lang));

  return [
    ...headerBlock(ctx, data.company, L("reports.doc.declSummaryTitle"), `${L("reports.doc.period")}: ${data.periodLabel}`, ctx.logo),

    sectionTitle(ctx, L("reports.doc.declSection")),
    table(
      ctx,
      [
        { text: L("reports.doc.colAuthority"), widthPct: 10, head: true, latin: true },
        { text: L("reports.doc.colDeclKind"), widthPct: 18, head: true },
        { text: L("reports.doc.period"), widthPct: 13, head: true, latin: true },
        { text: L("reports.doc.colDeclStatus"), widthPct: 16, head: true },
        { text: L("reports.doc.gross"), widthPct: 16, head: true, latin: true, align: "end" },
        { text: "IR", widthPct: 12, head: true, latin: true, align: "end" },
        { text: L("reports.doc.net"), widthPct: 15, head: true, latin: true, align: "end" },
      ],
      data.rows.map((r) => [
        { text: r.authority.toUpperCase(), widthPct: 10, latin: true },
        { text: dictOr(ctx, `specRegistry.kinds.${r.kind}`, r.kind), widthPct: 18 },
        { text: r.periodKey, widthPct: 13, latin: true },
        { text: dictOr(ctx, `declarations.statuses.${r.status}`, r.status), widthPct: 16 },
        { text: money(r.grossCents), widthPct: 16, latin: true, align: "end" },
        { text: money(r.irNetCents), widthPct: 12, latin: true, align: "end" },
        { text: money(r.netCents), widthPct: 15, latin: true, align: "end" },
      ])
    ),
    ...(data.rows.length === 0 ? [p(ctx, L("reports.doc.noRows"), { size: 8, color: MUTED })] : []),
    ...noteBlock(ctx),
    ...qrBlock(ctx, qrPng),
  ];
}

function complianceChildren(ctx: Ctx, data: Extract<AnyReportData, { kind: "compliance_report" }>, qrPng: Buffer): (Paragraph | Table)[] {
  const L = (k: string) => tr(ctx.dict, k);
  const money = (c: number | null) => (c === null ? "—" : docMoney(c, ctx.lang));
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
  const allMatch = data.diffs.length > 0 && data.diffs.every((d) => d.diffCents === 0);

  return [
    ...headerBlock(ctx, data.company, L("reports.doc.complianceTitle"), `${data.declarationLabel}  •  ${L("reports.doc.colDeclStatus")}: ${dictOr(ctx, `declarations.statuses.${data.status}`, data.status)}`, ctx.logo),
    p(ctx, L("reports.doc.complianceIntro"), { size: 8, color: MUTED }),

    sectionTitle(ctx, L("reports.doc.complianceTable")),
    table(
      ctx,
      [
        { text: L("reports.doc.colField"), widthPct: 31, head: true },
        { text: L("reports.doc.colPayslips"), widthPct: 24, head: true, latin: true, align: "end" },
        { text: L("reports.doc.colDeclaration"), widthPct: 24, head: true, latin: true, align: "end" },
        { text: L("reports.doc.colDiff"), widthPct: 21, head: true, latin: true, align: "end" },
      ],
      data.diffs.map((d) => [
        { text: fieldLabel(d.field), widthPct: 31 },
        { text: fieldText(d.field, d.payslipCents), widthPct: 24, latin: true, align: "end" },
        { text: d.declarationCents !== null ? fieldText(d.field, d.declarationCents) : "—", widthPct: 24, latin: true, align: "end" },
        { text: d.field === "workers" ? String(d.diffCents) : money(d.diffCents), widthPct: 21, latin: true, align: "end", bold: d.diffCents !== 0 },
      ])
    ),
    ...(data.diffs.length === 0
      ? [p(ctx, L("reports.doc.complianceNoFile"), { size: 8, color: MUTED })]
      : allMatch
        ? [p(ctx, L("reports.doc.complianceMatch"), { bold: true, color: "065F46" })]
        : [p(ctx, L("reports.doc.complianceDiff"), { bold: true, color: "92400E" })]),

    ...(data.fileHash
      ? [
          sectionTitle(ctx, L("reports.doc.officialFile")),
          kvRow(ctx, "SHA-256", data.fileHash, { latinValue: true }),
          ...(data.specVersion !== null ? [kvRow(ctx, L("reports.doc.specVersion"), `v${data.specVersion}`, { latinValue: true })] : []),
        ]
      : []),
    ...noteBlock(ctx),
    ...qrBlock(ctx, qrPng),
  ];
}

function platformSummaryChildren(ctx: Ctx, data: Extract<AnyReportData, { kind: "platform_summary" }>, qrPng: Buffer): (Paragraph | Table)[] {
  const L = (k: string) => tr(ctx.dict, k);
  const money = (c: number) => docMoney(c, ctx.lang);

  return [
    ...headerBlock(
      ctx,
      { legalName: data.branding.legalName, tradeName: data.branding.displayName, taxId: null, cnssNumber: null },
      L("reports.doc.platformTitle"),
      `${L("reports.doc.companiesCount")}: ${data.companiesCount}`,
      ctx.logo
    ),

    sectionTitle(ctx, L("reports.doc.companiesSection")),
    table(
      ctx,
      [
        { text: L("reports.doc.company"), widthPct: 34, head: true },
        { text: L("reports.doc.workersCount"), widthPct: 14, head: true, latin: true, align: "center" },
        { text: L("reports.doc.periodsCount"), widthPct: 14, head: true, latin: true, align: "center" },
        { text: L("reports.doc.net"), widthPct: 18, head: true, latin: true, align: "end" },
        { text: L("reports.doc.totalCost"), widthPct: 20, head: true, latin: true, align: "end" },
      ],
      data.rows.map((r) => [
        { text: r.legalName, widthPct: 34 },
        { text: String(r.workersCount), widthPct: 14, latin: true, align: "center" },
        { text: String(r.approvedPeriods), widthPct: 14, latin: true, align: "center" },
        { text: money(r.netCents), widthPct: 18, latin: true, align: "end" },
        { text: money(r.totalCostCents), widthPct: 20, latin: true, align: "end" },
      ])
    ),
    ...(data.rows.length === 0 ? [p(ctx, L("reports.doc.noRows"), { size: 8, color: MUTED })] : []),
    ...noteBlock(ctx),
    ...qrBlock(ctx, qrPng),
  ];
}

// ─── نقطة الدخول ─────────────────────────────────────────────

export async function renderReportDocx(
  data: AnyReportData,
  language: ReportLanguage,
  options: ReportOptions,
  meta: DocxRenderMeta
): Promise<Uint8Array> {
  const [naskh, sans, qrPng, logo] = await Promise.all([
    readFont(FONT_FILES.naskhRegular),
    readFont(FONT_FILES.sansRegular),
    qrPngBuffer(meta.verifyUrl, 240),
    logoPng(180),
  ]);
  const ctx = makeCtx(language, options, meta, data.branding, logo);

  let children: (Paragraph | Table)[];
  switch (data.kind) {
    case "payslip":
      children = payslipChildren(ctx, data, qrPng);
      break;
    case "payroll_summary":
      children = payrollSummaryChildren(ctx, data, qrPng);
      break;
    case "attendance_statement":
    case "hours_statement":
      children = attendanceChildren(ctx, data, qrPng);
      break;
    case "declarations_summary":
      children = declarationsSummaryChildren(ctx, data, qrPng);
      break;
    case "compliance_report":
      children = complianceChildren(ctx, data, qrPng);
      break;
    case "platform_summary":
      children = platformSummaryChildren(ctx, data, qrPng);
      break;
    default:
      throw new Error(`docx_unknown_kind:${(data as { kind: string }).kind}`);
  }

  const doc = new Document({
    // خط مضمّن: المستند يظهر سليمًا على أي جهاز حتى بلا الخطوط مثبتة
    fonts: [
      { name: "Noto Naskh Arabic", data: naskh, characterSet: CharacterSet.ANSI },
      { name: "Noto Sans", data: sans, characterSet: CharacterSet.ANSI },
    ],
    styles: {
      default: {
        document: {
          run: { font: ctx.rtl ? "Noto Naskh Arabic" : "Noto Sans", size: 22 },
        },
      },
    },
    sections: [
      {
        // bidi قسم RTL — يعمل فعليًا (w:bidi في الـ XML) وإن غاب عن أنواع المكتبة
        properties: {
          page: {
            size: { orientation: PageOrientation.PORTRAIT },
            margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 },
          },
          ...(ctx.rtl ? { bidi: true } : {}),
        } as never,
        footers: { default: pageFooter(ctx) },
        children,
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  return new Uint8Array(buffer);
}
