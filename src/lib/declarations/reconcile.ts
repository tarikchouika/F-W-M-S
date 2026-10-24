// HRMP — مطابقة IR الشهري مع بيان 9421 السنوي (SPEC §4.6 — المرحلة 6ج)
// «قاعدة مطابقة: مجموع IR في بيان 9421 يجب أن يطابق مجموع المبالغ المسددة شهريًا.
//  اجعل النظام يتحقق من ذلك قبل التوليد.»
import type { ValidationIssue } from "./types";

export type IrMonthlyEntry = {
  periodKey: string; // "2026-01" … "2026-12"
  irNetCents: number; // مجموع irNetCents لكشوف الشهر المعتمدة
};

export type IrReconciliation = {
  monthlyTotalCents: number;
  annualTotalCents: number;
  issues: ValidationIssue[];
};

/**
 * التحقق قبل توليد البيان السنوي:
 * - مجموع IR الشهري للسنة == الإجمالي المصرَّح به في 9421 (إلى السنتيم)
 * - السنة كاملة (12 شهرًا)؛ شهر بلا كشوف يُحسب صفرًا بشرط وجوده صراحةً
 */
export function reconcileIrMonthlyVsAnnual(monthly: IrMonthlyEntry[], annualTotalCents: number): IrReconciliation {
  const issues: ValidationIssue[] = [];

  const seen = new Map<string, number>();
  for (const m of monthly) {
    if (seen.has(m.periodKey)) {
      issues.push({ element: m.periodKey, reason: "duplicate_ir_month" });
      continue;
    }
    seen.set(m.periodKey, m.irNetCents);
  }

  // السنة كاملة: 12 شهرًا (SPEC §4.6: الإيداع السنوي يشمل السنة كلها)
  const yearMatch = /^(\d{4})-(\d{2})$/.exec(monthly[0]?.periodKey ?? "");
  if (yearMatch) {
    const year = yearMatch[1];
    for (let m = 1; m <= 12; m++) {
      const key = `${year}-${String(m).padStart(2, "0")}`;
      if (!seen.has(key)) {
        issues.push({ element: key, reason: "missing_ir_month" });
      }
    }
  }

  const monthlyTotalCents = [...seen.values()].reduce((a, b) => a + b, 0);
  if (monthlyTotalCents !== annualTotalCents) {
    issues.push({
      element: "Declaration9421.TotalIR",
      reason: "ir_total_mismatch",
      detail: `monthly=${monthlyTotalCents} annual=${annualTotalCents} diff=${annualTotalCents - monthlyTotalCents}`,
    });
  }

  return { monthlyTotalCents, annualTotalCents, issues };
}
