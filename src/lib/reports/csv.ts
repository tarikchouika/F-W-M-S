// FWMS — مولّد CSV للتقارير (صيغة جدولية قابلة للتحرير في Excel/Sheets)
// ─────────────────────────────────────────────────────────────────────────────
// لماذا CSV؟ لأنه **بلا اعتمادية جديدة** ويفتح في Excel وLibreOffice وGoogle
// Sheets مباشرةً ⇒ الجدول قابل للتحرير حسابيًا (بخلاف PDF/PNG).
//
// «الحرفية» (دقة البيانات):
//   • الأرقام **خام بلا فواصل ولا رموز عملة** (‎"5000.00"‎) ⇒ يستوردها Excel
//     كأرقام لا كنصوص، والتحليلات الحسابية تعمل.
//   • التواريخ **ISO-8601** (‎"2026-10-12"‎) ⇒ لا التباس بين الصيغ.
//   • ترميز UTF-8 مع BOM ⇒ يفتح Excel العربي بترميز صحيح بلا «mojibake».
//   • الأسطر مفصولة بـ CRLF والحقول المقتبسة وفق RFC 4180.
//   • ترتيب الأعمدة **بصريّ** في العربية (أول عمود منطقيًا = أقصى اليمين) —
//     مطابق لبقية الوثائق (PDF/DOCX) التي تعكس الأعمدة في RTL.
// ─────────────────────────────────────────────────────────────────────────────
import type { AnyReportData, ReportLanguage, ReportOptions } from "./types";
import { reportDict, tr, isRtl } from "./i18n";
import type { ReportDict } from "./i18n";
import { LINE_KIND_MAP } from "./line-kinds";

export type CsvRenderMeta = {
  refNumber: string;
  contentHash: string;
  verifyUrl: string;
  generatedAt: string;
  generatedBy: string;
};

/** مبلغ خام بلا تنسيق: 500000 (سنتيم) ⇒ "5000.00" (د.م. — بلا رمز عملة) */
function csvMoney(cents: number): string {
  return (cents / 100).toFixed(2);
}

function csvHours(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}:${String(m).padStart(2, "0")}`;
}

/** اقتباس حقل حسب RFC 4180 */
function field(value: string): string {
  const v = value ?? "";
  if (/[",\r\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

function row(cells: string[]): string {
  return cells.map(field).join(",");
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

type Table = { head: string[]; rows: string[][] };

/** جدول CSV لكل نوع تقرير — الأعمدة بالترتيب المنطقي (يُعكس في RTL) */
function tableOf(data: AnyReportData, dict: ReportDict, language: ReportLanguage): Table {
  const L = (k: string) => tr(dict, k);
  switch (data.kind) {
    case "payslip": {
      const head = [
        L("reports.doc.colItem"),
        L("reports.doc.colHours"),
        L("reports.doc.colRate"),
        L("reports.doc.colAmount"),
      ];
      const rows = data.lines.map((l) => [
        l.label || lineKindLabel(dict, l.kind),
        l.minutes !== null ? csvHours(l.minutes) : "",
        l.rateBp !== null ? (l.rateBp / 10000).toFixed(2) : "",
        csvMoney(l.amountCents),
      ]);
      // الإجماليات تُلحق بالجدول (صفّ مجموع) — للقراءة الجدولية الكاملة
      rows.push([
        L("reports.doc.gross"),
        csvHours(data.totals.workedMinutes),
        "",
        csvMoney(data.totals.grossCents),
      ]);
      rows.push([L("reports.doc.cnss"), "", "", csvMoney(-data.totals.cnssEmployeeCents)]);
      rows.push([L("reports.doc.amo"), "", "", csvMoney(-data.totals.amoEmployeeCents)]);
      rows.push([L("reports.doc.ir"), "", "", csvMoney(-data.totals.irNetCents)]);
      rows.push([L("reports.doc.net"), "", "", csvMoney(data.totals.netCents)]);
      return { head, rows };
    }
    case "payroll_summary": {
      const head = [
        L("reports.doc.worker"),
        L("reports.doc.colRef"),
        L("reports.doc.colHours"),
        L("reports.doc.gross"),
        "CNSS",
        "AMO",
        "IR",
        L("reports.doc.net"),
      ];
      return {
        head,
        rows: data.rows.map((r) => [
          r.fullName,
          r.refNumber,
          csvHours(r.workedMinutes),
          csvMoney(r.grossCents),
          csvMoney(-r.cnssEmployeeCents),
          csvMoney(-r.amoEmployeeCents),
          csvMoney(-r.irNetCents),
          csvMoney(r.netCents),
        ]),
      };
    }
    case "attendance_statement":
    case "hours_statement": {
      const head = [
        L("reports.doc.attendanceColDate"),
        L("reports.doc.attendanceColIn"),
        L("reports.doc.attendanceColOut"),
        L("reports.doc.attendanceColMinutes"),
        L("reports.doc.attendanceColStatus"),
      ];
      return {
        head,
        rows: data.rows.map((r) => [
          r.localDate,
          r.inLabel ?? "",
          r.outLabel ?? "",
          csvHours(r.minutes),
          dictOr(dict, `reports.doc.attendanceStatus.${r.status}`, r.status),
        ]),
      };
    }
    case "declarations_summary": {
      const head = [
        L("reports.doc.colAuthority"),
        L("reports.doc.colDeclKind"),
        L("reports.doc.period"),
        L("reports.doc.colDeclStatus"),
        L("reports.doc.gross"),
        "IR",
        L("reports.doc.net"),
      ];
      return {
        head,
        rows: data.rows.map((r) => [
          r.authority.toUpperCase(),
          dictOr(dict, `specRegistry.kinds.${r.kind}`, r.kind),
          r.periodKey,
          dictOr(dict, `declarations.statuses.${r.status}`, r.status),
          r.grossCents === null ? "" : csvMoney(r.grossCents),
          r.irNetCents === null ? "" : csvMoney(r.irNetCents),
          r.netCents === null ? "" : csvMoney(r.netCents),
        ]),
      };
    }
    case "compliance_report": {
      const head = [
        L("reports.doc.colField"),
        L("reports.doc.colPayslips"),
        L("reports.doc.colDeclaration"),
        L("reports.doc.colDiff"),
      ];
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
      return {
        head,
        rows: data.diffs.map((d) => [
          fieldLabel(d.field),
          d.field === "workers" ? String(d.payslipCents) : csvMoney(d.payslipCents),
          d.declarationCents === null
            ? ""
            : d.field === "workers"
              ? String(d.declarationCents)
              : csvMoney(d.declarationCents),
          d.field === "workers" ? String(d.diffCents) : csvMoney(d.diffCents),
        ]),
      };
    }
    case "platform_summary": {
      const head = [
        L("reports.doc.company"),
        L("reports.doc.workersCount"),
        L("reports.doc.periodsCount"),
        L("reports.doc.net"),
        L("reports.doc.totalCost"),
      ];
      return {
        head,
        rows: data.rows.map((r) => [
          r.legalName,
          String(r.workersCount),
          String(r.approvedPeriods),
          csvMoney(r.netCents),
          csvMoney(r.totalCostCents),
        ]),
      };
    }
    default:
      return { head: [], rows: [] };
  }
}

/** يولّد ملف CSV (بايتات UTF-8 مع BOM) */
export function renderReportCsv(
  data: AnyReportData,
  language: ReportLanguage,
  _options: ReportOptions,
  _meta: CsvRenderMeta
): Uint8Array {
  const dict = reportDict(language);
  const { head, rows } = tableOf(data, dict, language);
  // في العربية يُعكس ترتيب الأعمدة (الأول منطقيًا = أقصى اليمين) كبقية الوثائق
  const ordered = isRtl(language) ? [...head].reverse() : head;
  const orderedRows = isRtl(language) ? rows.map((r) => [...r].reverse()) : rows;
  const lines = [row(ordered), ...orderedRows.map(row)];
  // BOM (يقرأ Excel العربية بترميز صحيح) + CRLF (RFC 4180)
  const text = `﻿${lines.join("\r\n")}\r\n`;
  return new Uint8Array(Buffer.from(text, "utf8"));
}
