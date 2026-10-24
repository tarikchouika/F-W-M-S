// HRMP — محرك حساب كشف الأجر (SPEC §4.3 و§11.6 — المرحلة 6أ+6ب): دوال نقية بلا قاعدة بيانات
// خط الحساب الشهري (SPEC §11.6 بالترتيب):
//   1) الإجمالي = أساس + إضافي (بنسب المادة 201) + علاوات/مكافآت − خصم الغياب
//   2) SBI = الإجمالي − المعفى من IR (نقل/وجبات ضمن السقوف)
//   3) CNSS أجير = (0.52% + 3.96%) × min(الأساس، 6000) — فرعين منفصلين (لوازم التصريح)
//   4) AMO أجير = 2.26% × الأساس (بلا سقف)
//   5) الحصة المهنية: 35% (سقف 2500) للإجمالي ≤ 6500، وإلا 25% (سقف 2916.67)
//   6) RNI = SBI − CNSS − AMO − الحصة المهنية
//   7) IR = شريحة RNI × النسبة − المطروح
//   8) IR الصافي = IR − (المعالون × 50، سقف 6) — لا ينزل عن صفر
//   9) الصافي = الإجمالي − CNSS − AMO − IR − خصومات أخرى (سلف...)
//  + تكلفة المشغّل فرعًا فرعًا (1.05/7.93/6.40/4.11/1.60%)
//
// ⚠️ ملاحظة توثيقية (تُراجَع من المحاسب — راجع KNOWLEDGE_BASE): نص SPEC §11.6 خطوة 5 يقول
//    «الحصة المهنية من (SBI − CNSS − AMO)» بينما أمثلة §11.9 المرجعية (معيار قبول 6ب الحرفي)
//    تحسبها من SBI مباشرة (مثال 4000: 1400 لا 1305.64). اعتمدنا §11.9 (المعيار الملزم)
//    مع إثبات التطابق إلى السنتيم في tests/payroll-engine.ts.
// التقريب: سنتيم في نهاية كل بند فقط (SPEC §11.6 «تفاصيل تُحسم في الكود وتُختبر»)
// المرحلة 6ج (SPEC §12): عند تمرير regime يقرأ المحرك بنود الاشتراكات وخطوات الضريبة
// من تعريف المسار (بيانات) — بلا regime يبقى السلوك القديم المبني على pay_rules حرفيًا (توافق الاختبارات الذهبية).
import type {
  Computation,
  ComputedLine,
  ComputeInput,
  ManualLineInput,
  PayrollWarning,
} from "./types";
import { regimeMinWageBreached, type RegimeDefinition } from "./regime";

/** تطبيق نسبة مخزنة «نسبة مئوية ×10000» على أساس بالسنتيم → سنتيم مقرَّب */
export function applyRate(baseCents: number, rateX10000: number): number {
  return Math.round((baseCents * rateX10000) / 1_000_000);
}

/** أجر الساعة المكافئ (سنتيم) بحسب نظام الاحتساب — للإضافي وحد SMIG/SMAG */
export function effectiveHourlyCents(input: ComputeInput): number | null {
  const { employee, rules, regime } = input;
  if (employee.payType === "hourly") return employee.hourlyRateCents;
  if (employee.payType === "monthly") {
    if (employee.monthlyCents === null) return null;
    return Math.round(employee.monthlyCents / input.monthlyHoursDivisor);
  }
  const dailyHours = regime ? regime.dailyHours : rules.dailyHours;
  if (employee.dailyRateCents === null || dailyHours <= 0) return null;
  return Math.round(employee.dailyRateCents / dailyHours);
}

/** دقائق الإضافي → مبلغ بند (سعر الساعة × (1 + النسبة)) */
function otLine(minutes: number, hourlyCents: number, bp: number, kind: string, order: number, reason?: string): ComputedLine {
  const amount = Math.round((minutes * hourlyCents * (1_000_000 + bp)) / (60 * 1_000_000));
  return { kind, minutes, rateBp: bp, amountCents: amount, exemptIrCents: 0, exemptCnssCents: 0, order, reason };
}

const MANUAL_KINDS: ManualLineInput["kind"][] = ["bonus", "deduction", "allowance_transport", "allowance_meals"];

/** شريحة IR من خطوة مسار (params صريحة أو من pay_rules السارية) */
type StepBracket = { upToMonthlyCents: number | null; rateBp: number; deductMonthlyCents: number };

function parseStepBrackets(raw: unknown): StepBracket[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const out: StepBracket[] = [];
  for (const b of raw) {
    const row = b as Record<string, unknown>;
    const upTo = row.upToMonthlyCents === null || row.upToMonthlyCents === undefined ? null : Number(row.upToMonthlyCents);
    const rateBp = Number(row.rateBp);
    const deduct = Number(row.deductMonthlyCents);
    if (upTo !== null && !Number.isFinite(upTo)) return null;
    if (!Number.isFinite(rateBp) || rateBp < 0) return null;
    if (!Number.isFinite(deduct) || deduct < 0) return null;
    out.push({ upToMonthlyCents: upTo, rateBp, deductMonthlyCents: deduct });
  }
  out.sort((a, b) => {
    if (a.upToMonthlyCents === null) return 1;
    if (b.upToMonthlyCents === null) return -1;
    return a.upToMonthlyCents - b.upToMonthlyCents;
  });
  return out;
}

/** الحساب الكامل لكشف واحد — كل المبالغ سنتيم صحيح */
export function computePayslip(input: ComputeInput): Computation {
  const { employee, worked, manualLines, rules, regime } = input;
  const warnings = new Set<PayrollWarning>();

  if (employee.payType === "hourly" && employee.hourlyRateCents === null) throw new Error("missing_hourly_rate");
  if (employee.payType === "daily" && employee.dailyRateCents === null) throw new Error("missing_daily_rate");
  if (employee.payType === "monthly" && employee.monthlyCents === null) throw new Error("missing_monthly_rate");
  for (const line of manualLines) {
    if (!MANUAL_KINDS.includes(line.kind)) throw new Error(`invalid_manual_kind: ${line.kind}`);
    if (!Number.isInteger(line.amountCents) || line.amountCents <= 0) throw new Error("invalid_manual_amount");
  }

  const hourly = effectiveHourlyCents(input);
  const lines: ComputedLine[] = [];

  // ── 1) الأساس (أنظمة الاحتساب الثلاثة — SPEC §4.3) ─────────────
  if (employee.payType === "hourly") {
    lines.push({
      kind: "base_hours",
      minutes: worked.baseMinutes,
      rateBp: null,
      amountCents: Math.round((worked.baseMinutes * (employee.hourlyRateCents as number)) / 60),
      exemptIrCents: 0,
      exemptCnssCents: 0,
      order: 10,
    });
  } else if (employee.payType === "daily") {
    lines.push({
      kind: "base_days",
      minutes: worked.baseMinutes,
      rateBp: null,
      amountCents: worked.workedDays.length * (employee.dailyRateCents as number),
      exemptIrCents: 0,
      exemptCnssCents: 0,
      order: 10,
    });
  } else {
    lines.push({
      kind: "base_monthly",
      minutes: worked.baseMinutes,
      rateBp: null,
      amountCents: employee.monthlyCents as number,
      exemptIrCents: 0,
      exemptCnssCents: 0,
      order: 10,
    });
    // خصم الغياب غير المبرر تلقائيًا (SPEC §4.3): المجدول − الموثق، بسعر الساعة المكافئ
    if (worked.attendanceBased) {
      const absentMinutes = Math.max(0, worked.scheduledMinutes - worked.attendedMinutes);
      if (absentMinutes > 0) {
        const hourlyEq = Math.round((employee.monthlyCents as number) / input.monthlyHoursDivisor);
        lines.push({
          kind: "absence_deduction",
          minutes: absentMinutes,
          rateBp: null,
          amountCents: -Math.round((absentMinutes * hourlyEq) / 60),
          exemptIrCents: 0,
          exemptCnssCents: 0,
          order: 12,
        });
      }
    }
  }

  // ── 2) الإضافي: الحالات الأربع (المادة 201 — SPEC §11.4) ───────
  const ot = worked.overtime;
  if (ot.dayNormal > 0 && hourly !== null) lines.push(otLine(ot.dayNormal, hourly, rules.otDayNormalBp, "ot_day_normal", 20));
  if (ot.nightNormal > 0 && hourly !== null) lines.push(otLine(ot.nightNormal, hourly, rules.otNightNormalBp, "ot_night_normal", 21));
  if (ot.dayRest > 0 && hourly !== null) lines.push(otLine(ot.dayRest, hourly, rules.otDayRestBp, "ot_day_rest", 22));
  if (ot.nightRest > 0 && hourly !== null) lines.push(otLine(ot.nightRest, hourly, rules.otNightRestBp, "ot_night_rest", 23));

  // ── 3) البنود اليدوية: مكافآت وبدلات (معفى ضمن السقوف) وخصومات ─
  for (const manual of manualLines) {
    if (manual.kind === "bonus") {
      lines.push({ kind: "bonus", minutes: null, rateBp: null, amountCents: manual.amountCents, exemptIrCents: 0, exemptCnssCents: 0, order: 30, reason: manual.reason });
    } else if (manual.kind === "deduction") {
      // خصم من الصافي (سلف وغيرها — SPEC §11.6 خطوة 9) — لا يمس الوعاء الضريبي
      lines.push({ kind: "deduction", minutes: null, rateBp: null, amountCents: -manual.amountCents, exemptIrCents: 0, exemptCnssCents: 0, order: 60, reason: manual.reason });
    } else if (manual.kind === "allowance_transport") {
      const cap = employee.transportZone === "outside" ? rules.exemptTransportOutsideCents : rules.exemptTransportUrbanCents;
      const exempt = Math.min(manual.amountCents, cap);
      if (manual.amountCents > cap) warnings.add("transport_cap_exceeded");
      // ما يتجاوز السقف يُضاف تلقائيًا إلى الخاضع للضريبة والاشتراكات (SPEC §11.6)
      lines.push({ kind: "allowance_transport", minutes: null, rateBp: null, amountCents: manual.amountCents, exemptIrCents: exempt, exemptCnssCents: exempt, order: 31, reason: manual.reason });
    } else {
      const irCap = rules.exemptMealsIrDailyCents * worked.workedDays.length;
      const cnssCap = rules.exemptMealsCnssDailyCents * worked.workedDays.length;
      const exemptIr = Math.min(manual.amountCents, irCap);
      const exemptCnss = Math.min(manual.amountCents, cnssCap);
      if (manual.amountCents > irCap || manual.amountCents > cnssCap) warnings.add("meals_caps_exceeded");
      lines.push({ kind: "allowance_meals", minutes: null, rateBp: null, amountCents: manual.amountCents, exemptIrCents: exemptIr, exemptCnssCents: exemptCnss, order: 32, reason: manual.reason });
    }
  }

  // ── الإجمالي والوعاءان ──────────────────────────────────────────
  const grossCents = lines
    .filter((l) => l.kind !== "deduction") // خصم السلف على الصافي لا الإجمالي
    .reduce((acc, l) => acc + l.amountCents, 0);
  const exemptIrTotal = lines.reduce((acc, l) => acc + l.exemptIrCents, 0);
  const exemptCnssTotal = lines.reduce((acc, l) => acc + l.exemptCnssCents, 0);
  const sbiCents = Math.max(0, grossCents - exemptIrTotal); // الإجمالي الخاضع للـ IR
  const cnssBaseCents = Math.max(0, grossCents - exemptCnssTotal); // الأساس الخاضع للـ CNSS/AMO

  // ── 4/5) اقتطاعات الأجير — من قائمة بنود المسار (SPEC §12) أو من pay_rules (توافق 6أ/6ب) ──
  let cnssEmployee = 0;
  let amoEmployee = 0;
  let employeeOther = 0;

  if (regime) {
    // «الحساب يقرأ قائمة البنود ولا يفترض أن الاشتراكات دائمًا CNSS وAMO» (SPEC §12)
    for (const item of regime.contributions) {
      if (item.side !== "employee") continue;
      const basisCents = item.basis === "sbi" ? sbiCents : item.basis === "gross" ? grossCents : cnssBaseCents;
      const base = item.ceilingCents !== null ? Math.min(basisCents, item.ceilingCents) : basisCents;
      const amount = item.rateBp === 0 && item.amountCents !== null ? item.amountCents : applyRate(base, item.rateBp);
      lines.push({
        kind: item.key,
        minutes: null,
        rateBp: item.rateBp === 0 ? null : item.rateBp,
        amountCents: -amount,
        exemptIrCents: 0,
        exemptCnssCents: 0,
        order: item.order,
      });
      if (item.key === "cnss_employee_short" || item.key === "cnss_employee_long") cnssEmployee += amount;
      else if (item.key === "amo_employee") amoEmployee += amount;
      else employeeOther += amount;
    }
  } else {
    const cappedBase = Math.min(cnssBaseCents, rules.cnssCeilingCents);
    const cnssShort = applyRate(cappedBase, rules.cnssEmployeeShortBp);
    const cnssLong = applyRate(cappedBase, rules.cnssEmployeeLongBp);
    amoEmployee = applyRate(cnssBaseCents, rules.amoEmployeeBp);
    lines.push({ kind: "cnss_employee_short", minutes: null, rateBp: rules.cnssEmployeeShortBp, amountCents: -cnssShort, exemptIrCents: 0, exemptCnssCents: 0, order: 40 });
    lines.push({ kind: "cnss_employee_long", minutes: null, rateBp: rules.cnssEmployeeLongBp, amountCents: -cnssLong, exemptIrCents: 0, exemptCnssCents: 0, order: 41 });
    lines.push({ kind: "amo_employee", minutes: null, rateBp: rules.amoEmployeeBp, amountCents: -amoEmployee, exemptIrCents: 0, exemptCnssCents: 0, order: 42 });
    cnssEmployee = cnssShort + cnssLong;
  }
  const employeeContribTotal = cnssEmployee + amoEmployee + employeeOther;

  // ── 6) الحصة المهنية: خطوة مسار قابلة للتركيب (أو السلوك القديم بلا مسار) ──
  let proDeduction = 0;
  const proStep = regime?.steps.find((s) => s.kind === "pro_deduction_tiered");
  if (regime && proStep) {
    const fromRules = proStep.fromPayRules;
    const rate35Limit = fromRules || proStep.params.rate35LimitCents === undefined ? rules.proRate35LimitCents : Number(proStep.params.rate35LimitCents);
    const cap35 = fromRules || proStep.params.cap35Cents === undefined ? rules.proCap35Cents : Number(proStep.params.cap35Cents);
    const rate35 = fromRules || proStep.params.rate35Bp === undefined ? rules.proRate35Bp : Number(proStep.params.rate35Bp);
    const rate25 = fromRules || proStep.params.rate25Bp === undefined ? rules.proRate25Bp : Number(proStep.params.rate25Bp);
    const cap25 = fromRules || proStep.params.rate25CapCents === undefined ? rules.proRate25CapCents : Number(proStep.params.rate25CapCents);
    const use35 = sbiCents <= rate35Limit;
    const proRate = use35 ? rate35 : rate25;
    const proCap = use35 ? cap35 : cap25;
    proDeduction = Math.min(applyRate(sbiCents, proRate), proCap);
    lines.push({ kind: "pro_deduction", minutes: null, rateBp: proRate, amountCents: -proDeduction, exemptIrCents: 0, exemptCnssCents: 0, order: 43 });
  } else if (!regime) {
    const use35 = sbiCents <= rules.proRate35LimitCents;
    const proRate = use35 ? rules.proRate35Bp : rules.proRate25Bp;
    const proCap = use35 ? rules.proCap35Cents : rules.proRate25CapCents;
    proDeduction = Math.min(applyRate(sbiCents, proRate), proCap);
    lines.push({ kind: "pro_deduction", minutes: null, rateBp: proRate, amountCents: -proDeduction, exemptIrCents: 0, exemptCnssCents: 0, order: 43 });
  }

  // ── 7/8) الضريبة على الدخل — خطوات مسار (أو السلوك القديم بلا مسار) ──
  let irGross = 0;
  let familyDeduction = 0;
  if (regime) {
    const rniCentsInner = Math.max(0, sbiCents - employeeContribTotal - proDeduction);
    const irStep = regime.steps.find((s) => s.kind === "ir_brackets");
    if (irStep) {
      const brackets = irStep.fromPayRules ? rules.irBrackets : (parseStepBrackets(irStep.params.brackets) ?? rules.irBrackets);
      const bracket = brackets.find((b) => b.upToMonthlyCents === null || rniCentsInner <= b.upToMonthlyCents);
      irGross = bracket ? Math.max(0, applyRate(rniCentsInner, bracket.rateBp) - bracket.deductMonthlyCents) : 0;
      lines.push({ kind: "ir_gross", minutes: null, rateBp: bracket?.rateBp ?? null, amountCents: -irGross, exemptIrCents: 0, exemptCnssCents: 0, order: 50 });
    }
    const famStep = regime.steps.find((s) => s.kind === "family_deduction");
    if (famStep) {
      const perPerson = famStep.fromPayRules || famStep.params.perPersonCents === undefined ? rules.irFamilyDeductionCents : Number(famStep.params.perPersonCents);
      const capPeople = famStep.fromPayRules || famStep.params.capPeople === undefined ? rules.irFamilyDeductionCapPeople : Number(famStep.params.capPeople);
      const familyCount = Math.min(Math.max(0, employee.dependentsCount), capPeople);
      familyDeduction = familyCount * perPerson;
      lines.push({ kind: "family_deduction", minutes: null, rateBp: null, amountCents: familyDeduction, exemptIrCents: 0, exemptCnssCents: 0, order: 51 });
    }
  } else {
    const rniCentsInner = Math.max(0, sbiCents - cnssEmployee - amoEmployee - proDeduction);
    const bracket = rules.irBrackets.find((b) => b.upToMonthlyCents === null || rniCentsInner <= b.upToMonthlyCents);
    irGross = bracket ? Math.max(0, applyRate(rniCentsInner, bracket.rateBp) - bracket.deductMonthlyCents) : 0;
    const familyCount = Math.min(Math.max(0, employee.dependentsCount), rules.irFamilyDeductionCapPeople);
    familyDeduction = familyCount * rules.irFamilyDeductionCents;
    lines.push({ kind: "ir_gross", minutes: null, rateBp: bracket?.rateBp ?? null, amountCents: -irGross, exemptIrCents: 0, exemptCnssCents: 0, order: 50 });
    lines.push({ kind: "family_deduction", minutes: null, rateBp: null, amountCents: familyDeduction, exemptIrCents: 0, exemptCnssCents: 0, order: 51 });
  }
  const irNet = Math.max(0, irGross - familyDeduction);

  // ── 9) الصافي للدفع ─────────────────────────────────────────────
  const netDeductions = lines.filter((l) => l.kind === "deduction").reduce((acc, l) => acc + Math.abs(l.amountCents), 0);
  const netCents = grossCents - employeeContribTotal - irNet - netDeductions;

  // ── تكلفة المشغّل — من قائمة بنود المسار (SPEC §12) أو من pay_rules ──
  let employerCost = 0;
  if (regime) {
    for (const item of regime.contributions) {
      if (item.side !== "employer") continue;
      const basisCents = item.basis === "sbi" ? sbiCents : item.basis === "gross" ? grossCents : cnssBaseCents;
      const base = item.ceilingCents !== null ? Math.min(basisCents, item.ceilingCents) : basisCents;
      const amount = item.rateBp === 0 && item.amountCents !== null ? item.amountCents : applyRate(base, item.rateBp);
      lines.push({
        kind: item.key,
        minutes: null,
        rateBp: item.rateBp === 0 ? null : item.rateBp,
        amountCents: amount,
        exemptIrCents: 0,
        exemptCnssCents: 0,
        order: item.order,
      });
      employerCost += amount;
    }
  } else {
    const cappedBase = Math.min(cnssBaseCents, rules.cnssCeilingCents);
    const employerPrestShort = applyRate(cappedBase, rules.employerPrestShortBp);
    const employerPrestLong = applyRate(cappedBase, rules.employerPrestLongBp);
    const employerFamily = applyRate(cnssBaseCents, rules.employerFamilyBp);
    const employerAmo = applyRate(cnssBaseCents, rules.employerAmoBp);
    const employerTfp = applyRate(cnssBaseCents, rules.employerTfpBp);
    employerCost = employerPrestShort + employerPrestLong + employerFamily + employerAmo + employerTfp;
    lines.push({ kind: "employer_prest_short", minutes: null, rateBp: rules.employerPrestShortBp, amountCents: employerPrestShort, exemptIrCents: 0, exemptCnssCents: 0, order: 70 });
    lines.push({ kind: "employer_prest_long", minutes: null, rateBp: rules.employerPrestLongBp, amountCents: employerPrestLong, exemptIrCents: 0, exemptCnssCents: 0, order: 71 });
    lines.push({ kind: "employer_family", minutes: null, rateBp: rules.employerFamilyBp, amountCents: employerFamily, exemptIrCents: 0, exemptCnssCents: 0, order: 72 });
    lines.push({ kind: "employer_amo", minutes: null, rateBp: rules.employerAmoBp, amountCents: employerAmo, exemptIrCents: 0, exemptCnssCents: 0, order: 73 });
    lines.push({ kind: "employer_tfp", minutes: null, rateBp: rules.employerTfpBp, amountCents: employerTfp, exemptIrCents: 0, exemptCnssCents: 0, order: 74 });
  }

  // ── الفحوص والتحذيرات ───────────────────────────────────────────
  // الحد الأدنى يتبع مسار العامل (SPEC §12): ساعي للمسار العام (SMIG)، يومي للفلاحي (SMAG)
  let smigBreached: boolean;
  if (regime) {
    const effectiveDaily =
      employee.payType === "daily"
        ? employee.dailyRateCents
        : hourly !== null
          ? hourly * regime.dailyHours
          : null;
    smigBreached = regimeMinWageBreached(regime, hourly, effectiveDaily);
  } else {
    smigBreached = hourly === null ? true : hourly < rules.smigHourlyCents;
  }
  if (smigBreached) warnings.add("smig_breached"); // يمنع الاعتماد (SPEC §11.2)
  if (regime?.needsAccountantConfirmation && !regime.confirmedAt) {
    warnings.add("regime_needs_confirmation"); // الفلاحي: يمنع الاعتماد حتى تأكيد المحاسب (SPEC §12)
  }
  if (!worked.attendanceBased && worked.scheduledMinutes === 0) warnings.add("no_attendance");
  if (netCents < 0) warnings.add("negative_net");
  const unverified = Object.values(rules.provenance).filter((p) => p.verifiedBy === null);
  if (unverified.length > 0) warnings.add("unverified_rules"); // يمنع الاعتماد حتى يوثقها المحاسب

  lines.sort((a, b) => a.order - b.order);

  const otMinutes = ot.dayNormal + ot.nightNormal + ot.dayRest + ot.nightRest;
  const rniCents = Math.max(0, sbiCents - employeeContribTotal - proDeduction);
  return {
    lines,
    totals: {
      workedMinutes: worked.baseMinutes + otMinutes,
      breakMinutes: worked.breakMinutes,
      overtimeMinutes: otMinutes,
      workedDays: worked.workedDays.length,
      grossCents,
      sbiCents,
      cnssBaseCents,
      cnssEmployeeCents: cnssEmployee,
      amoEmployeeCents: amoEmployee,
      employeeOtherCents: employeeOther,
      proDeductionCents: proDeduction,
      rniCents,
      irGrossCents: irGross,
      familyDeductionCents: familyDeduction,
      irNetCents: irNet,
      netCents,
      employerCostCents: employerCost,
      totalCostCents: grossCents + employerCost,
      effectiveHourlyCents: hourly,
    },
    smigBreached,
    warnings: [...warnings],
  };
}

/** شرائح IR: أي شريحة تنطبق على RNI معين (للاختبار والعرض) */
export function findIrBracket(rateBp: number | null, brackets: { upToMonthlyCents: number | null; rateBp: number }[]): { upToMonthlyCents: number | null } | null {
  if (rateBp === null) return null;
  return brackets.find((b) => b.rateBp === rateBp) ?? null;
}
