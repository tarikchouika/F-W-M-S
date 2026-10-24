// HRMP — بذور قواعد الأجور المغربية (pay_rules) — ملكية: المساعد الثاني
// المرجع النافذ: docs/DATABASE_GUIDE.md §6 + docs/SPEC.md §11 و§12
// القواعد:
//   - النسب تُخزَّن Int أساس 10000 (basis_points): 4.48% → 44800
//   - المبالغ بالسنتيم (Int): 17.92 درهم → 1792
//   - كل سطر يحمل source وeffectiveFrom؛ verifiedBy=null حتى يراجعه المحاسب
//   - companyId=null يعني مستوى المنصة (عام لكل الشركات)
//   - القيم «القائمة» بلا تاريخ معلن تأخذ 2025-01-01 (بداية النطاق المرجعي 2025–2026)
// التشغيل: npx prisma db seed (عبر seed.ts) أو مباشرة: node prisma/seeds/pay-rules.ts
import { PrismaClient, Prisma } from "@prisma/client";

type PayRuleSeed = {
  key: string;
  valueInt?: number;
  valueText?: string;
  unit: "cents" | "basis_points" | "text" | "hours" | "count";
  effectiveFrom: string; // ISO date
  source: string;
};

/** جدول IR الشهري (2026) — JSON نصي موثّق داخل valueText (SPEC §11.6) */
const IR_BRACKETS_JSON = {
  note: "شهري = السنوي ÷ 12 — قانون المالية 2026 (SPEC §11.6). rateBp أساس 10000.",
  currency: "MAD",
  brackets: [
    { upToMonthlyCents: 333333, rateBp: 0, deductMonthlyCents: 0, upToAnnualCents: 4000000, deductAnnualCents: 0 },
    { upToMonthlyCents: 500000, rateBp: 100000, deductMonthlyCents: 33333, upToAnnualCents: 6000000, deductAnnualCents: 400000 },
    { upToMonthlyCents: 666667, rateBp: 200000, deductMonthlyCents: 83333, upToAnnualCents: 8000000, deductAnnualCents: 1000000 },
    { upToMonthlyCents: 833333, rateBp: 300000, deductMonthlyCents: 150000, upToAnnualCents: 10000000, deductAnnualCents: 1800000 },
    { upToMonthlyCents: 1500000, rateBp: 340000, deductMonthlyCents: 183333, upToAnnualCents: 18000000, deductAnnualCents: 2200000 },
    { upToMonthlyCents: null, rateBp: 370000, deductMonthlyCents: 228333, upToAnnualCents: null, deductAnnualCents: 2740000 },
  ],
} as const;

/** كل قواعد الأجور العامة (companyId=null) — القيم من SPEC §11 كما وردت في DATABASE_GUIDE §6 */
export const PAY_RULES: PayRuleSeed[] = [
  // ── الحد الأدنى للأجور (SPEC §11.2) ──────────────────────────────
  { key: "smig.hourly", valueInt: 1792, unit: "cents", effectiveFrom: "2026-01-01", source: "المرسوم 2.25.983 (SPEC §11.2)" },
  { key: "smag.daily", valueInt: 9744, unit: "cents", effectiveFrom: "2026-04-01", source: "SPEC §11.2 (المسار الفلاحي — 97,44 درهم/يوم)" },

  // ── مدة العمل (SPEC §11.3) ──────────────────────────────────────
  { key: "work.weekly_hours", valueInt: 44, unit: "hours", effectiveFrom: "2025-01-01", source: "مدونة الشغل 65-99 (SPEC §11.3)" },
  { key: "work.daily_max", valueInt: 10, unit: "hours", effectiveFrom: "2025-01-01", source: "مدونة الشغل (SPEC §11.3)" },
  { key: "work.daily_hours", valueInt: 8, unit: "hours", effectiveFrom: "2025-01-01", source: "ساعات اليوم القياسية (استنباط 44 س/أسبوع — SPEC §11.3) — بانتظار تأكيد المحاسب" },

  // ── سقف الأعباء العائلية (SPEC §11.6) ── [المرحلة 6أ/6ب]
  { key: "ir.family_deduction_cap_people", valueInt: 6, unit: "count", effectiveFrom: "2026-01-01", source: "قانون المالية 2026 — سقف 6 أشخاص معالين (SPEC §11.6)" },

  // ── الساعات الإضافية — نسب أساس 10000 (SPEC §11.4، المادة 201) ──
  { key: "ot.day_normal", valueInt: 250000, unit: "basis_points", effectiveFrom: "2025-01-01", source: "المادة 201 (SPEC §11.4)" },
  { key: "ot.night_normal", valueInt: 500000, unit: "basis_points", effectiveFrom: "2025-01-01", source: "المادة 201 (SPEC §11.4)" },
  { key: "ot.day_rest", valueInt: 500000, unit: "basis_points", effectiveFrom: "2025-01-01", source: "المادة 201 (SPEC §11.4)" },
  { key: "ot.night_rest", valueInt: 1000000, unit: "basis_points", effectiveFrom: "2025-01-01", source: "المادة 201 (SPEC §11.4)" },

  // ── حدود الليل (SPEC §11.4) ─────────────────────────────────────
  { key: "night.start", valueText: "21:00", unit: "text", effectiveFrom: "2025-01-01", source: "SPEC §11.4 (المسار العام)" },
  { key: "night.end", valueText: "06:00", unit: "text", effectiveFrom: "2025-01-01", source: "SPEC §11.4 (المسار العام)" },

  // ── اشتراكات الأجير — CNSS/AMO (SPEC §11.6) ─────────────────────
  { key: "cnss.employee.short", valueInt: 5200, unit: "basis_points", effectiveFrom: "2025-01-01", source: "تعميم CNSS (SPEC §11.6)" },
  { key: "cnss.employee.long", valueInt: 39600, unit: "basis_points", effectiveFrom: "2025-01-01", source: "تعميم CNSS (SPEC §11.6)" },
  { key: "cnss.employee.ceiling", valueInt: 600000, unit: "cents", effectiveFrom: "2025-01-01", source: "تعميم CNSS — سقف 6 000 درهم/شهر (SPEC §11.6)" },
  { key: "amo.employee", valueInt: 22600, unit: "basis_points", effectiveFrom: "2025-01-01", source: "تعميم AMO (SPEC §11.6)" },

  // ── حصة المشغّل (تكلفة — لا تُخصم من الأجير) (SPEC §11.6) ───────
  { key: "cnss.employer.prest_short", valueInt: 10500, unit: "basis_points", effectiveFrom: "2025-01-01", source: "تعميم CNSS (SPEC §11.6)" },
  { key: "cnss.employer.prest_long", valueInt: 79300, unit: "basis_points", effectiveFrom: "2025-01-01", source: "تعميم CNSS (SPEC §11.6)" },
  { key: "cnss.employer.family", valueInt: 64000, unit: "basis_points", effectiveFrom: "2025-01-01", source: "تعميم CNSS (SPEC §11.6)" },
  { key: "cnss.employer.amo", valueInt: 41100, unit: "basis_points", effectiveFrom: "2025-01-01", source: "تعميم AMO (SPEC §11.6)" },
  { key: "cnss.employer.tfp", valueInt: 16000, unit: "basis_points", effectiveFrom: "2025-01-01", source: "الرسم المهني TFP (SPEC §11.6)" },

  // ── الضريبة على الدخل IR (SPEC §11.6 — قانون المالية 2026) ─────
  { key: "ir.brackets", valueText: JSON.stringify(IR_BRACKETS_JSON), unit: "text", effectiveFrom: "2026-01-01", source: "قانون المالية 2026 (SPEC §11.6)" },
  { key: "ir.family_deduction", valueInt: 5000, unit: "cents", effectiveFrom: "2026-01-01", source: "قانون المالية 2026 — 50 درهم/شخص/شهر، سقف 6 أشخاص (SPEC §11.6)" },

  // ── الحصة المهنية (SPEC §11.6) ──────────────────────────────────
  { key: "pro.rate_35_limit", valueInt: 650000, unit: "cents", effectiveFrom: "2025-01-01", source: "SPEC §11.6 — 6 500 درهم/شهر (78 000/سنة)" },
  { key: "pro.cap_35", valueInt: 250000, unit: "cents", effectiveFrom: "2025-01-01", source: "SPEC §11.6 — سقف 2 500 درهم/شهر (30 000/سنة)" },
  { key: "pro.rate_25_cap", valueInt: 291667, unit: "cents", effectiveFrom: "2025-01-01", source: "SPEC §11.6 — سقف 2 916,67 درهم/شهر (35 000/سنة)" },
  // ── الحصة المهنية — النسب (أُضيفت بالمرحلة 6أ/6ب — ⚠️ بانتظار مراجعة المساعد الثاني كسابقة المرحلتين 2/3) ──
  { key: "pro.rate_35", valueInt: 350000, unit: "basis_points", effectiveFrom: "2025-01-01", source: "SPEC §11.6 — 35% للإجمالي ≤ 6 500 شهريًا" },
  { key: "pro.rate_25", valueInt: 250000, unit: "basis_points", effectiveFrom: "2025-01-01", source: "SPEC §11.6 — 25% فوق 6 500 شهريًا" },

  // ── سقوف البنود المعفاة من IR/CNSS (SPEC §11.6 — أُضيفت بالمرحلة 6أ/6ب، بانتظار المراجعة) ──
  { key: "exempt.transport.urban", valueInt: 50000, unit: "cents", effectiveFrom: "2025-01-01", source: "SPEC §11.6 — تعويض النقل داخل المدار حتى 500 درهم/شهر" },
  { key: "exempt.transport.outside", valueInt: 75000, unit: "cents", effectiveFrom: "2025-01-01", source: "SPEC §11.6 — تعويض النقل خارج المدار حتى 750 درهم/شهر (بالتبرير)" },
  { key: "exempt.meals.ir_daily", valueInt: 4000, unit: "cents", effectiveFrom: "2025-01-01", source: "SPEC §11.6 — منح الوجبات حتى 40 درهم/يوم للـ IR" },
  { key: "exempt.meals.cnss_daily", valueInt: 3000, unit: "cents", effectiveFrom: "2025-01-01", source: "SPEC §11.6 — CNSS مستحق على ما فوق 30 درهم/يوم" },
];

/**
 * يزرع/يحدّث قواعد الأجور العامة (companyId=null) بلا تكرار.
 * idempotent: يعتمد على findFirst ثم update/create (لا upsert — العمود companyId قد يكون null).
 */
export async function seedPayRules(db: PrismaClient) {
  console.log("🌱 pay_rules — بذور قواعد الأجور المغربية ...");
  for (const rule of PAY_RULES) {
    const data: Prisma.PayRuleUncheckedCreateInput = {
      companyId: null,
      key: rule.key,
      valueInt: rule.valueInt ?? null,
      valueText: rule.valueText ?? null,
      unit: rule.unit,
      effectiveFrom: new Date(`${rule.effectiveFrom}T00:00:00Z`),
      source: rule.source,
      verifiedBy: null, // لا تُعتمد قبل مراجعة محاسب (DATABASE_GUIDE §6)
      verifiedAt: null,
    };
    const existing = await db.payRule.findFirst({
      where: { companyId: null, key: rule.key, effectiveFrom: data.effectiveFrom },
    });
    if (existing) {
      await db.payRule.update({ where: { id: existing.id }, data });
    } else {
      await db.payRule.create({ data });
    }
  }
  const total = await db.payRule.count({ where: { companyId: null } });
  console.log(`✓ pay_rules: ${PAY_RULES.length} قاعدة (المجموع العام في القاعدة: ${total})`);
  console.log("  verifiedBy=null لكل السطور — للمراجعة من طرف المحاسب قبل الإنتاج.");
}

// تشغيل مباشر: node prisma/seeds/pay-rules.ts  (أو عبر seed.ts: npx prisma db seed)
if (process.argv[1]?.includes("pay-rules")) {
  const db = new PrismaClient();
  seedPayRules(db)
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(() => db.$disconnect());
}
