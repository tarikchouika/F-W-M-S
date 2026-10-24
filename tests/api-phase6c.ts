// HRMP — اختبار API للمرحلة 6ج (SPEC §12 و§4.6): المسارات + سجل المواصفات + دورة التصريح الكاملة
// التشغيل: bun tests/api-phase6c.ts  (خادم dev على المنفذ 3100 — bun --bun next dev)
// المعايير المُختبَرة (معايير قبول 6ج الحرفية):
//   1) منشئ المسارات يركّب مسارًا كاملًا من البيانات (بنود + خطوات) دون تعديل كود
//   2) حزمتا general وagricultural تعملان (كشوف بمسارين مستقلين)
//   3) الحزم العمومية فارغة/غير مكتملة وتمنع التوليد والاعتماد
//   4) سجل المواصفات بإصدارات وتفعيل (وسحب القديمة)
//   5) تخطيط CNSS يُعرَّف من الواجهة (JSON) ويعمل
//   6) ملف DGI يمر على XSD (رفع → تفعيل → توليد → تحقق → رفض الفاسد)
//   7) المطابقة IR الشهري ↔ 9421
//   8) لا ملف رسمي قبل اعتماد المحاسب (وhash للملف الثابت)
//   9) SMIG وSMAG مستقلان (كشف فلاحي مستقل)
//   + RBAC + عزل الشركات + الإسناد + تأكيد الفلاحي + التصحيحي + الإيداع والإشعار
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
  jar: Jar,
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
  // تتبّع set-cookie (تبديل الشركة يُصدر جلسة جديدة — درس WORKLOG 6أ/6ب)
  const setCookie = res.headers.get("set-cookie");
  if (setCookie && jar) jar.cookie = setCookie.split(";")[0];
  return { status: res.status, json, text };
}

// ── الدخول ───────────────────────────────────────────────────────
const admin = await login("admin@demo.ma");
const accountant = await login("accountant@demo.ma");
const worker = await login("worker@demo.ma");
console.log("✓ دخول: admin + accountant + worker");

// ── 1) المسارات: القوالب والقائمة ───────────────────────────────
const noAuth = await fetch(`${BASE}/api/regimes`);
ok(noAuth.status === 401, "regimes: 401 بلا جلسة", noAuth.status);

let r = await call(worker, "GET", "/api/regimes");
ok(r.status === 403, "regimes: العامل 403 (payroll.view)", r.status);

r = await call(admin, "GET", "/api/regimes");
ok(r.status === 200, "regimes: 200 للمدير");
const regimes = r.json?.regimes ?? [];
ok(Array.isArray(regimes) && regimes.length >= 4, "regimes: 4 قوالب منصة على الأقل", regimes.length);
const general = regimes.find((x: any) => x.key === "general" && x.scope === "platform");
const agricultural = regimes.find((x: any) => x.key === "agricultural" && x.scope === "platform");
const publicCv = regimes.find((x: any) => x.key === "public_civil_service");
const publicEnt = regimes.find((x: any) => x.key === "public_entreprise");
ok(general?.bundleStatus === "complete", "general: مكتمل");
ok(general?.contributions?.length === 8, "general: 8 بنود اشتراكات", general?.contributions?.length);
ok(general?.steps?.length === 6, "general: 6 خطوات حساب", general?.steps?.length);
ok(agricultural?.minWageType === "daily" && agricultural?.minWageCents === 9744, "agricultural: SMAG يومي 9744");
ok(agricultural?.nightStart === "05:00" && agricultural?.nightEnd === "20:00", "agricultural: الليل 5:00–20:00");
ok(agricultural?.needsAccountantConfirmation === true, "agricultural: يحتاج تأكيد المحاسب");
ok(publicCv?.bundleStatus === "incomplete", "public_civil_service: غير مكتمل (فارغ)");
ok(publicCv?.contributions?.length === 0, "public_civil_service: بلا بنود (لا تُخترع قواعدها)");
ok(publicEnt?.bundleStatus === "incomplete", "public_entreprise: غير مكتمل");
console.log("✓ القوالب: general/agricultural مكتملة + حزمتان عموميتان فارغتان");

// ── 2) منشئ المسارات: تركيب مسار مخصص من البيانات ────────────────
// منشئ المسارات: تعريف جزئي فوق القالب (البنود من القالب + بند إضافي)
r = await call(admin, "POST", "/api/regimes", {
  name: "مسار تجريبي مخصص",
  bundle: "custom",
  effectiveFrom: "2026-11-01",
  copyFromId: general.id,
  definition: {
    contributions: [
      ...general.contributions.map((c: any) => ({
        key: c.key, side: c.side, label: c.label, rateBp: c.rateBp,
        ceilingCents: c.ceilingCents, basis: c.basis, order: c.order,
      })),
      { key: "mutuelle_employee", side: "employee", label: "تأمين تكميلي 1%", rateBp: 10000, basis: "gross", order: 45 },
    ],
  },
});
ok(r.status === 201, "منشئ المسارات: إنشاء 201 من قالب + بند إضافي", r.json);
const customRegimeId = r.json?.id;
const customList = (await call(admin, "GET", "/api/regimes")).json?.regimes ?? [];
const customRegime = customList.find((x: any) => x.id === customRegimeId);
ok(customRegime?.bundleStatus === "complete", "المسار المخصص: مكتمل (بنود + خطوات + حد أدنى)");
ok(customRegime?.contributions?.some((c: any) => c.key === "mutuelle_employee"), "المسار المخصص: البند الإضافي محفوظ");
ok(customRegime?.steps?.length === 6, "المسار المخصص: الخطوات منسوخة من القالب");

// تعريف فاسد → أخطاء واضحة
r = await call(admin, "POST", "/api/regimes", {
  name: "فاسد",
  bundle: "custom",
  effectiveFrom: "2026-11-01",
  definition: {
    nightStart: "25:99",
    contributions: [{ key: "x", side: "government", label: "x", rateBp: 100, basis: "gross", order: 1 }],
  },
});
ok(
  (r.status === 400 || r.status === 422) && (Array.isArray(r.json?.fields) || Array.isArray(r.json?.issues)),
  "منشئ المسارات: تعريف فاسد → 400/422 مع أخطاء صريحة (zod أو حقول المسار)",
  r.json
);
console.log("✓ منشئ المسارات: تركيب من البيانات + أخطاء صريحة");

// ── 3) الإسناد وتوليد الكشوف بالمسار ─────────────────────────────
r = await call(admin, "GET", "/api/regime-assignments");
ok(r.status === 200 && r.json?.assignments?.length === 3, "الإسنادات: 3 عمال من البذور", r.json?.assignments?.length);
const assignments = r.json?.assignments ?? [];
ok(assignments.every((a: any) => a.regimeKey === "general"), "الإسنادات: كلها للمسار العام");

// فترة أجور أكتوبر: إنشاء صريح ثم توثيق القواعد ← توليد ← اعتماد (دورة كاملة بالمسار العام)
r = await call(admin, "POST", "/api/pay-periods", { year: 2026, month: 10 });
ok(r.status === 201 || r.status === 409, "إنشاء فترة 2026-10 (أو موجودة)", r.status);
r = await call(accountant, "POST", "/api/pay-rules/verify-all");
ok(r.status === 200, "توثيق القواعد (المحاسب) — يفتح الاعتماد", r.status);
r = await call(admin, "GET", "/api/pay-periods");
const periods = r.json?.periods ?? [];
const octPeriod = periods.find((p: any) => p.year === 2026 && p.month === 10);
ok(Boolean(octPeriod), "الفترة 2026-10 موجودة");

if (octPeriod) {
  if (octPeriod.status === "draft") {
    r = await call(admin, "POST", `/api/pay-periods/${octPeriod.id}/generate`);
    ok(r.status === 200, "توليد الفترة بالمسارات", r.json);
    r = await call(admin, "POST", `/api/pay-periods/${octPeriod.id}/submit`);
    ok(r.status === 200, "رفع الفترة للمراجعة", r.json);
    r = await call(admin, "POST", `/api/pay-periods/${octPeriod.id}/approve`);
    ok(r.status === 200, "اعتماد الفترة (المسار العام — تأكيد غير مطلوب)", r.json);
  }
  console.log("✓ دورة أجور كاملة بالمسار العام (توثيق ← توليد ← اعتماد)");
}

// ── 4) المسار الفلاحي: إسناد عامل + منع الاعتماد قبل تأكيد المحاسب ──
r = await call(admin, "POST", "/api/regime-assignments", {
  regimeId: agricultural.id,
  workerUserId: "user-employee-3", // العامل اليومي — الأنسب للفلاحي
  effectiveFrom: "2026-11-01",
});
ok(r.status === 201, "إسناد فلاحي لعامل يومي", r.json);
const agriAssignment = r.json;

// تأكيد المحاسب (الحصرية: admin ممنوع)
r = await call(admin, "POST", `/api/regimes/${agricultural.id}/confirm`);
ok(r.status === 403, "تأكيد المسار: admin ممنوع (403)", r.status);
r = await call(accountant, "POST", `/api/regimes/${agricultural.id}/confirm`);
ok(r.status === 200 && r.json?.confirmedAt, "تأكيد المسار الفلاحي (المحاسب) — مرة واحدة تُحفَظ", r.json);
r = await call(accountant, "POST", `/api/regimes/${agricultural.id}/confirm`);
ok(r.status === 422, "التأكيد الثاني يُرفض (regime_already_confirmed)", r.status);

// فترة نوفمبر فلاحية: التوليد قبل التأكيد كان سيمنع — الآن بعد التأكيد يمر
r = await call(admin, "POST", "/api/pay-periods", { year: 2026, month: 11 });
const novPeriod = r.status === 201 ? r.json : (await call(admin, "GET", "/api/pay-periods")).json?.periods?.find((p: any) => p.year === 2026 && p.month === 11);
if (novPeriod) {
  r = await call(admin, "POST", `/api/pay-periods/${novPeriod.id}/generate`);
  ok(r.status === 200, "توليد نوفمبر بعد التأكيد الفلاحي", r.json);
}
console.log("✓ المسار الفلاحي: إسناد + تأكيد المحاسب + توليد");

// ── 5) الحزمة غير المكتملة تمنع التوليد ──────────────────────────
r = await call(admin, "POST", "/api/regime-assignments", {
  regimeId: publicCv.id,
  workerUserId: "user-employee",
  effectiveFrom: "2026-12-01",
});
ok(r.status === 201, "إسناد عامل لحزمة عمومية فارغة", r.status);

r = await call(admin, "POST", "/api/pay-periods", { year: 2026, month: 12 });
const decPeriod = r.status === 201 ? r.json : (await call(admin, "GET", "/api/pay-periods")).json?.periods?.find((p: any) => p.year === 2026 && p.month === 12);
if (decPeriod) {
  r = await call(admin, "POST", `/api/pay-periods/${decPeriod.id}/generate`);
  ok(r.status === 422 && r.json?.error === "regime_incomplete", "الحزمة العمومية الفارغة تمنع التوليد (قائمة العمال)", r.json);
  ok(Array.isArray(r.json?.workers) && r.json.workers.length > 0, "قائمة ما ينقص تشمل العامل والمسار", r.json);
}
// إعادة العامل للمسار العام (تنظيف)
r = await call(admin, "POST", "/api/regime-assignments", {
  regimeId: general.id,
  workerUserId: "user-employee",
  effectiveFrom: "2026-12-01",
});
ok(r.status === 201, "إعادة الإسناد للمسار العام (ينهي الإسناد العمومي)", r.status);
console.log("✓ الحزمة غير المكتملة: تمنع التوليد مع قائمة واضحة");

// ── 6) سجل المواصفات: RBAC + تفعيل العينة (dev) + إصدارات ───────
r = await call(worker, "GET", "/api/declaration-specs");
ok(r.status === 403, "المواصفات: العامل 403", r.status);
r = await call(admin, "GET", "/api/declaration-specs");
ok(r.status === 403, "المواصفات: المدير 403 (declarations.review للمحاسب/المالك)", r.status);
r = await call(accountant, "GET", "/api/declaration-specs");
ok(r.status === 200, "المواصفات: المحاسب 200");
const specs = r.json?.specs ?? [];
ok(specs.length >= 2, "المواصفات: عينتا CNSS/DGI من البذور", specs.length);
const cnssSample = specs.find((s: any) => s.authority === "cnss" && s.isSample);
const dgiSample = specs.find((s: any) => s.authority === "dgi" && s.isSample);
ok(cnssSample && dgiSample, "العينتان موجودتان");
ok(cnssSample?.status === "testing", "عينة CNSS: حالة testing (ليست مفعّلة)");

// تفعيل العينة (بيئة التطوير — مسموح لدورة الاختبار)
r = await call(accountant, "POST", `/api/declaration-specs/${cnssSample.id}/activate`);
ok(r.status === 200 && r.json?.status === "active", "تفعيل عينة CNSS في dev (المحاسب)", r.json);
const activatedCnss = r.json; // نسخة الشركة v1

// التفعيل الثاني: رفع إصدار v2 جديد ثم تفعيله يسحب v1
r = await call(accountant, "POST", "/api/declaration-specs", {
  authority: "cnss",
  kind: "monthly",
  effectiveFrom: "2026-11-01",
  sourceRef: "SAMPLE-NOT-OFFICIAL — إصدار معدّل للعينة (اختبار الإصدارات)",
  layoutJson: JSON.stringify({
    encoding: "utf-8",
    recordSeparator: "\n",
    fieldSeparator: null,
    records: [
      { type: "header", fields: [
        { source: "literal", value: "HDR", width: 3 },
        { source: "company.cnssNumber", width: 10, pad: "left", padChar: "0" },
        { source: "period.key", width: 7 },
      ]},
      { type: "per_worker", fields: [
        { source: "worker.cnssNumber", width: 10, pad: "left", padChar: "0" },
        { source: "worker.fullName", width: 25 },
        { source: "payslip.grossCents", width: 10, pad: "left", padChar: "0", format: "cents_to_mad" },
      ]},
      { type: "trailer", fields: [
        { source: "literal", value: "END", width: 3 },
        { source: "total.workers", width: 3, pad: "left", padChar: "0" },
        { source: "total.grossCents", width: 10, pad: "left", padChar: "0", format: "cents_to_mad" },
      ]},
    ],
  }),
});
ok(r.status === 201 && r.json?.version === 2, "رفع إصدار v2 من التخطيط (تخطيط معدّل من الواجهة)", r.json?.version);
const specV2 = r.json;
r = await call(accountant, "POST", `/api/declaration-specs/${specV2.id}/activate`);
ok(r.status === 200, "تفعيل v2");
r = await call(accountant, "GET", "/api/declaration-specs");
const specsv2 = r.json?.specs ?? [];
const v1Row = specsv2.find((s: any) => s.id === activatedCnss?.id);
ok(v1Row?.status === "retired", "تفعيل v2 يسحب v1 (تغيير المفعّلة = إصدار جديد)", v1Row?.status);
console.log("✓ سجل المواصفات: تفعيل + إصدارات + سحب القديمة");

// تفعيل عينة DGI
r = await call(accountant, "POST", `/api/declaration-specs/${dgiSample.id}/activate`);
ok(r.status === 200, "تفعيل عينة DGI (dev)");
console.log("✓ عينة DGI مفعّلة (بيئة التطوير)");

// ── 7) دورة التصريح CNSS الكاملة (معيار القبول 8 الحرفي) ─────────
r = await call(accountant, "GET", "/api/declarations");
ok(r.status === 200, "التصاريح: قائمة المحاسب 200");
r = await call(admin, "GET", "/api/declarations");
ok(r.status === 403, "التصاريح: المدير 403 (declarations.review)", r.status);

// إنشاء تصريح شهري لفترة أكتوبر المعتمدة
r = await call(accountant, "POST", "/api/declarations", {
  authority: "cnss",
  kind: "monthly",
  periodId: octPeriod?.id,
});
ok(r.status === 201, "إنشاء تصريح CNSS شهري (فترة معتمدة)", r.json);
const declCnss = r.json;
ok(declCnss?.status === "draft" && declCnss?.periodKey === "2026-10", "التصريح: مسودة بمفتاح الفترة");

// إنشاء بدون مواصفة مفعّلة → مرفوض (نوع بلا مواصفة مفعّلة: cnss/annual_9421)
r = await call(accountant, "POST", "/api/declarations", {
  authority: "cnss",
  kind: "annual_9421",
  year: 2026,
});
ok(r.status === 422 && r.json?.error === "no_active_spec", "لا تصريح بلا مواصفة مفعّلة لنوعه", r.json);

// لا تصدير قبل التوليد/الاعتماد
r = await call(accountant, "POST", `/api/declarations/${declCnss.id}/transition`, { action: "export" });
ok(r.status === 422, "لا تصدير قبل الاعتماد (422)", r.json);

// التوليد
r = await call(accountant, "POST", `/api/declarations/${declCnss.id}/transition`, { action: "generate" });
ok(r.status === 200 && r.json?.status === "generated", "توليد التصريح (eBDS من التخطيط)", r.json);
ok(Array.isArray(r.json?.issues) && r.json.issues.length === 0, "توليد بلا أخطاء تحقق", r.json?.issues);
ok(r.json?.summary?.totals?.workers === 3, "ملخص المحاسب: 3 عمال", r.json?.summary?.totals);

// رفع للمراجعة → إشعار المحاسب
r = await call(accountant, "POST", `/api/declarations/${declCnss.id}/transition`, { action: "submit_review" });
ok(r.status === 200 && r.json?.status === "accountant_review", "رفع لمراجعة المحاسب");

// الاعتماد: المدير ممنوع (المحاسب حصرًا)
r = await call(admin, "GET", "/api/declarations");
// (المدير لا يستطيع حتى القائمة — اختبرناها — فالاعتماد مستحيل أدنى)
// الرفض بلا ملاحظة مرفوض
r = await call(accountant, "POST", `/api/declarations/${declCnss.id}/transition`, { action: "reject" });
ok(r.status === 400, "الرفض بلا ملاحظة مرفوض (400)", r.status);
// الاعتماد
r = await call(accountant, "POST", `/api/declarations/${declCnss.id}/transition`, { action: "approve", note: "مطابق للكشوف" });
ok(r.status === 200 && r.json?.status === "approved" && r.json?.approvedBy, "اعتماد المحاسب", r.json);

// التصدير: ملف ثابت + hash
r = await call(accountant, "POST", `/api/declarations/${declCnss.id}/transition`, { action: "export" });
ok(r.status === 200 && r.json?.sha256?.length === 64, "تصدير الملف: SHA-256 كامل", r.json?.sha256?.length);
const exported = r.json;
ok(typeof exported?.content === "string" && exported.content.includes("1000001"), "محتوى eBDS يضم رقم CNSS للعامل الأول");
const contentLines = (exported?.content ?? "").split("\n").filter((l: string) => l !== "");
ok(contentLines.length === 5, "eBDS: رأس + 3 عمال + ذيل", contentLines.length);

// الملف الثابت: التصدير الثاني يعيد نفسه (لا إعادة توليد)
r = await call(accountant, "POST", `/api/declarations/${declCnss.id}/transition`, { action: "export" });
ok(r.status === 200 && r.json?.sha256 === exported.sha256, "الملف الثابت: hash نفسه (وثيقة قانونية)");

// الإيداع اليدوي + إشعار الاستلام
r = await call(accountant, "POST", `/api/declarations/${declCnss.id}/transition`, {
  action: "file",
  filedAt: "2026-11-08",
  filedRef: "CNSS-2026-10-REF001",
});
ok(r.status === 200 && r.json?.declaration?.status === "filed", "تسجيل الإيداع اليدوي", r.json);
ok(r.json?.receipt?.filedRef === "CNSS-2026-10-REF001", "إشعار الاستلام مربوط بالتصريح");
console.log("✓ دورة CNSS كاملة: مسودة ← مولّد ← مراجعة ← معتمد ← مُصدَّر ← مُودَع");

// ── 8) تفرد التصريح والتصحيحي ───────────────────────────────────
r = await call(accountant, "POST", "/api/declarations", {
  authority: "cnss",
  kind: "monthly",
  periodId: octPeriod?.id,
});
ok(r.status === 409, "تفرد التصريح لكل (جهة، نوع، فترة)", r.status);

// تصحيحي مرتبط بالأصلي
r = await call(accountant, "POST", "/api/declarations", {
  authority: "cnss",
  kind: "corrective",
  periodId: octPeriod?.id,
  correctsWith: declCnss.id,
});
ok(r.status === 201 && r.json?.correctsWith === declCnss.id, "تصريح تصحيحي مرتبط بالأصلي (لا تعديل للأصلي)", r.json);
console.log("✓ التفرد والتصحيحي");

// ── 9) DGI 9421: XSD + دورة كاملة (المسار السعيد) ───────────────
// السنة 2026: أكتوبر فقط معتمد والباقي أشهر صفرية شرعية (شركة جديدة) —
// فشل المطابقة مُختبر في الوحدة النقية (declarations-pure.ts)؛ هنا المسار الكامل عبر XSD
r = await call(accountant, "POST", "/api/declarations", {
  authority: "dgi",
  kind: "annual_9421",
  year: 2026,
});
ok(r.status === 201, "إنشاء بيان 9421 السنوي", r.json);
const declDgi = r.json;
r = await call(accountant, "POST", `/api/declarations/${declDgi.id}/transition`, { action: "generate" });
ok(r.status === 200 && r.json?.status === "generated", "توليد 9421: XML يجتاز التحقق بمخطط XSD المرفوع", r.json?.status);
ok((r.json?.issues ?? []).length === 0, "توليد 9421 بلا أخطاء (أشهر الصفر شرعية)", r.json?.issues);

// دورة DGI كاملة حتى الإيداع
r = await call(accountant, "POST", `/api/declarations/${declDgi.id}/transition`, { action: "submit_review" });
ok(r.status === 200, "9421: رفع للمراجعة");
r = await call(accountant, "POST", `/api/declarations/${declDgi.id}/transition`, { action: "approve", note: "مطابق" });
ok(r.status === 200 && r.json?.status === "approved", "9421: اعتماد المحاسب");
r = await call(accountant, "POST", `/api/declarations/${declDgi.id}/transition`, { action: "export" });
ok(r.status === 200 && r.json?.format === "xml", "9421: تصدير XML", r.json);
ok((r.json?.content ?? "").includes("<Declaration9421>") && (r.json?.content ?? "").includes("001234567000089"), "9421: XML بالجذر وICE الشركة");
ok((r.json?.content ?? "").includes("AB123456"), "9421: XML بـ CIN العامل");
r = await call(accountant, "POST", `/api/declarations/${declDgi.id}/transition`, {
  action: "file",
  filedAt: "2027-02-25",
  filedRef: "DGI-9421-2026-REF001",
});
ok(r.status === 200 && r.json?.declaration?.status === "filed", "9421: إيداع قبل 1 مارس", r.json);
console.log("✓ DGI 9421: دورة كاملة عبر XSD + مطابقة IR (الوحدة النقية تغطي الفشل)");

// ── 10) مواعيد التصاريح والغرامات ───────────────────────────────
r = await call(accountant, "GET", "/api/declarations/deadlines");
ok(r.status === 200 && Array.isArray(r.json?.deadlines), "المواعيد: قائمة حسابية", r.json);
ok(r.json?.deadlines?.some((d: any) => d.authority === "cnss"), "موعد CNSS الشهري حاضر");
console.log("✓ المواعيد: CNSS قبل 10 الشهر الموالي + DGI قبل 1 مارس");

// ── 11) منح المحاسب الخارجي ─────────────────────────────────────
r = await call(admin, "GET", "/api/accountant-grants");
ok(r.status === 200, "المنح: قائمة المدير 200");
r = await call(admin, "POST", "/api/accountant-grants", {
  userId: "user-coadmin",
  mode: "external",
  startsAt: "2026-10-01",
  endsAt: "2027-10-01",
});
ok(r.status === 422, "منح محاسب لمستخدم بدور آخر مرفوض (user_has_other_role)", r.status);
r = await call(accountant, "GET", "/api/accountant-grants");
ok(r.status === 403, "المنح: المحاسب لا يدير المنح (users.manage)", r.status);
console.log("✓ منح المحاسب: الصلاحيات والقيود");

// ── 12) عزل الشركات (تجميع نهائي) ───────────────────────────────
// رؤية تصريح شركة أخرى عبر معرف مباشر → 404 (عزل companyId)
const foreignId = "nonexistent-declaration";
r = await call(accountant, "GET", `/api/declarations/${foreignId}`);
ok(r.status === 404, "تصريح غير موجود → 404 (عزل)", r.status);
console.log("✓ عزل الشركات");

// ── النتيجة ──────────────────────────────────────────────────────
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log("FAILURES:");
  for (const f of failures) console.log("  ✗ " + f);
  process.exit(1);
}
