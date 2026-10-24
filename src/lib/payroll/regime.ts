// HRMP — محرك المسارات (SPEC §12 — المرحلة 6ج): تعريف المسار بيانات لا كود
// «لا يوجد محرك أجور واحد بشروط مبعثرة. يوجد محرك واحد يقرأ تعريف مسار (regime) من البيانات»
// كل عامل مُسنَد لمسار بتاريخ سريان (RegimeAssignment)؛ بلا إسناد → المسار العام (سلوك متوافق 6أ/6ب).
// نقية بلا قاعدة بيانات: الصفوف الخام من الخدمة تُحوَّل هنا إلى تعريف جاهز للمحرك.
// ⚠️ اصطلاح النسب كالعادة: «نسبة مئوية ×10000» (0.52% → 520) → الكسر = القيمة / 10^6

import type { PayRuleSet } from "./types";

// ── الأنواع النقية ────────────────────────────────────────────────

export const REGIME_BUNDLES = [
  "general",
  "agricultural",
  "public_civil_service",
  "public_entreprise",
  "custom",
] as const;
export type RegimeBundle = (typeof REGIME_BUNDLES)[number];

export const CONTRIBUTION_SIDES = ["employee", "employer"] as const;
export type ContributionSide = (typeof CONTRIBUTION_SIDES)[number];

export const CONTRIBUTION_BASES = ["cnss_base", "sbi", "gross"] as const;
export type ContributionBasis = (typeof CONTRIBUTION_BASES)[number];

export const CALC_STEP_KINDS = [
  "employee_contributions", // بنود اشتراكات الأجير من قائمة البنود
  "pro_deduction_tiered", // الحصة المهنية بشريحتين وسقفين
  "ir_brackets", // الضريبة على الدخل بالشرائح
  "family_deduction", // خصم الأعباء العائلية
  "employer_contributions", // بنود اشتراكات المشغّل من قائمة البنود
  "net_summary", // تجميع الصافي (لا يُحسب — يعرّف ترتيب التقرير)
] as const;
export type CalcStepKind = (typeof CALC_STEP_KINDS)[number];

export const DECLARATION_PROFILES = ["none", "cnss_ebds", "dgi_xml"] as const;
export type DeclarationProfile = (typeof DECLARATION_PROFILES)[number];

/** بند اشتراك واحد كما يستهلكه المحرك (SPEC §12: قائمة بنود لا افتراض CNSS/AMO) */
export type RegimeContribution = {
  key: string; // مفتاح البند (يصبح kind بند الكشف)
  side: ContributionSide;
  label: string;
  rateBp: number; // 0 عند المبلغ الثابت
  amountCents: number | null; // بديل النسبة (بند بمبلغ ثابت)
  ceilingCents: number | null; // سقف الأساس — null بلا سقف
  basis: ContributionBasis;
  order: number;
};

/** خطوة حساب قابلة للتركيب (SPEC §12: «قائمة خطوات لا دالة واحدة») */
export type RegimeCalcStepDef = {
  kind: CalcStepKind;
  order: number;
  fromPayRules: boolean; // true: تقرأ معاملاتها من pay_rules السارية (المرجع الموحد)
  params: Record<string, number | string | null>; // قيم صريحة لمسار مخصص (تتقدم على pay_rules عند وجودها)
};

/** تعريف المسار الكامل كما يستهلكه المحرك */
export type RegimeDefinition = {
  id: string;
  key: string;
  name: string;
  bundle: RegimeBundle;
  bundleStatus: "complete" | "incomplete";
  minWageType: "hourly" | "daily";
  minWageCents: number;
  dailyHours: number;
  weeklyHours: number;
  annualHours: number | null;
  nightStartMin: number;
  nightEndMin: number;
  monthlyDaysBasis: number;
  declarationProfile: DeclarationProfile;
  needsAccountantConfirmation: boolean;
  confirmedAt: Date | null;
  contributions: RegimeContribution[];
  steps: RegimeCalcStepDef[];
};

// ── الصفوف الخام من قاعدة البيانات ────────────────────────────────

export type RawRegimeRow = {
  id: string;
  companyId: string | null;
  key: string;
  name: string;
  bundle: string;
  bundleStatus: string;
  minWageType: string;
  minWageCents: number;
  dailyHours: number;
  weeklyHours: number;
  annualHours: number | null;
  nightStart: string;
  nightEnd: string;
  monthlyDaysBasis: number;
  declarationProfile: string;
  needsAccountantConfirmation: boolean;
  confirmedAt: Date | null;
  isActive: boolean;
};

export type RawContributionRow = {
  regimeId: string;
  key: string;
  side: string;
  label: string;
  rateBp: number;
  amountCents: number | null;
  ceilingCents: number | null;
  basis: string;
  order: number;
  isActive: boolean;
};

export type RawCalcStepRow = {
  regimeId: string;
  kind: string;
  paramsJson: string;
  order: number;
  isActive: boolean;
};

// ── التحقق من القيم النصية (SQLite بلا enums — طبقة التطبيق) ───────

export class InvalidRegimeError extends Error {
  fields: string[];
  constructor(fields: string[], message?: string) {
    super(message ?? `invalid_regime: ${fields.join(", ")}`);
    this.name = "InvalidRegimeError";
    this.fields = fields;
  }
}

function parseClockMin(value: string, field: string, errors: string[]): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) {
    errors.push(field);
    return 0;
  }
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) {
    errors.push(field);
    return 0;
  }
  return h * 60 + min;
}

/**
 * بناء تعريف المسار من الصفوف الخام — يتحقق من كل قيمة نصية ويجمع الأخطاء دفعة واحدة
 * (أخطاء واضحة لسجل التدقيق والواجهة، لا استثناءات غامضة).
 */
export function buildRegimeDefinition(
  regime: RawRegimeRow,
  contributions: RawContributionRow[],
  steps: RawCalcStepRow[]
): RegimeDefinition {
  const errors: string[] = [];

  if (!REGIME_BUNDLES.includes(regime.bundle as RegimeBundle)) errors.push("bundle");
  if (regime.bundleStatus !== "complete" && regime.bundleStatus !== "incomplete") errors.push("bundleStatus");
  if (regime.minWageType !== "hourly" && regime.minWageType !== "daily") errors.push("minWageType");
  if (regime.minWageCents <= 0) errors.push("minWageCents");
  if (regime.dailyHours <= 0 || regime.dailyHours > 24) errors.push("dailyHours");
  if (regime.weeklyHours <= 0 || regime.weeklyHours > 168) errors.push("weeklyHours");
  if (regime.monthlyDaysBasis <= 0 || regime.monthlyDaysBasis > 31) errors.push("monthlyDaysBasis");
  if (!DECLARATION_PROFILES.includes(regime.declarationProfile as DeclarationProfile)) errors.push("declarationProfile");

  const nightStartMin = parseClockMin(regime.nightStart, "nightStart", errors);
  const nightEndMin = parseClockMin(regime.nightEnd, "nightEnd", errors);

  const items: RegimeContribution[] = [];
  for (const c of contributions) {
    if (!c.isActive) continue;
    if (!CONTRIBUTION_SIDES.includes(c.side as ContributionSide)) {
      errors.push(`item.${c.key}.side`);
      continue;
    }
    if (!CONTRIBUTION_BASES.includes(c.basis as ContributionBasis)) {
      errors.push(`item.${c.key}.basis`);
      continue;
    }
    if (c.rateBp < 0) {
      errors.push(`item.${c.key}.rateBp`);
      continue;
    }
    if (c.rateBp === 0 && (c.amountCents === null || c.amountCents <= 0)) {
      errors.push(`item.${c.key}.amountCents`);
      continue;
    }
    items.push({
      key: c.key,
      side: c.side as ContributionSide,
      label: c.label,
      rateBp: c.rateBp,
      amountCents: c.amountCents,
      ceilingCents: c.ceilingCents,
      basis: c.basis as ContributionBasis,
      order: c.order,
    });
  }

  const stepDefs: RegimeCalcStepDef[] = [];
  for (const s of steps) {
    if (!s.isActive) continue;
    if (!CALC_STEP_KINDS.includes(s.kind as CalcStepKind)) {
      errors.push(`step.${s.kind}`);
      continue;
    }
    let params: Record<string, unknown> = {};
    let fromPayRules = false;
    try {
      const parsed = JSON.parse(s.paramsJson === "" ? "{}" : s.paramsJson);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        params = parsed as Record<string, unknown>;
        fromPayRules = params.fromPayRules === true;
      } else {
        errors.push(`step.${s.kind}.paramsJson`);
        continue;
      }
    } catch {
      errors.push(`step.${s.kind}.paramsJson`);
      continue;
    }
    const cleanParams: Record<string, number | string | null> = {};
    for (const [k, v] of Object.entries(params)) {
      if (k === "fromPayRules") continue;
      if (typeof v === "number" || typeof v === "string" || v === null) cleanParams[k] = v;
    }
    stepDefs.push({ kind: s.kind as CalcStepKind, order: s.order, fromPayRules, params: cleanParams });
  }

  if (errors.length > 0) throw new InvalidRegimeError(errors);

  items.sort((a, b) => a.order - b.order);
  stepDefs.sort((a, b) => a.order - b.order);

  return {
    id: regime.id,
    key: regime.key,
    name: regime.name,
    bundle: regime.bundle as RegimeBundle,
    bundleStatus: regime.bundleStatus as "complete" | "incomplete",
    minWageType: regime.minWageType as "hourly" | "daily",
    minWageCents: regime.minWageCents,
    dailyHours: regime.dailyHours,
    weeklyHours: regime.weeklyHours,
    annualHours: regime.annualHours,
    nightStartMin,
    nightEndMin,
    monthlyDaysBasis: regime.monthlyDaysBasis,
    declarationProfile: regime.declarationProfile as DeclarationProfile,
    needsAccountantConfirmation: regime.needsAccountantConfirmation,
    confirmedAt: regime.confirmedAt,
    contributions: items,
    steps: stepDefs,
  };
}

// ── الحد الأدنى للمسار (SPEC §12: «التحقق من الحد الأدنى يتبع مسار العامل») ──

/**
 * مقارنة أجر العامل بالحد الأدنى للمسار:
 * - hourly (SMIG): سعر الساعة الفعلي ≥ الحد الأدنى الساعي
 * - daily (SMAG): الأجر اليومي الفعلي ≥ الحد الأدنى اليومي (سعر الساعة × ساعات اليوم للمقارنة)
 */
export function regimeMinWageBreached(
  regime: Pick<RegimeDefinition, "minWageType" | "minWageCents" | "dailyHours">,
  effectiveHourlyCents: number | null,
  effectiveDailyCents: number | null
): boolean {
  if (regime.minWageType === "daily") {
    if (effectiveDailyCents !== null) return effectiveDailyCents < regime.minWageCents;
    if (effectiveHourlyCents === null) return true;
    return effectiveHourlyCents * regime.dailyHours < regime.minWageCents;
  }
  if (effectiveHourlyCents === null) return true;
  return effectiveHourlyCents < regime.minWageCents;
}

// ── المسار الافتراضي المتوافق مع 6أ/6ب (سلوك الرجوع عند غياب الإسناد) ──

/**
 * تعريف المسار العام مبنياً من PayRuleSet — يطابق حرفياً سلوك المرحلة 6أ/6ب
 * (يُستخدم عند غياب إسناد عامل، وفي الاختبارات الذهبية كخط أساس للمقارنة).
 */
export function generalRegimeFromRules(rules: PayRuleSet): RegimeDefinition {
  return {
    id: "builtin-general",
    key: "general",
    name: "general",
    bundle: "general",
    bundleStatus: "complete",
    minWageType: "hourly",
    minWageCents: rules.smigHourlyCents,
    dailyHours: rules.dailyHours,
    weeklyHours: rules.weeklyHours,
    annualHours: null,
    nightStartMin: rules.nightStartMin,
    nightEndMin: rules.nightEndMin,
    monthlyDaysBasis: 26,
    declarationProfile: "cnss_ebds",
    needsAccountantConfirmation: false,
    confirmedAt: null,
    contributions: [
      { key: "cnss_employee_short", side: "employee", label: "CNSS (Prestations courtes)", rateBp: rules.cnssEmployeeShortBp, amountCents: null, ceilingCents: rules.cnssCeilingCents, basis: "cnss_base", order: 40 },
      { key: "cnss_employee_long", side: "employee", label: "CNSS (Prestations longues)", rateBp: rules.cnssEmployeeLongBp, amountCents: null, ceilingCents: rules.cnssCeilingCents, basis: "cnss_base", order: 41 },
      { key: "amo_employee", side: "employee", label: "AMO", rateBp: rules.amoEmployeeBp, amountCents: null, ceilingCents: null, basis: "cnss_base", order: 42 },
      { key: "employer_prest_short", side: "employer", label: "CNSS employeur (courtes)", rateBp: rules.employerPrestShortBp, amountCents: null, ceilingCents: rules.cnssCeilingCents, basis: "cnss_base", order: 70 },
      { key: "employer_prest_long", side: "employer", label: "CNSS employeur (longues)", rateBp: rules.employerPrestLongBp, amountCents: null, ceilingCents: rules.cnssCeilingCents, basis: "cnss_base", order: 71 },
      { key: "employer_family", side: "employer", label: "Allocations familiales", rateBp: rules.employerFamilyBp, amountCents: null, ceilingCents: null, basis: "cnss_base", order: 72 },
      { key: "employer_amo", side: "employer", label: "AMO employeur", rateBp: rules.employerAmoBp, amountCents: null, ceilingCents: null, basis: "cnss_base", order: 73 },
      { key: "employer_tfp", side: "employer", label: "TFP", rateBp: rules.employerTfpBp, amountCents: null, ceilingCents: null, basis: "cnss_base", order: 74 },
    ],
    steps: [
      { kind: "employee_contributions", order: 10, fromPayRules: true, params: {} },
      { kind: "pro_deduction_tiered", order: 20, fromPayRules: true, params: {} },
      { kind: "ir_brackets", order: 30, fromPayRules: true, params: {} },
      { kind: "family_deduction", order: 40, fromPayRules: true, params: {} },
      { kind: "employer_contributions", order: 50, fromPayRules: true, params: {} },
      { kind: "net_summary", order: 60, fromPayRules: true, params: {} },
    ],
  };
}
