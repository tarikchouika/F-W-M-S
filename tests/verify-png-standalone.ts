// HRMP — تحقق جلسة 2026-10-18 (المساعد الأول): توليد PNG داخل standalone
// الهدف: إثبات أن حلقة نسخ @img/* في build تجعل sharp يعمل من standalone مباشرة
// (وضع الفشل على الهاتف: كل PNG كان internal_error قبل fix-sharp-standalone.sh)
// التشغيل: BASE=http://localhost:3200 bun tests/verify-png-standalone.ts
const BASE = process.env.BASE ?? "http://localhost:3200";

async function login(email: string, password = "Fwms#2026"): Promise<string> {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (res.status !== 200) throw new Error(`login failed for ${email}: ${res.status}`);
  return (res.headers.get("set-cookie") ?? "").split(";")[0];
}

async function call(cookie: string, method: string, path: string, body?: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json", cookie },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let json: any = null;
  try { json = await res.json(); } catch { /* binaer أو فارغ */ }
  return { status: res.status, json };
}

async function main() {
  const admin = await login("admin@demo.ma");
  const accountant = await login("accountant@demo.ma");

  await call(accountant, "POST", "/api/pay-rules/verify-all");
  await call(admin, "POST", "/api/pay-periods", { year: 2026, month: 10 });
  const periods = await call(admin, "GET", "/api/pay-periods");
  const oct = (periods.json?.periods ?? []).find((p: any) => p.year === 2026 && p.month === 10);
  if (!oct) throw new Error("no period");
  if (oct.status === "draft") {
    await call(admin, "POST", `/api/pay-periods/${oct.id}/generate`);
    await call(admin, "POST", `/api/pay-periods/${oct.id}/submit`);
    await call(admin, "POST", `/api/pay-periods/${oct.id}/approve`);
  }
  const detail = await call(admin, "GET", `/api/pay-periods/${oct.id}`);
  const payslips = detail.json?.payslips ?? [];
  if (payslips.length < 1) throw new Error("no payslips");
  const payslipId = payslips[0].id;

  // ── الاختبار الجوهري: PNG عبر sharp داخل standalone ──
  const png = await call(admin, "POST", "/api/reports/generate", {
    kind: "payslip", targetId: payslipId, format: "png", language: "ar",
  });
  console.log(`PNG : status=${png.status} ref=${png.json?.refNumber} version=${png.json?.version} size=${png.json?.size}B`);
  const pngOk = png.status === 201 && typeof png.json?.size === "number" && png.json.size > 10000;

  // ── PDF للمقارنة (نفس البيانات) ──
  const pdf = await call(admin, "POST", "/api/reports/generate", {
    kind: "payslip", targetId: payslipId, format: "pdf", language: "ar",
  });
  console.log(`PDF : status=${pdf.status} ref=${pdf.json?.refNumber} version=${pdf.json?.version} size=${pdf.json?.size}B`);
  const pdfOk = pdf.status === 201 && typeof pdf.json?.size === "number" && pdf.json.size > 10000;

  // ── بصمة المحتوى مستقلة عن الصيغة (قاعدة المرحلة 7) ──
  const sameHash = png.json?.contentHash === pdf.json?.contentHash;
  console.log(`HASH: contentHash متطابق بين PNG وPDF = ${sameHash} (${png.json?.contentHash?.slice(0, 16)}…)`);

  // ── الإصدار 9 من العارض (إصلاح المساعد الثاني للمسألة 4) ──
  // v9 = محاذاة فيزيائية واعية بالاتجاه في png.ts (كانت النصوص تُقص عند الحواف)
  const verify = await fetch(`${BASE}/verify/${png.json?.refNumber}?h=${png.json?.contentHash}`);
  console.log(`VERIFY: ${verify.status} (صفحة التحقق العامة)`);

  const pass = pngOk && pdfOk && sameHash && verify.status === 200;
  console.log(pass ? "✓ standalone: PNG عبر sharp يعمل + PDF + بصمة موحَّدة + تحقق عام" : "✗ فشل أحد الفحوص");
  process.exit(pass ? 0 : 1);
}

main().catch((e) => { console.error("✗", e.message); process.exit(1); });
