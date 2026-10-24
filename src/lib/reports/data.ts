// HRMP — بُناة بيانات المستندات (SPEC §4.4.1 — المرحلة 7)
// القاعدة الذهبية: القسيمة والملخصات تُبنى من snapshotJson المجمدة للكشوف المعتمدة —
// «التصدير يخضع للعملة والقواعد المعتمدة في وقت الفترة لا الحالية» (SPEC §4.4.1)
import { db } from "@/lib/db";
import { localizedName } from "@/lib/localized-name";
import { getPlatformBranding } from "@/lib/branding";
import type {
  AttendanceReportData,
  AttendanceRow,
  ComplianceReportData,
  DeclarationsSummaryReportData,
  PayrollSummaryReportData,
  PayslipReportData,
  PlatformSummaryReportData,
  ReportBranding,
  ReportCompany,
  ReportLine,
  ReportWorker,
  SummaryWorkerRow,
} from "./types";

class ReportDataError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "ReportDataError";
    this.status = status;
  }
}

export { ReportDataError };

type CompanyRow = {
  id: string;
  legalName: string;
  names?: string | null;
  tradeName: string | null;
  taxId: string | null;
  cnssNumber: string | null;
  currency: string;
};

function reportCompany(c: CompanyRow, language?: string): ReportCompany {
  return {
    legalName: (language ? localizedName(c, language, "legalName") : c.legalName),
    tradeName: c.tradeName,
    taxId: c.taxId,
    cnssNumber: c.cnssNumber,
    currency: c.currency || "MAD",
  };
}

/** هوية مالك المنصة لكل مستند (white-label — SPEC §3.2): تدخل بيانات المستند
 * فتدخل بصمة المحتوى — تغيّر الهوية = إصدار جديد، والقديم ثابت للتدقيق */
async function reportBranding(): Promise<ReportBranding> {
  const b = await getPlatformBranding();
  return {
    legalName: b.legalName,
    displayName: b.displayName,
    contactEmail: b.contactEmail,
    contactPhone: b.contactPhone,
    websiteUrl: b.websiteUrl,
    footerText: b.footerText,
    termsUrl: b.termsUrl,
  };
}

function periodKeyOf(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

type SnapshotLine = {
  kind: string;
  label?: string | null;
  minutes: number | null;
  rateBp: number | null;
  amountCents: number;
  reason?: string | null;
};

type Snapshot = {
  totals: Record<string, number>;
  lines: SnapshotLine[];
  frozenAt?: string;
};

function parseSnapshot(raw: string | null | undefined, refNumber: string): Snapshot {
  if (!raw) throw new ReportDataError(409, "payslip_not_frozen");
  try {
    const parsed = JSON.parse(raw) as Snapshot;
    if (!parsed || !parsed.totals || !Array.isArray(parsed.lines)) {
      throw new Error("bad shape");
    }
    return parsed;
  } catch {
    throw new ReportDataError(500, `snapshot_corrupt:${refNumber}`);
  }
}

// ─── قسيمة الأجر ──────────────────────────────────────────────

export async function buildPayslipReportData(
  companyId: string,
  payslipId: string,
  language?: string
): Promise<PayslipReportData> {
  const payslip = await db.payslip.findFirst({
    where: { id: payslipId, companyId },
    include: {
      period: true,
      worker: { select: { id: true, fullName: true, names: true } }, // names: اسم العامل يتبع لغة الوثيقة (بلاغ المالك 2026-10-23)
    },
  });
  if (!payslip) throw new ReportDataError(404, "payslip_not_found");
  if (payslip.period.status !== "approved") {
    // «المستندات المعتمدة لا تتغيّر بعد توليدها» — لا قسيمة إلا عن فترة معتمدة
    throw new ReportDataError(422, "period_not_approved");
  }

  const [company, profile] = await Promise.all([
    db.company.findUnique({ where: { id: companyId } }),
    db.employeeProfile.findFirst({ where: { companyId, userId: payslip.workerUserId } }),
  ]);
  if (!company) throw new ReportDataError(404, "company_not_found");

  const snap = parseSnapshot(payslip.snapshotJson, payslip.refNumber);
  const t = snap.totals;

  const worker: ReportWorker = {
    fullName: localizedName(payslip.worker, language ?? "ar", "fullName"),
    cin: profile?.cin ?? null,
    cnssNumber: profile?.cnssNumber ?? null,
    payType: profile?.payType ?? "hourly",
    dependentsCount: profile?.dependentsCount ?? 0,
  };

  const lines: ReportLine[] = snap.lines.map((l) => ({
    kind: l.kind,
    label: l.label ?? null,
    minutes: l.minutes ?? null,
    rateBp: l.rateBp ?? null,
    amountCents: l.amountCents,
    reason: l.reason ?? null,
  }));

  return {
    kind: "payslip",
    branding: await reportBranding(),
    payslipId: payslip.id,
    refNumber: payslip.refNumber,
    periodLabel: periodKeyOf(payslip.period.year, payslip.period.month),
    periodStatus: payslip.period.status,
    frozenAt: snap.frozenAt ?? null,
    company: reportCompany(company, language),
    worker,
    totals: {
      workedMinutes: t.workedMinutes ?? payslip.workedMinutes,
      breakMinutes: t.breakMinutes ?? payslip.breakMinutes,
      overtimeMinutes: t.overtimeMinutes ?? payslip.overtimeMinutes,
      workedDays: t.workedDays ?? payslip.workedDays,
      grossCents: t.grossCents ?? payslip.grossCents,
      cnssEmployeeCents: t.cnssEmployeeCents ?? payslip.cnssEmployeeCents,
      amoEmployeeCents: t.amoEmployeeCents ?? payslip.amoEmployeeCents,
      irNetCents: t.irNetCents ?? payslip.irNetCents,
      netCents: t.netCents ?? payslip.netCents,
      employerCostCents: t.employerCostCents ?? payslip.employerCostCents,
      totalCostCents: t.totalCostCents ?? payslip.totalCostCents,
    },
    lines,
    smigBreached: payslip.smigBreached,
  };
}

// ─── ملخص أجور الفترة ─────────────────────────────────────────

export async function buildPayrollSummaryData(
  companyId: string,
  periodId: string,
  language?: string
): Promise<PayrollSummaryReportData> {
  const period = await db.payPeriod.findFirst({ where: { id: periodId, companyId } });
  if (!period) throw new ReportDataError(404, "period_not_found");
  if (period.status !== "approved") throw new ReportDataError(422, "period_not_approved");

  const [company, payslips] = await Promise.all([
    db.company.findUnique({ where: { id: companyId } }),
    db.payslip.findMany({
      where: { periodId: period.id, companyId },
      include: { worker: { select: { fullName: true, names: true } } },
      orderBy: { refNumber: "asc" },
    }),
  ]);
  if (!company) throw new ReportDataError(404, "company_not_found");

  const rows: SummaryWorkerRow[] = [];
  const totals = {
    workedMinutes: 0,
    overtimeMinutes: 0,
    grossCents: 0,
    sbiCents: 0,
    cnssEmployeeCents: 0,
    amoEmployeeCents: 0,
    irNetCents: 0,
    netCents: 0,
    employerCostCents: 0,
    totalCostCents: 0,
  };

  for (const ps of payslips) {
    const snap = parseSnapshot(ps.snapshotJson, ps.refNumber);
    const t = snap.totals;
    rows.push({
      fullName: localizedName(ps.worker, language ?? "ar", "fullName"),
      refNumber: ps.refNumber,
      workedMinutes: t.workedMinutes ?? ps.workedMinutes,
      overtimeMinutes: t.overtimeMinutes ?? ps.overtimeMinutes,
      grossCents: t.grossCents ?? ps.grossCents,
      cnssEmployeeCents: t.cnssEmployeeCents ?? ps.cnssEmployeeCents,
      amoEmployeeCents: t.amoEmployeeCents ?? ps.amoEmployeeCents,
      irNetCents: t.irNetCents ?? ps.irNetCents,
      netCents: t.netCents ?? ps.netCents,
    });
    totals.workedMinutes += t.workedMinutes ?? ps.workedMinutes;
    totals.overtimeMinutes += t.overtimeMinutes ?? ps.overtimeMinutes;
    totals.grossCents += t.grossCents ?? ps.grossCents;
    totals.sbiCents += t.sbiCents ?? ps.sbiCents;
    totals.cnssEmployeeCents += t.cnssEmployeeCents ?? ps.cnssEmployeeCents;
    totals.amoEmployeeCents += t.amoEmployeeCents ?? ps.amoEmployeeCents;
    totals.irNetCents += t.irNetCents ?? ps.irNetCents;
    totals.netCents += t.netCents ?? ps.netCents;
    totals.employerCostCents += t.employerCostCents ?? ps.employerCostCents;
    totals.totalCostCents += t.totalCostCents ?? ps.totalCostCents;
  }

  return {
    kind: "payroll_summary",
    branding: await reportBranding(),
    periodId: period.id,
    periodLabel: periodKeyOf(period.year, period.month),
    periodStatus: period.status,
    company: reportCompany(company, language),
    workersCount: payslips.length,
    totals,
    rows,
  };
}

// ─── بيان الحضور/الساعات (بلا أرقام أجر) ─────────────────────

export async function buildAttendanceReportData(
  companyId: string,
  targetUserId: string,
  year: number,
  month: number,
  kind: "attendance_statement" | "hours_statement",
  siteIds?: string[], // نطاق مواقع co_admin (null = كامل الشركة)
  language?: string
): Promise<AttendanceReportData> {
  const [company, worker] = await Promise.all([
    db.company.findUnique({ where: { id: companyId } }),
    db.user.findFirst({
      where: { id: targetUserId },
      include: { memberships: { where: { companyId }, select: { id: true } } },
    }),
  ]);
  if (!company || !worker || worker.memberships.length === 0) {
    throw new ReportDataError(404, "worker_not_in_company");
  }

  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1));

  const events = await db.attendanceEvent.findMany({
    where: {
      companyId,
      workerUserId: targetUserId,
      occurredAt: { gte: start, lt: end },
      type: { in: ["check_in", "check_out"] },
      status: { in: ["verified", "pending_review"] },
      ...(siteIds ? { siteId: { in: siteIds } } : {}),
    },
    orderBy: { occurredAt: "asc" },
  });

  // تجميع الأحداث إلى أيام محلية (UTC هنا لأن التخزين UTC والحدود شهرية UTC — متسق مع بيانات العرض)
  const byDay = new Map<string, { firstIn: Date | null; lastOut: Date | null; minutes: number }>();
  for (const ev of events) {
    const dayKey = ev.occurredAt.toISOString().slice(0, 10);
    const entry = byDay.get(dayKey) ?? { firstIn: null, lastOut: null, minutes: 0 };
    if (ev.type === "check_in" && !entry.firstIn) entry.firstIn = ev.occurredAt;
    if (ev.type === "check_out") entry.lastOut = ev.occurredAt;
    byDay.set(dayKey, entry);
  }
  // صافي الدقائق: من أول دخول إلى آخر انصراف لكل يوم
  for (const [dayKey, entry] of byDay) {
    if (entry.firstIn && entry.lastOut && entry.lastOut > entry.firstIn) {
      entry.minutes = Math.round((entry.lastOut.getTime() - entry.firstIn.getTime()) / 60000);
    }
    byDay.set(dayKey, entry);
  }

  const rows: AttendanceRow[] = [];
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  for (let d = 1; d <= daysInMonth; d++) {
    const dayKey = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const entry = byDay.get(dayKey);
    if (!entry) continue; // أيام بلا أي حدث لا تظهر (بلا حضور مُسجَّل)
    const hasIn = entry.firstIn !== null;
    const hasOut = entry.lastOut !== null;
    rows.push({
      localDate: dayKey,
      inLabel: hasIn ? entry.firstIn!.toISOString().slice(11, 16) : null,
      outLabel: hasOut ? entry.lastOut!.toISOString().slice(11, 16) : null,
      minutes: entry.minutes,
      status: hasIn && hasOut ? "done" : hasIn ? "partial" : "absent",
    });
  }

  const presentDays = rows.filter((r) => r.status !== "absent").length;

  return {
    kind,
    branding: await reportBranding(),
    targetUserId,
    workerName: localizedName(worker, language ?? "ar", "fullName"),
    rangeLabel: periodKeyOf(year, month),
    company: reportCompany(company, language),
    rows,
    totals: {
      days: rows.length,
      presentDays,
      totalMinutes: rows.reduce((a, r) => a + r.minutes, 0),
      lateCount: 0, // التأخير يقاس مقابل الجدولة — يُستكمل عند ربط الجدولة (موثَّق)
    },
  };
}

// ─── ملخص التصاريح (المحاسب) ──────────────────────────────────

export async function buildDeclarationsSummaryData(
  companyId: string,
  language?: string
): Promise<DeclarationsSummaryReportData> {
  const [company, declarations] = await Promise.all([
    db.company.findUnique({ where: { id: companyId } }),
    db.declaration.findMany({
      where: { companyId },
      orderBy: [{ authority: "asc" }, { periodKey: "desc" }],
      include: { spec: { select: { version: true } } },
    }),
  ]);
  if (!company) throw new ReportDataError(404, "company_not_found");

  let lastPeriod = "—";
  const rows = declarations.map((d) => {
    if (d.periodKey && d.periodKey !== "—") lastPeriod = d.periodKey;
    let summary: Record<string, number> | null = null;
    if (d.summaryJson) {
      try {
        const parsed = JSON.parse(d.summaryJson);
        summary = parsed?.totals ?? parsed ?? null;
      } catch {
        summary = null;
      }
    }
    return {
      authority: d.authority,
      kind: d.kind,
      periodKey: d.periodKey,
      status: d.status,
      grossCents: summary?.grossCents ?? null,
      irNetCents: summary?.irNetCents ?? null,
      netCents: summary?.netCents ?? null,
      specVersion: d.spec?.version ?? null,
      exportedAt: d.exportedAt ? d.exportedAt.toISOString() : null,
    };
  });

  return {
    kind: "declarations_summary",
    branding: await reportBranding(),
    company: reportCompany(company, language),
    periodLabel: lastPeriod,
    rows,
  };
}

// ─── تقرير المطابقة (SPEC §4.6: مع كل تصريح) ──────────────────

export async function buildComplianceReportData(
  companyId: string,
  declarationId: string,
  language?: string
): Promise<ComplianceReportData> {
  const declaration = await db.declaration.findFirst({
    where: { id: declarationId, companyId },
    include: {
      spec: { select: { version: true } },
      files: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
  if (!declaration) throw new ReportDataError(404, "declaration_not_found");
  if (!["approved", "exported", "filed"].includes(declaration.status)) {
    // التقرير يقارن ملفًا رسميًا معتمدًا — لا معنى له قبل الاعتماد
    throw new ReportDataError(422, "declaration_not_approved");
  }

  const [company, period] = await Promise.all([
    db.company.findUnique({ where: { id: companyId } }),
    declaration.periodId
      ? db.payPeriod.findFirst({ where: { id: declaration.periodId, companyId } })
      : null,
  ]);
  if (!company) throw new ReportDataError(404, "company_not_found");

  // إجماليات كشوف الفترة المعتمدة
  const payslipTotals = {
    workers: 0,
    grossCents: 0,
    cnssBaseCents: 0,
    cnssEmployeeCents: 0,
    amoEmployeeCents: 0,
    irNetCents: 0,
    netCents: 0,
  };
  if (period && period.status === "approved") {
    const payslips = await db.payslip.findMany({
      where: { periodId: period.id, companyId },
      select: {
        grossCents: true,
        cnssBaseCents: true,
        cnssEmployeeCents: true,
        amoEmployeeCents: true,
        irNetCents: true,
        netCents: true,
      },
    });
    payslipTotals.workers = payslips.length;
    for (const ps of payslips) {
      payslipTotals.grossCents += ps.grossCents;
      payslipTotals.cnssBaseCents += ps.cnssBaseCents;
      payslipTotals.cnssEmployeeCents += ps.cnssEmployeeCents;
      payslipTotals.amoEmployeeCents += ps.amoEmployeeCents;
      payslipTotals.irNetCents += ps.irNetCents;
      payslipTotals.netCents += ps.netCents;
    }
  }

  // إجماليات التصريح من summaryJson (كما وُلِّدت في ملفه الرسمي)
  const declarationTotals = {
    workers: null as number | null,
    grossCents: null as number | null,
    cnssEmployeeCents: null as number | null,
    amoEmployeeCents: null as number | null,
    irNetCents: null as number | null,
    netCents: null as number | null,
  };
  if (declaration.summaryJson) {
    try {
      const parsed = JSON.parse(declaration.summaryJson);
      const t = parsed?.totals ?? parsed ?? {};
      declarationTotals.workers = typeof t.workers === "number" ? t.workers : null;
      declarationTotals.grossCents = typeof t.grossCents === "number" ? t.grossCents : null;
      declarationTotals.cnssEmployeeCents =
        typeof t.cnssEmployeeCents === "number" ? t.cnssEmployeeCents : null;
      declarationTotals.amoEmployeeCents = typeof t.amoEmployeeCents === "number" ? t.amoEmployeeCents : null;
      declarationTotals.irNetCents = typeof t.irNetCents === "number" ? t.irNetCents : null;
      declarationTotals.netCents = typeof t.netCents === "number" ? t.netCents : null;
    } catch {
      /* ملخص غير قابل للتحليل — يظهر كفرق غير متاح */
    }
  }

  const fields: { key: string; ps: number; decl: number | null }[] = [
    { key: "workers", ps: payslipTotals.workers, decl: declarationTotals.workers },
    { key: "grossCents", ps: payslipTotals.grossCents, decl: declarationTotals.grossCents },
    { key: "cnssEmployeeCents", ps: payslipTotals.cnssEmployeeCents, decl: declarationTotals.cnssEmployeeCents },
    { key: "amoEmployeeCents", ps: payslipTotals.amoEmployeeCents, decl: declarationTotals.amoEmployeeCents },
    { key: "irNetCents", ps: payslipTotals.irNetCents, decl: declarationTotals.irNetCents },
    { key: "netCents", ps: payslipTotals.netCents, decl: declarationTotals.netCents },
  ];
  const diffs = fields
    .filter((f) => f.decl !== null)
    .map((f) => ({
      field: f.key,
      payslipCents: f.ps,
      declarationCents: f.decl,
      diffCents: (f.decl as number) - f.ps,
    }));

  const authorityLabel =
    declaration.authority === "cnss" ? "CNSS" : declaration.authority === "dgi" ? "DGI" : declaration.authority;

  return {
    kind: "compliance_report",
    branding: await reportBranding(),
    declarationId: declaration.id,
    declarationLabel: `${authorityLabel} — ${declaration.periodKey}`,
    authority: declaration.authority,
    status: declaration.status,
    company: reportCompany(company, language),
    periodLabel: period ? periodKeyOf(period.year, period.month) : declaration.periodKey,
    payslipTotals,
    declarationTotals,
    diffs,
    fileHash: declaration.files[0]?.sha256 ?? null,
    specVersion: declaration.spec?.version ?? null,
  };
}

// ─── ملخص المنصة (super_admin) ────────────────────────────────

export async function buildPlatformSummaryData(language?: string): Promise<PlatformSummaryReportData> {
  const companies = await db.company.findMany({
    where: { status: "active" },
    select: {
      id: true,
      legalName: true,
      names: true,
      _count: { select: { employeeProfiles: true } },
      payPeriods: {
        where: { status: "approved" },
        select: {
          id: true,
          year: true,
          month: true,
          approvedAt: true,
          payslips: {
            select: { netCents: true, totalCostCents: true },
          },
        },
        orderBy: [{ year: "desc" }, { month: "desc" }],
      },
    },
    orderBy: { legalName: "asc" },
  });

  const rows = companies.map((c) => {
    let netCents = 0;
    let totalCostCents = 0;
    let payslipsCount = 0;
    for (const p of c.payPeriods) {
      for (const ps of p.payslips) {
        netCents += ps.netCents;
        totalCostCents += ps.totalCostCents;
        payslipsCount++;
      }
    }
    const last = c.payPeriods[0];
    return {
      legalName: localizedName(c, language ?? "ar", "legalName"),
      workersCount: c._count.employeeProfiles,
      approvedPeriods: c.payPeriods.length,
      payslipsCount,
      netCents,
      totalCostCents,
      lastApprovedLabel: last ? periodKeyOf(last.year, last.month) : null,
    };
  });

  return {
    kind: "platform_summary",
    branding: await reportBranding(),
    companiesCount: companies.length,
    activeCompaniesCount: companies.length,
    rows,
  };
}
