// HRMP — خدمة الأجور (SPEC §4.3 و§8 — المرحلة 6أ+6ب): التنسيق بين المحرك النقي وقاعدة البيانات
// دورة الاعتماد: مسودة → مراجعة → معتمد (admin) — بعد الاعتماد يُقفل الكشف ولا يُعدَّل إلا بقيد
// تصحيح جديد في فترة لاحقة (قرار موثَّق)؛ قيود الدفتر append-only عند الاعتماد فقط.
// القرار الحاسم (يمنع الاعتماد): SMIG مُخترق (SPEC §11.2) أو قاعدة أجور غير موثقة من المحاسب.
import { z } from "zod";
import { db } from "@/lib/db";
import type { SessionPayload } from "@/lib/auth/jwt";
import { zonedToUtc } from "@/lib/scheduling";
import { writeAudit } from "@/lib/audit";
import { createNotification } from "@/lib/notifications";
import { buildRuleSet, ENGINE_RULE_KEYS, type RawPayRule } from "./rules";
import { computeWorkedTime } from "./hours";
import { computePayslip } from "./compute";
import {
  buildRegimeDefinition,
  generalRegimeFromRules,
  InvalidRegimeError,
  type RawCalcStepRow,
  type RawContributionRow,
  type RawRegimeRow,
  type RegimeDefinition,
} from "./regime";
import type {
  ComputedLine,
  ComputeInput,
  DayBreakdownRow,
  EmployeeInput,
  ManualLineInput,
  PayRuleSet,
  PayType,
} from "./types";
import { MissingPayRuleError, TRANSPORT_ZONES } from "./types";

type Session = SessionPayload & { companyTimezone: string };

function fail(status: number, code: string, extra?: Record<string, unknown>): never {
  throw Object.assign(new Error(code), { status, ...(extra ?? {}) });
}

const pad2 = (n: number) => String(n).padStart(2, "0");
export const periodLabel = (year: number, month: number) => `${year}-${pad2(month)}`;

/** نافذة الفترة بتوقيت الشركة: أول الشهر → أول الشهر الموالي (UTC) */
function periodWindow(year: number, month: number, tz: string) {
  const startLocal = `${year}-${pad2(month)}-01`;
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  const endLocal = `${nextYear}-${pad2(nextMonth)}-01`;
  return {
    startLocal,
    endLocal,
    startUtc: zonedToUtc(startLocal, 0, tz),
    endUtc: zonedToUtc(endLocal, 0, tz),
  };
}

/** إعدادات الشركة (restDay + monthlyHoursDivisor) — تُنشأ إن لم توجد (قيم افتراضية المخطط) */
async function ensureSettings(companyId: string) {
  const existing = await db.companySettings.findUnique({ where: { companyId } });
  if (existing) return existing;
  return db.companySettings.create({ data: { companyId } });
}

/** حل قواعد الأجور السارية عند لحظة — قواعد الشركة أولًا ثم المنصة (بيانات لا كود) */
export async function resolvePayRules(companyId: string, at: Date): Promise<PayRuleSet> {
  const rows = await db.payRule.findMany({
    where: {
      key: { in: [...ENGINE_RULE_KEYS] },
      OR: [{ companyId: null }, { companyId }],
    },
    orderBy: { effectiveFrom: "asc" },
  });
  const raw: RawPayRule[] = rows.map((r) => ({
    companyId: r.companyId,
    key: r.key,
    valueInt: r.valueInt,
    valueText: r.valueText,
    unit: r.unit,
    effectiveFrom: r.effectiveFrom,
    source: r.source,
    verifiedBy: r.verifiedBy,
  }));
  return buildRuleSet(raw, at, companyId);
}

// ── حل مسار العامل (SPEC §12 — المرحلة 6ج) ─────────────────────

export type WorkerRegimeResolution = {
  regime: RegimeDefinition;
  changedMidPeriod: boolean; // انتقال بين مسارين داخل الفترة (SPEC §12: يقسم الشهر — تحذير في 6ج)
};

/** آخر إسناد ساري للعامل — أو المسار العام (قالب المنصة ← بذور ← fallback من القواعد) */
export async function resolveWorkerRegime(
  companyId: string,
  workerUserId: string,
  window: { startUtc: Date; endUtc: Date }
): Promise<WorkerRegimeResolution> {
  const assignments = await db.regimeAssignment.findMany({
    where: {
      companyId,
      workerUserId,
      effectiveFrom: { lt: window.endUtc },
      OR: [{ endedAt: null }, { endedAt: { gt: window.startUtc } }],
    },
    orderBy: { effectiveFrom: "asc" },
    include: { regime: true },
  });

  // المسار الساري عند بداية الفترة (SPEC §4.4.1: قواعد بداية الفترة)
  let applicable = assignments
    .filter((a) => a.effectiveFrom.getTime() <= window.startUtc.getTime())
    .pop() ?? null;
  if (!applicable && assignments.length > 0) {
    // إسناد بدأ داخل الفترة (انتقال) — يُحسب عليه المسار الجديد مع تحذير تقسيم الشهر
    applicable = assignments[0];
  }
  const changedMidPeriod = assignments.some(
    (a) => a.effectiveFrom.getTime() > window.startUtc.getTime() && a.effectiveFrom.getTime() < window.endUtc.getTime()
  );

  let regimeRow: RawRegimeRow | null = null;
  let contributions: RawContributionRow[] = [];
  let steps: RawCalcStepRow[] = [];

  if (applicable) {
    regimeRow = applicable.regime as unknown as RawRegimeRow;
    const items = await db.regimeContributionItem.findMany({ where: { regimeId: applicable.regimeId } });
    const stepRows = await db.regimeCalcStep.findMany({ where: { regimeId: applicable.regimeId } });
    contributions = items as unknown as RawContributionRow[];
    steps = stepRows as unknown as RawCalcStepRow[];
  } else {
    // لا إسناد → قالب المسار العام للمنصة (سلوك متوافق مع 6أ/6ب قبل بذور المسارات)
    const platformGeneral = await db.payRegime.findFirst({
      where: { companyId: null, key: "general", isActive: true },
      include: { contributionItems: true, calcSteps: true },
      orderBy: { version: "desc" },
    });
    if (platformGeneral) {
      regimeRow = platformGeneral as unknown as RawRegimeRow;
      contributions = platformGeneral.contributionItems as unknown as RawContributionRow[];
      steps = platformGeneral.calcSteps as unknown as RawCalcStepRow[];
    }
  }

  const rules = await resolvePayRules(companyId, window.startUtc);
  if (!regimeRow) {
    // البذور لم تُشغّل بعد — fallback آمن مطابق لسلوك 6أ/6ب (يُبنى من pay_rules مباشرة)
    return { regime: generalRegimeFromRules(rules), changedMidPeriod };
  }
  return { regime: buildRegimeDefinition(regimeRow, contributions, steps), changedMidPeriod };
}

// ── الحساب لعامل واحد (قلب التوليد) ──────────────────────────────

type WorkerComputation = {
  computation: ReturnType<typeof computePayslip>;
  daily: DayBreakdownRow[];
  rules: PayRuleSet;
};

export async function computeWorkerPayslip(
  companyId: string,
  tz: string,
  settings: { restDay: number; monthlyHoursDivisor: number },
  workerUserId: string,
  profile: { payType: string; hourlyRateCents: number | null; dailyRateCents: number | null; monthlyCents: number | null; dependentsCount: number; transportZone: string },
  year: number,
  month: number,
  extraManual: ManualLineInput[] = [],
  preResolved?: WorkerRegimeResolution
): Promise<WorkerComputation & { regime: RegimeDefinition }> {
  const win = periodWindow(year, month, tz);
  const rules = await resolvePayRules(companyId, win.startUtc); // قواعد بداية الفترة (SPEC §4.4.1)

  // مسار العامل (SPEC §12 — المرحلة 6ج): بنود الاشتراكات وخطوات الضريبة من البيانات
  const { regime, changedMidPeriod } = preResolved ?? (await resolveWorkerRegime(companyId, workerUserId, win));
  if (regime.bundleStatus === "incomplete") {
    const missing: string[] = [];
    if (regime.contributions.length === 0) missing.push("contribution_items");
    if (regime.steps.length === 0) missing.push("calc_steps");
    if (regime.minWageCents <= 0) missing.push("min_wage");
    fail(422, "regime_incomplete", { regimeKey: regime.key, missing: missing.length > 0 ? missing : ["bundle_incomplete"] });
  }

  const holidays = await db.holiday.findMany({
    where: { companyId, localDate: { gte: win.startLocal, lt: win.endLocal } },
    select: { localDate: true },
  });

  // الورديات المجدولة في الفترة (بدايتها داخل النافذة — سابقة localDate «يوم بداية الوردية»)
  const shifts = await db.shift.findMany({
    where: {
      companyId,
      workerUserId,
      status: "scheduled",
      startsAt: { gte: win.startUtc, lt: win.endUtc },
    },
    select: { startsAt: true, endsAt: true, breakMinutes: true },
    orderBy: { startsAt: "asc" },
  });
  const scheduledSlices = shifts.map((s) => ({ startMs: s.startsAt.getTime(), endMs: s.endsAt.getTime() }));
  const scheduledBreakMinutes = shifts.reduce((acc, s) => acc + s.breakMinutes, 0);

  // الحضور الموثق (verified فقط — بانتظار المراجعة لا يُدفع): نافذة مبطَّنة 24س لالتقاط
  // انصراف وردية بدأت آخر يوم في الفترة (زوج الدخول داخل النافذة هو المرجّح)
  const padMs = 24 * 3600_000;
  const events = await db.attendanceEvent.findMany({
    where: {
      companyId,
      workerUserId,
      type: { in: ["check_in", "check_out"] },
      status: "verified",
      occurredAt: { gte: new Date(win.startUtc.getTime() - padMs), lt: new Date(win.endUtc.getTime() + padMs) },
    },
    orderBy: { occurredAt: "asc" },
    select: { type: true, occurredAt: true },
  });
  const attSlices: { startMs: number; endMs: number }[] = [];
  let openMs: number | null = null;
  for (const e of events) {
    if (e.type === "check_in") {
      openMs = e.occurredAt.getTime();
    } else if (openMs !== null) {
      attSlices.push({ startMs: openMs, endMs: e.occurredAt.getTime() });
      openMs = null;
    }
  }
  // نُبقي الأزواج التي بدأ دخولها داخل نافذة الفترة فعليًا (بداية الزوج = فترة استحقاقه)
  const keptAttSlices = attSlices.filter((s) => s.startMs >= win.startUtc.getTime() && s.startMs < win.endUtc.getTime());

  // حدود الليل والعتبة الأسبوعية تتبع المسار (الفلاحي: 5:00–20:00 و48س — SPEC §12)
  const worked = computeWorkedTime(keptAttSlices, scheduledSlices, scheduledBreakMinutes, {
    timezone: tz,
    restDay: settings.restDay,
    holidays: holidays.map((h) => h.localDate),
    nightStartMin: regime.nightStartMin,
    nightEndMin: regime.nightEndMin,
    weeklyThresholdMin: regime.weeklyHours * 60,
  });

  const employee: EmployeeInput = {
    userId: workerUserId,
    payType: profile.payType as PayType,
    hourlyRateCents: profile.hourlyRateCents,
    dailyRateCents: profile.dailyRateCents,
    monthlyCents: profile.monthlyCents,
    dependentsCount: profile.dependentsCount,
    transportZone: (TRANSPORT_ZONES as readonly string[]).includes(profile.transportZone)
      ? (profile.transportZone as "urban" | "outside")
      : "urban",
  };
  const input: ComputeInput = {
    employee,
    worked,
    manualLines: extraManual,
    rules,
    // القاسم الشهري: أساس المسار للفلاحي (26×8=208س) وإلا إعداد الشركة (191 = 44×52/12)
    monthlyHoursDivisor:
      regime.bundle === "agricultural" ? regime.monthlyDaysBasis * regime.dailyHours : settings.monthlyHoursDivisor,
    regime,
  };
  const computation = computePayslip(input);
  if (changedMidPeriod) computation.warnings.push("regime_changed_mid_period");
  return { computation, daily: worked.daily, rules, regime };
}

function lineToDb(payslipId: string, line: ComputedLine, createdByUserId?: string) {
  return {
    payslipId,
    kind: line.kind,
    minutes: line.minutes,
    rateBp: line.rateBp,
    amountCents: line.amountCents,
    exemptIrCents: line.exemptIrCents,
    exemptCnssCents: line.exemptCnssCents,
    order: line.order,
    reason: line.reason ?? null,
    createdByUserId: createdByUserId ?? null,
  };
}

/** أنواع البنود اليدوية (SPEC §4.3: مكافآت وبدلات وخصومات — لكل بند سبب ومنشئ) */
const MANUAL_LINE_KINDS = ["bonus", "deduction", "allowance_transport", "allowance_meals"] as const;

/** إعادة كتابة كشف قائم من المصدر (ورديات/حضور/بنود يدوية) — للمسودات وقيد المراجعة فقط */
async function rewritePayslip(
  companyId: string,
  tz: string,
  settings: { restDay: number; monthlyHoursDivisor: number },
  payslip: { id: string; workerUserId: string; periodId: string; refNumber: string },
  period: { year: number; month: number },
  profile: { payType: string; hourlyRateCents: number | null; dailyRateCents: number | null; monthlyCents: number | null; dependentsCount: number; transportZone: string }
): Promise<ReturnType<typeof computePayslip>> {
  // البنود اليدوية ببياناتها الكاملة (السبب والمنشئ — SPEC §4.3 «كل بند له سبب ومنشئ»)
  const storedManual = await db.payslipLine.findMany({
    where: { payslipId: payslip.id, kind: { in: [...MANUAL_LINE_KINDS] } },
    orderBy: { createdAt: "asc" },
  });
  const manual: ManualLineInput[] = storedManual.map((r) => ({
    kind: r.kind as ManualLineInput["kind"],
    amountCents: Math.abs(r.amountCents),
    reason: r.reason ?? undefined,
  }));
  const { computation, daily, rules } = await computeWorkerPayslip(
    companyId, tz, settings, payslip.workerUserId, profile, period.year, period.month, manual
  );
  // إعادة إدخال البنود مع استرجاع بيانات البنود اليدوية (المحرك يخرجها بنفس ترتيب الإدخال)
  let manualIdx = 0;
  const linesData = computation.lines.map((l) => {
    if ((MANUAL_LINE_KINDS as readonly string[]).includes(l.kind)) {
      const meta = storedManual[manualIdx++] ?? null;
      return {
        ...lineToDb(payslip.id, l),
        reason: meta?.reason ?? l.reason ?? null,
        createdByUserId: meta?.createdByUserId ?? null,
      };
    }
    return lineToDb(payslip.id, l);
  });
  await db.$transaction(async (tx) => {
    await tx.payslipLine.deleteMany({ where: { payslipId: payslip.id } });
    await tx.payslipLine.createMany({ data: linesData });
    await tx.payslip.update({
      where: { id: payslip.id },
      data: {
        workedMinutes: computation.totals.workedMinutes,
        breakMinutes: computation.totals.breakMinutes,
        overtimeMinutes: computation.totals.overtimeMinutes,
        workedDays: computation.totals.workedDays,
        grossCents: computation.totals.grossCents,
        sbiCents: computation.totals.sbiCents,
        cnssBaseCents: computation.totals.cnssBaseCents,
        cnssEmployeeCents: computation.totals.cnssEmployeeCents,
        amoEmployeeCents: computation.totals.amoEmployeeCents,
        proDeductionCents: computation.totals.proDeductionCents,
        rniCents: computation.totals.rniCents,
        irGrossCents: computation.totals.irGrossCents,
        familyDeductionCents: computation.totals.familyDeductionCents,
        irNetCents: computation.totals.irNetCents,
        netCents: computation.totals.netCents,
        employerCostCents: computation.totals.employerCostCents,
        totalCostCents: computation.totals.totalCostCents,
        smigBreached: computation.smigBreached,
        warningsJson: JSON.stringify(computation.warnings),
        rulesJson: JSON.stringify({ provenance: Object.values(rules.provenance) }),
        dailyJson: JSON.stringify(daily),
      },
    });
  });
  return computation;
}

// ── الفترات ──────────────────────────────────────────────────────

export const createPeriodSchema = z.object({
  year: z.number().int().min(2020).max(2100),
  month: z.number().int().min(1).max(12),
});

export async function listPeriods(session: Session) {
  const periods = await db.payPeriod.findMany({
    where: { companyId: session.companyId },
    orderBy: [{ year: "desc" }, { month: "desc" }],
    include: { payslips: { select: { grossCents: true, netCents: true, employerCostCents: true, smigBreached: true } } },
  });
  return periods.map((p) => ({
    id: p.id,
    year: p.year,
    month: p.month,
    label: periodLabel(p.year, p.month),
    status: p.status,
    generatedAt: p.generatedAt?.toISOString() ?? null,
    submittedAt: p.submittedAt?.toISOString() ?? null,
    approvedAt: p.approvedAt?.toISOString() ?? null,
    payslipCount: p.payslips.length,
    totalGrossCents: p.payslips.reduce((a, s) => a + s.grossCents, 0),
    totalNetCents: p.payslips.reduce((a, s) => a + s.netCents, 0),
    totalEmployerCostCents: p.payslips.reduce((a, s) => a + s.employerCostCents, 0),
    smigBreachedCount: p.payslips.filter((s) => s.smigBreached).length,
  }));
}

export async function createPeriod(session: Session, input: z.infer<typeof createPeriodSchema>) {
  const existing = await db.payPeriod.findUnique({
    where: { companyId_year_month: { companyId: session.companyId, year: input.year, month: input.month } },
  });
  if (existing) fail(409, "period_exists");

  // لا فترة مستقبلية: أول الشهر يجب أن يكون <= الآن
  const win = periodWindow(input.year, input.month, session.companyTimezone);
  if (win.startUtc.getTime() > Date.now()) fail(422, "future_period");

  const period = await db.payPeriod.create({
    data: { companyId: session.companyId, year: input.year, month: input.month },
  });
  await writeAudit({
    companyId: session.companyId,
    userId: session.sub,
    action: "payroll.period_create",
    entity: "pay_period",
    entityId: period.id,
    after: { year: input.year, month: input.month, status: "draft" },
  });
  return { id: period.id, year: period.year, month: period.month, status: period.status };
}

async function getOwnedPeriod(session: Session, periodId: string) {
  const period = await db.payPeriod.findFirst({ where: { id: periodId, companyId: session.companyId } });
  if (!period) fail(404, "not_found");
  return period;
}

export async function getPeriodDetail(session: Session, periodId: string) {
  const period = await getOwnedPeriod(session, periodId);
  const payslips = await db.payslip.findMany({
    where: { periodId: period.id },
    orderBy: { refNumber: "asc" },
    include: { worker: { select: { id: true, fullName: true, email: true } } },
  });

  // تحذيرات الفترة: قواعد غير موثقة (تحلّ حيًّا — توثيق لاحق للتوليد يفتح الاعتماد) + عمال بلا ملف أجر
  const unverifiedKeys = await liveUnverifiedRuleKeys(
    session.companyId,
    periodWindow(period.year, period.month, session.companyTimezone).startUtc
  );
  const members = await db.userMembership.findMany({
    where: { companyId: session.companyId, role: "employee", revokedAt: null, user: { isActive: true } },
    select: { userId: true },
  });
  const profileUsers = new Set(
    (
      await db.employeeProfile.findMany({
        where: { companyId: session.companyId, status: "active" },
        select: { userId: true },
      })
    ).map((p) => p.userId)
  );
  const missingProfiles = members.filter((m) => !profileUsers.has(m.userId)).length;

  return {
    period: {
      id: period.id,
      year: period.year,
      month: period.month,
      label: periodLabel(period.year, period.month),
      status: period.status,
      generatedAt: period.generatedAt?.toISOString() ?? null,
      submittedAt: period.submittedAt?.toISOString() ?? null,
      approvedAt: period.approvedAt?.toISOString() ?? null,
    },
    payslips: payslips.map((ps) => ({
      id: ps.id,
      refNumber: ps.refNumber,
      worker: ps.worker ? { id: ps.worker.id, fullName: ps.worker.fullName } : null,
      workedMinutes: ps.workedMinutes,
      overtimeMinutes: ps.overtimeMinutes,
      workedDays: ps.workedDays,
      grossCents: ps.grossCents,
      cnssEmployeeCents: ps.cnssEmployeeCents,
      amoEmployeeCents: ps.amoEmployeeCents,
      irNetCents: ps.irNetCents,
      netCents: ps.netCents,
      employerCostCents: ps.employerCostCents,
      totalCostCents: ps.totalCostCents,
      smigBreached: ps.smigBreached,
      warnings: safeParseArray(ps.warningsJson),
    })),
    totals: {
      payslipCount: payslips.length,
      grossCents: payslips.reduce((a, s) => a + s.grossCents, 0),
      cnssEmployeeCents: payslips.reduce((a, s) => a + s.cnssEmployeeCents, 0),
      amoEmployeeCents: payslips.reduce((a, s) => a + s.amoEmployeeCents, 0),
      irNetCents: payslips.reduce((a, s) => a + s.irNetCents, 0),
      netCents: payslips.reduce((a, s) => a + s.netCents, 0),
      employerCostCents: payslips.reduce((a, s) => a + s.employerCostCents, 0),
      totalCostCents: payslips.reduce((a, s) => a + s.totalCostCents, 0),
    },
    warnings: {
      unverifiedRuleKeys: unverifiedKeys,
      missingProfiles,
      smigBreachedCount: payslips.filter((s) => s.smigBreached).length,
    },
  };
}

/** المفاتيح غير الموثقة حاليًا (تحلّ حيًّا عند لحظة الفترة) — توثيق لاحق يفتح الاعتماد */
async function liveUnverifiedRuleKeys(companyId: string, at: Date): Promise<string[]> {
  try {
    const rules = await resolvePayRules(companyId, at);
    return Object.values(rules.provenance)
      .filter((p) => p.verifiedBy === null)
      .map((p) => p.key)
      .sort();
  } catch (error) {
    if (error instanceof MissingPayRuleError) return [`missing:${error.keys.join(",")}`];
    throw error;
  }
}

function safeParseArray(json: string | null): string[] {
  if (!json) return [];
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}

/** توليد/إعادة توليد كشوف المسودة لكل عمال الشركة أصحاب ملفات أجر نشطة */
export async function generatePeriod(session: Session, periodId: string) {
  const period = await getOwnedPeriod(session, periodId);
  if (period.status !== "draft") fail(422, "period_not_draft");

  const settings = await ensureSettings(session.companyId);
  const win = periodWindow(period.year, period.month, session.companyTimezone);

  let rules: PayRuleSet;
  try {
    rules = await resolvePayRules(session.companyId, win.startUtc);
  } catch (error) {
    if (error instanceof MissingPayRuleError) fail(422, "missing_pay_rule", { keys: error.keys });
    throw error;
  }

  const memberships = await db.userMembership.findMany({
    where: { companyId: session.companyId, role: "employee", revokedAt: null, user: { isActive: true } },
    include: { user: { select: { id: true, fullName: true } } },
  });
  const profiles = await db.employeeProfile.findMany({
    where: { companyId: session.companyId, status: "active" },
  });
  const profileByUser = new Map(profiles.map((p) => [p.userId, p]));

  const skipped: { userId: string; fullName: string; reason: string }[] = [];
  const eligible: { userId: string; fullName: string; profile: (typeof profiles)[number] }[] = [];
  for (const m of memberships) {
    const profile = profileByUser.get(m.userId);
    if (!profile) {
      skipped.push({ userId: m.userId, fullName: m.user.fullName, reason: "missing_pay_profile" });
      continue;
    }
    eligible.push({ userId: m.userId, fullName: m.user.fullName, profile });
  }
  eligible.sort((a, b) => a.fullName.localeCompare(b.fullName, "ar"));

  // حل مسارات العمال مسبقًا (SPEC §12 — الحزمة غير المكتملة تمنع التوليد وتعرض ما ينقص)
  const regimeByWorker = new Map<string, WorkerRegimeResolution>();
  for (const w of eligible) {
    try {
      regimeByWorker.set(w.userId, await resolveWorkerRegime(session.companyId, w.userId, win));
    } catch (error) {
      if (error instanceof InvalidRegimeError) {
        skipped.push({ userId: w.userId, fullName: w.fullName, reason: `regime_invalid: ${error.fields.join(",")}` });
        continue;
      }
      throw error;
    }
  }
  const regimeEligible = eligible.filter((w) => regimeByWorker.has(w.userId));
  const incomplete: { userId: string; fullName: string; regimeKey: string }[] = [];
  for (const w of regimeEligible) {
    const r = regimeByWorker.get(w.userId)!.regime;
    if (r.bundleStatus === "incomplete") {
      incomplete.push({ userId: w.userId, fullName: w.fullName, regimeKey: r.key });
    }
  }
  if (incomplete.length > 0) {
    fail(422, "regime_incomplete", { workers: incomplete });
  }

  const before = await db.payslip.count({ where: { periodId: period.id } });

  await db.$transaction(async (tx) => {
    const old = await tx.payslip.findMany({ where: { periodId: period.id }, select: { id: true } });
    if (old.length > 0) {
      await tx.payslipLine.deleteMany({ where: { payslipId: { in: old.map((o) => o.id) } } });
      await tx.payslip.deleteMany({ where: { periodId: period.id } });
    }
    for (const [idx, w] of regimeEligible.entries()) {
      const { computation, daily } = await computeWorkerPayslip(
        session.companyId, session.companyTimezone, settings, w.userId, w.profile, period.year, period.month,
        [], regimeByWorker.get(w.userId)
      );
      const payslip = await tx.payslip.create({
        data: {
          companyId: session.companyId,
          periodId: period.id,
          workerUserId: w.userId,
          refNumber: `PS-${period.year}${pad2(period.month)}-${String(idx + 1).padStart(4, "0")}`,
          workedMinutes: computation.totals.workedMinutes,
          breakMinutes: computation.totals.breakMinutes,
          overtimeMinutes: computation.totals.overtimeMinutes,
          workedDays: computation.totals.workedDays,
          grossCents: computation.totals.grossCents,
          sbiCents: computation.totals.sbiCents,
          cnssBaseCents: computation.totals.cnssBaseCents,
          cnssEmployeeCents: computation.totals.cnssEmployeeCents,
          amoEmployeeCents: computation.totals.amoEmployeeCents,
          proDeductionCents: computation.totals.proDeductionCents,
          rniCents: computation.totals.rniCents,
          irGrossCents: computation.totals.irGrossCents,
          familyDeductionCents: computation.totals.familyDeductionCents,
          irNetCents: computation.totals.irNetCents,
          netCents: computation.totals.netCents,
          employerCostCents: computation.totals.employerCostCents,
          totalCostCents: computation.totals.totalCostCents,
          smigBreached: computation.smigBreached,
          warningsJson: JSON.stringify(computation.warnings),
          rulesJson: JSON.stringify({ provenance: Object.values(rules.provenance) }),
          dailyJson: JSON.stringify(daily),
        },
      });
      await tx.payslipLine.createMany({
        data: computation.lines.map((l) => lineToDb(payslip.id, l)),
      });
    }
    await tx.payPeriod.update({
      where: { id: period.id },
      data: { generatedAt: new Date() },
    });
  });

  await writeAudit({
    companyId: session.companyId,
    userId: session.sub,
    action: "payroll.generate",
    entity: "pay_period",
    entityId: period.id,
    before: { payslipCount: before },
    after: { created: regimeEligible.length, skipped: skipped.length },
  });

  return { created: regimeEligible.length, skipped };
}

/** مسودة → مراجعة (تُعرض للمحاسب) — يتطلب توليدًا مسبقًا */
export async function submitPeriod(session: Session, periodId: string) {
  const period = await getOwnedPeriod(session, periodId);
  if (period.status !== "draft") fail(422, "period_not_draft");
  const count = await db.payslip.count({ where: { periodId: period.id } });
  if (count === 0) fail(422, "no_payslips");

  const updated = await db.payPeriod.update({
    where: { id: period.id },
    data: { status: "reviewing", submittedAt: new Date(), submittedBy: session.sub },
  });
  await writeAudit({
    companyId: session.companyId,
    userId: session.sub,
    action: "payroll.submit",
    entity: "pay_period",
    entityId: period.id,
    before: { status: period.status },
    after: { status: updated.status, payslipCount: count },
  });
  return { id: updated.id, status: updated.status };
}

/** مراجعة → مسودة (admin): حلقة ملاحظات المراجعة — إصلاح ثم إعادة التوليد قبل إعادة الإرسال.
 *  القفل الحقيقي بعد الاعتماد فقط (SPEC §4.3) — هذه العودة لا تمس فترة معتمدة أبدًا. */
export async function reopenPeriod(session: Session, periodId: string) {
  const period = await getOwnedPeriod(session, periodId);
  if (period.status !== "reviewing") fail(422, "period_not_reviewing");
  const updated = await db.payPeriod.update({
    where: { id: period.id },
    data: { status: "draft", submittedAt: null, submittedBy: null },
  });
  await writeAudit({
    companyId: session.companyId,
    userId: session.sub,
    action: "payroll.reopen",
    entity: "pay_period",
    entityId: period.id,
    before: { status: period.status },
    after: { status: updated.status },
  });
  return { id: updated.id, status: updated.status };
}

/** اعتماد نهائي (admin): يجمّد snapshot + يكتب قيود الدفتر + إشعار كل عامل */
export async function approvePeriod(session: Session, periodId: string) {
  const period = await getOwnedPeriod(session, periodId);
  if (period.status !== "reviewing") fail(422, "period_not_reviewing");

  const payslips = await db.payslip.findMany({
    where: { periodId: period.id },
    include: { worker: { select: { id: true, fullName: true } } },
  });

  const smigBreached = payslips.filter((p) => p.smigBreached);
  if (smigBreached.length > 0) {
    fail(422, "smig_breached", {
      workers: smigBreached.map((p) => ({ refNumber: p.refNumber, fullName: p.worker?.fullName ?? p.workerUserId })),
    });
  }

  // القواعد غير الموثقة تُفحص حيًّا (توثيق المحاسب بعد التوليد يفتح الاعتماد — القرار الموثّق)
  const unverifiedKeys = await liveUnverifiedRuleKeys(
    session.companyId,
    periodWindow(period.year, period.month, session.companyTimezone).startUtc
  );
  if (unverifiedKeys.length > 0) {
    fail(422, "unverified_rules", { keys: unverifiedKeys });
  }

  // المرحلة 6ج (SPEC §12): مسار يحتاج تأكيد المحاسب (الفلاحي) يمنع الاعتماد حتى يُؤكَّد مرة واحدة
  const needsConfirmation = payslips.filter((p) => {
    try {
      const warnings = JSON.parse(p.warningsJson ?? "[]") as string[];
      return warnings.includes("regime_needs_confirmation");
    } catch {
      return false;
    }
  });
  if (needsConfirmation.length > 0) {
    fail(422, "regime_needs_confirmation", {
      workers: needsConfirmation.map((p) => ({ refNumber: p.refNumber, fullName: p.worker?.fullName ?? p.workerUserId })),
    });
  }

  await db.$transaction(async (tx) => {
    for (const ps of payslips) {
      const lines = await tx.payslipLine.findMany({
        where: { payslipId: ps.id },
        orderBy: { order: "asc" },
      });
      const snapshot = {
        totals: {
          workedMinutes: ps.workedMinutes,
          overtimeMinutes: ps.overtimeMinutes,
          workedDays: ps.workedDays,
          grossCents: ps.grossCents,
          sbiCents: ps.sbiCents,
          cnssEmployeeCents: ps.cnssEmployeeCents,
          amoEmployeeCents: ps.amoEmployeeCents,
          proDeductionCents: ps.proDeductionCents,
          rniCents: ps.rniCents,
          irNetCents: ps.irNetCents,
          netCents: ps.netCents,
          employerCostCents: ps.employerCostCents,
          totalCostCents: ps.totalCostCents,
        },
        lines: lines.map((l) => ({
          kind: l.kind,
          minutes: l.minutes,
          rateBp: l.rateBp,
          amountCents: l.amountCents,
          exemptIrCents: l.exemptIrCents,
          exemptCnssCents: l.exemptCnssCents,
          reason: l.reason,
        })),
        rulesUsed: JSON.parse(ps.rulesJson ?? "{}"),
        daily: JSON.parse(ps.dailyJson ?? "[]"),
        frozenAt: new Date().toISOString(),
      };
      await tx.payslip.update({ where: { id: ps.id }, data: { snapshotJson: JSON.stringify(snapshot) } });
      await tx.ledgerEntry.create({
        data: {
          companyId: session.companyId,
          payslipId: ps.id,
          periodId: period.id,
          workerUserId: ps.workerUserId,
          kind: "payslip_approved",
          amountCents: ps.netCents,
          refNumber: ps.refNumber,
          entryJson: JSON.stringify({
            grossCents: ps.grossCents,
            cnssEmployeeCents: ps.cnssEmployeeCents,
            amoEmployeeCents: ps.amoEmployeeCents,
            irNetCents: ps.irNetCents,
            netCents: ps.netCents,
            employerCostCents: ps.employerCostCents,
          }),
          createdByUserId: session.sub,
        },
      });
    }
    await tx.payPeriod.update({
      where: { id: period.id },
      data: { status: "approved", approvedAt: new Date(), approvedBy: session.sub },
    });
  });

  // إشعار كل عامل بأن كشفه جاهز في «أجوري» — فشله لا يُفشل الاعتماد (قناة مستقلة)
  for (const ps of payslips) {
    void createNotification({
      companyId: session.companyId,
      userId: ps.workerUserId,
      type: "payslip_approved",
      payload: { periodLabel: periodLabel(period.year, period.month), refNumber: ps.refNumber },
    });
  }

  await writeAudit({
    companyId: session.companyId,
    userId: session.sub,
    action: "payroll.approve",
    entity: "pay_period",
    entityId: period.id,
    before: { status: period.status },
    after: {
      status: "approved",
      payslipCount: payslips.length,
      totalNetCents: payslips.reduce((a, p) => a + p.netCents, 0),
    },
  });

  return { id: period.id, status: "approved", payslipCount: payslips.length };
}

// ── الكشوف ───────────────────────────────────────────────────────

export async function getPayslipDetail(session: Session, payslipId: string) {
  const payslip = await db.payslip.findFirst({
    where: { id: payslipId, companyId: session.companyId },
    include: {
      worker: { select: { id: true, fullName: true, email: true } },
      period: { select: { id: true, year: true, month: true, status: true } },
    },
  });
  if (!payslip) fail(404, "not_found");

  // العامل: كشفه فقط + الفترة المعتمدة حصرًا (لا وعود مالية قبل الاعتماد)
  if (session.role === "employee") {
    if (payslip.workerUserId !== session.sub) fail(403, "forbidden");
    if (payslip.period.status !== "approved") fail(404, "not_found");
  }

  const lines = await db.payslipLine.findMany({
    where: { payslipId: payslip.id },
    orderBy: { order: "asc" },
  });

  // التفصيل اليومي: مخزّن مع الكشف (dailyJson) — ومن snapshot المعتمد عند الاعتماد
  let daily: DayBreakdownRow[] = [];
  const dailySource = payslip.snapshotJson ?? payslip.dailyJson;
  if (dailySource) {
    try {
      const parsed = JSON.parse(dailySource) as DayBreakdownRow[] | { daily?: DayBreakdownRow[] };
      daily = Array.isArray(parsed) ? parsed : (parsed.daily ?? []);
    } catch {
      daily = [];
    }
  }

  return {
    id: payslip.id,
    refNumber: payslip.refNumber,
    period: {
      id: payslip.period.id,
      label: periodLabel(payslip.period.year, payslip.period.month),
      status: payslip.period.status,
    },
    worker: payslip.worker ? { id: payslip.worker.id, fullName: payslip.worker.fullName } : null,
    workedMinutes: payslip.workedMinutes,
    breakMinutes: payslip.breakMinutes,
    overtimeMinutes: payslip.overtimeMinutes,
    workedDays: payslip.workedDays,
    grossCents: payslip.grossCents,
    sbiCents: payslip.sbiCents,
    cnssBaseCents: payslip.cnssBaseCents,
    cnssEmployeeCents: payslip.cnssEmployeeCents,
    amoEmployeeCents: payslip.amoEmployeeCents,
    proDeductionCents: payslip.proDeductionCents,
    rniCents: payslip.rniCents,
    irGrossCents: payslip.irGrossCents,
    familyDeductionCents: payslip.familyDeductionCents,
    irNetCents: payslip.irNetCents,
    netCents: payslip.netCents,
    employerCostCents: payslip.employerCostCents,
    totalCostCents: payslip.totalCostCents,
    smigBreached: payslip.smigBreached,
    warnings: safeParseArray(payslip.warningsJson),
    lines: lines.map((l) => ({
      id: l.id,
      kind: l.kind,
      minutes: l.minutes,
      rateBp: l.rateBp,
      amountCents: l.amountCents,
      exemptIrCents: l.exemptIrCents,
      exemptCnssCents: l.exemptCnssCents,
      reason: l.reason,
      isManual: (MANUAL_LINE_KINDS as readonly string[]).includes(l.kind),
    })),
    daily,
  };
}

/** كشوف العامل نفسه — الفترات المعتمدة فقط (SPEC §4.5 «أجوري») */
export async function listMyPayslips(session: Session) {
  const payslips = await db.payslip.findMany({
    where: { companyId: session.companyId, workerUserId: session.sub, period: { status: "approved" } },
    orderBy: [{ period: { year: "desc" } }, { period: { month: "desc" } }],
    include: { period: { select: { year: true, month: true, status: true } } },
  });
  return payslips.map((ps) => ({
    id: ps.id,
    refNumber: ps.refNumber,
    periodLabel: periodLabel(ps.period.year, ps.period.month),
    workedMinutes: ps.workedMinutes,
    overtimeMinutes: ps.overtimeMinutes,
    grossCents: ps.grossCents,
    cnssEmployeeCents: ps.cnssEmployeeCents,
    amoEmployeeCents: ps.amoEmployeeCents,
    irNetCents: ps.irNetCents,
    netCents: ps.netCents,
  }));
}

// ── البنود اليدوية (مكافآت/بدلات/خصومات — SPEC §4.3) ────────────

export const adjustmentSchema = z.object({
  kind: z.enum(["bonus", "deduction", "allowance_transport", "allowance_meals"]),
  amountCents: z.number().int().min(1).max(100_000_000), // حتى مليون درهم حارس منطقي
  reason: z.string().trim().min(2).max(240),
});

export async function addAdjustment(session: Session, payslipId: string, input: z.infer<typeof adjustmentSchema>) {
  const payslip = await db.payslip.findFirst({
    where: { id: payslipId, companyId: session.companyId },
    include: { period: { select: { id: true, year: true, month: true, status: true } } },
  });
  if (!payslip) fail(404, "not_found");
  if (payslip.period.status === "approved") fail(409, "payslip_locked");

  const profile = await db.employeeProfile.findFirst({
    where: { companyId: session.companyId, userId: payslip.workerUserId },
  });
  if (!profile) fail(422, "missing_pay_profile");

  const before = { grossCents: payslip.grossCents, netCents: payslip.netCents };

  // 1) خزّن البند اليدوي (بسببه ومنشئه — SPEC §4.3)
  await db.payslipLine.create({
    data: {
      payslipId: payslip.id,
      kind: input.kind,
      minutes: null,
      rateBp: null,
      amountCents: input.kind === "deduction" ? -input.amountCents : input.amountCents,
      exemptIrCents: 0,
      exemptCnssCents: 0,
      order: input.kind === "deduction" ? 60 : 30 + MANUAL_LINE_KINDS.indexOf(input.kind as (typeof MANUAL_LINE_KINDS)[number]),
      reason: input.reason,
      createdByUserId: session.sub,
    },
  });
  // 2) أعد الحساب من المصدر (البنود اليدوية كلها تُقرأ من القاعدة — التخزين هو مصدر الحقيقة)
  const settings = await ensureSettings(session.companyId);
  const after = await rewritePayslip(
    session.companyId, session.companyTimezone, settings,
    { id: payslip.id, workerUserId: payslip.workerUserId, periodId: payslip.periodId, refNumber: payslip.refNumber },
    { year: payslip.period.year, month: payslip.period.month },
    profile
  );

  await writeAudit({
    companyId: session.companyId,
    userId: session.sub,
    action: "payroll.adjustment_add",
    entity: "payslip",
    entityId: payslip.id,
    before,
    after: { grossCents: after.totals.grossCents, netCents: after.totals.netCents },
    reason: `${input.kind}: ${input.reason}`,
  });

  return {
    payslipId: payslip.id,
    grossCents: after.totals.grossCents,
    netCents: after.totals.netCents,
  };
}

export async function removeAdjustment(session: Session, lineId: string) {
  const line = await db.payslipLine.findFirst({
    where: { id: lineId, kind: { in: [...MANUAL_LINE_KINDS] } },
    include: {
      payslip: {
        include: { period: { select: { id: true, year: true, month: true, status: true } } },
      },
    },
  });
  if (!line || line.payslip.companyId !== session.companyId) fail(404, "not_found");
  if (line.payslip.period.status === "approved") fail(409, "payslip_locked");
  if (line.createdByUserId === null) fail(422, "not_manual_line");

  const payslip = line.payslip;
  const profile = await db.employeeProfile.findFirst({
    where: { companyId: session.companyId, userId: payslip.workerUserId },
  });
  if (!profile) fail(422, "missing_pay_profile");

  const before = { grossCents: payslip.grossCents, netCents: payslip.netCents };
  await db.payslipLine.delete({ where: { id: line.id } });
  const settings = await ensureSettings(session.companyId);
  const after = await rewritePayslip(
    session.companyId, session.companyTimezone, settings,
    { id: payslip.id, workerUserId: payslip.workerUserId, periodId: payslip.periodId, refNumber: payslip.refNumber },
    { year: payslip.period.year, month: payslip.period.month },
    profile
  );

  await writeAudit({
    companyId: session.companyId,
    userId: session.sub,
    action: "payroll.adjustment_remove",
    entity: "payslip",
    entityId: payslip.id,
    before: { ...before, line: { kind: line.kind, amountCents: line.amountCents, reason: line.reason } },
    after: { grossCents: after.totals.grossCents, netCents: after.totals.netCents },
  });

  return { payslipId: payslip.id, grossCents: after.totals.grossCents, netCents: after.totals.netCents };
}

// ── العطل الرسمية (SPEC §11.5) ───────────────────────────────────

export const holidaySchema = z.object({
  localDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "invalid_date"),
  name: z.string().trim().min(2).max(120),
});

export async function listHolidays(session: Session, year?: number) {
  const prefix = year ? `${year}-` : undefined;
  const rows = await db.holiday.findMany({
    where: { companyId: session.companyId, ...(prefix ? { localDate: { startsWith: prefix } } : {}) },
    orderBy: { localDate: "asc" },
  });
  return rows.map((h) => ({ id: h.id, localDate: h.localDate, name: h.name }));
}

export async function addHoliday(session: Session, input: z.infer<typeof holidaySchema>) {
  const existing = await db.holiday.findUnique({
    where: { companyId_localDate: { companyId: session.companyId, localDate: input.localDate } },
  });
  if (existing) fail(409, "holiday_exists");
  const holiday = await db.holiday.create({
    data: { companyId: session.companyId, localDate: input.localDate, name: input.name },
  });
  await writeAudit({
    companyId: session.companyId,
    userId: session.sub,
    action: "payroll.holiday_add",
    entity: "holiday",
    entityId: holiday.id,
    after: { localDate: input.localDate, name: input.name },
  });
  return { id: holiday.id, localDate: holiday.localDate, name: holiday.name };
}

export async function removeHoliday(session: Session, holidayId: string) {
  const holiday = await db.holiday.findFirst({ where: { id: holidayId, companyId: session.companyId } });
  if (!holiday) fail(404, "not_found");
  await db.holiday.delete({ where: { id: holiday.id } });
  await writeAudit({
    companyId: session.companyId,
    userId: session.sub,
    action: "payroll.holiday_remove",
    entity: "holiday",
    entityId: holiday.id,
    before: { localDate: holiday.localDate, name: holiday.name },
  });
  return { id: holiday.id };
}

// ── ملفات أجور العمال (SPEC §4.3 أنظمة الاحتساب) ────────────────

export const workerProfileSchema = z.object({
  userId: z.string().trim().min(1).max(64),
  payType: z.enum(["hourly", "daily", "monthly"]),
  hourlyRateCents: z.number().int().min(0).max(100_000_000).nullable().optional(),
  dailyRateCents: z.number().int().min(0).max(100_000_000).nullable().optional(),
  monthlyCents: z.number().int().min(0).max(1_000_000_000).nullable().optional(),
  transportZone: z.enum(["urban", "outside"]).default("urban"),
  dependentsCount: z.number().int().min(0).max(30).default(0),
  hireDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  notes: z.string().trim().max(240).optional(),
});

export async function listWorkerProfiles(session: Session) {
  const memberships = await db.userMembership.findMany({
    where: { companyId: session.companyId, role: "employee", revokedAt: null, user: { isActive: true } },
    include: { user: { select: { id: true, fullName: true, email: true } } },
  });
  const profiles = await db.employeeProfile.findMany({ where: { companyId: session.companyId } });
  const byUser = new Map(profiles.map((p) => [p.userId, p]));
  return memberships.map((m) => {
    const p = byUser.get(m.userId);
    return {
      userId: m.userId,
      fullName: m.user.fullName,
      email: m.user.email,
      profile: p
        ? {
            payType: p.payType,
            hourlyRateCents: p.hourlyRateCents,
            dailyRateCents: p.dailyRateCents,
            monthlyCents: p.monthlyCents,
            transportZone: p.transportZone,
            dependentsCount: p.dependentsCount,
            hireDate: p.hireDate ? p.hireDate.toISOString().slice(0, 10) : null,
            notes: p.notes,
            status: p.status,
          }
        : null,
    };
  });
}

export async function upsertWorkerProfile(session: Session, input: z.infer<typeof workerProfileSchema>) {
  const membership = await db.userMembership.findFirst({
    where: { userId: input.userId, companyId: session.companyId, role: "employee", revokedAt: null },
  });
  if (!membership) fail(400, "invalid_reference");

  const rateForType =
    input.payType === "hourly" ? input.hourlyRateCents ?? null
    : input.payType === "daily" ? input.dailyRateCents ?? null
    : input.monthlyCents ?? null;
  if (rateForType === null || rateForType <= 0) fail(422, "missing_rate_for_pay_type");

  const existing = await db.employeeProfile.findFirst({
    where: { companyId: session.companyId, userId: input.userId },
  });
  const before = existing
    ? { payType: existing.payType, hourlyRateCents: existing.hourlyRateCents, dailyRateCents: existing.dailyRateCents, monthlyCents: existing.monthlyCents, dependentsCount: existing.dependentsCount }
    : null;

  const data = {
    payType: input.payType,
    hourlyRateCents: input.payType === "hourly" ? rateForType : input.hourlyRateCents ?? null,
    dailyRateCents: input.payType === "daily" ? rateForType : input.dailyRateCents ?? null,
    monthlyCents: input.payType === "monthly" ? rateForType : input.monthlyCents ?? null,
    transportZone: input.transportZone,
    dependentsCount: input.dependentsCount,
    hireDate: input.hireDate ? new Date(`${input.hireDate}T00:00:00Z`) : existing?.hireDate ?? null,
    notes: input.notes ?? existing?.notes ?? null,
  };

  const saved = existing
    ? await db.employeeProfile.update({ where: { id: existing.id }, data })
    : await db.employeeProfile.create({ data: { ...data, companyId: session.companyId, userId: input.userId } });

  await writeAudit({
    companyId: session.companyId,
    userId: session.sub,
    action: "payroll.worker_profile_upsert",
    entity: "employee_profile",
    entityId: saved.id,
    before,
    after: { payType: saved.payType, hourlyRateCents: saved.hourlyRateCents, dailyRateCents: saved.dailyRateCents, monthlyCents: saved.monthlyCents, dependentsCount: saved.dependentsCount },
  });

  return { userId: input.userId, payType: saved.payType };
}

// ── قواعد الأجور: عرض + توثيق المحاسب (SPEC §11.6 verifiedBy) ────

export async function listPayRules(session: Session) {
  const rows = await db.payRule.findMany({
    where: { OR: [{ companyId: null }, { companyId: session.companyId }] },
    orderBy: [{ key: "asc" }, { effectiveFrom: "desc" }],
  });
  return rows.map((r) => ({
    id: r.id,
    key: r.key,
    companyId: r.companyId,
    valueInt: r.valueInt,
    valueText: r.valueText,
    unit: r.unit,
    effectiveFrom: r.effectiveFrom.toISOString().slice(0, 10),
    source: r.source,
    verifiedBy: r.verifiedBy,
    verifiedAt: r.verifiedAt ? r.verifiedAt.toISOString().slice(0, 10) : null,
  }));
}

/** توثيق قاعدة من المحاسب (أو المالك) — يمكّن الاعتماد لاحقًا */
export async function verifyPayRule(session: Session, ruleId: string) {
  const rule = await db.payRule.findFirst({
    where: { id: ruleId, OR: [{ companyId: null }, { companyId: session.companyId }] },
  });
  if (!rule) fail(404, "not_found");
  const before = { verifiedBy: rule.verifiedBy, verifiedAt: rule.verifiedAt };
  const updated = await db.payRule.update({
    where: { id: rule.id },
    data: { verifiedBy: session.sub, verifiedAt: new Date() },
  });
  await writeAudit({
    companyId: session.companyId,
    userId: session.sub,
    action: "payroll.rule_verify",
    entity: "pay_rule",
    entityId: rule.id,
    before,
    after: { verifiedBy: updated.verifiedBy, verifiedAt: updated.verifiedAt },
    reason: `key=${rule.key}`,
  });
  return { id: updated.id, key: updated.key, verifiedBy: updated.verifiedBy, verifiedAt: updated.verifiedAt };
}

/** توثيق كل قواعد الشركة/المنصة دفعة واحدة (للمحاسب — يسبق أول اعتماد) */
export async function verifyAllPayRules(session: Session) {
  const rows = await db.payRule.findMany({
    where: { OR: [{ companyId: null }, { companyId: session.companyId }], verifiedBy: null },
  });
  for (const rule of rows) {
    await db.payRule.update({
      where: { id: rule.id },
      data: { verifiedBy: session.sub, verifiedAt: new Date() },
    });
  }
  await writeAudit({
    companyId: session.companyId,
    userId: session.sub,
    action: "payroll.rule_verify_all",
    entity: "pay_rule",
    after: { count: rows.length },
  });
  return { verified: rows.length };
}
