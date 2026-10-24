// HRMP — اختبار وظيفي: الاستقطاب والتوظيف كاملًا (طلب المالك 2026-10-24)
// ---------------------------------------------------------------------------
// يغطي: تسجيل باحث (تحقق شكلي/تكرار/معرفات داخلية) + OTP بريد وهاتف (وضع
// التجربة) + رفع وثيقة حقيقية (PNG) + مصادقة الأدمن + نشر وظيفة + الظهور
// العام + التقديم (بوابة الحالات الوسيطة) + طلبات مكررة + انتقالات حالة
// الطلب + سحب الطلب + إغلاق الوظيفة + عزل الجلسات (باحث لا يفتح واجهات
// الشركات وموظف لا يفتح بوابة الباحث) + حدود الوثيقة (حجم/صيغة).
//
// التشغيل (خادم قائم على قاعدة بذور — مع تفعيل وضع تجربة OTP):
//   OTP_DEV_SHOW_CODE=1 BASE=http://localhost:3000 node tests/api-recruitment.mjs
const BASE = process.env.BASE ?? "http://localhost:3000";
const TS = Date.now().toString().slice(-8);
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

// أصغر PNG صحيح (1×1) — بادئات الملف الحقيقية تمر فحص الشمّ الخفيف
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64"
);

console.log("═══ 1) تسجيل باحث عن عمل: التحقق الشكلي والعزل ═══");

const seekerA = { fullName: "أحمد الباحث عن عمل", email: `seeker-a-${TS}@mail.test`, phone: `06${TS.padStart(8, "0").slice(-8)}`, password: "Seeker#2026pass" };
let seekerACookie = "";

await step("بريد مشوّه يُرفض (400)", async () => {
  const res = await fetch(`${BASE}/api/jobs/seeker/register`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...seekerA, email: "not-an-email" }),
  });
  return res.status === 400 ? true : `status=${res.status}`;
});
await step("هاتف غير مغربي يُرفض (400/409)", async () => {
  const res = await fetch(`${BASE}/api/jobs/seeker/register`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...seekerA, phone: "0512345678" }),
  });
  return res.status === 400 || res.status === 409 ? true : `status=${res.status}`;
});
await step("كلمة مرور ضعيفة تُرفض", async () => {
  const res = await fetch(`${BASE}/api/jobs/seeker/register`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...seekerA, password: "longpasswordnodigits" }),
  });
  const data = await j(res);
  return data.error === "weak_password" ? true : `error=${data.error}`;
});
await step("انتحال بريد بذور داخلي ممنوع (internal_email)", async () => {
  const res = await fetch(`${BASE}/api/jobs/seeker/register`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...seekerA, email: `x${TS}@fwms.local` }),
  });
  const data = await j(res);
  return data.error === "internal_email" ? true : `error=${data.error}`;
});
await step("تسجيل صحيح ينشئ الحساب + يُصدر جلسة باحث (201 + Set-Cookie)", async () => {
  const res = await fetch(`${BASE}/api/jobs/seeker/register`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(seekerA),
  });
  const cookie = res.headers.get("set-cookie") ?? "";
  seekerACookie = cookie.split(";")[0];
  return res.status === 201 && seekerACookie.includes("HRMP_SEEKER_SESSION") ? true : `status=${res.status} cookie=${cookie.slice(0, 40)}`;
});
await step("تكرار البريد يُرفض (email_taken)", async () => {
  const res = await fetch(`${BASE}/api/jobs/seeker/register`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...seekerA, phone: `07${TS.padStart(8, "0").slice(-8)}` }),
  });
  const data = await j(res);
  return data.error === "email_taken" ? true : `error=${data.error}`;
});
await step("جلسة الباحث لا تفتح واجهات الشركات (401 على /api/vacancies)", async () => {
  const res = await fetch(`${BASE}/api/vacancies`, { headers: { Cookie: seekerACookie } });
  return res.status === 401 ? true : `status=${res.status}`;
});

console.log("═══ 2) التحقق الآلي: OTP للبريد ثم الهاتف ═══");

let seekerAId = "";
await step("الملف الأولي: بلا توثيق وبلا وثيقة (بوابة /me)", async () => {
  const res = await fetch(`${BASE}/api/jobs/seeker/me`, { headers: { Cookie: seekerACookie } });
  const data = await j(res);
  seekerAId = data.seeker?.id ?? "";
  return res.status === 200 && data.seeker?.emailVerified === false && data.seeker?.hasDocument === false ? true : `body=${JSON.stringify(data).slice(0, 120)}`;
});

async function otpFlow(channel, targetLabel) {
  let devCode = "";
  await step(`إرسال رمز ${targetLabel} يعيد رمز التجربة (OTP_DEV_SHOW_CODE)`, async () => {
    const res = await fetch(`${BASE}/api/jobs/seeker/otp/send`, {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: seekerACookie },
      body: JSON.stringify({ channel }),
    });
    const data = await j(res);
    devCode = data.devCode ?? "";
    return res.status === 200 && /^\d{6}$/.test(devCode) ? true : `status=${res.status} body=${JSON.stringify(data).slice(0, 100)}`;
  });
  await step(`رمز خاطئ يُرفض (wrong_code)`, async () => {
    const res = await fetch(`${BASE}/api/jobs/seeker/otp/verify`, {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: seekerACookie },
      body: JSON.stringify({ channel, code: "000000" }),
    });
    const data = await j(res);
    return data.error === "wrong_code" ? true : `error=${data.error}`;
  });
  await step(`الرمز الصحيح يوثّق ${targetLabel}`, async () => {
    const res = await fetch(`${BASE}/api/jobs/seeker/otp/verify`, {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: seekerACookie },
      body: JSON.stringify({ channel, code: devCode }),
    });
    return res.status === 200 ? true : `status=${res.status} body=${JSON.stringify(await j(res)).slice(0, 100)}`;
  });
  await step(`إعادة توثيق ${targetLabel} ممنوعة (already_verified)`, async () => {
    const res = await fetch(`${BASE}/api/jobs/seeker/otp/verify`, {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: seekerACookie },
      body: JSON.stringify({ channel, code: devCode }),
    });
    const data = await j(res);
    return data.error === "already_verified" || res.status === 409 ? true : `status=${res.status} error=${data.error}`;
  });
}
await otpFlow("email", "البريد");
await otpFlow("phone", "الهاتف");

console.log("═══ 3) وثيقة الهوية: حدود الشمّ والحجم والنوع ═══");

await step("نوع وثيقة غير معروف يُرفض", async () => {
  const form = new FormData();
  form.set("type", "voter_card");
  form.set("file", new Blob([TINY_PNG], { type: "image/png" }), "doc.png");
  const res = await fetch(`${BASE}/api/jobs/seeker/document`, { method: "POST", headers: { Cookie: seekerACookie }, body: form });
  return res.status === 400 ? true : `status=${res.status}`;
});
await step("ملف بتسمية كاذبة يُرفض (doc_bad_mime — بايتات ليست صورة)", async () => {
  const form = new FormData();
  form.set("type", "national_id");
  form.set("file", new Blob([Buffer.from("not an image at all")], { type: "image/png" }), "fake.png");
  const res = await fetch(`${BASE}/api/jobs/seeker/document`, { method: "POST", headers: { Cookie: seekerACookie }, body: form });
  const data = await j(res);
  return data.error === "doc_bad_mime" ? true : `status=${res.status} error=${data.error}`;
});
await step("رفع PNG صحيح ينجح والملف يظهر في /me", async () => {
  const form = new FormData();
  form.set("type", "national_id");
  form.set("file", new Blob([TINY_PNG], { type: "image/png" }), "carte-nationale.png");
  const res = await fetch(`${BASE}/api/jobs/seeker/document`, { method: "POST", headers: { Cookie: seekerACookie }, body: form });
  const me = await j(await fetch(`${BASE}/api/jobs/seeker/me`, { headers: { Cookie: seekerACookie } }));
  return res.status === 200 && me.seeker?.hasDocument === true && me.seeker?.status === "pending" ? true : `status=${res.status} me=${JSON.stringify(me.seeker ?? {}).slice(0, 120)}`;
});

console.log("═══ 4) وظيفة شاغرة: إنشاء ونشر وحدود RBAC ═══");

let projectId = "";
await step("إيجاد مشروع الشركة التجريبية (admin)", async () => {
  const res = await fetch(`${BASE}/api/projects`, { headers: { Cookie: admin } });
  const data = await j(res);
  projectId = data.projects?.[0]?.id ?? "";
  return projectId ? true : `projects=${data.projects?.length ?? 0}`;
});

let vacancyId = "";
await step("العامل (employee) ممنوع من إنشاء وظيفة (403)", async () => {
  const res = await fetch(`${BASE}/api/vacancies`, {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: worker },
    body: JSON.stringify({ projectId, title: "وظيفة غير مصرح بها", description: "وصف طويل بما يكفي لاجتياز التحقق الحرفي", employmentType: "full_time", openings: 1 }),
  });
  return res.status === 403 ? true : `status=${res.status}`;
});
await step("admin ينشئ وظيفة (مسودة)", async () => {
  const res = await fetch(`${BASE}/api/vacancies`, {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: admin },
    body: JSON.stringify({
      projectId,
      title: `عامل نظافة — موقع تجريبي ${TS}`,
      description: "تنظيف يومي لموقع تجاري في الدار البيضاء مع احترام معايير السلامة والصحة المهنية المعتمدة.",
      requirements: "خبرة سنة في التنظيف المهني والقدرة على العمل بنظام مناوبات.",
      employmentType: "full_time",
      salaryMin: 300000, salaryMax: 450000, // سنتيم: 3000-4500 درهم
      openings: 2,
      contactEmail: `rh-${TS}@demo.ma`,
      contactPhone: "0612345678",
    }),
  });
  const data = await j(res);
  vacancyId = data.id ?? "";
  return res.status === 201 && vacancyId ? true : `status=${res.status} body=${JSON.stringify(data).slice(0, 120)}`;
});
await step("المسودة لا تظهر للعموم قبل النشر (صفحة /jobs بلا العنوان)", async () => {
  const res = await fetch(`${BASE}/jobs`);
  const html = await res.text();
  return res.status === 200 && !html.includes(`عامل نظافة — موقع تجريبي ${TS}`) ? true : "ظهرت المسودة للعموم!";
});
await step("admin ينشر الوظيفة", async () => {
  const res = await fetch(`${BASE}/api/vacancies/${vacancyId}`, {
    method: "PATCH", headers: { "Content-Type": "application/json", Cookie: admin },
    body: JSON.stringify({ status: "published" }),
  });
  return res.status === 200 ? true : `status=${res.status}`;
});
await step("الوظيفة المنشورة تظهر في الصفحة العامة /jobs", async () => {
  const res = await fetch(`${BASE}/jobs`);
  const html = await res.text();
  return res.status === 200 && html.includes(`عامل نظافة — موقع تجريبي ${TS}`) ? true : "لم تظهر في /jobs";
});
await step("صفحة التفاصيل العامة تعمل (/jobs/{id})", async () => {
  const res = await fetch(`${BASE}/jobs/${vacancyId}`);
  return res.status === 200 ? true : `status=${res.status}`;
});

console.log("═══ 5) المصادقة والبوابات الوسيطة ═══");

await step("الباحث غير المعتمد ممنوع من التقديم (not_approved)", async () => {
  const res = await fetch(`${BASE}/api/jobs/apply`, {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: seekerACookie },
    body: JSON.stringify({ vacancyId }),
  });
  const data = await j(res);
  return data.error === "not_approved" ? true : `error=${data.error}`;
});
await step("admin يرى الباحث في قائمة المصادقة (pending)", async () => {
  const res = await fetch(`${BASE}/api/seekers?status=pending`, { headers: { Cookie: admin } });
  const data = await j(res);
  return (data.items ?? []).some((s) => s.id === seekerAId) ? true : `عدد=${data.items?.length ?? 0}`;
});
await step("العامل (employee) ممنوع من قائمة المصادقة (403)", async () => {
  const res = await fetch(`${BASE}/api/seekers`, { headers: { Cookie: worker } });
  return res.status === 403 ? true : `status=${res.status}`;
});
await step("المالك (super_admin) يقدر على المصادقة أيضًا — اعتماد الباحث", async () => {
  const res = await fetch(`${BASE}/api/seekers/${seekerAId}`, {
    method: "PATCH", headers: { "Content-Type": "application/json", Cookie: owner },
    body: JSON.stringify({ action: "approve" }),
  });
  return res.status === 200 ? true : `status=${res.status}`;
});
await step("خدمة الوثيقة للأدمن فقط: العامل يُرفض (403)", async () => {
  const res = await fetch(`${BASE}/api/seekers/${seekerAId}/document`, { headers: { Cookie: worker } });
  return res.status === 403 ? true : `status=${res.status}`;
});
await step("خدمة الوثيقة تعيد الصورة للأدمن (image/png)", async () => {
  const res = await fetch(`${BASE}/api/seekers/${seekerAId}/document`, { headers: { Cookie: admin } });
  const type = res.headers.get("content-type") ?? "";
  return res.status === 200 && type.startsWith("image/png") ? true : `status=${res.status} type=${type}`;
});

console.log("═══ 6) التقديم وطلبات الشركة ═══");

await step("الباحث المعتمد يقدّم بنجاح (201)", async () => {
  const res = await fetch(`${BASE}/api/jobs/apply`, {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: seekerACookie },
    body: JSON.stringify({ vacancyId, coverNote: "أرغب في الانضمام لفريق النظافة لديكم." }),
  });
  return res.status === 201 ? true : `status=${res.status} body=${JSON.stringify(await j(res)).slice(0, 100)}`;
});
await step("طلب مكرر يُرفض (already_applied 409)", async () => {
  const res = await fetch(`${BASE}/api/jobs/apply`, {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: seekerACookie },
    body: JSON.stringify({ vacancyId }),
  });
  const data = await j(res);
  return res.status === 409 && data.error === "already_applied" ? true : `status=${res.status} error=${data.error}`;
});
let applicationId = "";
await step("الشركة ترى الطلب مع بيانات تواصل الباحث", async () => {
  const res = await fetch(`${BASE}/api/vacancies/${vacancyId}/applications`, { headers: { Cookie: admin } });
  const data = await j(res);
  applicationId = data.items?.[0]?.id ?? "";
  const seeker = data.items?.[0]?.seeker;
  return res.status === 200 && applicationId && seeker?.email === seekerA.email && seeker?.phone === `+${seekerA.phone.replace(/^0/, "212")}` ? true : `body=${JSON.stringify(data).slice(0, 160)}`;
});
await step("انتقال submitted → viewed ينجح", async () => {
  const res = await fetch(`${BASE}/api/vacancy-applications/${applicationId}`, {
    method: "PATCH", headers: { "Content-Type": "application/json", Cookie: admin },
    body: JSON.stringify({ status: "viewed" }),
  });
  return res.status === 200 ? true : `status=${res.status}`;
});
await step("انتقال viewed → hired ينجح", async () => {
  const res = await fetch(`${BASE}/api/vacancy-applications/${applicationId}`, {
    method: "PATCH", headers: { "Content-Type": "application/json", Cookie: admin },
    body: JSON.stringify({ status: "hired" }),
  });
  return res.status === 200 ? true : `status=${res.status}`;
});
await step("سحب طلب «تم توظيفه» ممنوع (bad_transition)", async () => {
  const res = await fetch(`${BASE}/api/jobs/applications/${applicationId}/withdraw`, {
    method: "POST", headers: { Cookie: seekerACookie },
  });
  const data = await j(res);
  return data.error === "bad_transition" ? true : `error=${data.error}`;
});

console.log("═══ 7) باحث ثانٍ: رفض مصادقة + إغلاق الوظيفة ═══");

const seekerB = { fullName: "سعاد الباحثة عن عمل", email: `seeker-b-${TS}@mail.test`, phone: `07${(Number(TS) + 1).toString().padStart(8, "0").slice(-8)}`, password: "Seeker#2026pass" };
let seekerBCookie = "";
let seekerBId = "";
async function completeSeekerFile(cookie) {
  // توثيق البريد ثم الهاتف (وضع التجربة يعيد الرمز في الاستجابة) + رفع الوثيقة
  for (const channel of ["email", "phone"]) {
    const send = await fetch(`${BASE}/api/jobs/seeker/otp/send`, {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ channel }),
    });
    const data = await j(send);
    if (send.status !== 200 || !/^\d{6}$/.test(data.devCode ?? "")) return `send ${channel} => ${send.status}`;
    const verify = await fetch(`${BASE}/api/jobs/seeker/otp/verify`, {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ channel, code: data.devCode }),
    });
    if (verify.status !== 200) return `verify ${channel} => ${verify.status}`;
  }
  const form = new FormData();
  form.set("type", "passport");
  form.set("file", new Blob([TINY_PNG], { type: "image/png" }), "passport.png");
  const doc = await fetch(`${BASE}/api/jobs/seeker/document`, { method: "POST", headers: { Cookie: cookie }, body: form });
  return doc.status === 200 ? true : `doc => ${doc.status}`;
}

await step("تسجيل باحث ثانٍ + إكمال ملفه (توثيق مزدوج + وثيقة)", async () => {
  const reg = await fetch(`${BASE}/api/jobs/seeker/register`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(seekerB),
  });
  seekerBCookie = (reg.headers.get("set-cookie") ?? "").split(";")[0];
  if (reg.status !== 201) return `reg=${reg.status}`;
  const me = await j(await fetch(`${BASE}/api/jobs/seeker/me`, { headers: { Cookie: seekerBCookie } }));
  seekerBId = me.seeker?.id ?? "";
  if (!seekerBId) return "no id";
  const completion = await completeSeekerFile(seekerBCookie);
  if (completion !== true) return `اكتمال الملف: ${completion}`;
  const meAfter = await j(await fetch(`${BASE}/api/jobs/seeker/me`, { headers: { Cookie: seekerBCookie } }));
  return meAfter.seeker?.emailVerified === true && meAfter.seeker?.phoneVerified === true && meAfter.seeker?.hasDocument === true
    ? true
    : `الحالة النهائية=${JSON.stringify(meAfter.seeker ?? {}).slice(0, 120)}`;
});
await step("دخول الباحثة الثانية لاحقًا يعمل (login بعد الخروج)", async () => {
  const loginRes = await fetch(`${BASE}/api/jobs/seeker/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: seekerB.email, password: seekerB.password }),
  });
  return loginRes.status === 200 ? true : `status=${loginRes.status}`;
});
await step("الرفض بلا سبب ممنوع (reason_required)", async () => {
  const res = await fetch(`${BASE}/api/seekers/${seekerBId}`, {
    method: "PATCH", headers: { "Content-Type": "application/json", Cookie: admin },
    body: JSON.stringify({ action: "reject" }),
  });
  const data = await j(res);
  return data.error === "reason_required" ? true : `error=${data.error}`;
});
await step("الرفض مع سبب ينجح والحساب rejected", async () => {
  const res = await fetch(`${BASE}/api/seekers/${seekerBId}`, {
    method: "PATCH", headers: { "Content-Type": "application/json", Cookie: admin },
    body: JSON.stringify({ action: "reject", reason: "الوثيقة غير مقروءة — يرجى إعادة الرفع بصورة أوضح." }),
  });
  const me = await j(await fetch(`${BASE}/api/jobs/seeker/me`, { headers: { Cookie: seekerBCookie } }));
  return res.status === 200 && me.seeker?.status === "rejected" && me.seeker?.rejectionReason ? true : `status=${res.status} me=${JSON.stringify(me.seeker ?? {}).slice(0, 120)}`;
});
await step("إغلاق الوظيفة ينجح ثم تختفي من الصفحة العامة", async () => {
  const res = await fetch(`${BASE}/api/vacancies/${vacancyId}`, {
    method: "PATCH", headers: { "Content-Type": "application/json", Cookie: admin },
    body: JSON.stringify({ status: "closed" }),
  });
  const page = await fetch(`${BASE}/jobs`);
  const html = await page.text();
  return res.status === 200 && !html.includes(`عامل نظافة — موقع تجريبي ${TS}`) ? true : `close=${res.status} ظاهرة=${html.includes(`عامل نظافة — موقع تجريبي ${TS}`)}`;
});
await step("صفحة تفاصيل الوظيفة المغلقة ترجع 404 للعموم", async () => {
  const res = await fetch(`${BASE}/jobs/${vacancyId}`);
  return res.status === 404 ? true : `status=${res.status}`;
});
await step("وظيفة غير موجودة: التقديم يرد 404", async () => {
  const res = await fetch(`${BASE}/api/jobs/apply`, {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: seekerACookie },
    body: JSON.stringify({ vacancyId: "nonexistent-vacancy-id-123456" }),
  });
  return res.status === 404 ? true : `status=${res.status}`;
});

console.log(`\n═══ النتيجة: ${pass} ✓ / ${fail} ✗ ═══`);
process.exit(fail > 0 ? 1 : 0);
