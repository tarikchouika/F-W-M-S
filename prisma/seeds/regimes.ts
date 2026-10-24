// HRMP — بذور المسارات والتصاريح (المرحلة 6ج — SPEC §12 و§4.6)
// ملكية: المساعد الثاني (كباقي البذور) — نُفِّذت هنا لسابقة المراحل مع طلب مراجعة صريح.
// القواعد:
//   - قوالب المنصة (companyId=null): general (مكتمل)، agricultural (مكتمل + تأكيد محاسب)،
//     public_civil_service وpublic_entreprise (هيكل فارغ غير مكتمل يمنع الاعتماد — SPEC §12)
//   - البنود والخطوات من SPEC §11.6/§12 حرفيًا مع مصدر كل قيمة
//   - عينات مواصفات التصريح موسومة SAMPLE-NOT-OFFICIAL (لا تُفعَّل في الإنتاج أبدًا — SPEC §4.6)
//   - idempotent (upsert) — تشغيل مزدوج بلا تكرار
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

type ItemSeed = {
  key: string;
  side: "employee" | "employer";
  label: string;
  rateBp: number;
  ceilingCents: number | null;
  basis: "cnss_base" | "sbi" | "gross";
  order: number;
  source: string;
};

type StepSeed = { kind: string; order: number; paramsJson: string };

const CNSS_ITEMS: ItemSeed[] = [
  { key: "cnss_employee_short", side: "employee", label: "CNSS — Prestations sociales (courtes)", rateBp: 5200, ceilingCents: 600000, basis: "cnss_base", order: 40, source: "تعميم CNSS — 0.52% بسقف 6000 درهم (SPEC §11.6)" },
  { key: "cnss_employee_long", side: "employee", label: "CNSS — Prestations sociales (longues)", rateBp: 39600, ceilingCents: 600000, basis: "cnss_base", order: 41, source: "تعميم CNSS — 3.96% بسقف 6000 درهم (SPEC §11.6)" },
  { key: "amo_employee", side: "employee", label: "AMO — Assurance maladie", rateBp: 22600, ceilingCents: null, basis: "cnss_base", order: 42, source: "تعميم AMO — 2.26% بلا سقف (SPEC §11.6)" },
  { key: "employer_prest_short", side: "employer", label: "CNSS employeur — courtes", rateBp: 10500, ceilingCents: 600000, basis: "cnss_base", order: 70, source: "تعميم CNSS — 1.05% (SPEC §11.6)" },
  { key: "employer_prest_long", side: "employer", label: "CNSS employeur — longues", rateBp: 79300, ceilingCents: 600000, basis: "cnss_base", order: 71, source: "تعميم CNSS — 7.93% (SPEC §11.6)" },
  { key: "employer_family", side: "employer", label: "CNSS employeur — allocations familiales", rateBp: 64000, ceilingCents: null, basis: "cnss_base", order: 72, source: "تعميم CNSS — 6.40% (SPEC §11.6)" },
  { key: "employer_amo", side: "employer", label: "AMO employeur", rateBp: 41100, ceilingCents: null, basis: "cnss_base", order: 73, source: "تعميم AMO — 4.11% (SPEC §11.6)" },
  { key: "employer_tfp", side: "employer", label: "TFP — Taxe de formation professionnelle", rateBp: 16000, ceilingCents: null, basis: "cnss_base", order: 74, source: "TFP — 1.60% (SPEC §11.6)" },
];

const FROM_PAY_RULES = JSON.stringify({ fromPayRules: true });

const STANDARD_STEPS: StepSeed[] = [
  { kind: "employee_contributions", order: 10, paramsJson: FROM_PAY_RULES },
  { kind: "pro_deduction_tiered", order: 20, paramsJson: FROM_PAY_RULES },
  { kind: "ir_brackets", order: 30, paramsJson: FROM_PAY_RULES },
  { kind: "family_deduction", order: 40, paramsJson: FROM_PAY_RULES },
  { kind: "employer_contributions", order: 50, paramsJson: FROM_PAY_RULES },
  { kind: "net_summary", order: 60, paramsJson: FROM_PAY_RULES },
];

type RegimeSeed = {
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
  source: string | null;
  notes: string | null;
  items: ItemSeed[];
  steps: StepSeed[];
};

const REGIMES: RegimeSeed[] = [
  {
    key: "general",
    name: "المسار العام (غير الفلاحي — SMIG)",
    bundle: "general",
    bundleStatus: "complete",
    minWageType: "hourly",
    minWageCents: 1792, // 17.92 درهم/ساعة — SPEC §11.2
    dailyHours: 8,
    weeklyHours: 44,
    annualHours: null,
    nightStart: "21:00",
    nightEnd: "06:00",
    monthlyDaysBasis: 26,
    declarationProfile: "cnss_ebds",
    needsAccountantConfirmation: false,
    source: "المرسوم 2.25.983 (SMIG) + مدونة الشغل 65-99 (SPEC §11.2/§11.3/§12)",
    notes: "حراسة، نظافة، بناء، حرف — قواعد الاقتطاعات في SPEC §11.6",
    items: CNSS_ITEMS,
    steps: STANDARD_STEPS,
  },
  {
    key: "agricultural",
    name: "المسار الفلاحي والغابوي (SMAG)",
    bundle: "agricultural",
    bundleStatus: "complete",
    minWageType: "daily",
    minWageCents: 9744, // 97.44 درهم/يوم من 1 أبريل 2026 — SPEC §11.2
    dailyHours: 8,
    weeklyHours: 48, // 2496 ÷ 52 — SPEC §12
    annualHours: 2496,
    nightStart: "05:00",
    nightEnd: "20:00",
    monthlyDaysBasis: 26,
    declarationProfile: "cnss_ebds",
    needsAccountantConfirmation: true, // قاعدة الأساس تحتاج تأكيد المحاسب مرة واحدة (SPEC §12)
    source: "SMAG 2026 + SPEC §12 (المدة 8س/يوم و2496س/سنة وحدود الليل 5:00–20:00)",
    notes: "بستنة فلاحية وأعمال الاستغلاليات — الاشتراكات بنسب آخر سنتين (SPEC §12)؛ قاعدة الأساس (أيام العمل والاحتساب اليومي) تحتاج تأكيد المحاسب قبل أول اعتماد",
    items: CNSS_ITEMS, // «القيمة الافتراضية نفس النسب الرسمية المعتمدة في آخر سنتين» (SPEC §12)
    steps: STANDARD_STEPS,
  },
  {
    // حزم عمومية: هيكل فارغ قابل للتعبئة — لا تُخترع قواعدها (SPEC §12)
    key: "public_civil_service",
    name: "القطاع العام — الوظيفة العمومية (هيكل فارغ)",
    bundle: "public_civil_service",
    bundleStatus: "incomplete",
    minWageType: "hourly",
    minWageCents: 0,
    dailyHours: 8,
    weeklyHours: 40,
    annualHours: null,
    nightStart: "21:00",
    nightEnd: "06:00",
    monthlyDaysBasis: 26,
    declarationProfile: "none", // قد لا تُصرَّح في Damancom أصلاً (SPEC §12)
    needsAccountantConfirmation: true,
    source: null,
    notes: "تُدخَل الأنظمة (تقاعد/تأمين صحي/سلالم الأجور) من الجهة المالكة أو محاسبها بتواريخ سريان ومصادر — يمنع النظام الاعتماد حتى اكتمالها ويعرض ما ينقص",
    items: [],
    steps: [],
  },
  {
    key: "public_entreprise",
    name: "المؤسسات العمومية والشركات العامة (هيكل فارغ)",
    bundle: "public_entreprise",
    bundleStatus: "incomplete",
    minWageType: "hourly",
    minWageCents: 0,
    dailyHours: 8,
    weeklyHours: 44,
    annualHours: null,
    nightStart: "21:00",
    nightEnd: "06:00",
    monthlyDaysBasis: 26,
    declarationProfile: "none",
    needsAccountantConfirmation: true,
    source: null,
    notes: "قد تجمع عقوداً خاصة وأنظمة أساسية داخلية واتفاقيات — تُدخَل من الجهة المالكة (SPEC §12)",
    items: [],
    steps: [],
  },
];

// ── عينات مواصفات التصريح (SAMPLE-NOT-OFFICIAL — للاختبار فقط — SPEC §4.6) ──

const CNSS_SAMPLE_LAYOUT = {
  encoding: "utf-8",
  recordSeparator: "\n",
  fieldSeparator: null,
  sampleTag: "SAMPLE-NOT-OFFICIAL",
  records: [
    {
      type: "header",
      fields: [
        { source: "literal", value: "01", width: 2 },
        { source: "company.cnssNumber", width: 10, pad: "left", padChar: "0" },
        { source: "period.year", width: 4 },
        { source: "period.month", width: 2 },
      ],
    },
    {
      type: "per_worker",
      fields: [
        { source: "literal", value: "02", width: 2 },
        { source: "worker.cnssNumber", width: 10, pad: "left", padChar: "0" },
        { source: "worker.fullName", width: 20 },
        { source: "payslip.workedDays", width: 3, pad: "left", padChar: "0" },
        { source: "payslip.grossCents", width: 12, pad: "left", padChar: "0", format: "cents_to_mad" },
        { source: "payslip.cnssBaseCents", width: 12, pad: "left", padChar: "0", format: "cents_to_mad" },
      ],
    },
    {
      type: "trailer",
      fields: [
        { source: "literal", value: "99", width: 2 },
        { source: "total.workers", width: 3, pad: "left", padChar: "0" },
        { source: "total.grossCents", width: 12, pad: "left", padChar: "0", format: "cents_to_mad" },
        { source: "total.cnssEmployeeCents", width: 10, pad: "left", padChar: "0", format: "cents_to_mad" },
      ],
    },
  ],
};

const DGI_SAMPLE_XSD = `<?xml version="1.0" encoding="UTF-8"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
  <xs:complexType name="EmployeType">
    <xs:sequence>
      <xs:element name="CIN" type="xs:string" minOccurs="1" maxOccurs="1"/>
      <xs:element name="Jours" type="xs:integer" minOccurs="1" maxOccurs="1"/>
      <xs:element name="Brut" type="xs:decimal" minOccurs="1" maxOccurs="1"/>
    </xs:sequence>
  </xs:complexType>
  <xs:simpleType name="IceType">
    <xs:restriction base="xs:string">
      <xs:pattern value="[0-9]{15}"/>
    </xs:restriction>
  </xs:simpleType>
  <xs:element name="Declaration9421">
    <xs:complexType>
      <xs:sequence>
        <xs:element name="Annee" type="xs:integer" minOccurs="1" maxOccurs="1"/>
        <xs:element name="ICE" type="IceType" minOccurs="1" maxOccurs="1"/>
        <xs:element name="Employe" type="EmployeType" minOccurs="0" maxOccurs="unbounded"/>
        <xs:element name="TotalIR" type="xs:decimal" minOccurs="1" maxOccurs="1"/>
      </xs:sequence>
    </xs:complexType>
  </xs:element>
</xs:schema>`;

const DGI_SAMPLE_MAPPING = {
  rootElement: "Declaration9421",
  fields: [
    { source: "declaration.year", element: "Annee", scope: "header" },
    { source: "company.taxId", element: "ICE", scope: "header" },
    { source: "worker.cin", element: "CIN", scope: "per_worker" },
    { source: "payslip.workedDays", element: "Jours", scope: "per_worker", format: "int" },
    { source: "payslip.grossCents", element: "Brut", scope: "per_worker", format: "cents_to_mad" },
    { source: "total.irNetCents", element: "TotalIR", scope: "trailer", format: "cents_to_mad" },
  ],
};

async function upsertRegimes() {
  for (const r of REGIMES) {
    const existing = await db.payRegime.findFirst({
      where: { companyId: null, key: r.key },
      orderBy: { version: "desc" },
    });
    if (existing) {
      // تحديث القالب في مكانه إن لم تتغير البنية (البذور idempotent — تعديل القيم فقط عند إعادة تشغيل البذور)
      await db.payRegime.update({
        where: { id: existing.id },
        data: {
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
          needsAccountantConfirmation: r.needsAccountantConfirmation,
          source: r.source,
          notes: r.notes,
          isActive: true,
        },
      });
      // إعادة مزامنة البنود والخطوات (حذف وإعادة إنشاء — القالب ملك المنصة)
      await db.regimeContributionItem.deleteMany({ where: { regimeId: existing.id } });
      await db.regimeCalcStep.deleteMany({ where: { regimeId: existing.id } });
      if (r.items.length > 0) {
        await db.regimeContributionItem.createMany({
          data: r.items.map((c) => ({
            regimeId: existing.id, key: c.key, side: c.side, label: c.label, rateBp: c.rateBp,
            ceilingCents: c.ceilingCents, basis: c.basis, order: c.order, isActive: true, source: c.source,
          })),
        });
      }
      if (r.steps.length > 0) {
        await db.regimeCalcStep.createMany({
          data: r.steps.map((s) => ({ regimeId: existing.id, kind: s.kind, paramsJson: s.paramsJson, order: s.order, isActive: true })),
        });
      }
      console.log(`  ✓ قالب مسار محدَّث: ${r.key} (v${existing.version}) — ${r.items.length} بندًا، ${r.steps.length} خطوة`);
    } else {
      const created = await db.payRegime.create({
        data: {
          companyId: null,
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
          version: 1,
          isActive: true,
          effectiveFrom: new Date("2026-01-01T00:00:00Z"),
          source: r.source,
          needsAccountantConfirmation: r.needsAccountantConfirmation,
          notes: r.notes,
        },
      });
      if (r.items.length > 0) {
        await db.regimeContributionItem.createMany({
          data: r.items.map((c) => ({
            regimeId: created.id, key: c.key, side: c.side, label: c.label, rateBp: c.rateBp,
            ceilingCents: c.ceilingCents, basis: c.basis, order: c.order, isActive: true, source: c.source,
          })),
        });
      }
      if (r.steps.length > 0) {
        await db.regimeCalcStep.createMany({
          data: r.steps.map((s) => ({ regimeId: created.id, kind: s.kind, paramsJson: s.paramsJson, order: s.order, isActive: true })),
        });
      }
      console.log(`  ✓ قالب مسار جديد: ${r.key} — ${r.items.length} بندًا، ${r.steps.length} خطوة`);
    }
  }
}

async function upsertSampleSpecs() {
  const specs = [
    {
      authority: "cnss",
      kind: "monthly",
      version: 1,
      layoutJson: JSON.stringify(CNSS_SAMPLE_LAYOUT, null, 2),
      xsdContent: null,
      mappingJson: null,
      sourceRef: "SAMPLE-NOT-OFFICIAL — عينة تخطيط eBDS للاختبار فقط (تُستبدل بمواصفة رسمية يرفعها المحاسب)",
    },
    {
      authority: "dgi",
      kind: "annual_9421",
      version: 1,
      layoutJson: null,
      xsdContent: DGI_SAMPLE_XSD,
      mappingJson: JSON.stringify(DGI_SAMPLE_MAPPING, null, 2),
      sourceRef: "SAMPLE-NOT-OFFICIAL — عينة XSD للاختبار فقط (المخطط الرسمي يرفعه المحاسب من DGI)",
    },
  ];
  for (const s of specs) {
    const existing = await db.declarationSpec.findFirst({
      where: { companyId: null, authority: s.authority, kind: s.kind, version: s.version },
    });
    if (existing) {
      await db.declarationSpec.update({
        where: { id: existing.id },
        data: {
          layoutJson: s.layoutJson,
          xsdContent: s.xsdContent,
          mappingJson: s.mappingJson,
          sourceRef: s.sourceRef,
        },
      });
      console.log(`  ✓ مواصفة عينة محدَّثة: ${s.authority}/${s.kind} v${s.version} (SAMPLE-NOT-OFFICIAL)`);
    } else {
      await db.declarationSpec.create({
        data: {
          companyId: null,
          authority: s.authority,
          kind: s.kind,
          version: s.version,
          effectiveFrom: new Date("2026-01-01T00:00:00Z"),
          sourceRef: s.sourceRef,
          layoutJson: s.layoutJson,
          xsdContent: s.xsdContent,
          mappingJson: s.mappingJson,
          status: "testing",
          isSample: true,
          uploadedBy: "system-seed",
        },
      });
      console.log(`  ✓ مواصفة عينة جديدة: ${s.authority}/${s.kind} v${s.version} (SAMPLE-NOT-OFFICIAL)`);
    }
  }
}

async function main() {
  console.log("🌱 بذور المرحلة 6ج: المسارات والتصاريح الرسمية…");
  await upsertRegimes();
  await upsertSampleSpecs();
  console.log("  ملاحظة: العينات موسومة SAMPLE-NOT-OFFICIAL — لا تُفعَّل في الإنتاج أبدًا (SPEC §4.6)");
}

// تشغيل مباشر أو استيراد من seed.ts
if (process.argv[1]?.includes("regimes")) {
  main()
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(() => db.$disconnect());
}

export { main as seedRegimes };
