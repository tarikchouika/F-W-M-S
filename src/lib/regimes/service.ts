// HRMP — خدمة المسارات (SPEC §12 — المرحلة 6ج): منشئ المسارات + الإسناد + التأكيد
// منشئ المسارات: واجهة للمالك/المحاسب تركّب مساراً كاملاً من البيانات (بنود + خطوات) بلا تعديل كود.
// قوالب البدء: «نسخ مسار موجود وتعديله» (SPEC §12) — الحزم العمومية هيكل فارغ يمنع الاعتماد.
import { z } from "zod";
import { db } from "@/lib/db";
import type { SessionPayload } from "@/lib/auth/jwt";
import { writeAudit } from "@/lib/audit";
import {
  buildRegimeDefinition,
  InvalidRegimeError,
  type RawCalcStepRow,
  type RawContributionRow,
  type RawRegimeRow,
} from "@/lib/payroll/regime";

type Session = SessionPayload & { companyId: string };

function fail(status: number, code: string, extra?: Record<string, unknown>): never {
  throw Object.assign(new Error(code), { status, ...(extra ?? {}) });
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

// ── القوائم ──────────────────────────────────────────────────────

export async function listRegimes(session: Session) {
  const rows = await db.payRegime.findMany({
    where: { OR: [{ companyId: session.companyId }, { companyId: null }] },
    orderBy: [{ bundle: "asc" }, { version: "desc" }],
    include: {
      contributionItems: { orderBy: { order: "asc" } },
      calcSteps: { orderBy: { order: "asc" } },
      _count: { select: { assignments: true } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    companyId: r.companyId,
    scope: r.companyId === null ? "platform" : "company",
    key: r.key,
    name: r.name,
    bundle: r.bundle,
    bundleStatus: r.bundleStatus,
    minWageType: r.minWageType,
    minWageCents: r.minWageCents,
    dailyHours: r.dailyHours,
    weeklyHours: r.weeklyHours,
    annualHours: r.annualHours,
    nightStart: r.nightStart,
    nightEnd: r.nightEnd,
    monthlyDaysBasis: r.monthlyDaysBasis,
    declarationProfile: r.declarationProfile,
    version: r.version,
    isActive: r.isActive,
    effectiveFrom: r.effectiveFrom,
    source: r.source,
    needsAccountantConfirmation: r.needsAccountantConfirmation,
    confirmedBy: r.confirmedBy,
    confirmedAt: r.confirmedAt,
    notes: r.notes,
    contributions: r.contributionItems.map((c) => ({
      id: c.id,
      key: c.key,
      side: c.side,
      label: c.label,
      rateBp: c.rateBp,
      amountCents: c.amountCents,
      ceilingCents: c.ceilingCents,
      basis: c.basis,
      order: c.order,
      source: c.source,
    })),
    steps: r.calcSteps.map((s) => ({ id: s.id, kind: s.kind, paramsJson: s.paramsJson, order: s.order })),
    assignmentsCount: r._count.assignments,
  }));
}

// ── منشئ المسارات: إنشاء من قالب أو من الصفر ─────────────────────

export const createRegimeSchema = z.object({
  key: z.string().min(1).max(60).optional(),
  name: z.string().min(1).max(120),
  bundle: z.enum(["general", "agricultural", "public_civil_service", "public_entreprise", "custom"]),
  copyFromId: z.string().optional(),
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  source: z.string().max(500).optional(),
  notes: z.string().max(2000).optional(),
  definition: z
    .object({
      minWageType: z.enum(["hourly", "daily"]).optional(),
      minWageCents: z.number().int().positive().optional(),
      dailyHours: z.number().int().min(1).max(24).optional(),
      weeklyHours: z.number().int().min(1).max(168).optional(),
      annualHours: z.number().int().positive().nullable().optional(),
      nightStart: z.string().regex(/^\d{1,2}:\d{2}$/).optional(),
      nightEnd: z.string().regex(/^\d{1,2}:\d{2}$/).optional(),
      monthlyDaysBasis: z.number().int().min(1).max(31).optional(),
      declarationProfile: z.enum(["none", "cnss_ebds", "dgi_xml"]).optional(),
      contributions: z
        .array(
          z.object({
            key: z.string().min(1).max(80),
            side: z.enum(["employee", "employer"]),
            label: z.string().min(1).max(120),
            rateBp: z.number().int().min(0),
            amountCents: z.number().int().positive().nullable().optional(),
            ceilingCents: z.number().int().positive().nullable().optional(),
            basis: z.enum(["cnss_base", "sbi", "gross"]),
            order: z.number().int().min(0),
            source: z.string().max(300).optional(),
          })
        )
        .optional(),
      steps: z
        .array(
          z.object({
            kind: z.enum(["employee_contributions", "pro_deduction_tiered", "ir_brackets", "family_deduction", "employer_contributions", "net_summary"]),
            paramsJson: z.string().default("{}"),
            order: z.number().int().min(0),
          })
        )
        .optional(),
    })
    .optional(),
});

export async function createRegime(session: Session, input: z.infer<typeof createRegimeSchema>) {
  if (session.role !== "admin" && session.role !== "super_admin" && session.role !== "accountant") {
    fail(403, "forbidden");
  }
  // المفتاح من الاسم (slug) — الأسماء غير اللاتينية تُعطى لاحقة زمنية قصيرة كي لا تكون فارغة
  const nameSlug = slug(input.key ?? input.name);
  const key = nameSlug !== "" ? `custom-${nameSlug}` : `custom-r${Date.now().toString(36)}`;
  if (!input.key && nameSlug === "" && !input.name.trim()) fail(422, "invalid_regime_key");

  // مصدر النسخ (قالب منصة أو مسار شركة) — مع بنوده وخطواته
  type TemplateRow = {
    minWageType: string;
    minWageCents: number;
    dailyHours: number;
    weeklyHours: number;
    annualHours: number | null;
    nightStart: string;
    nightEnd: string;
    monthlyDaysBasis: number;
    declarationProfile: string;
    source: string | null;
    contributionItems: {
      key: string; side: string; label: string; rateBp: number;
      amountCents: number | null; ceilingCents: number | null; basis: string;
      order: number; source: string | null;
    }[];
    calcSteps: { kind: string; paramsJson: string; order: number }[];
  };
  let template: TemplateRow | null = null;
  if (input.copyFromId) {
    const found = await db.payRegime.findFirst({
      where: { id: input.copyFromId, OR: [{ companyId: session.companyId }, { companyId: null }] },
      include: { contributionItems: true, calcSteps: true },
    });
    if (!found) fail(404, "template_not_found");
    template = found as unknown as TemplateRow;
  }

  const def = input.definition;
  const base = template
    ? {
        minWageType: def?.minWageType ?? template.minWageType,
        minWageCents: def?.minWageCents ?? template.minWageCents,
        dailyHours: def?.dailyHours ?? template.dailyHours,
        weeklyHours: def?.weeklyHours ?? template.weeklyHours,
        annualHours: def?.annualHours ?? template.annualHours,
        nightStart: def?.nightStart ?? template.nightStart,
        nightEnd: def?.nightEnd ?? template.nightEnd,
        monthlyDaysBasis: def?.monthlyDaysBasis ?? template.monthlyDaysBasis,
        declarationProfile: def?.declarationProfile ?? template.declarationProfile,
        contributions: def?.contributions ?? template.contributionItems.map((c) => ({
          key: c.key, side: c.side as "employee" | "employer", label: c.label, rateBp: c.rateBp,
          amountCents: c.amountCents, ceilingCents: c.ceilingCents, basis: c.basis as "cnss_base" | "sbi" | "gross",
          order: c.order, source: c.source ?? undefined,
        })),
        steps: def?.steps ?? template.calcSteps.map((s) => ({ kind: s.kind as never, paramsJson: s.paramsJson, order: s.order })),
      }
    : {
        minWageType: def?.minWageType ?? "hourly",
        minWageCents: def?.minWageCents ?? 0,
        dailyHours: def?.dailyHours ?? 8,
        weeklyHours: def?.weeklyHours ?? 44,
        annualHours: def?.annualHours ?? null,
        nightStart: def?.nightStart ?? "21:00",
        nightEnd: def?.nightEnd ?? "06:00",
        monthlyDaysBasis: def?.monthlyDaysBasis ?? 26,
        declarationProfile: def?.declarationProfile ?? "none",
        contributions: def?.contributions ?? [],
        steps: def?.steps ?? [],
      };

  const complete = base.contributions.length > 0 && base.steps.length > 0 && base.minWageCents > 0;

  const versionRow = await db.payRegime.findFirst({
    where: { companyId: session.companyId, key },
    orderBy: { version: "desc" },
    select: { version: true },
  });

  const regime = await db.payRegime.create({
    data: {
      companyId: session.companyId,
      key,
      name: input.name,
      bundle: input.bundle,
      bundleStatus: complete ? "complete" : "incomplete",
      minWageType: base.minWageType,
      minWageCents: base.minWageCents,
      dailyHours: base.dailyHours,
      weeklyHours: base.weeklyHours,
      annualHours: base.annualHours ?? null,
      nightStart: base.nightStart,
      nightEnd: base.nightEnd,
      monthlyDaysBasis: base.monthlyDaysBasis,
      declarationProfile: base.declarationProfile,
      version: (versionRow?.version ?? 0) + 1,
      isActive: true,
      effectiveFrom: new Date(`${input.effectiveFrom}T00:00:00Z`),
      source: input.source ?? template?.source ?? null,
      needsAccountantConfirmation: false,
      notes: input.notes,
    },
  });
  if (base.contributions.length > 0) {
    await db.regimeContributionItem.createMany({
      data: base.contributions.map((c) => ({
        regimeId: regime.id, key: c.key, side: c.side, label: c.label, rateBp: c.rateBp,
        amountCents: c.amountCents ?? null, ceilingCents: c.ceilingCents ?? null, basis: c.basis,
        order: c.order, isActive: true, source: (c as { source?: string }).source ?? null,
      })),
    });
  }
  if (base.steps.length > 0) {
    await db.regimeCalcStep.createMany({
      data: base.steps.map((s) => ({ regimeId: regime.id, kind: s.kind, paramsJson: s.paramsJson, order: s.order, isActive: true })),
    });
  }

  const items = await db.regimeContributionItem.findMany({ where: { regimeId: regime.id } });
  const steps = await db.regimeCalcStep.findMany({ where: { regimeId: regime.id } });
  try {
    buildRegimeDefinition(regime as unknown as RawRegimeRow, items as unknown as RawContributionRow[], steps as unknown as RawCalcStepRow[]);
  } catch (e) {
    if (e instanceof InvalidRegimeError) {
      fail(422, "invalid_regime", { fields: e.fields });
    }
    throw e;
  }

  await writeAudit({
    companyId: session.companyId,
    userId: session.sub,
    action: "regime.create",
    entity: "pay_regime",
    entityId: regime.id,
    before: null,
    after: { key, bundle: input.bundle, bundleStatus: regime.bundleStatus, version: regime.version },
  });
  return regime;
}

// ── تعديل مسار الشركة: إصدار جديد لا تعديل للقديم ────────────────

export const updateRegimeSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  minWageType: z.enum(["hourly", "daily"]).optional(),
  minWageCents: z.number().int().positive().optional(),
  dailyHours: z.number().int().min(1).max(24).optional(),
  weeklyHours: z.number().int().min(1).max(168).optional(),
  annualHours: z.number().int().positive().nullable().optional(),
  nightStart: z.string().regex(/^\d{1,2}:\d{2}$/).optional(),
  nightEnd: z.string().regex(/^\d{1,2}:\d{2}$/).optional(),
  monthlyDaysBasis: z.number().int().min(1).max(31).optional(),
  declarationProfile: z.enum(["none", "cnss_ebds", "dgi_xml"]).optional(),
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  source: z.string().max(500).optional(),
  notes: z.string().max(2000).optional(),
  contributions: z
    .array(
      z.object({
        key: z.string().min(1).max(80),
        side: z.enum(["employee", "employer"]),
        label: z.string().min(1).max(120),
        rateBp: z.number().int().min(0),
        amountCents: z.number().int().positive().nullable().optional(),
        ceilingCents: z.number().int().positive().nullable().optional(),
        basis: z.enum(["cnss_base", "sbi", "gross"]),
        order: z.number().int().min(0),
        source: z.string().max(300).optional(),
      })
    )
    .optional(),
  steps: z
    .array(
      z.object({
        kind: z.enum(["employee_contributions", "pro_deduction_tiered", "ir_brackets", "family_deduction", "employer_contributions", "net_summary"]),
        paramsJson: z.string().default("{}"),
        order: z.number().int().min(0),
      })
    )
    .optional(),
});

export async function updateRegime(session: Session, regimeId: string, input: z.infer<typeof updateRegimeSchema>) {
  if (session.role !== "admin" && session.role !== "super_admin" && session.role !== "accountant") {
    fail(403, "forbidden");
  }
  const regime = await db.payRegime.findFirst({ where: { id: regimeId, companyId: session.companyId } });
  if (!regime) fail(404, "regime_not_found");
  if (regime.key === "general" || regime.key === "agricultural") {
    fail(422, "platform_template_readonly");
  }

  const newVersion = regime.version + 1;
  const existingItems = await db.regimeContributionItem.findMany({ where: { regimeId: regime.id } });
  const existingSteps = await db.regimeCalcStep.findMany({ where: { regimeId: regime.id } });
  const contributions = input.contributions ?? existingItems;
  const steps = input.steps ?? existingSteps;
  const complete =
    contributions.length > 0 &&
    steps.length > 0 &&
    (input.minWageCents ?? regime.minWageCents) > 0;

  const created = await db.payRegime.create({
    data: {
      companyId: session.companyId,
      key: regime.key,
      name: input.name ?? regime.name,
      bundle: regime.bundle,
      bundleStatus: complete ? "complete" : "incomplete",
      minWageType: input.minWageType ?? regime.minWageType,
      minWageCents: input.minWageCents ?? regime.minWageCents,
      dailyHours: input.dailyHours ?? regime.dailyHours,
      weeklyHours: input.weeklyHours ?? regime.weeklyHours,
      annualHours: input.annualHours !== undefined ? input.annualHours : regime.annualHours,
      nightStart: input.nightStart ?? regime.nightStart,
      nightEnd: input.nightEnd ?? regime.nightEnd,
      monthlyDaysBasis: input.monthlyDaysBasis ?? regime.monthlyDaysBasis,
      declarationProfile: input.declarationProfile ?? regime.declarationProfile,
      version: newVersion,
      isActive: true,
      effectiveFrom: input.effectiveFrom ? new Date(`${input.effectiveFrom}T00:00:00Z`) : regime.effectiveFrom,
      source: input.source ?? regime.source,
      needsAccountantConfirmation: regime.needsAccountantConfirmation,
      notes: input.notes ?? regime.notes,
    },
  });
  await db.payRegime.update({ where: { id: regime.id }, data: { isActive: false } });
  await db.regimeContributionItem.createMany({
    data: contributions.map((c) => ({
      regimeId: created.id, key: c.key, side: c.side, label: c.label, rateBp: c.rateBp,
      amountCents: c.amountCents ?? null, ceilingCents: c.ceilingCents ?? null, basis: c.basis,
      order: c.order, isActive: true, source: c.source ?? null,
    })),
  });
  await db.regimeCalcStep.createMany({
    data: steps.map((s) => ({ regimeId: created.id, kind: s.kind, paramsJson: s.paramsJson, order: s.order, isActive: true })),
  });

  await writeAudit({
    companyId: session.companyId,
    userId: session.sub,
    action: "regime.update",
    entity: "pay_regime",
    entityId: created.id,
    before: { id: regime.id, version: regime.version, isActive: true },
    after: { id: created.id, version: newVersion, bundleStatus: created.bundleStatus },
  });
  return created;
}

// ── تأكيد المحاسب لقاعدة الأساس الفلاحي (مرة واحدة ثم تُحفَظ) ────

export async function confirmRegime(session: Session, regimeId: string) {
  if (session.role !== "accountant" && session.role !== "super_admin") {
    fail(403, "forbidden");
  }
  const regime = await db.payRegime.findFirst({
    where: { id: regimeId, OR: [{ companyId: session.companyId }, { companyId: null }] },
  });
  if (!regime) fail(404, "regime_not_found");
  if (!regime.needsAccountantConfirmation) fail(422, "regime_needs_no_confirmation");
  if (regime.confirmedAt) fail(422, "regime_already_confirmed");

  let target = regime;
  if (regime.companyId === null) {
    const companyCopy = await db.payRegime.findFirst({
      where: { companyId: session.companyId, key: regime.key },
      orderBy: { version: "desc" },
    });
    if (companyCopy) {
      if (companyCopy.confirmedAt) fail(422, "regime_already_confirmed"); // التأكيد مرة واحدة (نسخة الشركة)
      target = companyCopy;
    } else {
      const versionRow = await db.payRegime.findFirst({
        where: { companyId: session.companyId, key: regime.key },
        orderBy: { version: "desc" },
        select: { version: true },
      });
      target = await db.payRegime.create({
        data: {
          companyId: session.companyId,
          key: regime.key,
          name: regime.name,
          bundle: regime.bundle,
          bundleStatus: regime.bundleStatus,
          minWageType: regime.minWageType,
          minWageCents: regime.minWageCents,
          dailyHours: regime.dailyHours,
          weeklyHours: regime.weeklyHours,
          annualHours: regime.annualHours,
          nightStart: regime.nightStart,
          nightEnd: regime.nightEnd,
          monthlyDaysBasis: regime.monthlyDaysBasis,
          declarationProfile: regime.declarationProfile,
          version: (versionRow?.version ?? 0) + 1,
          isActive: true,
          effectiveFrom: regime.effectiveFrom,
          source: regime.source,
          needsAccountantConfirmation: true,
        },
      });
      const items = await db.regimeContributionItem.findMany({ where: { regimeId: regime.id } });
      const stepsRows = await db.regimeCalcStep.findMany({ where: { regimeId: regime.id } });
      await db.regimeContributionItem.createMany({
        data: items.map((c) => ({
          regimeId: target.id, key: c.key, side: c.side, label: c.label, rateBp: c.rateBp,
          amountCents: c.amountCents, ceilingCents: c.ceilingCents, basis: c.basis,
          order: c.order, isActive: true, source: c.source,
        })),
      });
      await db.regimeCalcStep.createMany({
        data: stepsRows.map((s) => ({ regimeId: target.id, kind: s.kind, paramsJson: s.paramsJson, order: s.order, isActive: true })),
      });
    }
  }

  const updated = await db.payRegime.update({
    where: { id: target.id },
    data: { confirmedBy: session.sub, confirmedAt: new Date() },
  });
  await writeAudit({
    companyId: session.companyId,
    userId: session.sub,
    action: "regime.confirm",
    entity: "pay_regime",
    entityId: updated.id,
    before: { confirmedAt: null },
    after: { confirmedBy: session.sub, confirmedAt: updated.confirmedAt },
  });
  return updated;
}

// ── إسناد العمال ─────────────────────────────────────────────────

export const createAssignmentSchema = z.object({
  regimeId: z.string(),
  workerUserId: z.string(),
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export async function listAssignments(session: Session) {
  const rows = await db.regimeAssignment.findMany({
    where: { companyId: session.companyId },
    orderBy: [{ workerUserId: "asc" }, { effectiveFrom: "desc" }],
    include: {
      regime: { select: { id: true, key: true, name: true, bundle: true, version: true } },
    },
  });
  const users = await db.userMembership.findMany({
    where: { companyId: session.companyId, role: "employee", revokedAt: null },
    include: { user: { select: { id: true, fullName: true } } },
  });
  const names = new Map(users.map((u) => [u.userId, u.user.fullName]));
  return rows.map((r) => ({
    id: r.id,
    workerUserId: r.workerUserId,
    workerName: names.get(r.workerUserId) ?? r.workerUserId,
    regimeId: r.regimeId,
    regimeKey: r.regime.key,
    regimeName: r.regime.name,
    regimeBundle: r.regime.bundle,
    regimeVersion: r.regime.version,
    effectiveFrom: r.effectiveFrom,
    endedAt: r.endedAt,
  }));
}

export async function createAssignment(session: Session, input: z.infer<typeof createAssignmentSchema>) {
  if (session.role !== "admin" && session.role !== "super_admin") {
    fail(403, "forbidden");
  }
  const regime = await db.payRegime.findFirst({
    where: { id: input.regimeId, OR: [{ companyId: session.companyId }, { companyId: null }], isActive: true },
  });
  if (!regime) fail(404, "regime_not_found");
  const membership = await db.userMembership.findFirst({
    where: { companyId: session.companyId, userId: input.workerUserId, revokedAt: null },
  });
  if (!membership) fail(404, "worker_not_in_company");

  const previous = await db.regimeAssignment.findFirst({
    where: { companyId: session.companyId, workerUserId: input.workerUserId, endedAt: null },
    orderBy: { effectiveFrom: "desc" },
  });
  if (previous && previous.regimeId === regime.id && previous.effectiveFrom.getTime() === new Date(`${input.effectiveFrom}T00:00:00Z`).getTime()) {
    fail(409, "assignment_exists");
  }

  const assignment = await db.$transaction(async (tx) => {
    if (previous) {
      await tx.regimeAssignment.update({
        where: { id: previous.id },
        data: { endedAt: new Date(`${input.effectiveFrom}T00:00:00Z`) },
      });
    }
    return tx.regimeAssignment.create({
      data: {
        companyId: session.companyId,
        regimeId: regime.id,
        workerUserId: input.workerUserId,
        effectiveFrom: new Date(`${input.effectiveFrom}T00:00:00Z`),
        createdBy: session.sub,
      },
    });
  });

  await writeAudit({
    companyId: session.companyId,
    userId: session.sub,
    action: "regime.assign",
    entity: "regime_assignment",
    entityId: assignment.id,
    before: previous ? { id: previous.id, endedAt: null } : null,
    after: { regimeKey: regime.key, workerUserId: input.workerUserId, effectiveFrom: input.effectiveFrom },
  });
  return assignment;
}
