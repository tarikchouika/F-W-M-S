// HRMP — مُصدِّر CNSS (eBDS) من تعريف تخطيط يعرّفه المحاسب (SPEC §4.6 — المرحلة 6ج)
// «بنية الملف لا أفترضها: يعرّفها المحاسب كتعريف تخطيط قابل للتحرير:
//   ترتيب الحقول، الفواصل أو العرض الثابت، الترميز، الرأس والذيل،
//   تنسيق التواريخ والأرقام، ومعادلات الإجماليات» — ننفذها حرفيًا هنا.
// نقية بلا قاعدة بيانات. كل خطأ تحقق يُعرض بوضوح: الحقل + السبب.
import type { DeclarationContext, EbdsLayout, LayoutField, ValidationIssue } from "./types";
import { DeclarationValidationError } from "./types";

const NUMERIC_SOURCES = new Set<string>([
  "payslip.workedDays",
  "payslip.grossCents",
  "payslip.cnssBaseCents",
  "payslip.cnssEmployeeCents",
  "payslip.amoEmployeeCents",
  "payslip.netCents",
  "total.workers",
  "total.grossCents",
  "total.cnssBaseCents",
  "total.cnssEmployeeCents",
  "total.amoEmployeeCents",
  "total.netCents",
  "total.days",
  "period.year",
  "period.month",
]);

function resolveValue(
  field: LayoutField,
  ctx: DeclarationContext,
  workerIndex: number | null
): { value: string | null; numeric: boolean } {
  const w = workerIndex !== null ? ctx.workers[workerIndex] : null;
  const numeric = NUMERIC_SOURCES.has(field.source);
  switch (field.source) {
    case "literal":
      return { value: field.value ?? "", numeric: false };
    case "company.cnssNumber":
      return { value: ctx.companyCnssNumber, numeric: false };
    case "company.legalName":
      return { value: ctx.companyLegalName, numeric: false };
    case "company.taxId":
      return { value: ctx.companyTaxId, numeric: false };
    case "period.key":
      return { value: ctx.periodKey, numeric: false };
    case "period.year":
      return { value: String(ctx.periodYear), numeric: true };
    case "period.month":
      return { value: ctx.periodMonth === null ? null : String(ctx.periodMonth).padStart(2, "0"), numeric: true };
    case "worker.cnssNumber":
      return { value: w?.cnssNumber ?? null, numeric: false };
    case "worker.cin":
      return { value: w?.cin ?? null, numeric: false };
    case "worker.fullName":
      return { value: w?.fullName ?? null, numeric: false };
    case "worker.userId":
      return { value: w?.userId ?? null, numeric: false };
    case "payslip.refNumber":
      return { value: w?.refNumber ?? null, numeric: false };
    case "payslip.workedDays":
      return { value: w ? String(w.workedDays) : null, numeric: true };
    case "payslip.grossCents":
      return { value: w ? String(w.grossCents) : null, numeric: true };
    case "payslip.cnssBaseCents":
      return { value: w ? String(w.cnssBaseCents) : null, numeric: true };
    case "payslip.cnssEmployeeCents":
      return { value: w ? String(w.cnssEmployeeCents) : null, numeric: true };
    case "payslip.amoEmployeeCents":
      return { value: w ? String(w.amoEmployeeCents) : null, numeric: true };
    case "payslip.netCents":
      return { value: w ? String(w.netCents) : null, numeric: true };
    case "total.workers":
      return { value: String(ctx.workers.length), numeric: true };
    case "total.days":
      return { value: String(ctx.workers.reduce((a, x) => a + x.workedDays, 0)), numeric: true };
    case "total.grossCents":
      return { value: String(ctx.workers.reduce((a, x) => a + x.grossCents, 0)), numeric: true };
    case "total.cnssBaseCents":
      return { value: String(ctx.workers.reduce((a, x) => a + x.cnssBaseCents, 0)), numeric: true };
    case "total.cnssEmployeeCents":
      return { value: String(ctx.workers.reduce((a, x) => a + x.cnssEmployeeCents, 0)), numeric: true };
    case "total.amoEmployeeCents":
      return { value: String(ctx.workers.reduce((a, x) => a + x.amoEmployeeCents, 0)), numeric: true };
    case "total.netCents":
      return { value: String(ctx.workers.reduce((a, x) => a + x.netCents, 0)), numeric: true };
    default:
      return { value: null, numeric: false };
  }
}

/** تحويل رقمي بحسب التنسيق: cents_to_mad (÷100 بخانتين) | cents | int */
function formatNumber(raw: string, format: LayoutField["format"]): string {
  const n = Number(raw);
  if (!Number.isFinite(n)) return raw;
  if (format === "cents_to_mad") return (n / 100).toFixed(2);
  return String(n);
}

function renderField(
  field: LayoutField,
  recordLabel: string,
  ctx: DeclarationContext,
  workerIndex: number | null,
  issues: ValidationIssue[]
): string {
  const resolved = resolveValue(field, ctx, workerIndex);
  let text = resolved.value;
  const isNumeric = resolved.numeric;

  if (text === null || text === "") {
    if (field.optional) {
      text = "";
    } else {
      issues.push({ element: `${recordLabel}.${field.source}`, reason: "missing_required_value" });
      text = "";
    }
  }

  if (isNumeric && text !== "" && field.format) {
    text = formatNumber(text, field.format);
  }

  // العرض الثابت: قصّ/حشو إلزامي مع أخطاء تجاوز واضحة (SPEC §4.6: «يعرض أخطاء التحقق بوضوح»)
  if (field.width !== undefined) {
    if (text.length > field.width) {
      issues.push({
        element: `${recordLabel}.${field.source}`,
        reason: "value_exceeds_width",
        detail: `length=${text.length} width=${field.width}`,
      });
      text = text.slice(0, field.width);
    } else if (text.length < field.width) {
      const padChar = field.padChar ?? (isNumeric ? "0" : " ");
      const padDir = field.pad ?? (isNumeric ? "left" : "right");
      text = padDir === "left" ? text.padStart(field.width, padChar) : text.padEnd(field.width, padChar);
    }
  }
  return text;
}

/** التحقق من سلامة التعريف نفسه قبل أي توليد (أخطاء واضحة للمحاسب) */
export function validateLayout(layout: EbdsLayout): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!Array.isArray(layout.records) || layout.records.length === 0) {
    issues.push({ element: "layout.records", reason: "empty_layout" });
    return issues;
  }
  const hasPerWorker = layout.records.some((r) => r.type === "per_worker");
  if (!hasPerWorker) {
    issues.push({ element: "layout.records", reason: "no_per_worker_record" });
  }
  for (const rec of layout.records) {
    if (!Array.isArray(rec.fields) || rec.fields.length === 0) {
      issues.push({ element: `record.${rec.type}`, reason: "empty_fields" });
      continue;
    }
    if (layout.fieldSeparator === null) {
      for (const f of rec.fields) {
        if (f.width === undefined) {
          issues.push({ element: `record.${rec.type}.${f.source}`, reason: "fixed_width_missing" });
        }
      }
    }
    for (const f of rec.fields) {
      if (f.source === "literal" && (f.value === undefined || f.value === "")) {
        issues.push({ element: `record.${rec.type}.literal`, reason: "literal_missing_value" });
      }
    }
  }
  return issues;
}

/** توليد ملف eBDS كاملاً من التخطيط والسياق — يرمي DeclarationValidationError عند أي خطأ */
export function renderEbdsLayout(layout: EbdsLayout, ctx: DeclarationContext): string {
  const issues = validateLayout(layout);
  if (issues.length > 0) throw new DeclarationValidationError(issues);

  const lines: string[] = [];
  const sep = layout.fieldSeparator ?? "";

  for (const rec of layout.records) {
    if (rec.type === "header") {
      const fieldIssues: ValidationIssue[] = [];
      const parts = rec.fields.map((f) => renderField(f, "header", ctx, null, fieldIssues));
      issues.push(...fieldIssues);
      lines.push(parts.join(sep));
    } else if (rec.type === "trailer") {
      const fieldIssues: ValidationIssue[] = [];
      const parts = rec.fields.map((f) => renderField(f, "trailer", ctx, null, fieldIssues));
      issues.push(...fieldIssues);
      lines.push(parts.join(sep));
    } else {
      if (ctx.workers.length === 0) {
        // تصريح «لا شيء» (néant): سجل الرأس والذيل فقط (SPEC §4.6: يوجد حتى بلا أجور)
        continue;
      }
      ctx.workers.forEach((_, idx) => {
        const fieldIssues: ValidationIssue[] = [];
        const parts = rec.fields.map((f) => renderField(f, "worker", ctx, idx, fieldIssues));
        issues.push(...fieldIssues);
        lines.push(parts.join(sep));
      });
    }
  }

  if (issues.length > 0) throw new DeclarationValidationError(issues);
  return lines.join(layout.recordSeparator) + layout.recordSeparator;
}
