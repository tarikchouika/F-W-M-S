// FWMS — إعادة إنتاج دورة رواتب كاملة + تصريح معتمد لاختبار تقرير المطابقة
// (منهجية المشروع: إعادة إنتاج قبل العلاج)
// التشغيل: bun /home/z/my-project/fwms/scripts/repro-declaration.mjs
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  const company = await db.company.findFirst({ where: { id: "company-demo" } });
  if (!company) throw new Error("company-demo غير موجود");

  // 1) فترة رواتب معتمدة لشهر 2026-10
  let period = await db.payPeriod.findFirst({ where: { companyId: company.id, year: 2026, month: 10 } });
  if (!period) {
    period = await db.payPeriod.create({
      data: { companyId: company.id, year: 2026, month: 10, status: "approved", approvedAt: new Date() },
    });
    console.log("✓ فترة أُنشئت:", period.id);
  }

  // 2) كشوف أجور مجمّدة لثلاثة عمال (مع snapshotJson)
  const workers = await db.user.findMany({
    where: { memberships: { some: { companyId: company.id } } },
    include: { employeeProfiles: { where: { companyId: company.id } } },
  });
  const employees = workers.filter((w) => w.employeeProfiles.length > 0).slice(0, 3);
  let seq = 1;
  for (const w of employees) {
    const exists = await db.payslip.findFirst({ where: { periodId: period.id, workerUserId: w.id } });
    if (exists) continue;
    const gross = 4_000_00 + seq * 500_00;
    const cnss = Math.round(gross * 0.0448);
    const amo = Math.round(gross * 0.0226);
    const ir = Math.round(gross * 0.1);
    const net = gross - cnss - amo - ir;
    const snap = {
      totals: {
        workedMinutes: 10560, breakMinutes: 0, overtimeMinutes: 480, workedDays: 22,
        grossCents: gross, sbiCents: gross, cnssEmployeeCents: cnss, amoEmployeeCents: amo,
        irNetCents: ir, netCents: net, employerCostCents: Math.round(gross * 0.2113), totalCostCents: Math.round(gross * 1.2113),
      },
      lines: [
        { kind: "base_hours", minutes: 10560, rateBp: 300000, amountCents: gross, label: null },
        { kind: "cnss", minutes: null, rateBp: null, amountCents: cnss, label: null },
        { kind: "amo", minutes: null, rateBp: null, amountCents: amo, label: null },
        { kind: "ir", minutes: null, rateBp: null, amountCents: ir, label: null },
      ],
      frozenAt: new Date().toISOString(),
    };
    await db.payslip.create({
      data: {
        companyId: company.id, periodId: period.id, workerUserId: w.id,
        refNumber: `PS-202610-${String(seq).padStart(4, "0")}`,
        workedMinutes: 10560, breakMinutes: 0, overtimeMinutes: 480, workedDays: 22,
        grossCents: gross, cnssBaseCents: gross, cnssEmployeeCents: cnss, amoEmployeeCents: amo,
        irNetCents: ir, netCents: net, employerCostCents: Math.round(gross * 0.2113),
        totalCostCents: Math.round(gross * 1.2113), smigBreached: false,
        snapshotJson: JSON.stringify(snap),
      },
    });
    seq++;
  }
  console.log("✓ كشوف مجمّدة:", seq - 1);

  // 3) تصريح CNSS شهري معتمد مع ملف وملخص
  const spec = await db.declarationSpec.findFirst({ where: { authority: "cnss", kind: "monthly" } });
  let decl = await db.declaration.findFirst({ where: { companyId: company.id, periodKey: "2026-10" } });
  if (!decl) {
    const payslips = await db.payslip.findMany({ where: { periodId: period.id } });
    const gross = payslips.reduce((a, p) => a + p.grossCents, 0);
    const cnss = payslips.reduce((a, p) => a + p.cnssEmployeeCents, 0);
    const amo = payslips.reduce((a, p) => a + p.amoEmployeeCents, 0);
    const ir = payslips.reduce((a, p) => a + p.irNetCents, 0);
    const net = payslips.reduce((a, p) => a + p.netCents, 0);
    decl = await db.declaration.create({
      data: {
        companyId: company.id, specId: spec.id, periodId: period.id, periodKey: "2026-10",
        authority: "cnss", kind: "monthly", status: "approved",
        createdBy: "user-super-admin",
        approvedBy: "user-super-admin", approvedAt: new Date(),
        summaryJson: JSON.stringify({ totals: { workers: payslips.length, grossCents: gross, cnssEmployeeCents: cnss, amoEmployeeCents: amo, irNetCents: ir, netCents: net } }),
      },
    });
    await db.declarationFile.create({
      data: {
        declarationId: decl.id,
        content: "SAMPLE-EBDS-CONTENT-FOR-COMPLIANCE-TEST",
        sha256: "a".repeat(64), specVersion: spec.version, format: "ebds",
        sizeBytes: 37, exportedBy: "user-super-admin",
      },
    });
    console.log("✓ تصريح معتمد:", decl.id);
  }

  // 4) تصريح DGI في حالة generated (لاختبار الرفض)
  const specDgi = await db.declarationSpec.findFirst({ where: { authority: "dgi" } });
  const declDraft = await db.declaration.findFirst({ where: { companyId: company.id, periodKey: "2026", authority: "dgi" } });
  if (!declDraft) {
    await db.declaration.create({
      data: { companyId: company.id, specId: specDgi.id, periodId: null, periodKey: "2026", authority: "dgi", kind: "annual_9421", status: "generated", createdBy: "user-super-admin" },
    });
    console.log("✓ تصريح DGI بحالة generated (لاختبار الرسائل)");
  }

  console.log("\n=== المعرّفات للاختبار ===");
  console.log("period:", period.id);
  console.log("declCNSS:", decl.id);
  const all = await db.declaration.findMany({ where: { companyId: company.id } });
  for (const d of all) console.log(`  ${d.authority}/${d.kind} ${d.periodKey} → ${d.status} (${d.id})`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => db.$disconnect());
