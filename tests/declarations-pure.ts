// HRMP — اختبار وحدة التصاريح النقية (SPEC §4.6 — المرحلة 6ج)
// التشغيل: bun tests/declarations-pure.ts
// يغطي: مُصدِّر eBDS من تخطيط (رأس/عامل/ذيل، عرض ثابت، أخطاء واضحة، néant)
//        + مُحقّق XSD (بنية/تكرار/إلزام/طول/نمط) + بانٍ من mapping + مطابقة IR الشهري/9421
import { renderEbdsLayout, validateLayout } from "../src/lib/declarations/layout";
import { parseXsd, validateXmlAgainstXsd } from "../src/lib/declarations/xsd";
import { buildXmlFromMapping, parseXml } from "../src/lib/declarations/xml";
import { DeclarationValidationError, type DeclarationContext, type EbdsLayout, type XmlMapping } from "../src/lib/declarations/types";
import { reconcileIrMonthlyVsAnnual, type IrMonthlyEntry } from "../src/lib/declarations/reconcile";

let passed = 0;
let failed = 0;
const failures: string[] = [];
function ok(cond: boolean, label: string) {
  if (cond) passed++;
  else {
    failed++;
    failures.push(label);
  }
}
function eq(actual: unknown, expected: unknown, label: string) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  ok(a === e, `${label} — actual=${a} expected=${e}`);
}

// ── سياق اختبار ──────────────────────────────────────────────────
const ctx: DeclarationContext = {
  companyCnssNumber: "1234567",
  companyLegalName: "SOCIETE DEMO SARL",
  companyTaxId: "001234567000089",
  periodKey: "2026-10",
  periodYear: 2026,
  periodMonth: 10,
  workers: [
    {
      userId: "user-worker",
      fullName: "AHMED ALAMI",
      cin: "AB123456",
      cnssNumber: "7654321",
      refNumber: "PS-202610-0001",
      workedDays: 22,
      grossCents: 400000,
      sbiCents: 400000,
      cnssBaseCents: 400000,
      cnssEmployeeCents: 17920,
      amoEmployeeCents: 9040,
      irNetCents: 0,
      netCents: 373040,
    },
    {
      userId: "user-worker2",
      fullName: "FATIMA ZAHRA",
      cin: "CD654321",
      cnssNumber: "7654322",
      refNumber: "PS-202610-0002",
      workedDays: 26,
      grossCents: 1000000,
      sbiCents: 1000000,
      cnssBaseCents: 1000000,
      cnssEmployeeCents: 26880,
      amoEmployeeCents: 22600,
      irNetCents: 45156,
      netCents: 905364,
    },
  ],
};

// ── 1) تخطيط CNSS (eBDS) بعرض ثابت ──────────────────────────────
const layout: EbdsLayout = {
  encoding: "utf-8",
  recordSeparator: "\n",
  fieldSeparator: null,
  sampleTag: "SAMPLE-NOT-OFFICIAL",
  records: [
    {
      type: "header",
      fields: [
        { source: "literal", value: "01", width: 2 },
        { source: "company.cnssNumber", width: 10, padChar: "0", pad: "left" },
        { source: "period.year", width: 4 },
        { source: "period.month", width: 2 },
      ],
    },
    {
      type: "per_worker",
      fields: [
        { source: "literal", value: "02", width: 2 },
        { source: "worker.cnssNumber", width: 10, padChar: "0", pad: "left" },
        { source: "worker.fullName", width: 20 },
        { source: "payslip.workedDays", width: 3, padChar: "0", pad: "left" },
        { source: "payslip.grossCents", width: 12, padChar: "0", pad: "left", format: "cents_to_mad" },
        { source: "payslip.cnssBaseCents", width: 12, padChar: "0", pad: "left", format: "cents_to_mad" },
      ],
    },
    {
      type: "trailer",
      fields: [
        { source: "literal", value: "99", width: 2 },
        { source: "total.workers", width: 3, padChar: "0", pad: "left" },
        { source: "total.grossCents", width: 12, padChar: "0", pad: "left", format: "cents_to_mad" },
        { source: "total.cnssEmployeeCents", width: 10, padChar: "0", pad: "left", format: "cents_to_mad" },
      ],
    },
  ],
};

const ebds = renderEbdsLayout(layout, ctx);
const ebdsLines = ebds.split("\n").filter((l) => l !== "");
eq(ebdsLines.length, 4, "eBDS: header + 2 workers + trailer");
eq(ebdsLines[0], "010001234567202610", "eBDS header fixed width");
// العامل الأول: 02 + 0007654321 + اسم بعرض 20 + أيام 022 + 4000.00 بعرض 12
eq(ebdsLines[1].slice(0, 12), "020007654321", "eBDS worker1 prefix");
eq(ebdsLines[1].length, 2 + 10 + 20 + 3 + 12 + 12, "eBDS worker1 total width");
eq(ebdsLines[1].slice(32, 35), "022", "eBDS worker1 days");
// الذيل: 99 + 002 + 14000.00 (إجمالي 4000+10000=14000) + 448.00
eq(ebdsLines[3].slice(0, 5), "99002", "eBDS trailer count");
ok(ebdsLines[3].includes("0014000.00"), "eBDS trailer gross total (14000.00 MAD)");

// ── 2) أخطاء واضحة: قيمة ناقصة إلزامية ─────────────────────────
const ctxMissingCin: DeclarationContext = {
  ...ctx,
  workers: [{ ...ctx.workers[0], cnssNumber: null }],
};
let threw: DeclarationValidationError | null = null;
try {
  renderEbdsLayout(layout, ctxMissingCin);
} catch (e) {
  if (e instanceof DeclarationValidationError) threw = e;
}
ok(threw !== null, "missing CNSS number → DeclarationValidationError");
eq(threw?.issues[0]?.element, "worker.worker.cnssNumber", "missing value error names the element");
eq(threw?.issues[0]?.reason, "missing_required_value", "missing value error reason");

// تجاوز العرض: اسم أطول من 20 حرفًا
const longNameCtx: DeclarationContext = {
  ...ctx,
  workers: [{ ...ctx.workers[0], fullName: "A".repeat(30) }],
};
threw = null;
try {
  renderEbdsLayout(layout, longNameCtx);
} catch (e) {
  if (e instanceof DeclarationValidationError) threw = e;
}
ok(threw !== null, "name overflow → DeclarationValidationError");
ok(threw?.issues.some((i) => i.reason === "value_exceeds_width") === true, "overflow error reason");

// ── 3) تصريح «لا شيء» (néant): بلا عمال — رأس وذيل فقط ─────────
const neant = renderEbdsLayout(layout, { ...ctx, workers: [] });
const neantLines = neant.split("\n").filter((l) => l !== "");
eq(neantLines.length, 2, "néant: header + trailer only");
ok(neantLines[1].includes("000"), "néant trailer zero workers");

// تخطيط فاسد: بلا سجل per_worker
const badLayoutIssues = validateLayout({ ...layout, records: [layout.records[0]] });
ok(badLayoutIssues.some((i) => i.reason === "no_per_worker_record"), "layout without per_worker record rejected");
// تخطيط فاسد: عرض ثابت بلا width
const badWidthIssues = validateLayout({
  ...layout,
  fieldSeparator: null,
  records: [{ type: "header", fields: [{ source: "company.cnssNumber" }] }],
});
ok(badWidthIssues.some((i) => i.reason === "fixed_width_missing"), "field without width in fixed-width layout rejected");

// ── 4) مُحقّق XSD ────────────────────────────────────────────────
const SAMPLE_XSD = `<?xml version="1.0" encoding="UTF-8"?>
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

const xsdModel = parseXsd(SAMPLE_XSD);
ok(xsdModel.root?.name === "Declaration9421", "XSD root parsed");
ok(xsdModel.warnings.length === 0, "sample XSD has no warnings");

// XML صحيح
const validXml = `<?xml version="1.0" encoding="UTF-8"?>
<Declaration9421>
  <Annee>2026</Annee>
  <ICE>001234567000089</ICE>
  <Employe><CIN>AB123456</CIN><Jours>22</Jours><Brut>4000.00</Brut></Employe>
  <Employe><CIN>CD654321</CIN><Jours>26</Jours><Brut>10000.00</Brut></Employe>
  <TotalIR>451.56</TotalIR>
</Declaration9421>`;
eq(validateXmlAgainstXsd(validXml, xsdModel), [], "valid XML passes XSD");

// عنصر إلزامي ناقص (ICE)
const missingIce = validXml.replace("<ICE>001234567000089</ICE>", "");
const issues1 = validateXmlAgainstXsd(missingIce, xsdModel);
ok(issues1.some((i) => i.reason === "missing_required_element" && i.element.includes("ICE")), "missing ICE → element+reason");

// عنصر زائد غير معرف في المخطط
const extraEl = validXml.replace("<TotalIR>", "<Inconnu>x</Inconnu>\n  <TotalIR>");
const issues2 = validateXmlAgainstXsd(extraEl, xsdModel);
ok(issues2.some((i) => i.reason === "unexpected_element" && i.element.includes("Inconnu")), "unexpected element detected");

// ترتيب sequence مكسور (Jours قبل CIN)
const swapped = validXml.replace("<CIN>AB123456</CIN><Jours>22</Jours>", "<Jours>22</Jours><CIN>AB123456</CIN>");
const issues3 = validateXmlAgainstXsd(swapped, xsdModel);
ok(issues3.length > 0, "sequence order violation detected");

// نمط ICE مخالف (15 رقمًا)
const badPattern = validXml.replace("001234567000089", "123");
const issues4 = validateXmlAgainstXsd(badPattern, xsdModel);
ok(issues4.some((i) => i.reason === "pattern_violation" && i.element.includes("ICE")), "pattern violation on ICE");

// XML غير متشكل
const issues5 = validateXmlAgainstXsd("<Declaration9421><unclosed></Declaration9421>", xsdModel);
ok(issues5.some((i) => i.reason === "malformed_xml"), "malformed XML detected");

// ── 5) بانٍ من mapping ──────────────────────────────────────────
const mapping: XmlMapping = {
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
const built = buildXmlFromMapping(mapping, ctx);
eq(built.missing, [], "mapping build with full data → no missing");
const parsedBack = parseXml(built.xml);
eq(parsedBack.name, "Declaration9421", "built XML root correct");
eq(parsedBack.children.find((c) => c.name === "ICE")?.text, "001234567000089", "built ICE value");
eq(parsedBack.children.filter((c) => c.name === "Employe").length, 2, "built Employe count");
eq(parsedBack.children.find((c) => c.name === "TotalIR")?.text, "451.56", "built TotalIR total (0+451.56)");
// البناء يطابق XSD العينة (دورة كاملة: بناء ← تحقق)
eq(validateXmlAgainstXsd(built.xml, xsdModel), [], "built XML validates against sample XSD");

// قيمة ناقصة (CIN فارغ) → missing + لا يبنى مع ناقص
const builtMissing = buildXmlFromMapping(mapping, { ...ctx, workers: [{ ...ctx.workers[0], cin: null }] });
ok(builtMissing.missing.some((m) => m.includes("CIN")), "missing CIN reported in mapping build");

// ── 6) مطابقة IR الشهري ↔ بيان 9421 (SPEC §4.6: قاعدة مطابقة) ──
const fullYear = (nonzero: { periodKey: string; irNetCents: number }[]): IrMonthlyEntry[] =>
  Array.from({ length: 12 }, (_, i) => {
    const key = `2026-${String(i + 1).padStart(2, "0")}`;
    return { periodKey: key, irNetCents: nonzero.find((n) => n.periodKey === key)?.irNetCents ?? 0 };
  });
const months = [
  { periodKey: "2026-01", irNetCents: 100000 },
  { periodKey: "2026-02", irNetCents: 110000 },
  { periodKey: "2026-03", irNetCents: 120000 },
];
// متطابق (12 شهرًا، 3 منها بدخل)
const ok1 = reconcileIrMonthlyVsAnnual(fullYear(months), 330000);
eq(ok1.issues, [], "IR monthly sum == annual total → no issues");
// فرق 1 سنتيم
const off = reconcileIrMonthlyVsAnnual(fullYear(months), 330001);
ok(off.issues.some((i) => i.reason === "ir_total_mismatch"), "1-cent difference detected");
eq(off.monthlyTotalCents, 330000, "monthly total reported");
eq(off.annualTotalCents, 330001, "annual total reported");
// شهر ناقص (11 شهرًا فقط من 12)
const missingMonth = reconcileIrMonthlyVsAnnual(fullYear(months).slice(0, 11), 330000);
ok(missingMonth.issues.some((i) => i.reason === "missing_ir_month"), "missing month detected (11 of 12)");
// تصفير الشهور الغائبة: كشف بلا IR يُحسب صفرًا (لا يُحذف الشهر)
const withZeroMonth = reconcileIrMonthlyVsAnnual(fullYear(months), 330000);
eq(withZeroMonth.issues, [], "12 months with zero-IR months → no issues");

// ── النتيجة ──────────────────────────────────────────────────────
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log("FAILURES:");
  for (const f of failures) console.log("  ✗ " + f);
  process.exit(1);
}
