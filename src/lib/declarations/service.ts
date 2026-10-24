// HRMP — خدمة التصاريح الرسمية (SPEC §4.6 — المرحلة 6ج): سجل المواصفات + دورة الاعتماد
// الدورة: مسودة ← مولَّد ← قيد مراجعة المحاسب ← معتمد ← مُصدَّر ← مُودَع (يدويًا)
// القواعد النافذة:
//   - لا يُصدَّر ملف رسمي قبل اعتماد المحاسب (SPEC §4.6)
//   - لا توليد بلا مواصفة مفعّلة («لا توجد مواصفة معتمدة؛ ارفعها أو فعّلها»)
//   - عينة SAMPLE-NOT-OFFICIAL لا تُفعَّل في الإنتاج أبدًا
//   - CIN/CNSS إلزاميان قبل التوليد (رفض الملف من الجهة بدونهما — SPEC §4.6)
//   - الملف المُصدَّر نسخة ثابتة + SHA-256 (وثيقة قانونية)
//   - التصحيح تصريح جديد مرتبط بالأصلي لا تعديل له
import { createHash } from "crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import type { SessionPayload } from "@/lib/auth/jwt";
import { writeAudit } from "@/lib/audit";
import { createNotification } from "@/lib/notifications";
import { renderEbdsLayout } from "./layout";
import { parseXsd, validateXmlAgainstXsd } from "./xsd";
import { buildXmlFromMapping } from "./xml";
import { reconcileIrMonthlyVsAnnual, type IrMonthlyEntry } from "./reconcile";
import {
  SPEC_AUTHORITIES,
  SPEC_KINDS,
  DeclarationValidationError,
  type DeclarationContext,
  type DeclarationWorkerRow,
  type EbdsLayout,
  type ValidationIssue,
  type XmlMapping,
} from "./types";

type Session = SessionPayload & { companyId: string; companyTimezone: string; companyName: string };

function fail(status: number, code: string, extra?: Record<string, unknown>): never {
  throw Object.assign(new Error(code), { status, ...(extra ?? {}) });
}

const sha256 = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");

// ── فحوص بيانات العمال (SPEC §4.6: CIN/CNSS إلزاميان بصيغة سليمة) ──

const CIN_RE = /^[A-Z]{1,2}[0-9]{4,8}$/i;
const CNSS_RE = /^[0-9]{7,13}$/;

function workerIdentityIssues(rows: DeclarationWorkerRow[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  for (const w of rows) {
    if (w.cin === null || !CIN_RE.test(w.cin)) {
      issues.push({ element: `worker[${w.refNumber}].cin`, reason: w.cin === null ? "missing_cin" : "invalid_cin" });
    }
    if (w.cnssNumber === null || !CNSS_RE.test(w.cnssNumber)) {
      issues.push({ element: `worker[${w.refNumber}].cnssNumber`, reason: w.cnssNumber === null ? "missing_cnss" : "invalid_cnss" });
    }
  }
  return issues;
}

// ── سجل المواصفات (SPEC §4.6: جهة، نوع، إصدار، حالة، من رفعها ومن اعتمدها) ──

const layoutSchema = z.object({
  encoding: z.enum(["utf-8", "windows-1256", "latin-1"]),
  recordSeparator: z.enum(["\n", "\r\n"]),
  fieldSeparator: z.string().max(3).nullable(),
  records: z
    .array(
      z.object({
        type: z.enum(["header", "per_worker", "trailer"]),
        fields: z
          .array(
            z.object({
              source: z.string().min(1),
              value: z.string().optional(),
              width: z.number().int().positive().max(200).optional(),
              pad: z.enum(["left", "right"]).optional(),
              padChar: z.string().max(1).optional(),
              format: z.enum(["cents_to_mad", "cents", "int"]).optional(),
              optional: z.boolean().optional(),
            })
          )
          .min(1),
      })
    )
    .min(1),
});

export const createSpecSchema = z.object({
  authority: z.enum(SPEC_AUTHORITIES),
  kind: z.enum(SPEC_KINDS),
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  sourceRef: z.string().max(500).optional(),
  layoutJson: z.string().optional(), // CNSS: تعريف التخطيط (JSON نصي)
  xsdContent: z.string().optional(), // DGI: مخطط XSD
  mappingJson: z.string().optional(), // ربط حقول الأجور بالعناصر (DGI)
});

export async function listSpecs(session: Session) {
  const rows = await db.declarationSpec.findMany({
    where: { OR: [{ companyId: session.companyId }, { companyId: null }] },
    orderBy: [{ authority: "asc" }, { kind: "asc" }, { version: "desc" }],
    include: { _count: { select: { declarations: true } } },
  });
  return rows.map((r) => ({
    id: r.id,
    authority: r.authority,
    kind: r.kind,
    version: r.version,
    effectiveFrom: r.effectiveFrom,
    sourceRef: r.sourceRef,
    status: r.status,
    isSample: r.isSample,
    scope: r.companyId === null ? "platform" : "company",
    uploadedBy: r.uploadedBy,
    approvedBy: r.approvedBy,
    approvedAt: r.approvedAt,
    createdAt: r.createdAt,
    declarationsCount: r._count.declarations,
  }));
}

export async function getSpecDetail(session: Session, specId: string) {
  const spec = await db.declarationSpec.findFirst({
    where: { id: specId, OR: [{ companyId: session.companyId }, { companyId: null }] },
  });
  if (!spec) fail(404, "spec_not_found");
  return spec;
}

/** رفع إصدار جديد — المحاسب (وللمالك): CNSS يرفع تخطيط eBDS، DGI يرفع XSD */
export async function createSpec(session: Session, input: z.infer<typeof createSpecSchema>) {
  if (session.role !== "accountant" && session.role !== "super_admin") {
    fail(403, "forbidden"); // SPEC §4.6: شاشة المواصفات للمحاسب والمالك
  }
  if (input.authority === "cnss") {
    const parsed = layoutSchema.safeParse(JSON.parse(input.layoutJson ?? "null"));
    if (!parsed.success) fail(422, "invalid_layout_json", { issues: parsed.error.issues.slice(0, 5) });
    if (input.xsdContent) fail(422, "xsd_not_for_cnss");
  } else {
    if (!input.xsdContent || input.xsdContent.trim() === "") fail(422, "xsd_required");
    try {
      parseXsd(input.xsdContent); // تحقق من تشكل المخطط نفسه قبل قبوله
    } catch (e) {
      fail(422, "invalid_xsd", { detail: (e as Error).message.slice(0, 200) });
    }
  }

  const last = await db.declarationSpec.findFirst({
    where: { companyId: session.companyId, authority: input.authority, kind: input.kind },
    orderBy: { version: "desc" },
    select: { version: true },
  });
  const version = (last?.version ?? 0) + 1;

  const spec = await db.declarationSpec.create({
    data: {
      companyId: session.companyId,
      authority: input.authority,
      kind: input.kind,
      version,
      effectiveFrom: new Date(`${input.effectiveFrom}T00:00:00Z`),
      sourceRef: input.sourceRef,
      layoutJson: input.authority === "cnss" ? input.layoutJson : null,
      xsdContent: input.authority === "dgi" ? input.xsdContent : null,
      mappingJson: input.mappingJson,
      status: "draft",
      isSample: false,
      uploadedBy: session.sub,
    },
  });

  await writeAudit({
    companyId: session.companyId,
    userId: session.sub,
    action: "declaration_spec.create",
    entity: "declaration_spec",
    entityId: spec.id,
    before: null,
    after: { authority: input.authority, kind: input.kind, version },
  });
  return spec;
}

/** تفعيل مواصفة (المحاسب/المالك): يسحب المفعّلة السابقة وينشئ إصدارًا — لا تعديل للقديم */
export async function activateSpec(session: Session, specId: string) {
  if (session.role !== "accountant" && session.role !== "super_admin") {
    fail(403, "forbidden");
  }
  const spec = await db.declarationSpec.findFirst({
    where: { id: specId, OR: [{ companyId: session.companyId }, { companyId: null }] },
  });
  if (!spec) fail(404, "spec_not_found");
  if (spec.status === "retired") fail(422, "spec_retired");
  if (spec.status === "active") fail(422, "spec_already_active");
  if (spec.isSample && process.env.NODE_ENV === "production") {
    // SPEC §4.6: العينات «لا تُفعَّل أبداً في الإنتاج» — مسموحة في التطوير لدورة الاختبار فقط
    fail(422, "sample_not_activatable");
  }

  // إصدار جديد عند الشركة إن كانت المواصفة قالب منصة (الشركة تملك نسختها المفعّلة)
  let target = spec;
  if (spec.companyId === null) {
    const companyCopy = await db.declarationSpec.findFirst({
      where: { companyId: session.companyId, authority: spec.authority, kind: spec.kind },
      orderBy: { version: "desc" },
    });
    const version = (companyCopy?.version ?? 0) + 1;
    target = await db.declarationSpec.create({
      data: {
        companyId: session.companyId,
        authority: spec.authority,
        kind: spec.kind,
        version,
        effectiveFrom: spec.effectiveFrom,
        sourceRef: spec.sourceRef,
        layoutJson: spec.layoutJson,
        xsdContent: spec.xsdContent,
        mappingJson: spec.mappingJson,
        status: "active",
        isSample: spec.isSample, // نسخة الشركة من عينة تبقى موسومة في التطوير
        uploadedBy: session.sub,
        approvedBy: session.sub,
        approvedAt: new Date(),
      },
    });
  } else {
    target = await db.declarationSpec.update({
      where: { id: spec.id },
      data: { status: "active", approvedBy: session.sub, approvedAt: new Date() },
    });
  }

  // سحب المفعّلة السابقة (تغيير المفعّلة ينشئ إصدارًا ولا يعدّل القديم — SPEC §4.6)
  await db.declarationSpec.updateMany({
    where: {
      companyId: session.companyId,
      authority: spec.authority,
      kind: spec.kind,
      status: "active",
      id: { not: target.id },
    },
    data: { status: "retired" },
  });

  await writeAudit({
    companyId: session.companyId,
    userId: session.sub,
    action: "declaration_spec.activate",
    entity: "declaration_spec",
    entityId: target.id,
    before: { status: spec.status, version: spec.version },
    after: { status: "active", version: target.version },
  });
  return target;
}

export async function retireSpec(session: Session, specId: string) {
  if (session.role !== "accountant" && session.role !== "super_admin") {
    fail(403, "forbidden");
  }
  const spec = await db.declarationSpec.findFirst({
    where: { id: specId, companyId: session.companyId },
  });
  if (!spec) fail(404, "spec_not_found");
  if (spec.status !== "active") fail(422, "spec_not_active");
  const updated = await db.declarationSpec.update({ where: { id: spec.id }, data: { status: "retired" } });
  await writeAudit({
    companyId: session.companyId,
    userId: session.sub,
    action: "declaration_spec.retire",
    entity: "declaration_spec",
    entityId: spec.id,
    before: { status: "active" },
    after: { status: "retired" },
  });
  return updated;
}

// ── بناء سياق التوليد من كشوف معتمدة (SPEC §4.6: «يقرأ من بيانات الأجور المعتمدة فقط») ──

async function buildDeclarationContext(session: Session, year: number, month: number | null): Promise<DeclarationContext> {
  const company = await db.company.findUnique({ where: { id: session.companyId } });
  if (!company) fail(404, "company_not_found");

  const where =
    month !== null
      ? { companyId: session.companyId, year, month, status: "approved" }
      : { companyId: session.companyId, year, status: "approved" };

  const periods = await db.payPeriod.findMany({ where });
  if (month !== null && periods.length === 0) fail(422, "period_not_approved");

  const payslips = await db.payslip.findMany({
    where: { periodId: { in: periods.map((p) => p.id) } },
    include: { worker: { select: { id: true, fullName: true } } },
    orderBy: { refNumber: "asc" },
  });

  const profiles = await db.employeeProfile.findMany({
    where: { companyId: session.companyId, userId: { in: payslips.map((p) => p.workerUserId) } },
    select: { userId: true, cin: true, cnssNumber: true },
  });
  const profileByUser = new Map(profiles.map((p) => [p.userId, p]));

  const workers: DeclarationWorkerRow[] = payslips.map((p) => ({
    userId: p.workerUserId,
    fullName: p.worker?.fullName ?? p.workerUserId,
    cin: profileByUser.get(p.workerUserId)?.cin ?? null,
    cnssNumber: profileByUser.get(p.workerUserId)?.cnssNumber ?? null,
    refNumber: p.refNumber,
    workedDays: p.workedDays,
    grossCents: p.grossCents,
    sbiCents: p.sbiCents,
    cnssBaseCents: p.cnssBaseCents,
    cnssEmployeeCents: p.cnssEmployeeCents,
    amoEmployeeCents: p.amoEmployeeCents,
    irNetCents: p.irNetCents,
    netCents: p.netCents,
  }));

  return {
    companyCnssNumber: company.cnssNumber,
    companyLegalName: company.legalName,
    companyTaxId: company.taxId,
    periodKey: month !== null ? `${year}-${String(month).padStart(2, "0")}` : `${year}`,
    periodYear: year,
    periodMonth: month,
    workers,
  };
}

/** الملخص للمحاسب: الأرقام + مقارنة الفترة السابقة + إجمالي كل اشتراك (SPEC §4.6) */
async function buildSummary(session: Session, ctx: DeclarationContext, authority: string) {
  const totals = {
    workers: ctx.workers.length,
    days: ctx.workers.reduce((a, w) => a + w.workedDays, 0),
    grossCents: ctx.workers.reduce((a, w) => a + w.grossCents, 0),
    cnssBaseCents: ctx.workers.reduce((a, w) => a + w.cnssBaseCents, 0),
    cnssEmployeeCents: ctx.workers.reduce((a, w) => a + w.cnssEmployeeCents, 0),
    amoEmployeeCents: ctx.workers.reduce((a, w) => a + w.amoEmployeeCents, 0),
    irNetCents: ctx.workers.reduce((a, w) => a + w.irNetCents, 0),
    netCents: ctx.workers.reduce((a, w) => a + w.netCents, 0),
  };

  // مقارنة مع الفترة السابقة (نفس الجهة والنوع)
  let previous: Record<string, number> | null = null;
  if (ctx.periodMonth !== null) {
    const prevMonth = ctx.periodMonth === 1 ? 12 : ctx.periodMonth - 1;
    const prevYear = ctx.periodMonth === 1 ? ctx.periodYear - 1 : ctx.periodYear;
    const prevKey = `${prevYear}-${String(prevMonth).padStart(2, "0")}`;
    const prevDecl = await db.declaration.findFirst({
      where: { companyId: session.companyId, authority, kind: "monthly", periodKey: prevKey },
      orderBy: { createdAt: "desc" },
      select: { summaryJson: true },
    });
    if (prevDecl?.summaryJson) {
      try {
        const parsed = JSON.parse(prevDecl.summaryJson);
        previous = parsed.totals ?? null;
      } catch {
        previous = null;
      }
    }
  }

  return { totals, previousPeriod: previous };
}

// ── التصاريح: الإنشاء والتوليد والدورة ────────────────────────────

export const createDeclarationSchema = z.object({
  authority: z.enum(SPEC_AUTHORITIES),
  kind: z.enum(SPEC_KINDS),
  periodId: z.string().optional(), // الشهري: فترة أجور
  year: z.number().int().min(2020).max(2100).optional(), // السنوي
  correctsWith: z.string().optional(), // التصحيحي: التصريح الأصلي
});

async function getActiveSpec(session: Session, authority: string, kind: string) {
  const spec = await db.declarationSpec.findFirst({
    where: { companyId: session.companyId, authority, kind, status: "active" },
    orderBy: { version: "desc" },
  });
  if (!spec) {
    // SPEC §4.6: «لا يُصدَّر أي ملف رسمي إن لم توجد مواصفة مفعّلة لنوعه»
    fail(422, "no_active_spec");
  }
  return spec;
}

async function getOwnedDeclaration(session: Session, declarationId: string) {
  const declaration = await db.declaration.findFirst({
    where: { id: declarationId, companyId: session.companyId },
    include: { spec: true },
  });
  if (!declaration) fail(404, "declaration_not_found");
  return declaration;
}

/** إنشاء تصريح (admin/المالك): يتطلب مواصفة مفعّلة — شهرية من فترة معتمدة أو سنوية */
export async function createDeclaration(session: Session, input: z.infer<typeof createDeclarationSchema>) {
  if (session.role !== "admin" && session.role !== "super_admin" && session.role !== "accountant") {
    fail(403, "forbidden");
  }
  // التصحيحي يستخدم مواصفة نوع الأصلي (تصحيح شهري بتخطيط شهري — لا نوع مستقل)
  let specKind: "monthly" | "annual_9421" | "corrective" | "neant" = input.kind;
  if (input.kind === "corrective") {
    if (!input.correctsWith) fail(422, "original_required");
    const original = await db.declaration.findFirst({
      where: { id: input.correctsWith, companyId: session.companyId },
      select: { kind: true, periodKey: true },
    });
    if (!original) fail(404, "original_not_found");
    specKind = original.kind === "corrective" ? "monthly" : (original.kind as "monthly" | "annual_9421" | "corrective" | "neant");
  }
  const spec = await getActiveSpec(session, input.authority, specKind);

  let periodId: string | null = null;
  let periodKey: string;
  let year: number;
  let month: number | null = null;

  if (input.kind === "monthly" || input.kind === "neant" || input.kind === "corrective") {
    if (!input.periodId) fail(422, "period_required");
    const period = await db.payPeriod.findFirst({
      where: { id: input.periodId, companyId: session.companyId },
    });
    if (!period) fail(404, "period_not_found");
    if (input.kind !== "corrective" && period.status !== "approved") fail(422, "period_not_approved");
    periodId = period.id;
    year = period.year;
    month = period.month;
    periodKey = `${year}-${String(month).padStart(2, "0")}`;
  } else {
    // annual_9421
    if (!input.year) fail(422, "year_required");
    year = input.year;
    periodKey = `${year}`;
  }

  if (input.correctsWith) {
    const original = await getOwnedDeclaration(session, input.correctsWith);
    if (original.id === undefined) fail(404, "original_not_found");
  } else if (input.kind === "corrective") {
    fail(422, "original_required");
  }

  // تفرد النشط لكل (جهة، نوع، فترة) — التصحيحي يسمح بسلسلة
  const existing = await db.declaration.findFirst({
    where: { companyId: session.companyId, authority: input.authority, kind: input.kind, periodKey },
  });
  if (existing && input.kind !== "corrective") fail(409, "declaration_exists");

  const declaration = await db.declaration.create({
    data: {
      companyId: session.companyId,
      specId: spec.id,
      periodId,
      periodKey,
      authority: input.authority,
      kind: input.kind,
      status: "draft",
      correctsWith: input.correctsWith ?? null,
      createdBy: session.sub,
    },
  });

  await writeAudit({
    companyId: session.companyId,
    userId: session.sub,
    action: "declaration.create",
    entity: "declaration",
    entityId: declaration.id,
    before: null,
    after: { authority: input.authority, kind: input.kind, periodKey, specVersion: spec.version },
  });
  return declaration;
}

export async function listDeclarations(session: Session) {
  const rows = await db.declaration.findMany({
    where: { companyId: session.companyId },
    orderBy: { createdAt: "desc" },
    include: {
      spec: { select: { version: true, isSample: true, status: true } },
      _count: { select: { files: true, receipts: true } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    authority: r.authority,
    kind: r.kind,
    periodKey: r.periodKey,
    status: r.status,
    specVersion: r.spec.version,
    isSample: r.spec.isSample,
    correctsWith: r.correctsWith,
    createdBy: r.createdBy,
    createdAt: r.createdAt,
    approvedAt: r.approvedAt,
    exportedAt: r.exportedAt,
    filedAt: r.filedAt,
    filesCount: r._count.files,
    receiptsCount: r._count.receipts,
  }));
}

export async function getDeclarationDetail(session: Session, declarationId: string) {
  const declaration = await getOwnedDeclaration(session, declarationId);
  const files = await db.declarationFile.findMany({
    where: { declarationId: declaration.id },
    select: { id: true, sha256: true, specVersion: true, format: true, sizeBytes: true, exportedBy: true, createdAt: true },
  });
  const receipts = await db.declarationReceipt.findMany({
    where: { declarationId: declaration.id },
    select: { id: true, filedAt: true, filedRef: true, uploadedBy: true, createdAt: true },
  });
  return {
    ...declaration,
    spec: {
      id: declaration.spec.id,
      authority: declaration.spec.authority,
      kind: declaration.spec.kind,
      version: declaration.spec.version,
      isSample: declaration.spec.isSample,
      status: declaration.spec.status,
    },
    files,
    receipts,
  };
}

/** توليد المحتوى + التحقق: مسودة ← مولَّد (الأخطاء تعرض ولا تُخزَّن ملفًا) */
export async function generateDeclaration(session: Session, declarationId: string) {
  if (session.role !== "admin" && session.role !== "super_admin" && session.role !== "accountant") {
    fail(403, "forbidden");
  }
  const declaration = await getOwnedDeclaration(session, declarationId);
  if (declaration.status !== "draft" && declaration.status !== "rejected") {
    fail(422, "declaration_not_draft");
  }
  const spec = declaration.spec;

  const year = declaration.periodId !== null ? (await db.payPeriod.findUnique({ where: { id: declaration.periodId } }))?.year ?? Number(declaration.periodKey.slice(0, 4)) : Number(declaration.periodKey.slice(0, 4));
  const month = declaration.periodId !== null
    ? (await db.payPeriod.findUnique({ where: { id: declaration.periodId } }))?.month ?? null
    : null;

  // تصريح «لا شيء» (néant): بلا كشوف (SPEC §4.6: يودع حتى بلا أجور)
  const isNeant = declaration.kind === "neant";
  const ctx: DeclarationContext = isNeant
    ? {
        companyCnssNumber: (await db.company.findUnique({ where: { id: session.companyId } }))?.cnssNumber ?? null,
        companyLegalName: session.companyName,
        companyTaxId: (await db.company.findUnique({ where: { id: session.companyId } }))?.taxId ?? null,
        periodKey: declaration.periodKey,
        periodYear: year,
        periodMonth: month,
        workers: [],
      }
    : await buildDeclarationContext(session, year, month);

  const issues: ValidationIssue[] = workerIdentityIssues(ctx.workers);

  // 9421 السنوي: مطابقة IR الشهري ↔ الإجمالي السنوي قبل التوليد (SPEC §4.6)
  if (declaration.kind === "annual_9421") {
    const allPeriods = await db.payPeriod.findMany({
      where: { companyId: session.companyId, year },
      select: { id: true, month: true, status: true },
    });
    const periods = allPeriods.filter((p) => p.status === "approved");
    // شهر له فترة غير معتمدة → تحذير للمحاسب (لا يودع بيان سنوي بفترات ناقصة)
    for (const p of allPeriods) {
      if (p.status !== "approved") {
        issues.push({ element: `${year}-${String(p.month).padStart(2, "0")}`, reason: "month_period_not_approved" });
      }
    }
    const monthlyIr = await db.payslip.groupBy({
      by: ["periodId"],
      where: { periodId: { in: periods.map((p) => p.id) } },
      _sum: { irNetCents: true },
    });
    const entries: IrMonthlyEntry[] = periods.map((p) => ({
      periodKey: `${year}-${String(p.month).padStart(2, "0")}`,
      irNetCents: monthlyIr.find((m) => m.periodId === p.id)?._sum.irNetCents ?? 0,
    }));
    // الأشهر بلا فترة = صفر (شركة جديدة — شرعية)؛ المطابقة على المجموع
    for (let m = 1; m <= 12; m++) {
      const key = `${year}-${String(m).padStart(2, "0")}`;
      if (!entries.some((e) => e.periodKey === key)) entries.push({ periodKey: key, irNetCents: 0 });
    }
    const annualTotal = ctx.workers.reduce((a, w) => a + w.irNetCents, 0);
    const reconciliation = reconcileIrMonthlyVsAnnual(entries, annualTotal);
    issues.push(...reconciliation.issues);
  }

  let content: string | null = null;
  try {
    if (declaration.authority === "cnss") {
      const layout = JSON.parse(spec.layoutJson ?? "null") as EbdsLayout | null;
      if (!layout) fail(422, "spec_layout_missing");
      content = renderEbdsLayout(layout, ctx);
    } else {
      const mapping = JSON.parse(spec.mappingJson ?? "null") as XmlMapping | null;
      if (!mapping) fail(422, "spec_mapping_missing");
      const built = buildXmlFromMapping(mapping, ctx);
      if (built.missing.length > 0) {
        for (const m of built.missing) issues.push({ element: m, reason: "missing_mapping_value" });
      } else {
        // التحقق بمخطط XSD المفعّل قبل تسليم الملف (SPEC §4.6)
        const xsdModel = parseXsd(spec.xsdContent ?? "");
        const xsdIssues = validateXmlAgainstXsd(built.xml, xsdModel);
        issues.push(...xsdIssues);
        if (xsdModel.warnings.length > 0) {
          // محدودات موثقة (xs:choice/import) — تحذيرات لا أخطاء
        }
        content = built.xml;
      }
    }
  } catch (e) {
    if (e instanceof DeclarationValidationError) {
      issues.push(...e.issues);
    } else {
      throw e;
    }
  }

  const summary = await buildSummary(session, ctx, declaration.authority);
  const blocking = issues.filter((i) => !i.reason.startsWith("xsd_"));

  const updated = await db.declaration.update({
    where: { id: declaration.id },
    data: {
      status: blocking.length === 0 && content !== null ? "generated" : "draft",
      summaryJson: JSON.stringify({ ...summary, validation: issues }),
      validationJson: JSON.stringify(issues),
    },
  });

  await writeAudit({
    companyId: session.companyId,
    userId: session.sub,
    action: "declaration.generate",
    entity: "declaration",
    entityId: declaration.id,
    before: { status: declaration.status },
    after: { status: updated.status, issues: issues.length },
  });

  return { id: updated.id, status: updated.status, issues, summary };
}

/** مولَّد ← قيد مراجعة المحاسب (مع إشعار المحاسب) */
export async function submitForReview(session: Session, declarationId: string) {
  const declaration = await getOwnedDeclaration(session, declarationId);
  if (declaration.status !== "generated") fail(422, "declaration_not_generated");

  const updated = await db.declaration.update({
    where: { id: declaration.id },
    data: { status: "accountant_review" },
  });

  // إشعار محاسبي الشركة
  const accountants = await db.userMembership.findMany({
    where: { companyId: session.companyId, role: "accountant", revokedAt: null },
    select: { userId: true },
  });
  for (const a of accountants) {
    await createNotification({
      companyId: session.companyId,
      userId: a.userId,
      type: "declaration_review_requested",
      payload: { declarationId: declaration.id, authority: declaration.authority, periodKey: declaration.periodKey },
    });
  }

  await writeAudit({
    companyId: session.companyId,
    userId: session.sub,
    action: "declaration.submit_review",
    entity: "declaration",
    entityId: declaration.id,
    before: { status: "generated" },
    after: { status: "accountant_review" },
  });
  return updated;
}

/** اعتماد/رفض المحاسب (declarations.review) — لا تصدير قبل الاعتماد (SPEC §4.6) */
export async function reviewDeclaration(
  session: Session,
  declarationId: string,
  decision: "approved" | "rejected",
  note?: string
) {
  if (session.role !== "accountant" && session.role !== "super_admin") {
    fail(403, "forbidden");
  }
  const declaration = await getOwnedDeclaration(session, declarationId);
  if (declaration.status !== "accountant_review") fail(422, "declaration_not_in_review");
  if (decision === "rejected" && (!note || note.trim() === "")) fail(422, "rejection_note_required");

  const data =
    decision === "approved"
      ? { status: "approved", approvedBy: session.sub, approvedAt: new Date(), reviewNote: note ?? null, reviewedBy: session.sub, reviewedAt: new Date() }
      : { status: "rejected", reviewNote: note ?? null, reviewedBy: session.sub, reviewedAt: new Date() };

  const updated = await db.declaration.update({ where: { id: declaration.id }, data });

  await writeAudit({
    companyId: session.companyId,
    userId: session.sub,
    action: `declaration.${decision}`,
    entity: "declaration",
    entityId: declaration.id,
    before: { status: "accountant_review" },
    after: { status: decision, note: note ?? null },
  });
  return updated;
}

/** تصدير الملف الرسمي (المحاسب): نسخة ثابتة + SHA-256 — بعد الاعتماد فقط */
export async function exportDeclarationFile(session: Session, declarationId: string) {
  if (session.role !== "accountant" && session.role !== "super_admin") {
    fail(403, "forbidden");
  }
  const declaration = await getOwnedDeclaration(session, declarationId);
  if (declaration.status !== "approved" && declaration.status !== "exported") {
    // SPEC §4.6: لا يخرج ملف رسمي قبل اعتماد المحاسب
    fail(422, "declaration_not_approved");
  }

  const existing = await db.declarationFile.findFirst({ where: { declarationId: declaration.id } });
  if (existing) {
    // الملف الثابت لا يُعاد توليده — يُعاد تسليمه كما هو (وثيقة قانونية)
    return { file: existing, content: null as string | null };
  }

  const spec = declaration.spec;
  const year = Number(declaration.periodKey.slice(0, 4));
  const month = declaration.periodId !== null
    ? (await db.payPeriod.findUnique({ where: { id: declaration.periodId } }))?.month ?? null
    : null;
  const ctx: DeclarationContext =
    declaration.kind === "neant"
      ? {
          companyCnssNumber: (await db.company.findUnique({ where: { id: session.companyId } }))?.cnssNumber ?? null,
          companyLegalName: session.companyName,
          companyTaxId: (await db.company.findUnique({ where: { id: session.companyId } }))?.taxId ?? null,
          periodKey: declaration.periodKey,
          periodYear: year,
          periodMonth: month,
          workers: [],
        }
      : await buildDeclarationContext(session, year, month);

  let content: string;
  if (declaration.authority === "cnss") {
    const layout = JSON.parse(spec.layoutJson ?? "null") as EbdsLayout | null;
    if (!layout) fail(422, "spec_layout_missing");
    content = renderEbdsLayout(layout, ctx);
  } else {
    const mapping = JSON.parse(spec.mappingJson ?? "null") as XmlMapping | null;
    if (!mapping) fail(422, "spec_mapping_missing");
    const built = buildXmlFromMapping(mapping, ctx);
    if (built.missing.length > 0) fail(422, "missing_mapping_value", { missing: built.missing });
    const xsdModel = parseXsd(spec.xsdContent ?? "");
    const issues = validateXmlAgainstXsd(built.xml, xsdModel);
    if (issues.length > 0) fail(422, "xsd_validation_failed", { issues });
    content = built.xml;
  }

  const file = await db.declarationFile.create({
    data: {
      declarationId: declaration.id,
      content,
      sha256: sha256(content),
      specVersion: spec.version,
      format: declaration.authority === "cnss" ? "ebds" : "xml",
      sizeBytes: Buffer.byteLength(content, "utf8"),
      exportedBy: session.sub,
    },
  });
  await db.declaration.update({
    where: { id: declaration.id },
    data: { status: "exported", exportedBy: session.sub, exportedAt: new Date() },
  });

  await writeAudit({
    companyId: session.companyId,
    userId: session.sub,
    action: "declaration.export",
    entity: "declaration",
    entityId: declaration.id,
    before: { status: declaration.status },
    after: { status: "exported", sha256: file.sha256, specVersion: spec.version },
  });
  return { file, content };
}

/** قراءة محتوى ملف مُصدَّر (المحاسب فقط — بيانات حساسة) */
export async function getDeclarationFileContent(session: Session, declarationId: string) {
  if (session.role !== "accountant" && session.role !== "super_admin") {
    fail(403, "forbidden");
  }
  const declaration = await getOwnedDeclaration(session, declarationId);
  const file = await db.declarationFile.findFirst({ where: { declarationId: declaration.id } });
  if (!file) fail(404, "file_not_exported");
  return file;
}

/** تسجيل الإيداع اليدوي + إشعار الاستلام (SPEC §4.6) */
export const fileDeclarationSchema = z.object({
  filedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  filedRef: z.string().max(120).optional(),
  receiptB64: z.string().optional(),
});

export async function fileDeclaration(session: Session, declarationId: string, input: z.infer<typeof fileDeclarationSchema>) {
  if (session.role !== "accountant" && session.role !== "super_admin") {
    fail(403, "forbidden");
  }
  const declaration = await getOwnedDeclaration(session, declarationId);
  if (declaration.status !== "exported" && declaration.status !== "filed") fail(422, "declaration_not_exported");

  const receipt = await db.declarationReceipt.create({
    data: {
      declarationId: declaration.id,
      filedAt: new Date(`${input.filedAt}T00:00:00Z`),
      filedRef: input.filedRef,
      receiptB64: input.receiptB64,
      uploadedBy: session.sub,
    },
  });
  const updated = await db.declaration.update({
    where: { id: declaration.id },
    data: { status: "filed", filedAt: receipt.filedAt, filedRef: input.filedRef ?? null },
  });

  await writeAudit({
    companyId: session.companyId,
    userId: session.sub,
    action: "declaration.file",
    entity: "declaration",
    entityId: declaration.id,
    before: { status: declaration.status },
    after: { status: "filed", filedRef: input.filedRef ?? null },
  });
  return { declaration: updated, receipt };
}

// ── المواعيد والتنبيهات (SPEC §4.6: تذكير قبل 10 الشهر الموالي و28 فبراير) ──

export async function getDeadlineStatus(session: Session) {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;

  // CNSS الشهري: قبل 10 من الشهر الموالي لآخر فترة أجور
  const lastPeriod = await db.payPeriod.findFirst({
    where: { companyId: session.companyId, status: "approved" },
    orderBy: [{ year: "desc" }, { month: "desc" }],
  });
  const deadlines: { authority: string; kind: string; periodKey: string; dueDate: string; status: string; lateFeeNote: boolean }[] = [];

  if (lastPeriod) {
    const nextMonth = lastPeriod.month === 12 ? 1 : lastPeriod.month + 1;
    const nextYear = lastPeriod.month === 12 ? lastPeriod.year + 1 : lastPeriod.year;
    const due = `${nextYear}-${String(nextMonth).padStart(2, "0")}-10`;
    const declaration = await db.declaration.findFirst({
      where: { companyId: session.companyId, authority: "cnss", periodKey: `${lastPeriod.year}-${String(lastPeriod.month).padStart(2, "0")}`, status: { in: ["filed"] } },
    });
    deadlines.push({
      authority: "cnss",
      kind: "monthly",
      periodKey: `${lastPeriod.year}-${String(lastPeriod.month).padStart(2, "0")}`,
      dueDate: due,
      status: declaration ? "filed" : now > new Date(`${due}T00:00:00Z`) ? "late" : "due_soon",
      lateFeeNote: now > new Date(`${due}T00:00:00Z`),
    });
  }

  // DGI السنوي (9421): قبل 1 مارس من السنة الموالية
  const annualDecl = await db.declaration.findFirst({
    where: { companyId: session.companyId, authority: "dgi", kind: "annual_9421", periodKey: `${year - 1}` },
  });
  if (annualDecl || year > 2026) {
    deadlines.push({
      authority: "dgi",
      kind: "annual_9421",
      periodKey: `${year - 1}`,
      dueDate: `${year}-03-01`,
      status: annualDecl?.status === "filed" ? "filed" : now > new Date(`${year}-03-01T00:00:00Z`) ? "late" : "due_soon",
      lateFeeNote: now > new Date(`${year}-03-01T00:00:00Z`),
    });
  }

  return { today: now.toISOString().slice(0, 10), deadlines };
}

// ── منح المحاسب الخارجي (SPEC §3.3: صريحة، مؤقتة، قابلة للسحب) ──

export const createGrantSchema = z.object({
  userId: z.string(),
  mode: z.enum(["internal", "external"]).default("external"),
  startsAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endsAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export async function listGrants(session: Session) {
  const rows = await db.accountantGrant.findMany({
    where: { companyId: session.companyId },
    orderBy: { createdAt: "desc" },
    include: { user: { select: { id: true, fullName: true, email: true } } },
  });
  return rows.map((r) => ({
    id: r.id,
    userId: r.userId,
    userName: r.user.fullName,
    userEmail: r.user.email,
    mode: r.mode,
    startsAt: r.startsAt,
    endsAt: r.endsAt,
    revokedAt: r.revokedAt,
    grantedBy: r.grantedBy,
    createdAt: r.createdAt,
    active: r.revokedAt === null && r.startsAt.getTime() <= Date.now() && (!r.endsAt || r.endsAt.getTime() >= Date.now()),
  }));
}

/** منح محاسب خارجي: يُنشئ عضوية accountant مؤقتة تُراجَع عند كل دخول (أو منحة موثقة لمحاسب داخلي) */
export async function createGrant(session: Session, input: z.infer<typeof createGrantSchema>) {
  if (session.role !== "admin" && session.role !== "super_admin") {
    fail(403, "forbidden");
  }
  const user = await db.user.findUnique({ where: { id: input.userId } });
  if (!user) fail(404, "user_not_found");
  const membership = await db.userMembership.findFirst({
    where: { companyId: session.companyId, userId: input.userId },
  });
  if (!membership) {
    // عضوية المحاسب تُنشأ بدور accountant (إن لم تكن لديه عضوية أخرى)
    await db.userMembership.create({
      data: {
        userId: input.userId,
        companyId: session.companyId,
        role: "accountant",
      },
    });
  } else if (membership.role !== "accountant") {
    fail(422, "user_has_other_role");
  }

  const grant = await db.accountantGrant.create({
    data: {
      companyId: session.companyId,
      userId: input.userId,
      mode: input.mode,
      grantedBy: session.sub,
      startsAt: new Date(`${input.startsAt}T00:00:00Z`),
      endsAt: input.endsAt ? new Date(`${input.endsAt}T00:00:00Z`) : null,
    },
  });
  await writeAudit({
    companyId: session.companyId,
    userId: session.sub,
    action: "accountant_grant.create",
    entity: "accountant_grant",
    entityId: grant.id,
    before: null,
    after: { userId: input.userId, mode: input.mode, startsAt: input.startsAt, endsAt: input.endsAt ?? null },
  });
  return grant;
}

/** سحب المنحة: يبطل العضوية أيضًا إن كانت منحًا خارجيًا بلا منحات سارية أخرى */
export async function revokeGrant(session: Session, grantId: string) {
  if (session.role !== "admin" && session.role !== "super_admin") {
    fail(403, "forbidden");
  }
  const grant = await db.accountantGrant.findFirst({ where: { id: grantId, companyId: session.companyId } });
  if (!grant) fail(404, "grant_not_found");
  if (grant.revokedAt) fail(422, "grant_already_revoked");

  const updated = await db.accountantGrant.update({
    where: { id: grant.id },
    data: { revokedAt: new Date() },
  });

  // هل بقيت منحة سارية؟ إن لا والعضوية دورها accountant → تُسحب العضوية
  const remaining = await db.accountantGrant.findFirst({
    where: {
      companyId: session.companyId,
      userId: grant.userId,
      revokedAt: null,
      startsAt: { lte: new Date() },
      OR: [{ endsAt: null }, { endsAt: { gte: new Date() } }],
    },
  });
  if (!remaining) {
    await db.userMembership.updateMany({
      where: { companyId: session.companyId, userId: grant.userId, role: "accountant" },
      data: { revokedAt: new Date() },
    });
  }

  await writeAudit({
    companyId: session.companyId,
    userId: session.sub,
    action: "accountant_grant.revoke",
    entity: "accountant_grant",
    entityId: grant.id,
    before: { revokedAt: null },
    after: { revokedAt: updated.revokedAt, membershipRevoked: !remaining },
  });
  return updated;
}
