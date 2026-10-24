// HRMP — اختبار محرك المسارات (المرحلة 6ج — SPEC §12 و§11.9): انحدار + مسارات مستقلة
// التشغيل: bun tests/regime-engine.ts
// الأهداف:
//   1) الأمثلة الذهبية §11.9 إلى السنتيم — بلا مسار (سلوك 6أ/6ب) وبمسار عام من «صفوف قاعدة بيانات»
//      → التطابق بين المسارين إلزامي (regime من البيانات لا يغيّر الأرقام)
//   2) المسار الفلاحي: SMAG يومي 9744 (حدّ أدنى يومي)، ليل 5:00–20:00، أسبوع 48س
//   3) مسار مخصص: بند اشتراك إضافي + حذف خطوة الأعباء العائلية (قابلية التركيب)
//   4) توافق الوجوه: حزمتان مختلفتان بنتائج مستقلة (معيار قبول 6ج الحرفي)
import {
  buildRegimeDefinition,
  generalRegimeFromRules,
  regimeMinWageBreached,
  type RawCalcStepRow,
  type RawContributionRow,
  type RawRegimeRow,
  type RegimeDefinition,
} from "../src/lib/payroll/regime";
import { computePayslip } from "../src/lib/payroll/compute";
import type { ComputeInput, PayRuleSet, WorkedTime } from "../src/lib/payroll/types";

let passed = 0;
let failed = 0;
const failures: string[] = [];
function ok(cond: boolean, label: string) {
  if (cond) {
    passed++;
  } else {
    failed++;
    failures.push(label);
  }
}
function eq(actual: unknown, expected: unknown, label: string) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  ok(a === e, `${label} — actual=${a} expected=${e}`);
}

// ── مجموعة القواعد (قيم البذور pay-rules.ts — 2026) ─────────────
const rules: PayRuleSet = {
  smigHourlyCents: 1792,
  weeklyHours: 44,
  dailyHours: 8,
  otDayNormalBp: 250000,
  otNightNormalBp: 500000,
  otDayRestBp: 500000,
  otNightRestBp: 1000000,
  nightStartMin: 21 * 60,
  nightEndMin: 6 * 60,
  cnssEmployeeShortBp: 5200,
  cnssEmployeeLongBp: 39600,
  cnssCeilingCents: 600000,
  amoEmployeeBp: 22600,
  employerPrestShortBp: 10500,
  employerPrestLongBp: 79300,
  employerFamilyBp: 64000,
  employerAmoBp: 41100,
  employerTfpBp: 16000,
  irBrackets: [
    { upToMonthlyCents: 333333, rateBp: 0, deductMonthlyCents: 0 },
    { upToMonthlyCents: 500000, rateBp: 100000, deductMonthlyCents: 33333 },
    { upToMonthlyCents: 666667, rateBp: 200000, deductMonthlyCents: 83333 },
    { upToMonthlyCents: 833333, rateBp: 300000, deductMonthlyCents: 150000 },
    { upToMonthlyCents: 1500000, rateBp: 340000, deductMonthlyCents: 183333 },
    { upToMonthlyCents: null, rateBp: 370000, deductMonthlyCents: 228333 },
  ],
  irFamilyDeductionCents: 5000,
  irFamilyDeductionCapPeople: 6,
  proRate35LimitCents: 650000,
  proCap35Cents: 250000,
  proRate35Bp: 350000,
  proRate25Bp: 250000,
  proRate25CapCents: 291667,
  exemptTransportUrbanCents: 0,
  exemptTransportOutsideCents: 0,
  exemptMealsIrDailyCents: 0,
  exemptMealsCnssDailyCents: 0,
  provenance: {},
};

// ── صفوف «قاعدة بيانات» للمسار العام (كما ستخزنها البذور) ──────
const generalRow: RawRegimeRow = {
  id: "regime-general-test",
  companyId: null,
  key: "general",
  name: "general",
  bundle: "general",
  bundleStatus: "complete",
  minWageType: "hourly",
  minWageCents: 1792,
  dailyHours: 8,
  weeklyHours: 44,
  annualHours: null,
  nightStart: "21:00",
  nightEnd: "06:00",
  monthlyDaysBasis: 26,
  declarationProfile: "cnss_ebds",
  needsAccountantConfirmation: false,
  confirmedAt: null,
  isActive: true,
};

const generalItems: RawContributionRow[] = [
  { regimeId: "regime-general-test", key: "cnss_employee_short", side: "employee", label: "CNSS courtes", rateBp: 5200, amountCents: null, ceilingCents: 600000, basis: "cnss_base", order: 40, isActive: true },
  { regimeId: "regime-general-test", key: "cnss_employee_long", side: "employee", label: "CNSS longues", rateBp: 39600, amountCents: null, ceilingCents: 600000, basis: "cnss_base", order: 41, isActive: true },
  { regimeId: "regime-general-test", key: "amo_employee", side: "employee", label: "AMO", rateBp: 22600, amountCents: null, ceilingCents: null, basis: "cnss_base", order: 42, isActive: true },
  { regimeId: "regime-general-test", key: "employer_prest_short", side: "employer", label: "CNSS employeur courtes", rateBp: 10500, amountCents: null, ceilingCents: 600000, basis: "cnss_base", order: 70, isActive: true },
  { regimeId: "regime-general-test", key: "employer_prest_long", side: "employer", label: "CNSS employeur longues", rateBp: 79300, amountCents: null, ceilingCents: 600000, basis: "cnss_base", order: 71, isActive: true },
  { regimeId: "regime-general-test", key: "employer_family", side: "employer", label: "Allocations familiales", rateBp: 64000, amountCents: null, ceilingCents: null, basis: "cnss_base", order: 72, isActive: true },
  { regimeId: "regime-general-test", key: "employer_amo", side: "employer", label: "AMO employeur", rateBp: 41100, amountCents: null, ceilingCents: null, basis: "cnss_base", order: 73, isActive: true },
  { regimeId: "regime-general-test", key: "employer_tfp", side: "employer", label: "TFP", rateBp: 16000, amountCents: null, ceilingCents: null, basis: "cnss_base", order: 74, isActive: true },
];

const stepRow = (kind: string, order: number): RawCalcStepRow => ({
  regimeId: "regime-general-test",
  kind,
  paramsJson: JSON.stringify({ fromPayRules: true }),
  order,
  isActive: true,
});
const generalSteps: RawCalcStepRow[] = [
  stepRow("employee_contributions", 10),
  stepRow("pro_deduction_tiered", 20),
  stepRow("ir_brackets", 30),
  stepRow("family_deduction", 40),
  stepRow("employer_contributions", 50),
  stepRow("net_summary", 60),
];

const generalDbRegime = buildRegimeDefinition(generalRow, generalItems, generalSteps);

// ── سياق عمل شهري كامل (ساعي، 80 ساعة أساس، 20 يومًا) ───────────
function fullMonthWork(baseMinutes: number, days: number): WorkedTime {
  return {
    baseMinutes,
    overtime: { dayNormal: 0, nightNormal: 0, dayRest: 0, nightRest: 0 },
    totalMinutes: baseMinutes,
    workedDays: Array.from({ length: days }, (_, i) => `2026-10-${String(i + 1).padStart(2, "0")}`),
    breakMinutes: 0,
    scheduledMinutes: baseMinutes,
    attendedMinutes: baseMinutes,
    attendanceBased: true,
    daily: [],
  };
}

function monthlyInput(grossCents: number, dependents: number, regime?: RegimeDefinition): ComputeInput {
  // عامل شهري: بند الأساس = الأجر الشهري حرفيًا (يقبل أي قيمة إجمالية) ولا خصم غياب
  // (scheduled == attended)، فتصبح الأرقام مطابقة للأمثلة الذهبية مباشرة.
  const worked = fullMonthWork(173 * 60, 20);
  return {
    employee: {
      userId: "w1",
      payType: "monthly",
      hourlyRateCents: null,
      dailyRateCents: null,
      monthlyCents: grossCents,
      dependentsCount: dependents,
      transportZone: "urban",
    },
    worked,
    manualLines: [],
    rules,
    monthlyHoursDivisor: 191,
    regime,
  };
}

// ── 1) الأمثلة الذهبية §11.9 — بلا مسار ثم بمسار من «البيانات» ──
const GOLDEN: { gross: number; dep: number; cnss: number; amo: number; pro: number; rni: number; ir: number; net: number }[] = [
  { gross: 400000, dep: 0, cnss: 17920, amo: 9040, pro: 140000, rni: 233040, ir: 0, net: 373040 },
  { gross: 1000000, dep: 3, cnss: 26880, amo: 22600, pro: 250000, rni: 700520, ir: 45156, net: 905364 },
  { gross: 2500000, dep: 4, cnss: 26880, amo: 56500, pro: 291667, rni: 2124953, ir: 537900, net: 1878720 },
];

for (const g of GOLDEN) {
  const legacy = computePayslip(monthlyInput(g.gross, g.dep));
  eq(legacy.totals.grossCents, g.gross, `golden ${g.gross} gross`);
  eq(legacy.totals.cnssEmployeeCents, g.cnss, `golden ${g.gross} CNSS`);
  eq(legacy.totals.amoEmployeeCents, g.amo, `golden ${g.gross} AMO`);
  eq(legacy.totals.proDeductionCents, g.pro, `golden ${g.gross} pro`);
  eq(legacy.totals.rniCents, g.rni, `golden ${g.gross} RNI`);
  eq(legacy.totals.irNetCents, g.ir, `golden ${g.gross} IR net`);
  eq(legacy.totals.netCents, g.net, `golden ${g.gross} net`);

  const withRegime = computePayslip(monthlyInput(g.gross, g.dep, generalDbRegime));
  eq(withRegime.totals.grossCents, legacy.totals.grossCents, `regime==legacy ${g.gross} gross`);
  eq(withRegime.totals.cnssEmployeeCents, legacy.totals.cnssEmployeeCents, `regime==legacy ${g.gross} CNSS`);
  eq(withRegime.totals.amoEmployeeCents, legacy.totals.amoEmployeeCents, `regime==legacy ${g.gross} AMO`);
  eq(withRegime.totals.proDeductionCents, legacy.totals.proDeductionCents, `regime==legacy ${g.gross} pro`);
  eq(withRegime.totals.irNetCents, legacy.totals.irNetCents, `regime==legacy ${g.gross} IR`);
  eq(withRegime.totals.netCents, legacy.totals.netCents, `regime==legacy ${g.gross} net`);
  eq(withRegime.totals.employerCostCents, legacy.totals.employerCostCents, `regime==legacy ${g.gross} employer cost`);
  eq(JSON.stringify(withRegime.lines), JSON.stringify(legacy.lines), `regime==legacy ${g.gross} lines identical`);
}

// المسار العام من القواعد (fallback) == من صفوف قاعدة البيانات
const fallbackRegime = generalRegimeFromRules(rules);
for (const g of GOLDEN) {
  const a = computePayslip(monthlyInput(g.gross, g.dep, fallbackRegime));
  const b = computePayslip(monthlyInput(g.gross, g.dep, generalDbRegime));
  eq(a.totals.netCents, b.totals.netCents, `fallback==db-regime ${g.gross}`);
}

// ── 2) المسار الفلاحي (SMAG) ────────────────────────────────────
const agriculturalRow: RawRegimeRow = {
  ...generalRow,
  id: "regime-agri-test",
  key: "agricultural",
  name: "agricultural",
  bundle: "agricultural",
  minWageType: "daily",
  minWageCents: 9744,
  dailyHours: 8,
  weeklyHours: 48,
  annualHours: 2496,
  nightStart: "05:00",
  nightEnd: "20:00",
  monthlyDaysBasis: 26,
  needsAccountantConfirmation: true,
  confirmedAt: null,
};
const agriculturalItems: RawContributionRow[] = generalItems.map((i) => ({ ...i, regimeId: "regime-agri-test" }));
const agriculturalSteps: RawCalcStepRow[] = generalSteps.map((s) => ({ ...s, regimeId: "regime-agri-test" }));
const agriRegime = buildRegimeDefinition(agriculturalRow, agriculturalItems, agriculturalSteps);

eq(agriRegime.nightStartMin, 300, "agri night start 05:00 = 300min");
eq(agriRegime.nightEndMin, 1200, "agri night end 20:00 = 1200min");
eq(agriRegime.weeklyHours, 48, "agri weekly 48h");

ok(!regimeMinWageBreached(agriRegime, 9744 / 8, 9744), "SMAG 9744 daily OK");
ok(regimeMinWageBreached(agriRegime, 9000 / 8, 9000), "SMAG 9000 daily breached");
ok(regimeMinWageBreached(agriRegime, 1100, null), "SMAG hourly 1100 breached (1100×8 < 9744)");
ok(!regimeMinWageBreached(agriRegime, 1250, null), "SMAG hourly 1250 OK (1250×8 ≥ 9744)");

const agriInput: ComputeInput = {
  employee: {
    userId: "w-agri",
    payType: "daily",
    hourlyRateCents: null,
    dailyRateCents: 9744,
    monthlyCents: null,
    dependentsCount: 0,
    transportZone: "urban",
  },
  worked: fullMonthWork(26 * 8 * 60, 26),
  manualLines: [],
  rules,
  monthlyHoursDivisor: 26 * 8,
  regime: agriRegime,
};
const agriComputation = computePayslip(agriInput);
eq(agriComputation.totals.grossCents, 26 * 9744, "agri gross = 26 × SMAG");
ok(agriComputation.warnings.includes("regime_needs_confirmation"), "agri needs accountant confirmation warning");
ok(!agriComputation.smigBreached, "agri daily 9744 not breached");

const agriConfirmed = buildRegimeDefinition(
  { ...agriculturalRow, confirmedAt: new Date("2026-10-01") },
  agriculturalItems,
  agriculturalSteps
);
const agriComputation2 = computePayslip({ ...agriInput, regime: agriConfirmed });
ok(!agriComputation2.warnings.includes("regime_needs_confirmation"), "agri confirmed → no warning");

const agriMonthlyInput: ComputeInput = {
  employee: {
    userId: "w-agri-m",
    payType: "monthly",
    hourlyRateCents: null,
    dailyRateCents: null,
    monthlyCents: 26 * 9744,
    dependentsCount: 0,
    transportZone: "urban",
  },
  worked: fullMonthWork(208 * 60, 26),
  manualLines: [],
  rules,
  monthlyHoursDivisor: 208,
  regime: agriConfirmed,
};
const agriMonthly = computePayslip(agriMonthlyInput);
eq(agriMonthly.totals.grossCents, 253344, "agri monthly gross 26×9744=253344");
eq(agriMonthly.totals.effectiveHourlyCents, 1218, "agri monthly effective hourly 253344/208");

// ── 3) مسار مخصص: بند إضافي + حذف خطوة (قابلية التركيب SPEC §12) ──
const customItems: RawContributionRow[] = [
  ...generalItems.map((i) => ({ ...i, regimeId: "regime-custom" })),
  { regimeId: "regime-custom", key: "mutuelle_employee", side: "employee", label: "Mutuelle 1%", rateBp: 10000, amountCents: null, ceilingCents: null, basis: "gross", order: 45, isActive: true },
];
const customSteps: RawCalcStepRow[] = generalSteps
  .filter((s) => s.kind !== "family_deduction")
  .map((s) => ({ ...s, regimeId: "regime-custom" }));
const customRow: RawRegimeRow = {
  ...generalRow,
  id: "regime-custom",
  key: "custom-test",
  name: "Custom",
  bundle: "custom",
  declarationProfile: "none",
};
const customRegime = buildRegimeDefinition(customRow, customItems, customSteps);

const customComputation = computePayslip(monthlyInput(400000, 4, customRegime));
eq(customComputation.totals.employeeOtherCents, 4000, "custom mutuelle 1% of gross = 4000");
eq(customComputation.totals.familyDeductionCents, 0, "custom no family deduction step");
const generalSame = computePayslip(monthlyInput(400000, 4, generalDbRegime));
// 4000: IR=0 في هذه الشريحة → الصافي = عام − 4000 حصرًا
eq(customComputation.totals.netCents, generalSame.totals.netCents - 4000, "custom net = general net − mutuelle");
ok(customComputation.lines.some((l) => l.kind === "mutuelle_employee"), "custom line kind present");

// ── 4) حزمتان مستقلتان (معيار القبول: نتائج مستقلة صحيحة) ────────
const generalDailyInput: ComputeInput = {
  employee: {
    userId: "w-gen-d",
    payType: "daily",
    hourlyRateCents: null,
    dailyRateCents: 9744,
    monthlyCents: null,
    dependentsCount: 0,
    transportZone: "urban",
  },
  worked: fullMonthWork(26 * 8 * 60, 26),
  manualLines: [],
  rules,
  monthlyHoursDivisor: 191,
  regime: generalDbRegime,
};
const generalDaily = computePayslip(generalDailyInput);
eq(generalDaily.totals.effectiveHourlyCents, 1218, "general daily 9744/8 = 1218");
// الاختلاف الجوهري بين المسارين على نفس الأجر: عام ساعي (1218 < 1792 مُخترق)؛ فلاحي يومي (9744 مجتاز)
ok(generalDaily.smigBreached === true, "general: daily 9744 as hourly-equiv breaches SMIG");
ok(agriComputation.smigBreached === false, "agricultural: same wage passes SMAG");

// ── 5) التحقق من رفض تعريفات فاسدة (أخطاء مجمّعة واضحة) ─────────
try {
  buildRegimeDefinition({ ...generalRow, nightStart: "25:00" } as RawRegimeRow, generalItems, generalSteps);
  ok(false, "invalid nightStart must throw");
} catch (e) {
  ok((e as { fields?: string[] }).fields?.includes("nightStart") === true, "invalid nightStart → field error");
}
try {
  buildRegimeDefinition(generalRow, [
    ...generalItems,
    { regimeId: "regime-general-test", key: "bad_side", side: "government", label: "x", rateBp: 100, amountCents: null, ceilingCents: null, basis: "cnss_base", order: 50, isActive: true },
  ], generalSteps);
  ok(false, "invalid side must throw");
} catch (e) {
  ok((e as { fields?: string[] }).fields?.some((f) => f.startsWith("item.")) === true, "invalid side → item field error");
}

// ── 6) حدود §11.8/§11.9 الإضافية (سقف CNSS عند 6000 بالضبط) ─────
const at6k = computePayslip(monthlyInput(600000, 0, generalDbRegime));
eq(at6k.totals.cnssEmployeeCents, 26880, "CNSS capped at 6000 exactly → 4.48% × 600000 = 26880");
const above6k = computePayslip(monthlyInput(600001, 0, generalDbRegime));
eq(above6k.totals.cnssEmployeeCents, 26880, "CNSS capped above 6000 → still 26880");
eq(above6k.totals.amoEmployeeCents, Math.round(600001 * 0.0226), "AMO uncapped above 6000");

const at65 = computePayslip(monthlyInput(650000, 0, generalDbRegime));
eq(at65.totals.proDeductionCents, 227500, "pro 35% at 6500 = 227500 (cap 250000)");
const above65 = computePayslip(monthlyInput(650001, 0, generalDbRegime));
eq(above65.totals.proDeductionCents, 162500, "pro 25% at 650001 = 162500 (under cap)");

// ── النتيجة ──────────────────────────────────────────────────────
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log("FAILURES:");
  for (const f of failures) console.log("  ✗ " + f);
  process.exit(1);
}
