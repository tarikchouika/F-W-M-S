// FWMS — اختبار API للمرحلة 9 (v0.10.0): الرسائل الصوتية + الحضور الجغرافي الحي + المستخدمون والتفويض
// ---------------------------------------------------------------------------
// المعايير المُختبَرة (بلاغ المالك 2026-10-18):
//   1) صوت مباشر بين العامل/الحرفي/مسؤول الفريق — والعزل الصارم بين الفرق (403 عند العبور)
//      والسوبر/الأدمن/الكوأدمن يخاطبون الجميع.
//   2) قائد الفريق يعرف لحظيًا داخل/خارج منطقة الفريق + إشعار تلقائي عند الخروج.
//   3) الكوأدمن يرى مواقع المرؤوسين الأنية (location.view).
//   4) الأدمن يضيف/يزيل أعضاء الفرق؛ السوبر أدمن وحده يسجّل الحسابات ويُفوّض.
//   5) مسميات وظيفية شاملة (عمال/حرفيون/تقنيون/مقيسون) — مفتاح غير صالح = 400.
// التشغيل (نفس نمط المرحلة 8 — قاعدة اختبار مستقلة):
//   DATABASE_URL=file:.../db/test-phase8.db PORT=3100 (خادم قائم) ثم:
//   BASE=http://localhost:3100 bun /home/z/my-project/fwms/tests/api-phase9.ts
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

async function call(jar: Jar | null, path: string, init?: RequestInit): Promise<{ status: number; body: any }> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { ...(init?.headers ?? {}), ...(jar ? { cookie: jar.cookie } : {}) },
  });
  let body: any = null;
  const text = await res.text();
  try { body = JSON.parse(text); } catch { body = text.slice(0, 200); }
  return { status: res.status, body };
}

const json = (obj: unknown): RequestInit => ({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(obj) });

// تسجيل صوتي وهمي صالح (webm صغير)
function fakeAudio(bytes = 2048): File {
  return new File([new Uint8Array(bytes).fill(1)], "v.webm", { type: "audio/webm" });
}
async function sendVoice(jar: Jar, to: string): Promise<{ status: number; body: any }> {
  const form = new FormData();
  form.append("to", to);
  form.append("durationSec", "5");
  form.append("audio", fakeAudio());
  return call(jar, "/api/voice-messages", { method: "POST", body: form });
}

const NIGHT = "group-demo-night";   // فريق الحراسة الليلي
const CLEAN = "group-demo-clean";   // فريق النظافة الصباحي

async function main() {
  // ═══ 0) الدخول ═══
  const owner = await login("owner@fwms.local");
  const admin = await login("admin@demo.ma");
  const supervisor = await login("supervisor@demo.ma");
  const w1 = await login("worker@demo.ma");
  const w2 = await login("worker2@demo.ma");
  const w3 = await login("worker3@demo.ma");
  ok(true, "دخول الأدوار الستة");

  // ═══ 1) تهيئة الفرق (الأدمن — teams.manage) ═══
  // قائد فريق الحراسة = عاملة2 (دور عامل — القيادة فوق الدور)، ومنطقة بمركز معروف ونصف قطر 150م
  const ZONE = { lat: 33.5731, lng: -7.5898 }; // الدار البيضاء
  const patchZone = await call(admin, `/api/worker-groups/${NIGHT}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ leaderUserId: "user-employee-2", zoneLat: ZONE.lat, zoneLng: ZONE.lng, zoneRadiusM: 150 }),
  });
  ok(patchZone.status === 200, "الأدمن يعيّن قائد الفريق ومنطقته الجغرافية", patchZone);

  const addW1 = await call(admin, `/api/worker-groups/${NIGHT}/members`, json({ userId: "user-employee", jobTitleKey: "security_guard" }));
  const addW2 = await call(admin, `/api/worker-groups/${NIGHT}/members`, json({ userId: "user-employee-2", jobTitleKey: "general_laborer" }));
  const addW3 = await call(admin, `/api/worker-groups/${CLEAN}/members`, json({ userId: "user-employee-3", jobTitleKey: "cleaner" }));
  ok(addW1.status === 201 || addW1.status === 200, "إضافة عامل1 لفريق الحراسة", addW1);
  ok(addW2.status === 201 || addW2.status === 200, "إضافة عاملة2 لفريق الحراسة", addW2);
  ok(addW3.status === 201 || addW3.status === 200, "إضافة عامل3 لفريق النظافة (فريق آخر)", addW3);

  // مسمى غير صالح يُرفض (كتالوج المسميات موحّد)
  const badTitle = await call(admin, `/api/worker-groups/${CLEAN}/members`, json({ userId: "user-employee-3", jobTitleKey: "not_a_real_job" }));
  ok(badTitle.status === 400, "مسمى وظيفي خارج الكتالوج = 400", badTitle);

  // العامل لا يدير الفرق
  const w1Add = await call(w1, `/api/worker-groups/${NIGHT}/members`, json({ userId: "user-employee-3" }));
  ok(w1Add.status === 403, "العامل لا يضيف أعضاء (403)", w1Add);

  // ═══ 2) الرسائل الصوتية — العزل بين الفرق ═══
  const v12 = await sendVoice(w1, "user-employee-2");
  ok(v12.status === 201 || v12.status === 200, "عامل1 ← عاملة2 (نفس الفريق): إرسال جائز", v12);

  const v13 = await sendVoice(w1, "user-employee-3");
  ok(v13.status === 403, "عامل1 ← عامل3 (فريق آخر): ممنوع 403", v13);

  const v31 = await sendVoice(w3, "user-employee");
  ok(v31.status === 403, "عامل3 ← عامل1 (عبور معكوس): ممنوع 403", v31);

  // القائدة (عاملة2) تخاطب أعضاء فريقها
  const vS1 = await sendVoice(w2, "user-employee");
  ok(vS1.status === 201 || vS1.status === 200, "قائدة الفريق ← عضو فريقها: جائز", vS1);
  // الكوأدمن (وضع إشرافي voice.admin) يخاطب الجميع
  const vC1 = await sendVoice(supervisor, "user-employee-3");
  ok(vC1.status === 201 || vC1.status === 200, "الكوأدمن ← أي مستخدم: جائز (إشراف)", vC1);

  // الوضع الإشرافي: المالك يخاطب الجميع
  const vO3 = await sendVoice(owner, "user-employee-3");
  ok(vO3.status === 201 || vO3.status === 200, "السوبر أدمن ← أي مستخدم: جائز (إشراف)", vO3);
  const vA3 = await sendVoice(admin, "user-employee-3");
  ok(vA3.status === 201 || vA3.status === 200, "الأدمن ← أي مستخدم: جائز (إشراف)", vA3);

  // جهات اتصال العامل: فريقه فقط (القائدة عضوة أيضًا) — لا عامل3 ولا الإدارة
  const contacts1 = await call(w1, "/api/voice-messages?contacts=1");
  const ids1 = (contacts1.body?.contacts ?? []).map((c: any) => c.userId);
  ok(contacts1.status === 200 && ids1.includes("user-employee-2"),
    "جهات عامل1 = فريقه حصرًا", ids1);
  ok(!ids1.includes("user-employee-3") && !ids1.includes("user-admin") && !ids1.includes("user-coadmin"),
    "عامل3 والإدارة غائبون عن جهات عامل1 (عزل الفرق)", ids1);
  const contactsOwner = await call(owner, "/api/voice-messages?contacts=1");
  ok(contactsOwner.body?.mode === "admin" && (contactsOwner.body?.contacts ?? []).length >= 5,
    "وضع المالك الإشرافي: كل مستخدمي الشركة", contactsOwner.body?.mode);

  // سجل المحادثة: العامل الثالث لا يقرأ محادثة فريق الحراسة
  const convoW3 = await call(w3, "/api/voice-messages?with=user-employee-2");
  ok(convoW3.status === 403, "عامل3 لا يقرأ محادثة فريق آخر (403)", convoW3);
  const convo1 = await call(w1, "/api/voice-messages?with=user-employee-2");
  ok(convo1.status === 200 && (convo1.body?.messages ?? []).length >= 1, "عامل1 يرى محادثته مع عاملة2", convo1.body?.messages?.length);

  // حدّ الحجم: >2.5MB = 413
  const bigForm = new FormData();
  bigForm.append("to", "user-employee-2");
  bigForm.append("durationSec", "5");
  bigForm.append("audio", fakeAudio(2_600_000));
  const vBig = await call(w1, "/api/voice-messages", { method: "POST", body: bigForm });
  ok(vBig.status === 413, "رسالة أكبر من 2.5MB = 413", vBig);

  // ═══ 3) الحضور الجغرافي الحي والسياج ═══
  // نبضة داخل المنطقة (الدار البيضاء — مركز الفريق)
  const inPing = await call(w1, "/api/location-pings", json({ lat: ZONE.lat, lng: ZONE.lng, accuracyM: 10 }));
  ok(inPing.status === 200, "نبضة موقع: مقبولة", inPing);
  const inEval = (inPing.body?.evaluations ?? []).find((e: any) => e.groupId === NIGHT);
  ok(inEval?.state === "inside", "عامل1 داخل منطقة فريق الحراسة", inPing.body?.evaluations);

  // نبضة خارج المنطقة (الرباط ~ 60كم) — انتقال left ⇒ إشعار فوري للقائدة
  const outPing = await call(w1, "/api/location-pings", json({ lat: 34.0209, lng: -6.8416, accuracyM: 15 }));
  const outEval = (outPing.body?.evaluations ?? []).find((e: any) => e.groupId === NIGHT);
  ok(outEval?.state === "outside" && outEval?.transition === "left", "عامل1 خرج من منطقة فريقه (انتقال مكتشف)", outPing.body?.evaluations);
  ok(outEval?.leaderNotified === true, "الإشعار الفوري أُرسل للقائدة (leaderNotified)", outEval);

  // إشعار الخروج وصل لقائدة الفريق (عاملة2)
  const notifLeader = await call(w2, "/api/notifications");
  const notifRows = notifLeader.body?.notifications ?? [];
  const exitNotif = Array.isArray(notifRows)
    ? notifRows.find((n: any) => String(n.type ?? "").includes("left_zone"))
    : null;
  ok(!!exitNotif, "قائدة الفريق تلقّت إشعار الخروج من المنطقة", notifRows.slice?.(0, 3));

  // لقطة الحضور: القائدة (دور عامل) ترى فريقها وحالة الأعضاء — بلا نطاق شركة
  const presS = await call(w2, "/api/team-presence");
  ok(presS.status === 200, "قائدة الفريق تطلب لقطة الحضور", presS.status);
  const gS = (presS.body?.groups ?? []).find((g: any) => g.id === NIGHT);
  const mS = (gS?.members ?? []).find((m: any) => m.userId === "user-employee");
  ok(presS.body?.scope === "led" && !!gS, "نطاق القائدة: فريقها حصرًا (led)", presS.body?.scope);
  ok(mS?.state === "outside", "لقطة القائدة: عامل1 خارج المنطقة", mS);

  // الكوأدمن/الأدمن/المالك: نطاق أوسع (company/sites)
  const presA = await call(admin, "/api/team-presence");
  ok(presA.body?.scope === "company" && (presA.body?.groups ?? []).length >= 2,
    "الأدمن يرى كل الفرق (location.view)", presA.body?.scope);
  const presO = await call(owner, "/api/team-presence");
  ok(presO.body?.scope === "company", "السوبر أدمن يرى كل الفرق", presO.body?.scope);
  const presC = await call(supervisor, "/api/team-presence");
  ok(presC.status === 200 && ["company", "sites"].includes(presC.body?.scope),
    "الكوأدمن يرى مواقع المرؤوسين (نطاق واسع)", presC.body?.scope);

  // العامل غير القائد لا يرى مواقع أحد (خصوصية)
  const presW1 = await call(w1, "/api/team-presence");
  ok(presW1.status === 403, "العامل غير القائد لا يرى المواقع (403)", presW1);

  // ═══ 4) المستخدمون — قاعدة المالك ═══
  const stamp = Date.now().toString(36);
  // السوبر أدمن ينشئ حسابًا بمسمى من الكتالوج
  const createOwner = await call(owner, "/api/users", json({
    email: `plumber-${stamp}@demo.ma`, fullName: "سبّاك تجريبي", role: "employee", jobTitleKey: "plumber",
  }));
  ok(createOwner.status === 200 || createOwner.status === 201, "السوبر أدمن يسجّل حسابًا جديدًا", createOwner);
  ok(typeof createOwner.body?.initialPassword === "string" && createOwner.body.initialPassword.length >= 8,
    "كلمة المرور الابتدائية تُعرض مرة واحدة", createOwner.body?.initialPassword?.length);

  // الأدمن لا يسجّل حسابات (users.create للسوبر حصرًا)
  const createAdmin = await call(admin, "/api/users", json({
    email: `x-${stamp}@demo.ma`, fullName: "محاولة غير جائزة", role: "employee",
  }));
  ok(createAdmin.status === 403, "الأدمن لا يسجّل الحسابات (403 — قاعدة المالك)", createAdmin);

  // مسمى غير صالح في إنشاء الحساب
  const createBad = await call(owner, "/api/users", json({
    email: `y-${stamp}@demo.ma`, fullName: "مسمى غير صالح", role: "employee", jobTitleKey: "xxx-nope",
  }));
  ok(createBad.status === 400, "إنشاء حساب بمسمى خارج الكتالوج = 400", createBad);

  // ═══ 5) التفويض (السوبر أدمن وحده) ═══
  // تفويض users.create إلى الأدمن → ينجح الإنشاء ثم يُسحب فيعود 403
  const grant = await call(owner, "/api/users/delegations", json({
    granteeId: "user-admin", permission: "users.create", expiresInDays: 1,
  }));
  ok(grant.status === 201 || grant.status === 200, "السوبر أدمن يفوّض users.create للأدمن", grant);

  const createAdmin2 = await call(admin, "/api/users", json({
    email: `delegated-${stamp}@demo.ma`, fullName: "حساب بتفويض", role: "employee", jobTitleKey: "electrician_master",
  }));
  ok(createAdmin2.status === 200 || createAdmin2.status === 201, "الأدمن المفوَّض يسجّل حسابًا (نفاذ التفويض)", createAdmin2);

  const delegations = await call(owner, "/api/users/delegations");
  const mine = (delegations.body?.delegations ?? []).filter((d: any) => d.granteeId === "user-admin" && d.permission === "users.create");
  ok(mine.length === 1, "التفويض النشط مُدرج", mine.length);
  const revokeId = mine[0]?.id;
  if (revokeId) {
    const revoke = await call(owner, `/api/users/delegations?id=${revokeId}`, { method: "DELETE" });
    ok(revoke.status === 200, "سحب التفويض", revoke);
  }
  const createAdmin3 = await call(admin, "/api/users", json({
    email: `after-revoke-${stamp}@demo.ma`, fullName: "بعد السحب", role: "employee",
  }));
  ok(createAdmin3.status === 403, "بعد سحب التفويض: الأدمن يعجز مجددًا (403)", createAdmin3.status);

  // الأدمن لا يفوّض (لا تفويض التفويض)
  const grantAdmin = await call(admin, "/api/users/delegations", json({ granteeId: "user-accountant", permission: "users.create" }));
  ok(grantAdmin.status === 403, "غير السوبر لا يفوّض الصلاحيات (403)", grantAdmin);

  // ═══ 6) إزالة عضو من الفريق (الأدمن) ═══
  const removeW1 = await call(admin, `/api/worker-groups/${NIGHT}/members?userId=user-employee`, { method: "DELETE" });
  ok(removeW1.status === 200, "الأدمن يزيل عامل1 من الفريق", removeW1);
  // بعد الإزالة: عامل1 بلا فريق — تنقطع مخاطبته للقائدة الزميلة
  const v12after = await sendVoice(w1, "user-employee-2");
  ok(v12after.status === 403 || v12after.status === 409, "بعد الإزالة: المخاطبة تنقطع (403/409)", v12after);

  // ═══ 7) الإصدار الموحّد ═══
  const health = await call(null, "/api/health");
  // الإصدار يأتي من src/lib/version.ts (الحقيقة الوحيدة) — لا رقم مثبّت هنا:
  // كان "0.10.0" مثبّتًا فسقط الفحص عند كل إصدار جديد (0.11.0).
  const APP_VERSION = (await import("../src/lib/version")).APP_VERSION as string;
  ok(health.body?.version === APP_VERSION, `health يعرض الإصدار الموحّد ${APP_VERSION}`, health.body?.version);

  // ═══ النتيجة ═══
  console.log("════════════════════════════════════");
  console.log(`النتيجة: ${passed}/${passed + failed}`);
  if (failed > 0) {
    console.log("✗ إخفاقات المرحلة 9:");
    for (const f of failures) console.log(`  - ${f}`);
    process.exit(1);
  }
  console.log("✓ كل اختبارات المرحلة 9 ناجحة");
}

main().catch((e) => {
  console.error("خطأ قاتل:", e);
  process.exit(1);
});
