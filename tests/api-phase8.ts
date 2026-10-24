// HRMP — اختبار API للمرحلة 8 (SPEC §3.2 و§8): ملكية المنصة + white-label + نقل الملكية التجريبي
// التشغيل (قاعدة اختبار مستقلة — لا تلمس قاعدة التطوير):
//   rm -f db/test-phase8.db*
//   DATABASE_URL=file:$(pwd)/db/test-phase8.db node_modules/.bin/prisma db push --skip-generate
//   DATABASE_URL=file:$(pwd)/db/test-phase8.db bun prisma/seeds/seed.ts
//   DATABASE_URL=file:$(pwd)/db/test-phase8.db PORT=3100 setsid nohup bun --bun next dev -p 3100 > dev3100.log 2>&1 < /dev/null &
//   BASE=http://localhost:3100 bun tests/api-phase8.ts
// ملاحظة: schema الاختبار عبر db push (مساوية بنيويًا) — migration الموقّعة مسؤولية المساعد الثاني (WORKLOG).
// المعايير المُختبَرة (معيار قبول المرحلة 8 الحرفي):
//   «نقل ملكية تجريبي يفقد فيه المالك السابق كل وصول (أسرار مُدوَّرة، جلسات منتهية، سجل تدقيق سليم)»
//   + قائمة فحص أمني: تحديد معدل الدخول + RBAC + إعادة مصادقة كل خطوة
//   + white-label يدخل بصمة المحتوى (تغيّر الهوية = إصدار مستند جديد والقديم ثابت)
const BASE = process.env.BASE ?? "http://localhost:3100";

let passed = 0;
let failed = 0;
const failures: string[] = [];
function ok(cond: boolean, label: string, detail?: unknown) {
  if (cond) {
    passed++;
  } else {
    failed++;
    failures.push(label + (detail !== undefined ? ` — ${JSON.stringify(detail)?.slice(0, 300)}` : ""));
  }
}

type Jar = { cookie: string };
async function login(email: string, password = "Fwms#2026"): Promise<Jar> {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (res.status !== 200) throw new Error(`login failed for ${email}: ${res.status}`);
  const setCookie = res.headers.get("set-cookie");
  if (!setCookie) throw new Error("no set-cookie");
  return { cookie: setCookie.split(";")[0] };
}

async function call(
  jar: Jar | null,
  method: string,
  path: string,
  body?: unknown
): Promise<{ status: number; json: any; text: string }> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(jar ? { Cookie: jar.cookie } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  const setCookie = res.headers.get("set-cookie");
  if (setCookie && jar) jar.cookie = setCookie.split(";")[0];
  return { status: res.status, json, text };
}

// كل قيود التدقيق (عقد v0.11.0: ترقيم صفحات page/pageSize بحدّ pageSize=100
// وpage≤500 — الاستعلام القديم ?limit=200 لم يعد مدعومًا ⇒ أعاد أول صفحة فقط
// (25 صفًا) فبدت قيود أقدم «مفقودة» في فحص سلامة السجل. خطأ في الاختبار لا في
// التطبيق: commit 5470403 (v0.11.0) هو من استبدل عقد الاستعلام ولم يحدّث الاختبار.
async function fetchAllAudit(jar: Jar): Promise<any[]> {
  const all: any[] = [];
  for (let page = 1; page <= 50; page++) {
    const r = await call(jar, "GET", `/api/audit?page=${page}&pageSize=100`);
    if (r.status !== 200) break;
    const logs: any[] = r.json?.logs ?? [];
    all.push(...logs);
    const total: number = r.json?.total ?? all.length;
    if (logs.length === 0 || all.length >= total) break;
  }
  return all;
}

const OWNER = "owner@fwms.local";
const NEW_ADMIN_EMAIL = "newowner@test.ma";

// ── الدخول ───────────────────────────────────────────────────────
const owner = await login(OWNER);
const admin = await login("admin@demo.ma");
const accountant = await login("accountant@demo.ma");
const worker = await login("worker@demo.ma");
console.log("✓ دخول: owner + admin + accountant + worker");

// ── 1) RBAC: ملكية المنصة لـ super_admin حصرًا ───────────────────
let r = await call(null, "GET", "/api/platform/ownership");
ok(r.status === 401, "ownership: 401 بلا جلسة", r.status);

r = await call(worker, "GET", "/api/platform/ownership");
ok(r.status === 403, "ownership: العامل 403", r.status);
r = await call(accountant, "GET", "/api/platform/ownership");
ok(r.status === 403, "ownership: المحاسب 403", r.status);
r = await call(admin, "GET", "/api/platform/ownership");
ok(r.status === 403, "ownership: المدير 403 (platform.manage للمالك حصرًا)", r.status);

r = await call(owner, "GET", "/api/platform/ownership");
ok(r.status === 200, "ownership: 200 للمالك");
ok(r.json?.owner?.legalName === "HRMP Platform Owner (Demo)", "identity: الاسم القانوني من البذور", r.json?.owner?.legalName);
ok(r.json?.activeTransfer === null, "status: لا نقل جارٍ");
ok(r.json?.freeze === false, "status: لا تجميد");
console.log("✓ RBAC: super_admin حصرًا + الحالة الأولية سليمة");

// ── 2) تحديد معدل تسجيل الدخول (SPEC §6 — أُغلق في المرحلة 8) ────
{
  const email = "ratelimit-probe@test.ma";
  let last = 0;
  for (let i = 0; i < 12; i++) {
    const res = await fetch(`${BASE}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: "wrong-password" }),
    });
    last = res.status;
    if (res.status === 429) {
      ok(res.headers.get("retry-after") !== null, "login rate: ترويسة Retry-After موجودة");
      break;
    }
  }
  ok(last === 429, "login rate: 429 بعد تجاوز 10 محاولات/دقيقة", last);
}
console.log("✓ تحديد معدل الدخول: 429 مع Retry-After");

// ── 3) white-label: تحديث هوية المالك (بإعادة مصادقة) ─────────────
r = await call(owner, "POST", "/api/platform/ownership", {
  action: "update-owner",
  password: "WRONG",
  displayName: "X",
});
ok(r.status === 401 && r.json?.error === "reauth_failed", "identity: كلمة مرور خاطئة → 401 reauth_failed", r.json);

r = await call(owner, "POST", "/api/platform/ownership", {
  action: "update-owner",
  password: "Fwms#2026",
  displayName: "منصة الأمان التجريبية",
  modulesJson: "not-json{",
});
ok(r.status === 422 && r.json?.error === "bad_modules_json", "identity: modulesJson فاسد → 422", r.json);

r = await call(owner, "POST", "/api/platform/ownership", {
  action: "update-owner",
  password: "Fwms#2026",
  displayName: "منصة الأمان التجريبية",
  contactEmail: "brand@test.ma",
  websiteUrl: "https://owner.example",
  termsUrl: "https://owner.example/terms",
  footerText: "تذييل مالك الاختبار",
  modulesJson: JSON.stringify({ "module.declarations": false, "regime.agricultural": false }),
});
ok(r.status === 200, "identity: تحديث الهوية 200", r.json);

r = await call(owner, "GET", "/api/platform/ownership");
ok(r.json?.owner?.displayName === "منصة الأمان التجريبية", "identity: الاسم المعروض محدَّث");
ok(r.json?.owner?.footerText === "تذييل مالك الاختبار", "identity: تذييل التقارير محدَّث");
ok(r.json?.owner?.websiteUrl === "https://owner.example", "identity: الموقع محدَّث");
const auditLogsOwner = await fetchAllAudit(owner);
ok(
  auditLogsOwner.some((l: any) => l.action === "platform.owner.updated"),
  "identity: محدَّث في سجل التدقيق"
);
console.log("✓ white-label: تحديث الهوية + تدقيق + رفض الفاسد");

// ── 4) دورة أجور + قسيمة v1 قبل النقل (لإثبات الثبات لاحقًا) ──────
await call(accountant, "POST", "/api/pay-rules/verify-all");
r = await call(admin, "POST", "/api/pay-periods", { year: 2026, month: 10 });
ok(r.status === 201 || r.status === 409, "payroll: فترة 2026-10 (إنشاء أو موجودة)", r.status);
r = await call(admin, "GET", "/api/pay-periods");
const octPeriod = (r.json?.periods ?? []).find((p: any) => p.year === 2026 && p.month === 10);
ok(Boolean(octPeriod), "payroll: الفترة موجودة");
if (octPeriod && octPeriod.status === "draft") {
  await call(admin, "POST", `/api/pay-periods/${octPeriod.id}/generate`);
  await call(admin, "POST", `/api/pay-periods/${octPeriod.id}/submit`);
  await call(admin, "POST", `/api/pay-periods/${octPeriod.id}/approve`);
}
r = await call(admin, "GET", `/api/pay-periods/${octPeriod.id}`);
const payslips = r.json?.payslips ?? [];
ok(payslips.length >= 1, "payroll: كشوف مولَّدة", payslips.length);
const payslipId = payslips[0]?.id;

r = await call(owner, "POST", "/api/reports/generate", {
  kind: "payslip",
  targetId: payslipId,
  format: "pdf",
  language: "ar",
});
ok(r.status === 201 && r.json?.version === 1 && r.json?.reused === false, "report: قسيمة v1 (قبل النقل)", r.json);
const v1Doc = r.json;

// لقطة سجل التدقيق قبل النقل (لإثبات سلامته بعد النقل)
const auditLogsBeforeTransfer = await fetchAllAudit(owner);
const auditBefore = auditLogsBeforeTransfer.map((l: any) => l.id);
ok(auditBefore.length >= 5, "audit: سجل قبل النقل غير فارغ", auditBefore.length);
console.log(`✓ دورة أجور معتمدة + قسيمة v1 + لقطة تدقيق (${auditBefore.length} قيدًا)`);

// ── 5) بدء نقل ببريد موجود → رفض (لا استيلاء على حساب قائم) ──────
r = await call(owner, "POST", "/api/platform/ownership", {
  action: "initiate",
  password: "Fwms#2026",
  newOwnerLegalName: "كيان وهمي",
  newOwnerDisplayName: "وهمي",
  newOwnerInitialAdminEmail: OWNER,
});
ok(r.status === 409 && r.json?.error === "admin_email_exists", "transfer: بريد المالك الجديد موجود → 409", r.json);

r = await call(owner, "POST", "/api/platform/ownership", {
  action: "initiate",
  password: "Fwms#2026",
  newOwnerLegalName: "كيان وهمي",
  newOwnerDisplayName: "وهمي",
  newOwnerInitialAdminEmail: "bad-email",
});
ok(r.status === 400, "transfer: بريد غير صالح → 400", r.status);

// ── 6) نقل تجريبي (إلغاء): التجميد يعمل ويُرفع ───────────────────
r = await call(owner, "POST", "/api/platform/ownership", {
  action: "initiate",
  password: "Fwms#2026",
  newOwnerLegalName: "كيان الإلغاء التجريبي",
  newOwnerDisplayName: "إلغاء",
  newOwnerInitialAdminEmail: "cancel-probe@test.ma",
  reason: "اختبار التجميد والإلغاء",
});
ok(r.status === 201, "transfer(تجريبي): بدء 201", r.json);
const dummyId = r.json?.transferId;

r = await call(owner, "GET", "/api/platform/ownership");
ok(r.json?.freeze === true, "freeze: التجميد مفعّل فور البدء");
ok(r.json?.activeTransfer?.state === "awaiting_current_owner", "freeze: الحالة بانتظار المالك الحالي");

r = await call(owner, "POST", "/api/companies", { legalName: "شركة زمن التجميد SARL", locale: "ar" });
ok(r.status === 423 && r.json?.error === "platform_frozen", "freeze: إنشاء شركة → 423 platform_frozen", r.status);

r = await call(admin, "POST", "/api/accountant-grants", {
  userId: "user-accountant",
  mode: "external",
  companyId: "company-demo",
  startsOn: "2026-10-01",
  endsOn: "2026-12-31",
});
ok(r.status === 423, "freeze: منح محاسب → 423", r.status);

r = await call(owner, "GET", "/api/companies");
ok(r.status === 200, "freeze: القراءة مسموحة أثناء التجميد", r.status);

r = await call(owner, "POST", "/api/platform/ownership", { action: "execute", password: "Fwms#2026" });
ok(r.status === 409 && r.json?.error === "no_approved_transfer", "transfer: تنفيذ قبل الموافقات → 409", r.json);

r = await call(owner, "POST", "/api/platform/ownership", {
  action: "cancel",
  password: "Fwms#2026",
  reason: "اختبار مكتمل",
});
ok(r.status === 200, "transfer(تجريبي): إلغاء 200", r.json);

r = await call(owner, "GET", "/api/platform/ownership");
ok(r.json?.freeze === false, "freeze: رُفع بعد الإلغاء");
ok(r.json?.history?.[0]?.state === "cancelled", "history: آخر سجل ملغى", r.json?.history?.[0]);

r = await call(owner, "POST", "/api/companies", { legalName: "شركة ما بعد الإلغاء SARL", locale: "ar" });
ok(r.status === 201, "freeze: إنشاء شركة يعمل بعد رفع التجميد", r.status);
console.log("✓ تجميد/إلغاء: 423 أثناء النقل + رفع بعده");

// ── 7) النقل الحقيقي: الموافقتان + الرمز + التنفيذ ───────────────
const NEW_LEGAL = "مؤسسة الملكية الجديدة للاختبار";
r = await call(owner, "POST", "/api/platform/ownership", {
  action: "initiate",
  password: "Fwms#2026",
  newOwnerLegalName: NEW_LEGAL,
  newOwnerDisplayName: "منصة المالك الجديد",
  newOwnerContactEmail: "contact@newowner.ma",
  newOwnerInitialAdminEmail: NEW_ADMIN_EMAIL,
  reason: "نقل تجريبي لمعيار قبول المرحلة 8",
});
ok(r.status === 201, "transfer: بدء النقل الحقيقي 201", r.json);
const realId = r.json?.transferId;

r = await call(owner, "POST", "/api/platform/ownership", {
  action: "initiate",
  password: "Fwms#2026",
  newOwnerLegalName: "آخر",
  newOwnerDisplayName: "آخر",
  newOwnerInitialAdminEmail: "another@test.ma",
});
ok(r.status === 409 && r.json?.error === "transfer_in_progress", "transfer: نقل ثانٍ أثناء نشط → 409", r.json);

r = await call(owner, "POST", "/api/platform/ownership", { action: "approve-current", password: "WRONG" });
ok(r.status === 401, "transfer: موافقة الحالي بكلمة خاطئة → 401");

r = await call(owner, "POST", "/api/platform/ownership", { action: "approve-current", password: "Fwms#2026" });
ok(r.status === 200, "transfer: موافقة المالك الحالي 200", r.json);

r = await call(owner, "GET", "/api/platform/ownership");
ok(r.json?.activeTransfer?.state === "awaiting_new_owner", "transfer: الحالة بانتظار الجديد");
ok(r.json?.activeTransfer?.currentOwnerApprovedAt !== null, "transfer: خُتمت موافقة الحالي بزمن");

r = await call(owner, "POST", "/api/platform/ownership", { action: "issue-code", password: "Fwms#2026" });
ok(r.status === 200 && typeof r.json?.approvalCode === "string" && r.json.approvalCode.length >= 8, "transfer: توليد الرمز", r.json);
const code = r.json?.approvalCode as string;

r = await call(owner, "POST", "/api/platform/ownership", {
  action: "approve-new",
  password: "Fwms#2026",
  approvalCode: "DEADBEEF00",
});
ok(r.status === 401 && r.json?.error === "approval_code_mismatch", "transfer: رمز خاطئ → 401 mismatch", r.json);

r = await call(owner, "POST", "/api/platform/ownership", {
  action: "approve-new",
  password: "Fwms#2026",
  approvalCode: code,
});
ok(r.status === 200, "transfer: موافقة المالك الجديد بالرمز 200", r.json);

r = await call(owner, "GET", "/api/platform/ownership");
ok(r.json?.activeTransfer?.state === "approved", "transfer: معتمد وجاهز للتنفيذ");

r = await call(owner, "POST", "/api/platform/ownership", {
  action: "approve-new",
  password: "Fwms#2026",
  approvalCode: code,
});
ok(r.status === 409, "transfer: الرمز أحادي الاستخدام (لا إعادة استخدام)", r.status);
console.log("✓ الموافقتان المنفصلتان + رمز أحادي الاستخدام");

// ── التنفيذ ──────────────────────────────────────────────────────
r = await call(owner, "POST", "/api/platform/ownership", { action: "execute", password: "Fwms#2026" });
ok(r.status === 200, "transfer: التنفيذ 200", r.json);
const exec = r.json ?? {};
ok(exec.integrityCheckStatus === "ok", "transfer: فحص التطابق ok", exec.integrityCheckStatus);
ok(/^[0-9a-f]{64}$/.test(exec.backupSha256 ?? ""), "transfer: بصمة النسخة الاحتياطية SHA-256");
ok(/^[0-9a-f]{64}$/.test(exec.exportSha256 ?? ""), "transfer: بصمة التصدير SHA-256");
ok((exec.backupTableCount ?? 0) >= 30, "transfer: النسخة تحمل كل الجداول (≥30)", exec.backupTableCount);
ok((exec.revokedSuperAdminCount ?? 0) >= 1, "transfer: عضويات super_admin أُلغيت", exec.revokedSuperAdminCount);
ok((exec.sessionsInvalidatedUsers ?? 0) >= 7, "transfer: جلسات كل المستخدمين أُبطلت", exec.sessionsInvalidatedUsers);
ok(typeof exec.newAdminTempPassword === "string" && exec.newAdminTempPassword.length >= 8, "transfer: كلمة مرور ابتدائية عُرضت مرة");
ok(/^[0-9a-f]{64}$/.test(exec.suggestedAuthSecret ?? ""), "transfer: سر JWT مقترح 64-hex");
console.log("✓ التنفيذ: نسخ احتياطي + تصدير + فحص تطابق + إبطال شامل");

// ── 8) المالك السابق يفقد كل وصول (معيار القبول الحرفي) ──────────
r = await call(owner, "GET", "/api/platform/ownership");
ok(r.status === 401, "post: جلسة المالك السابق ماتت (401)", r.status);

let relogin: Response;
try {
  relogin = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: OWNER, password: "Fwms#2026" }),
  });
  ok(relogin.status === 403, "post: إعادة دخول المالك السابق → 403 (لا عضوية)", relogin.status);
  const j = await relogin.json().catch(() => null);
  ok(j?.error === "no_active_membership", "post: السبب no_active_membership (لا باب خلفي)", j);
} catch (e) {
  ok(false, "post: إعادة دخول المالك السابق", e);
}

r = await call(worker, "GET", "/api/my-schedule");
ok(r.status === 401, "post: جلسة العامل (غير المعنية بالنقل) ماتت أيضًا — إبطال شامل", r.status);

// المدير: عضويته سليمة — يعود بالدخول (إبطال الجلسة لا الحساب)
let adminRelogin: Jar | null = null;
try {
  adminRelogin = await login("admin@demo.ma");
  ok(true, "post: المدير يعيد الدخول (حسابه سليم — أُبطلت الجلسة فقط)");
} catch (e) {
  ok(false, "post: المدير يعيد الدخول", e);
}
console.log("✓ المالك السابق: جلسة ميتة + دخول مرفوض + لا باب خلفي");

// ── 9) المالك الجديد: دخول + حالة + تأكيد تدوير الأسرار ──────────
const tempPassword = exec.newAdminTempPassword as string;
let newOwner: Jar | null = null;
try {
  newOwner = await login(NEW_ADMIN_EMAIL, tempPassword);
  ok(true, "new-owner: دخول بحساب المالك الجديد الابتدائي");
} catch (e) {
  ok(false, "new-owner: دخول بحساب المالك الجديد", e);
}

if (newOwner) {
  r = await call(newOwner, "GET", "/api/platform/ownership");
  ok(r.status === 200, "new-owner: يرى أدوات الملكية");
  ok(r.json?.owner?.legalName === NEW_LEGAL, "new-owner: الكيان باسم المالك الجديد", r.json?.owner?.legalName);
  ok(r.json?.freeze === false, "new-owner: التجميد مرفوع");
  ok(r.json?.lastCompleted?.newOwnerLegalName === NEW_LEGAL, "new-owner: آخر منجز موثَّق");
  ok(r.json?.lastCompleted?.secretsRotatedAt === null, "new-owner: التدوير بانتظار التأكيد");

  r = await call(newOwner, "POST", "/api/platform/ownership", { action: "confirm-rotation", password: tempPassword });
  ok(r.status === 200, "new-owner: تأكيد تدوير الأسرار 200", r.json);

  r = await call(newOwner, "GET", "/api/platform/ownership");
  ok(r.json?.lastCompleted?.secretsRotatedAt !== null, "new-owner: التدوير مختوم بزمن");
}
console.log("✓ المالك الجديد: دخول + ملكية كاملة + ختم تدوير الأسرار");

// ── 10) سجل التدقيق سليم (لا يُفقد شيء — القديم كامل + حدث النقل) ─
if (newOwner) {
  const logsAfter = await fetchAllAudit(newOwner);
  const idsAfter = new Set(logsAfter.map((l: any) => l.id));
  const preserved = auditBefore.filter((id: string) => idsAfter.has(id));
  ok(preserved.length === auditBefore.length, `audit: كل قيود ما قبل النقل محفوظة (${preserved.length}/${auditBefore.length})`);
  ok(
    logsAfter.some((l: any) => l.action === "ownership.transfer.completed"),
    "audit: حدث النقل مسجَّل (من/إلى/متى/الموافقات)"
  );
  ok(
    logsAfter.some((l: any) => l.action === "ownership.transfer.current_owner_approved"),
    "audit: موافقة المالك الحالي مسجَّلة"
  );
  ok(
    logsAfter.some((l: any) => l.action === "ownership.transfer.new_owner_approved"),
    "audit: موافقة المالك الجديد مسجَّلة"
  );
  ok(
    logsAfter.some((l: any) => l.action === "platform.owner.updated"),
    "audit: أثر white-label القديم ما زال موجودًا"
  );
}
console.log("✓ سجل التدقيق: كامل قبل النقل وبعده + أحداث الدورة كلها");

// ── 11) white-label داخل بصمة المحتوى (إصدار جديد لا تعديل) ──────
if (newOwner) {
  r = await call(newOwner, "POST", "/api/reports/generate", {
    kind: "payslip",
    targetId: payslipId,
    format: "pdf",
    language: "ar",
  });
  ok(
    r.status === 201 && r.json?.version === 2 && r.json?.reused === false,
    "branding-in-hash: تغيّر هوية المالك → إصدار جديد (v2) لا إعادة استخدام",
    r.json
  );

  r = await call(newOwner, "POST", "/api/reports/generate", {
    kind: "payslip",
    targetId: payslipId,
    format: "pdf",
    language: "ar",
  });
  ok(r.json?.reused === true && r.json?.version === 2, "branding-in-hash: نفس الهوية الآن → إعادة استخدام v2", r.json);
  ok(v1Doc?.contentHash !== (r.json?.contentHash ?? ""), "branding-in-hash: بصمة v1 ≠ بصمة v2");
}
console.log("✓ الثبات مع white-label: القديم ثابت والجديد إصدار مرقّم");

// ── الخلاصة ──────────────────────────────────────────────────────
console.log("\n════════════════════════════════════");
console.log(`النتيجة: ${passed}/${passed + failed}`);
if (failed > 0) {
  console.log("إخفاقات:");
  for (const f of failures) console.log(`  ✗ ${f}`);
  process.exit(1);
} else {
  console.log("✓ كل اختبارات المرحلة 8 ناجحة");
}
export {};
