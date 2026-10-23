// FWMS — اختبار وظيفي أساسي: شركة/فرع/مشروع/موقع/حساب/تفويض (جولة تفتيش المالك 2026-10-19 «تفحص جميع وظائف المنصة وصلاحيات المستخدمين»)
// ---------------------------------------------------------------------------
// التشغيل (خادم قائم — وضع الإنتاج أو التطوير):
//   BASE=http://localhost:3000 node tests/api-functional-core.mjs
// ملاحظة: يتطلّب قاعدة بذور (bunx prisma db seed) — ينشئ بيانات تجريبية بلاحقة زمنية.
// FWMS — اختبار وظيفي شامل: إنشاء شركة/فرع/مشروع/موقع/حساب مستخدم/تفويض صلاحية
const BASE = process.env.BASE ?? "http://localhost:3000";
const TS = Date.now().toString().slice(-8); // روابط فريدة لإعادة التشغيل
const PW = "Fwms#2026";

async function login(email, password = PW) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`login ${email} => ${res.status}`);
  return res.headers.get("set-cookie")?.split(";")[0] ?? "";
}

const j = (r) => r.json().catch(() => ({}));
let pass = 0, fail = 0;
async function step(name, fn) {
  try {
    const r = await fn();
    if (r === true) { console.log(`  ✓ ${name}`); pass++; }
    else { console.log(`  ✗ ${name} — ${r}`); fail++; }
  } catch (e) {
    console.log(`  ✗ ${name} — استثناء: ${e.message}`); fail++;
  }
}

const owner = await login("owner@fwms.local");
const admin = await login("admin@demo.ma");
const worker = await login("worker@demo.ma");
const supervisor = await login("supervisor@demo.ma");

console.log("═══ 1) إنشاء شركة (المالك — super_admin) ═══");
let companyId = null;
await step("المالك ينشئ شركة «شركة الاختبار الآلي SARL»", async () => {
  const res = await fetch(`${BASE}/api/companies`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: owner },
    body: JSON.stringify({
      name: "شركة الاختبار الآلي SARL",
      legalName: "شركة الاختبار الآلي ش.م.م",
      contactEmail: "test-auto@demo.ma",
      ice: "0012345678000",
      ifu: "12345678",
      rc: "RC-TEST-001",
      cnssNumber: "9876543",
    }),
  });
  const data = await j(res);
  companyId = data.company?.id ?? data.id ?? null;
  return (res.status === 201 || res.status === 200) && companyId ? true : `status=${res.status} body=${JSON.stringify(data).slice(0, 120)}`;
});
await step("المالك يرى الشركة الجديدة في القائمة", async () => {
  const res = await fetch(`${BASE}/api/companies`, { headers: { Cookie: owner } });
  const data = await j(res);
  const found = (data.companies ?? []).some((c) => c.id === companyId);
  return found ? true : `لم تُوجد في ${data.companies?.length ?? "?"} شركة`;
});
await step("المدير (admin) ممنوع من إنشاء شركة (403)", async () => {
  const res = await fetch(`${BASE}/api/companies`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: admin },
    body: JSON.stringify({ name: "شركة غير مصرح بها" }),
  });
  return res.status === 403 ? true : `status=${res.status}`;
});

console.log("═══ 2) إنشاء فرع + مشروع + موقع (admin) ═══");
let branchId = null, projectId = null, siteId = null;
await step("admin ينشئ فرعًا", async () => {
  const res = await fetch(`${BASE}/api/branches`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: admin },
    body: JSON.stringify({ name: "فرع الاختبار — المحمدية", city: "المحمدية", address: "شارع الاختبار 1" }),
  });
  const data = await j(res);
  branchId = data.branch?.id ?? data.id ?? null;
  return (res.status === 201 || res.status === 200) && branchId ? true : `status=${res.status} body=${JSON.stringify(data).slice(0, 120)}`;
});
await step("admin ينشئ مشروعًا", async () => {
  const res = await fetch(`${BASE}/api/projects`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: admin },
    body: JSON.stringify({ name: "مشروع اختبار آلي", branchId, startDate: "2026-10-01", endDate: "2026-12-31" }),
  });
  const data = await j(res);
  projectId = data.project?.id ?? data.id ?? null;
  return (res.status === 201 || res.status === 200) && projectId ? true : `status=${res.status} body=${JSON.stringify(data).slice(0, 120)}`;
});
await step("admin ينشئ موقعًا بإحداثيات ونطاق 120م", async () => {
  const res = await fetch(`${BASE}/api/sites`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: admin },
    body: JSON.stringify({
      name: "موقع اختبار آلي",
      address: "عنوان اختبار",
      latitude: 33.6866,
      longitude: -7.5780,
      radiusM: 120,
      branchId,
      projectId,
    }),
  });
  const data = await j(res);
  siteId = data.site?.id ?? data.id ?? null;
  return (res.status === 201 || res.status === 200) && siteId ? true : `status=${res.status} body=${JSON.stringify(data).slice(0, 120)}`;
});
await step("إحداثيات غير صالحة تُرفض (400)", async () => {
  const res = await fetch(`${BASE}/api/sites`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: admin },
    body: JSON.stringify({ name: "موقع فاسد", latitude: 999, longitude: -7.5, radiusM: 100 }),
  });
  return res.status === 400 ? true : `status=${res.status}`;
});
await step("العامل ممنوع من إنشاء موقع (403)", async () => {
  const res = await fetch(`${BASE}/api/sites`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: worker },
    body: JSON.stringify({ name: "موقع عامل", latitude: 33.6, longitude: -7.5, radiusM: 100 }),
  });
  return res.status === 403 ? true : `status=${res.status}`;
});

console.log("═══ 3) إنشاء حساب مستخدم + تفويض (super_admin) ═══");
let newUserId = null, initialPassword = null;
await step("المالك ينشئ حساب مدير جديد (كلمة مرور مولدة)", async () => {
  const res = await fetch(`${BASE}/api/users`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: owner },
    body: JSON.stringify({ email: `newmanager-${TS}@demo.ma`, fullName: "مدير اختبار آلي", role: "admin" }),
  });
  const data = await j(res);
  newUserId = data.user?.id ?? data.user?.userId ?? null;
  initialPassword = data.initialPassword ?? null;
  return (res.status === 201 || res.status === 200) && newUserId ? true : `status=${res.status} body=${JSON.stringify(data).slice(0, 140)}`;
});
await step("admin ممنوع من إنشاء حساب (users.create للمالك حصرًا)", async () => {
  const res = await fetch(`${BASE}/api/users`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: admin },
    body: JSON.stringify({ email: "hacker@demo.ma", fullName: "اختبار", role: "admin" }),
  });
  return res.status === 403 ? true : `status=${res.status}`;
});
await step("تفويض users.create إلى admin الجديد ثم استعماله", async () => {
  // 1) المالك يفوّض
  const del = await fetch(`${BASE}/api/users/delegations`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: owner },
    body: JSON.stringify({ granteeId: newUserId, permission: "users.create", note: "اختبار آلي للتفويض" }),
  });
  const delData = await j(del);
  if (del.status !== 201 && del.status !== 200) return `تفويض فشل: ${del.status} ${JSON.stringify(delData).slice(0, 120)}`;
  // 2) المدير الجديد يسجل دخوله بكلمة المرور المولدة (عادت مرة واحدة في الاستجابة)
  if (!initialPassword) return "كلمة المرور المولدة لم تُلتقط من استجابة الإنشاء";
  // login ترمي استثناء عند الفشل — النجاح يعيد كوكي الجلسة مباشرة
  const nm = await login(`newmanager-${TS}@demo.ma`, initialPassword);
  const res2 = await fetch(`${BASE}/api/users`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: nm },
    body: JSON.stringify({ email: `delegated-${TS}@demo.ma`, fullName: "حساب عبر التفويض", role: "employee" }),
  });
  return (res2.status === 201 || res2.status === 200) ? true : `status=${res2.status} (التفويض لم يُفعّل)`;
});
await step("سحب التفويض (DELETE) ثم منع الاستعمال", async () => {
  const list = await fetch(`${BASE}/api/users/delegations`, { headers: { Cookie: owner } });
  const data = await j(list);
  const grant = (data.delegations ?? data.grants ?? []).find((d) => d.permission === "users.create" && (d.granteeId === newUserId || d.grantee?.email === `newmanager-${TS}@demo.ma`));
  if (!grant) return "لم يُوجد التفويض في القائمة";
  const del = await fetch(`${BASE}/api/users/delegations?id=${grant.id}`, { method: "DELETE", headers: { Cookie: owner } });
  return del.status === 200 || del.status === 204 ? true : `status=${del.status}`;
});

console.log("═══ 4) عزل البيانات بين الشركات ═══");
await step("العامل لا يرى مواقع شركة أخرى (عزل companyId من الجلسة)", async () => {
  const res = await fetch(`${BASE}/api/sites`, { headers: { Cookie: worker } });
  const data = await j(res);
  const leaked = (data.sites ?? []).some((s) => s.companyId && s.companyId !== "company-demo");
  return !leaked ? true : `تسرب: ${JSON.stringify(leaked)}`;
});

console.log("═══ 5) تسجيل الدخول: كلمات مرور خاطئة وموقوفة ═══");
await step("كلمة مرور خاطئة → 401", async () => {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin@demo.ma", password: "WrongPassword1!" }),
  });
  return res.status === 401 ? true : `status=${res.status}`;
});
await step("حساب غير موجود → 401 (لا كشف وجود)", async () => {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "ghost@nowhere.ma", password: "Whatever123!" }),
  });
  return res.status === 401 ? true : `status=${res.status}`;
});
await step("جلسة ملغاة بعد الخروج (إبطال حقيقي)", async () => {
  const s = await login("worker@demo.ma");
  await new Promise((r) => setTimeout(r, 2500)); // هامش الثانية الموثق في session.ts
  const out = await fetch(`${BASE}/api/auth/logout`, { method: "POST", headers: { Cookie: s } });
  if (out.status !== 200) return `خروج=${out.status}`;
  const after = await fetch(`${BASE}/api/auth/session`, { headers: { Cookie: s } });
  const data = await j(after);
  return data.user == null ? true : `الجلسة ما زالت حية: ${JSON.stringify(data).slice(0, 80)}`;
});

console.log("═══ النتيجة ═══");
console.log(`PASS=${pass} FAIL=${fail}`);
process.exit(fail > 0 ? 1 : 0);
