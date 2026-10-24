// HRMP — حل قواعد الأجور زمنيًا (SPEC §11: بيانات بتواريخ سريان — لا ثوابت كود)
// نقية بلا قاعدة بيانات: تستقبل صفوف PayRule الخام وتختار السارية عند تاريخ معين.
// أسبقية القاعدة الخاصة بالشركة على قاعدة المنصة (companyId=null) عند تساوي التاريخ أو أقدمه.
// ⚠️ اصطلاح النسب: القيمة مخزنة «نسبة مئوية ×10000» (4.48% → 44800) → الكسر = القيمة / 10^6
//    (ملاحظة المساعد الثاني في WORKLOG 2026-10-17: «محرك الأجور يقسم على 10^6 لا 10^4»)
import type { IrBracket, PayRuleSet, RuleProvenance } from "./types";
import { MissingPayRuleError } from "./types";

/** صف قاعدة خام (يطابق حقول نموذج PayRule بعد التسطيح) */
export type RawPayRule = {
  companyId: string | null;
  key: string;
  valueInt: number | null;
  valueText: string | null;
  unit: string;
  effectiveFrom: Date;
  source: string | null;
  verifiedBy: string | null;
};

/** كل المفاتيح التي يستهلكها محرك المرحلة 6أ/6ب */
export const ENGINE_RULE_KEYS = [
  "smig.hourly",
  "work.weekly_hours",
  "work.daily_hours",
  "ot.day_normal",
  "ot.night_normal",
  "ot.day_rest",
  "ot.night_rest",
  "night.start",
  "night.end",
  "cnss.employee.short",
  "cnss.employee.long",
  "cnss.employee.ceiling",
  "amo.employee",
  "cnss.employer.prest_short",
  "cnss.employer.prest_long",
  "cnss.employer.family",
  "cnss.employer.amo",
  "cnss.employer.tfp",
  "ir.brackets",
  "ir.family_deduction",
  "ir.family_deduction_cap_people",
  "pro.rate_35_limit",
  "pro.cap_35",
  "pro.rate_35",
  "pro.rate_25",
  "pro.rate_25_cap",
  "exempt.transport.urban",
  "exempt.transport.outside",
  "exempt.meals.ir_daily",
  "exempt.meals.cnss_daily",
] as const;

/** "21:00" → 1260 دقيقة (مع تحقق صارم) */
export function parseClock(value: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) throw new Error(`invalid_clock_rule: ${value}`);
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) throw new Error(`invalid_clock_rule: ${value}`);
  return h * 60 + min;
}

/** تحليل JSON شرائح IR الشهرية (SPEC §11.6 — قانون المالية 2026) */
export function parseIrBrackets(valueText: string): IrBracket[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(valueText);
  } catch {
    throw new Error("invalid_ir_brackets_json");
  }
  const brackets = (parsed as { brackets?: unknown })?.brackets;
  if (!Array.isArray(brackets) || brackets.length === 0) {
    throw new Error("invalid_ir_brackets_json");
  }
  const out: IrBracket[] = brackets.map((b) => {
    const row = b as Record<string, unknown>;
    const upTo = row.upToMonthlyCents === null ? null : Number(row.upToMonthlyCents);
    const rateBp = Number(row.rateBp);
    const deduct = Number(row.deductMonthlyCents);
    if (upTo !== null && (!Number.isFinite(upTo) || upTo < 0)) throw new Error("invalid_ir_brackets_json");
    if (!Number.isFinite(rateBp) || rateBp < 0) throw new Error("invalid_ir_brackets_json");
    if (!Number.isFinite(deduct) || deduct < 0) throw new Error("invalid_ir_brackets_json");
    return { upToMonthlyCents: upTo, rateBp, deductMonthlyCents: deduct };
  });
  // الشرائح مرتبة تصاعديًا بحدّها الأعلى (null أخيرًا)
  out.sort((a, b) => {
    if (a.upToMonthlyCents === null) return 1;
    if (b.upToMonthlyCents === null) return -1;
    return a.upToMonthlyCents - b.upToMonthlyCents;
  });
  return out;
}

function toProvenance(row: RawPayRule): RuleProvenance {
  return {
    key: row.key,
    value: row.valueInt !== null ? String(row.valueInt) : (row.valueText ?? ""),
    unit: row.unit,
    source: row.source,
    effectiveFrom: row.effectiveFrom.toISOString().slice(0, 10),
    verifiedBy: row.verifiedBy,
  };
}

/**
 * بناء مجموعة القواعد السارية عند لحظة معينة (at بتوقيت UTC).
 * - قواعد الشركة (companyId محدد) تتقدم على قواعد المنصة (null) للمفتاح نفسه.
 * - ضمن نفس المستوى: الأحدث سريانًا ≤ at.
 * - أي مفتاح مطلوب بلا صف ساري → MissingPayRuleError (لا افتراضات في الكود).
 */
export function buildRuleSet(rows: RawPayRule[], at: Date, companyId: string | null): PayRuleSet {
  const atMs = at.getTime();
  const picked = new Map<string, RawPayRule>();

  for (const row of rows) {
    if (!ENGINE_RULE_KEYS.includes(row.key as (typeof ENGINE_RULE_KEYS)[number])) continue;
    if (row.companyId !== null && row.companyId !== companyId) continue; // قاعدة شركة أخرى
    if (row.effectiveFrom.getTime() > atMs) continue; // لم تسري بعد

    const current = picked.get(row.key);
    if (!current) {
      picked.set(row.key, row);
      continue;
    }
    // أسبقية: شركة > منصة، ثم الأحدث سريانًا
    const currentIsCompany = current.companyId !== null;
    const rowIsCompany = row.companyId !== null;
    if (rowIsCompany && !currentIsCompany) {
      picked.set(row.key, row);
    } else if (rowIsCompany === currentIsCompany && row.effectiveFrom > current.effectiveFrom) {
      picked.set(row.key, row);
    }
  }

  const missing = ENGINE_RULE_KEYS.filter((k) => !picked.has(k));
  if (missing.length > 0) throw new MissingPayRuleError([...missing]);

  const int = (key: string): number => {
    const row = picked.get(key)!;
    if (row.valueInt === null) throw new Error(`rule_not_int: ${key}`);
    return row.valueInt;
  };
  const text = (key: string): string => {
    const row = picked.get(key)!;
    if (row.valueText === null || row.valueText.trim() === "") throw new Error(`rule_not_text: ${key}`);
    return row.valueText;
  };

  const irBrackets = parseIrBrackets(text("ir.brackets"));

  const provenance: Record<string, RuleProvenance> = {};
  for (const [key, row] of picked) provenance[key] = toProvenance(row);

  return {
    smigHourlyCents: int("smig.hourly"),
    weeklyHours: int("work.weekly_hours"),
    dailyHours: int("work.daily_hours"),
    otDayNormalBp: int("ot.day_normal"),
    otNightNormalBp: int("ot.night_normal"),
    otDayRestBp: int("ot.day_rest"),
    otNightRestBp: int("ot.night_rest"),
    nightStartMin: parseClock(text("night.start")),
    nightEndMin: parseClock(text("night.end")),
    cnssEmployeeShortBp: int("cnss.employee.short"),
    cnssEmployeeLongBp: int("cnss.employee.long"),
    cnssCeilingCents: int("cnss.employee.ceiling"),
    amoEmployeeBp: int("amo.employee"),
    employerPrestShortBp: int("cnss.employer.prest_short"),
    employerPrestLongBp: int("cnss.employer.prest_long"),
    employerFamilyBp: int("cnss.employer.family"),
    employerAmoBp: int("cnss.employer.amo"),
    employerTfpBp: int("cnss.employer.tfp"),
    irBrackets,
    irFamilyDeductionCents: int("ir.family_deduction"),
    irFamilyDeductionCapPeople: int("ir.family_deduction_cap_people"),
    proRate35LimitCents: int("pro.rate_35_limit"),
    proCap35Cents: int("pro.cap_35"),
    proRate35Bp: int("pro.rate_35"),
    proRate25Bp: int("pro.rate_25"),
    proRate25CapCents: int("pro.rate_25_cap"),
    exemptTransportUrbanCents: int("exempt.transport.urban"),
    exemptTransportOutsideCents: int("exempt.transport.outside"),
    exemptMealsIrDailyCents: int("exempt.meals.ir_daily"),
    exemptMealsCnssDailyCents: int("exempt.meals.cnss_daily"),
    provenance,
  };
}
