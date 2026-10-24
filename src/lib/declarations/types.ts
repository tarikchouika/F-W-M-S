// HRMP — أنواع التصاريح الرسمية (SPEC §4.6 — المرحلة 6ج)
// القاعدة الذهبية (SPEC §4.6): «لا تخترع بنية أي ملف رسمي، ولا تكتب مواصفة من عندك»
// بنية eBDS (CNSS) يعرّفها المحاسب كتعريف تخطيط (layout) قابل للتحرير؛
// ومخطط DGI يرفعه المحاسب كملف XSD؛ والربط (mapping) إعداد قابل للتعديل لا كود.

// ── سجل المواصفات ────────────────────────────────────────────────

export const SPEC_AUTHORITIES = ["cnss", "dgi"] as const;
export type SpecAuthority = (typeof SPEC_AUTHORITIES)[number];

export const SPEC_KINDS = ["monthly", "annual_9421", "corrective", "neant"] as const;
export type SpecKind = (typeof SPEC_KINDS)[number];

export const SPEC_STATUSES = ["draft", "testing", "active", "retired"] as const;
export type SpecStatus = (typeof SPEC_STATUSES)[number];

export const DECLARATION_STATUSES = [
  "draft",
  "generated",
  "accountant_review",
  "approved",
  "rejected",
  "exported",
  "filed",
] as const;
export type DeclarationStatus = (typeof DECLARATION_STATUSES)[number];

// ── تعريف تخطيط CNSS (eBDS) — يعرّفه المحاسب ويحرّره من الواجهة (SPEC §4.6) ──

export type LayoutField = {
  /** مصدر القيمة: literal ثابت | خاصية شركة | خاصية عامل/كشف | إجمالي محسوب */
  source:
    | "literal"
    | "company.cnssNumber"
    | "company.legalName"
    | "company.taxId"
    | "period.key"
    | "period.year"
    | "period.month"
    | "worker.cnssNumber"
    | "worker.cin"
    | "worker.fullName"
    | "worker.userId"
    | "payslip.refNumber"
    | "payslip.workedDays"
    | "payslip.grossCents"
    | "payslip.cnssBaseCents"
    | "payslip.cnssEmployeeCents"
    | "payslip.amoEmployeeCents"
    | "payslip.netCents"
    | "total.workers"
    | "total.grossCents"
    | "total.cnssBaseCents"
    | "total.cnssEmployeeCents"
    | "total.amoEmployeeCents"
    | "total.netCents"
    | "total.days";
  value?: string; // للـ literal فقط
  width?: number; // العرض الثابت بالحروف — إلزامي في العرض الثابت
  pad?: "left" | "right"; // اتجاه الحشو (default: right للنص، left للأرقام)
  padChar?: string; // حرف الحشو (default: مسافة للنص، "0" للأرقام)
  /** تنسيق القيمة الرقمية: cents_to_mad (÷100) | cents (كما هو) | int */
  format?: "cents_to_mad" | "cents" | "int";
  /** تنسيق التاريخ: DDMMYYYY | YYYYMMDD | YYYY-MM-DD */
  dateFormat?: "DDMMYYYY" | "YYYYMMDD" | "YYYY-MM-DD";
  optional?: boolean; // الحقل الاختياري: غياب القيمة لا يمنع التوليد (يُملأ فراغات)
};

export type LayoutRecord = {
  /** سجل لكل عامل (fields) أو سجل واحد (header/trailer) */
  type: "header" | "per_worker" | "trailer";
  fields: LayoutField[];
};

export type EbdsLayout = {
  encoding: "utf-8" | "windows-1256" | "latin-1"; // الترميز (يُصدَّر utf-8 دائمًا؛ يُوثَّق للمحاسب)
  recordSeparator: "\n" | "\r\n";
  /** فاصل الحقول: null = عرض ثابت (fixed width) وإلا حرف الفاصل */
  fieldSeparator: string | null;
  sampleTag?: string; // SAMPLE-NOT-OFFICIAL للعينات
  records: LayoutRecord[];
};

// ── ربط DGI (mapping) — إعداد قابل للتعديل لا كود (SPEC §4.6) ──

export type XmlMappingField = {
  source:
    | "literal"
    | "company.taxId"
    | "company.legalName"
    | "company.cnssNumber"
    | "declaration.year"
    | "declaration.periodKey"
    | "worker.cin"
    | "worker.cnssNumber"
    | "worker.fullName"
    | "payslip.refNumber"
    | "payslip.workedDays"
    | "payslip.grossCents"
    | "payslip.sbiCents"
    | "payslip.irNetCents"
    | "payslip.netCents"
    | "total.workers"
    | "total.grossCents"
    | "total.sbiCents"
    | "total.irNetCents";
  value?: string;
  element: string; // اسم عنصر XML
  attribute?: string; // سمة بدل عنصر (مثل <Employe cin="...">
  /** أين يتكرر: header مرة | per_worker لكل عامل | trailer مرة (الإجماليات) */
  scope: "header" | "per_worker" | "trailer";
  format?: "cents_to_mad" | "cents" | "int";
};

export type XmlMapping = {
  rootElement: string;
  namespace?: string;
  fields: XmlMappingField[];
};

// ── صف بيانات العامل للتوليد (مصدر واحد للجهتين) ────────────────

export type DeclarationWorkerRow = {
  userId: string;
  fullName: string;
  cin: string | null;
  cnssNumber: string | null;
  refNumber: string;
  workedDays: number;
  grossCents: number;
  sbiCents: number;
  cnssBaseCents: number;
  cnssEmployeeCents: number;
  amoEmployeeCents: number;
  irNetCents: number;
  netCents: number;
};

export type DeclarationContext = {
  companyCnssNumber: string | null;
  companyLegalName: string;
  companyTaxId: string | null;
  periodKey: string; // "2026-10" أو "2026"
  periodYear: number;
  periodMonth: number | null;
  workers: DeclarationWorkerRow[];
};

// ── أخطاء التحقق (تُعرض بوضوح: العنصر + السبب — SPEC §4.6) ─────

export type ValidationIssue = {
  element: string; // الحقل/العنصر/السجل
  reason: string; // رمز السبب (يُترجم في الواجهة)
  detail?: string;
};

export class DeclarationValidationError extends Error {
  issues: ValidationIssue[];
  constructor(issues: ValidationIssue[]) {
    super(`declaration_validation_failed: ${issues.length} issue(s)`);
    this.name = "DeclarationValidationError";
    this.issues = issues;
  }
}
