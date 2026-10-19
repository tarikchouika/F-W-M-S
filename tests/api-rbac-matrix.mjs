// FWMS — اختبار مصفوفة الصلاحيات RBAC عبر API للحسابات الخمسة (جولة تفتيش المالك 2026-10-19 «تفحص جميع وظائف المنصة وصلاحيات المستخدمين»)
// ---------------------------------------------------------------------------
// التشغيل (خادم قائم — وضع الإنتاج أو التطوير):
//   BASE=http://localhost:3000 node tests/api-rbac-matrix.mjs
// ملاحظة: يتطلّب قاعدة بذور (bunx prisma db seed) — ينشئ بيانات تجريبية بلاحقة زمنية.
// FWMS — اختبار RBAC شامل عبر API للحسابات الخمسة
// يستعمل: node rbac-api-test.mjs
const BASE = "http://localhost:3000";

const ACCOUNTS = [
  { email: "owner@fwms.local", role: "super_admin", label: "المالك" },
  { email: "admin@demo.ma", role: "admin", label: "المدير" },
  { email: "accountant@demo.ma", role: "accountant", label: "المحاسب" },
  { email: "supervisor@demo.ma", role: "co_admin", label: "المشرف" },
  { email: "worker@demo.ma", role: "employee", label: "العامل" },
];

// (مسار، طريقة، متوقع لكل دور بالترتيب أعلاه)
// 200/201 = مسموح | 403 = ممنوع صلاحيةً | 401 = غير مصرح (لا جلسة)
const CASES = [
  { path: "/api/auth/session", method: "GET", expect: [200, 200, 200, 200, 200], note: "جلسة" },
  { path: "/api/companies", method: "GET", expect: [200, 403, 403, 403, 403], note: "قائمة الشركات — مالك فقط" },
  { path: "/api/branches", method: "GET", expect: [200, 200, 403, 403, 403], note: "الفروع — إدارة" },
  { path: "/api/projects", method: "GET", expect: [200, 200, 403, 403, 403], note: "المشاريع — إدارة" },
  { path: "/api/sites", method: "GET", expect: [200, 200, 403, 403, 403], note: "المواقع — إدارة" },
  { path: "/api/worker-groups", method: "GET", expect: [200, 200, 403, 403, 403], note: "مجموعات العمال" },
  { path: "/api/shift-templates", method: "GET", expect: [200, 200, 403, 200, 403], note: "قوالب الورديات — إدارة+مشرف" },
  { path: "/api/shifts", method: "GET", expect: [200, 200, 403, 200, 403], note: "الورديات — بلا عامل" },
  { path: "/api/my-schedule", method: "GET", expect: [200, 200, 200, 200, 200], note: "برنامجي — الجميع" },
  { path: "/api/attendance", method: "GET", expect: [200, 200, 403, 200, 403], note: "سجل الحضور — بلا عامل" },
  { path: "/api/my-attendance", method: "GET", expect: [200, 200, 200, 200, 200], note: "حضوري — الجميع" },
  { path: "/api/coverage", method: "GET", expect: [200, 200, 403, 200, 403], note: "التغطية المفتوحة" },
  { path: "/api/pay-periods", method: "GET", expect: [200, 200, 200, 403, 403], note: "دورات الأجور — مالك+محاسب" },
  { path: "/api/my-payslips", method: "GET", expect: [200, 200, 200, 200, 200], note: "أجوري — الجميع" },
  { path: "/api/regimes", method: "GET", expect: [200, 200, 200, 403, 403], note: "المسارات" },
  { path: "/api/holidays", method: "GET", expect: [200, 200, 200, 403, 403], note: "العطل" },
  { path: "/api/declarations", method: "GET", expect: [200, 403, 200, 403, 403], note: "التصاريح — مالك+محاسب" },
  { path: "/api/declaration-specs", method: "GET", expect: [200, 403, 200, 403, 403], note: "سجل المواصفات" },
  { path: "/api/audit", method: "GET", expect: [200, 200, 200, 403, 403], note: "سجل التدقيق" },
  { path: "/api/users", method: "GET", expect: [200, 200, 403, 403, 403], note: "المستخدمون — users.manage (أُصلح: كان مفتوحًا للجميع)" },
  { path: "/api/team-presence", method: "GET", expect: [200, 200, 403, 200, 403], note: "فرق الحضور" },
  { path: "/api/voice-messages?group=none", method: "GET", expect: [404, 404, 403, 404, 403], note: "الرسائل الصوتية — group=none: مشرفو voice.admin=404 (لا جماعة)، voice.use=403 (ليس فريقه)" },
  { path: "/api/reports", method: "GET", expect: [200, 200, 200, 200, 200], note: "التقارير" },
  { path: "/api/verification-policies", method: "GET", expect: [200, 200, 403, 403, 403], note: "سياسات التحقق — إدارة" },
  { path: "/api/regime-assignments", method: "GET", expect: [200, 200, 200, 403, 403], note: "إسنادات المسارات — payroll.view" },
  { path: "/api/health", method: "GET", expect: [200, 200, 200, 200, 200], note: "الصحة — عام" },
];

async function login(email) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "Fwms#2026" }),
  });
  if (!res.ok) throw new Error(`login ${email} => ${res.status}`);
  const cookie = res.headers.get("set-cookie")?.split(";")[0] ?? "";
  return cookie;
}

const cookies = {};
for (const acc of ACCOUNTS) {
  cookies[acc.email] = await login(acc.email);
  console.log(`✓ دخول: ${acc.label} (${acc.email})`);
}
console.log("".padEnd(70, "─"));

let pass = 0, fail = 0;
const failures = [];
for (const c of CASES) {
  const row = [];
  for (let i = 0; i < ACCOUNTS.length; i++) {
    const acc = ACCOUNTS[i];
    try {
      const res = await fetch(`${BASE}${c.path}`, {
        method: c.method,
        headers: { Cookie: cookies[acc.email] },
        redirect: "manual",
      });
      const status = res.status;
      const expected = c.expect[i];
      const ok = status === expected || (expected === 200 && status === 201);
      row.push(ok ? `${acc.role}:${status}✓` : `${acc.role}:${status}✗(توقع ${expected})`);
      if (ok) pass++;
      else { fail++; failures.push(`${c.note} — ${acc.email}: ${status} بدل ${expected}`); }
    } catch (e) {
      row.push(`${acc.role}:ERR✗`);
      fail++;
      failures.push(`${c.note} — ${acc.email}: ${e.message}`);
    }
  }
  console.log(`${c.note}`);
  console.log(`   ${row.join("  ")}`);
}
console.log("".padEnd(70, "─"));
console.log(`PASS=${pass} FAIL=${fail}`);
if (failures.length) {
  console.log("الإخفاقات:");
  for (const f of failures) console.log(`  ✗ ${f}`);
}
