// FWMS — بذور المرحلة 0–2: مالك المنصة + شركة تجريبية + مستخدمو الأدوار الخمسة + بنية تنظيمية تجريبية
// ملكية: مشتركة (المساعد الأول). قواعد الأجور pay_rules مهمة المساعد الثاني (docs/DATABASE_GUIDE.md §6)
// التشغيل: bun prisma/seeds/seed.ts
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { seedPayRules } from "./pay-rules";
import { seedRegimes } from "./regimes";

const db = new PrismaClient();

const DEMO_PASSWORD = "Fwms#2026"; // تجريبي فقط — يُستبدل في الإنتاج

async function main() {
  console.log("🌱 FWMS seed — المرحلة 0–1 ...");

  // 1) مالك المنصة (white-label — SPEC §3.2)
  const owner = await db.platformOwner.upsert({
    where: { id: "platform-owner-fwms" },
    update: {},
    create: {
      id: "platform-owner-fwms",
      legalName: "FWMS Platform Owner (Demo)",
      displayName: "FWMS",
      contactEmail: "owner@fwms.local",
      defaultLocale: "ar",
      defaultCurrency: "MAD",
    },
  });

  // 2) شركة تجريبية
  const company = await db.company.upsert({
    where: { id: "company-demo" },
    update: {},
    create: {
      id: "company-demo",
      platformOwnerId: owner.id,
      legalName: "شركة الأمن والنظافة التجريبية SARL",
      tradeName: "Demo Security & Cleaning",
      // أسماء محلية رباعية (علاج بلاغ 2026-10-19: أسماء عربية في واجهة لاتينية = خلل)
      names: JSON.stringify({
        ar: "شركة الأمن والنظافة التجريبية SARL",
        fr: "SARL Sécurité & Nettoyage Démo",
        en: "Demo Security & Cleaning SARL",
        es: "SARL Seguridad y Limpieza Demo",
      }),
      taxId: "001234567000089",
      cnssNumber: "1234567",
      locale: "ar",
      timezone: "Africa/Casablanca",
      status: "active",
    },
  });

  // 3) إعدادات الشركة بقيم مغربية افتراضية (SPEC §11)
  await db.companySettings.upsert({
    where: { companyId: company.id },
    update: {},
    create: {
      companyId: company.id,
      workWeekHours: 44,
      restDay: 5,
      monthlyHoursDivisor: 191,
      showWagesToSupervisor: false,
      dualApprovalEnabled: false,
    },
  });

  // 4) سياسة تحقق افتراضية: GPS فقط (none) — تفعيل face قرار مالك (SPEC §4.2)
  await db.verificationPolicy.upsert({
    where: { id: "vp-company-demo" },
    update: {},
    create: {
      id: "vp-company-demo",
      companyId: company.id,
      policy: "none",
      faceAcknowledged: false,
    },
  });

  // 5) مستخدمو الأدوار الخمسة (تجريبيون) + عاملان إضافيان لسيناريو التغطية السريعة (المرحلة 5)
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const users = [
    { id: "user-super-admin", email: "owner@fwms.local", fullName: "مالك المنصة", role: "super_admin" },
    { id: "user-admin", email: "admin@demo.ma", fullName: "مدير العمليات", role: "admin" },
    { id: "user-accountant", email: "accountant@demo.ma", fullName: "المسؤول عن المحاسبة", role: "accountant" },
    { id: "user-coadmin", email: "supervisor@demo.ma", fullName: "المشرف الميداني", role: "co_admin" },
    { id: "user-employee", email: "worker@demo.ma", fullName: "عامل ميداني", role: "employee" },
    { id: "user-employee-2", email: "worker2@demo.ma", fullName: "عاملة ميدانية بديلة", role: "employee" },
    { id: "user-employee-3", email: "worker3@demo.ma", fullName: "عامل ميداني ثالث", role: "employee" },
  ];

  for (const u of users) {
    const user = await db.user.upsert({
      where: { email: u.email },
      update: {},
      create: {
        id: u.id,
        email: u.email,
        fullName: u.fullName,
        passwordHash,
        locale: "ar",
        isActive: true,
      },
    });
    // العضوية في الشركة التجريبية (super_admin يظل مرتبطًا بالمالك عبر دوره عبر الشركات)
    await db.userMembership.upsert({
      where: { userId_companyId: { userId: user.id, companyId: company.id } },
      update: {},
      create: {
        userId: user.id,
        companyId: company.id,
        role: u.role,
        isDefault: true,
      },
    });
  }

  // 6) منح المحاسب الخارجي (نموذج داخلي هنا — SPEC §3.3)
  await db.accountantGrant.upsert({
    where: { id: "grant-accountant-demo" },
    update: {},
    create: {
      id: "grant-accountant-demo",
      companyId: company.id,
      userId: "user-accountant",
      mode: "internal",
      grantedBy: "user-super-admin",
      startsAt: new Date("2026-01-01T00:00:00Z"),
    },
  });

  // قواعد الأجور المغربية (pay_rules بتواريخ السريان) — ملكية المساعد الثاني:
  //    prisma/seeds/pay-rules.ts وفق docs/DATABASE_GUIDE.md §6 (لا تُخترع قيم هنا أبدًا).
  await seedPayRules(db);

  // 7) بنية تنظيمية تجريبية (المرحلة 2 — SPEC §8): فرع + مشروع + مواقع الدار البيضاء + مجموعات
  const branch = await db.branch.upsert({
    where: { id: "branch-demo-casa" },
    update: {},
    create: {
      id: "branch-demo-casa",
      companyId: company.id,
      name: "فرع الدار البيضاء — أنفا",
      names: JSON.stringify({
        ar: "فرع الدار البيضاء — أنفا",
        fr: "Agence Casablanca — Anfa",
        en: "Casablanca Branch — Anfa",
        es: "Sucursal Casablanca — Anfa",
      }),
      code: "CASA-01",
      city: "الدار البيضاء",
      address: "شارع الزرقطوني، الدار البيضاء",
    },
  });

  const project = await db.project.upsert({
    where: { id: "project-demo-tower" },
    update: {},
    create: {
      id: "project-demo-tower",
      companyId: company.id,
      branchId: branch.id,
      name: "مشروع برج الأعمال الزجاجي",
      names: JSON.stringify({
        ar: "مشروع برج الأعمال الزجاجي",
        fr: "Projet Tour d'Affaires en Verre",
        en: "Glass Business Tower Project",
        es: "Proyecto Torre de Negocios de Cristal",
      }),
      code: "PRJ-2026-001",
      startsAt: new Date("2026-01-05T00:00:00Z"),
      endsAt: new Date("2027-06-30T00:00:00Z"),
    },
  });

  // مواقع بإحداثيات حقيقية تقريبية بالدار البيضاء — معيار القبول: موقع بنصف قطر يظهر على الخريطة
  const demoSites = [
    {
      id: "site-demo-gate",
      name: "موقع الحراسة — البوابة الرئيسية",
      names: JSON.stringify({ ar: "موقع الحراسة — البوابة الرئيسية", fr: "Site Sécurité — Portail Principal", en: "Security Site — Main Gate", es: "Sitio de Seguridad — Portal Principal" }),
      address: "مدخل البرج، شارع الزرقطوني", latitude: 33.5731, longitude: -7.5898, radiusM: 60,
    },
    {
      id: "site-demo-mall",
      name: "موقع النظافة — المركز التجاري",
      names: JSON.stringify({ ar: "موقع النظافة — المركز التجاري", fr: "Site Nettoyage — Centre Commercial", en: "Cleaning Site — Shopping Center", es: "Sitio de Limpieza — Centro Comercial" }),
      address: "Anfa Place، الدار البيضاء", latitude: 33.5922, longitude: -7.632, radiusM: 80,
    },
    {
      id: "site-demo-garden",
      name: "موقع البستنة — حديقة الجامعة العربية",
      names: JSON.stringify({ ar: "موقع البستنة — حديقة الجامعة العربية", fr: "Site Espaces Verts — Jardin de l'Université Arabe", en: "Landscaping Site — Arab University Garden", es: "Sitio de Jardinería — Jardín de la Universidad Árabe" }),
      address: "الدار البيضاء", latitude: 33.5913, longitude: -7.6189, radiusM: 50,
    },
  ];
  for (const s of demoSites) {
    await db.site.upsert({
      where: { id: s.id },
      update: {},
      create: { ...s, companyId: company.id, branchId: branch.id, projectId: project.id },
    });
  }

  const demoGroups = [
    { id: "group-demo-night", name: "فريق الحراسة الليلي", description: "مناوبات ليلية متصلة (22:00–06:00)" },
    { id: "group-demo-clean", name: "فريق النظافة الصباحي", description: "توزيع على مواقع متعددة (06:00–14:00)" },
  ];
  for (const g of demoGroups) {
    await db.workerGroup.upsert({
      where: { id: g.id },
      update: {},
      create: { ...g, companyId: company.id },
    });
  }

  // 8) قوالب ورديات بحسب القطاع (المرحلة 3 — SPEC §4.1): حراسة ليل متصل، بناء نهار محدد، نظافة توزيع متعدد
  //    endTime ≤ start = وردية تعبر منتصف الليل (الحراسة الليلية)
  const demoTemplates = [
    { id: "template-demo-security-night", name: "حراسة — ليل متصل", sector: "security", startTimeMin: 1320, endTimeMin: 360, breakMinutes: 0, notes: "22:00–06:00 تعبر منتصف الليل (SPEC §11.4)" },
    { id: "template-demo-construction-day", name: "بناء — نهار محدد", sector: "construction", startTimeMin: 480, endTimeMin: 1020, breakMinutes: 60, notes: "08:00–17:00 مع استراحة ساعة" },
    { id: "template-demo-cleaning-morning", name: "نظافة — فوج صباحي", sector: "cleaning", startTimeMin: 360, endTimeMin: 840, breakMinutes: 30, notes: "06:00–14:00" },
    { id: "template-demo-cleaning-evening", name: "نظافة — فوج مسائي", sector: "cleaning", startTimeMin: 840, endTimeMin: 1320, breakMinutes: 30, notes: "14:00–22:00 — يُستخدم مع الصباحي لقاعدة تناوب" },
  ];
  for (const t of demoTemplates) {
    await db.shiftTemplate.upsert({
      where: { id: t.id },
      update: {},
      create: { ...t, companyId: company.id },
    });
  }

  // 9) سيناريو التغطية السريعة (المرحلة 5 — SPEC §4.1 و§8): ورديات «اليوم» بتوقيت الشركة
  //    - worker1 (البوابة 06:00–14:00): العامل الغائب — بلا تسجيل حضور ← مرشّح لسحب بديل
  //    - worker3 (المركز التجاري 08:00–17:00): متعارض مع نافذة البوابة ← يجب استبعاده من المتاحين
  //    - worker2: حرّ اليوم ← البديل المتاح
  //    معرّفات بتاريخ اليوم كي تعيد البذور توليد السيناريو يوميًا (idempotent في نفس اليوم)
  const tzOffsetMs = (date: Date, timeZone: string): number => {
    const dtf = new Intl.DateTimeFormat("en-US", {
      timeZone, hour12: false, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
    });
    const parts = dtf.formatToParts(date);
    const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? "0");
    return Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"), get("second")) - date.getTime();
  };
  const zonedToUtc = (localDate: string, minutes: number, timeZone: string): Date => {
    const [y, m, d] = localDate.split("-").map(Number);
    const naive = new Date(Date.UTC(y, m - 1, d, Math.floor(minutes / 60), minutes % 60));
    const pass1 = new Date(naive.getTime() - tzOffsetMs(naive, timeZone));
    return new Date(naive.getTime() - tzOffsetMs(pass1, timeZone));
  };
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: company.timezone, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());

  const coverageShifts = [
    { suffix: "gate", workerId: "user-employee", siteId: "site-demo-gate", templateId: "template-demo-cleaning-morning", startTimeMin: 360, endTimeMin: 840, breakMinutes: 30 },
    { suffix: "mall", workerId: "user-employee-3", siteId: "site-demo-mall", templateId: "template-demo-construction-day", startTimeMin: 480, endTimeMin: 1020, breakMinutes: 60 },
  ];
  for (const s of coverageShifts) {
    const id = `shift-demo-${today}-${s.suffix}`;
    await db.shift.upsert({
      where: { id },
      update: {}, // لا نلمس ورديات أنشأها المستخدمون فعليًا — السيناريو يُنشأ مرة يوميًا
      create: {
        id,
        companyId: company.id,
        workerUserId: s.workerId,
        siteId: s.siteId,
        templateId: s.templateId,
        localDate: today,
        startsAt: zonedToUtc(today, s.startTimeMin, company.timezone),
        endsAt: zonedToUtc(today, s.endTimeMin, company.timezone),
        breakMinutes: s.breakMinutes,
        status: "scheduled",
        source: "manual",
        notes: "بذور سيناريو التغطية السريعة (المرحلة 5)",
        createdByUserId: "user-admin",
      },
    });
  }

  console.log("✓ مالك المنصة + الشركة التجريبية + 7 مستخدمين (5 أدوار + عاملان للتغطية)");
  console.log("✓ بنية تنظيمية: فرع الدار البيضاء + مشروع برج + 3 مواقع جغرافية + مجموعتا عمال");
  console.log("✓ جدولة: 4 قوالب ورديات قطاعية (حراسة ليل / بناء نهار / نظافة صباحي+مسائي)");
  console.log(`✓ سيناريو التغطية ${today}: عامل غائب بالبوابة + بديل متاح + عامل متعارض`);

  // 10) المرحلة 6أ/6ب — بذور الأجور (⚠️ بانتظار مراجعة المساعد الثاني كسابقة المراحل السابقة):
  //     أ) ملفات أجور العمال الثلاثة (أنظمة الاحتساب الثلاثة ممثلة: بالساعة/باليوم/شهري)
  //     ب) العطل الرسمية ذات التاريخ الثابت 2026 (الدينية يُدخلها admin سنويًا — لا تُخمَّن)
  //     ج) ورديات الأسبوع الفائت + حضور موثَّق كامل: سيناريو أجور قابل للعرض والتوليد
  await db.employeeProfile.upsert({
    where: { id: "profile-employee-1" },
    update: { cin: "AB123456", cnssNumber: "1000001" },
    create: {
      id: "profile-employee-1",
      companyId: company.id,
      userId: "user-employee",
      payType: "hourly",
      hourlyRateCents: 3000, // 30 درهم/ساعة
      transportZone: "urban",
      dependentsCount: 2,
      hireDate: new Date("2024-06-01T00:00:00Z"),
      cin: "AB123456", // بيانات التصريح التجريبية (المرحلة 6ج)
      cnssNumber: "1000001",
    },
  });
  await db.employeeProfile.upsert({
    where: { id: "profile-employee-2" },
    update: { cin: "CD234567", cnssNumber: "1000002" },
    create: {
      id: "profile-employee-2",
      companyId: company.id,
      userId: "user-employee-2",
      payType: "hourly",
      hourlyRateCents: 2800, // 28 درهم/ساعة
      transportZone: "urban",
      dependentsCount: 0,
      hireDate: new Date("2025-03-01T00:00:00Z"),
      cin: "CD234567",
      cnssNumber: "1000002",
    },
  });
  await db.employeeProfile.upsert({
    where: { id: "profile-employee-3" },
    update: { cin: "EE345678", cnssNumber: "1000003" },
    create: {
      id: "profile-employee-3",
      companyId: company.id,
      userId: "user-employee-3",
      payType: "daily",
      dailyRateCents: 14400, // 144 درهم/يوم (≥ SMIG×8 = 143,36)
      transportZone: "urban",
      dependentsCount: 3,
      hireDate: new Date("2023-01-15T00:00:00Z"),
      cin: "EE345678",
      cnssNumber: "1000003",
    },
  });

  const fixedHolidays2026 = [
    { localDate: "2026-01-01", name: "رأس السنة الميلادية" },
    { localDate: "2026-01-11", name: "ذكرى تقديم وثيقة الاستقلال" },
    { localDate: "2026-01-14", name: "رأس السنة الأمازيغية" },
    { localDate: "2026-05-01", name: "عيد الشغل" },
    { localDate: "2026-07-30", name: "عيد العرش" },
    { localDate: "2026-08-14", name: "استرجاع إقليم وادي الذهب" },
    { localDate: "2026-08-20", name: "ثورة الملك والشعب" },
    { localDate: "2026-08-21", name: "عيد الشباب" },
    { localDate: "2026-11-06", name: "ذكرى المسيرة الخضراء" },
    { localDate: "2026-11-18", name: "عيد الاستقلال" },
  ];
  for (const h of fixedHolidays2026) {
    await db.holiday.upsert({
      where: { companyId_localDate: { companyId: company.id, localDate: h.localDate } },
      update: {},
      create: { companyId: company.id, localDate: h.localDate, name: h.name },
    });
  }

  // سيناريو ورديات الأسبوع الفائت (الإثنين–الجمعة) + حضور موثَّق كامل بتوقيت الشركة:
  //   worker1: 3 ليالِ حراسة 22:00–06:00 (24 س ليلًا عاديًا — لا إضافي أسبوعي)
  //   worker2: نظافة 06:00–14:00 الإثنين–الخميس (32 س عادية) + الجمعة (يوم الراحة — 8 س إضافي راحة نهار +50%)
  //   worker3: بناء 08:00–17:00 الإثنين–الخميس بمرتبة أجر يومية (استراحة ساعة — 8 س صافية/يوم)
  const lastMonday = (() => {
    const [y, m, d] = today.split("-").map(Number);
    const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    const back = (wd === 0 ? 6 : wd - 1) + 7; // إلى إثنين الأسبوع الفائت
    const dt = new Date(Date.UTC(y, m - 1, d));
    dt.setUTCDate(dt.getUTCDate() - back);
    return dt.toISOString().slice(0, 10);
  })();
  const shiftDate = (offset: number) => {
    const [y, m, d] = lastMonday.split("-").map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    dt.setUTCDate(dt.getUTCDate() + offset);
    return dt.toISOString().slice(0, 10);
  };

  type PayShift = {
    suffix: string;
    workerId: string;
    siteId: string;
    templateId: string;
    dayOffset: number;
    startTimeMin: number;
    endTimeMin: number;
    breakMinutes: number;
  };
  const payShifts: PayShift[] = [];
  for (let i = 0; i < 3; i++) {
    payShifts.push({ suffix: `w1-night-${i}`, workerId: "user-employee", siteId: "site-demo-gate", templateId: "template-demo-security-night", dayOffset: i, startTimeMin: 1320, endTimeMin: 360, breakMinutes: 0 });
  }
  for (let i = 0; i < 5; i++) {
    payShifts.push({ suffix: `w2-clean-${i}`, workerId: "user-employee-2", siteId: "site-demo-mall", templateId: "template-demo-cleaning-morning", dayOffset: i, startTimeMin: 360, endTimeMin: 840, breakMinutes: 30 });
  }
  for (let i = 0; i < 5; i++) {
    payShifts.push({ suffix: `w3-build-${i}`, workerId: "user-employee-3", siteId: "site-demo-garden", templateId: "template-demo-construction-day", dayOffset: i, startTimeMin: 480, endTimeMin: 1020, breakMinutes: 60 });
  }

  for (const s of payShifts) {
    const localDate = shiftDate(s.dayOffset);
    const id = `shift-demo-pay-${localDate}-${s.suffix}`;
    const startsAt = zonedToUtc(localDate, s.startTimeMin, company.timezone);
    // وردية تعبر منتصف الليل (endTime ≤ startTime): النهاية في اليوم التالي (سابقة قوالب المرحلة 3)
    const endsAt =
      s.endTimeMin <= s.startTimeMin
        ? new Date(zonedToUtc(localDate, s.endTimeMin, company.timezone).getTime() + 24 * 3600_000)
        : zonedToUtc(localDate, s.endTimeMin, company.timezone);
    const site = demoSites.find((x) => x.id === s.siteId)!;
    await db.shift.upsert({
      where: { id },
      update: {},
      create: {
        id,
        companyId: company.id,
        workerUserId: s.workerId,
        siteId: s.siteId,
        templateId: s.templateId,
        localDate,
        startsAt,
        endsAt,
        breakMinutes: s.breakMinutes,
        status: "scheduled",
        source: "manual",
        notes: "بذور سيناريو الأجور (المرحلة 6أ/6ب)",
        createdByUserId: "user-admin",
      },
    });
    // حضور موثَّق كامل: زوج دخول/خروج عند بداية الوردية ونهايتها (داخل النطاق — مسافة 0)
    for (const [type, occurredAt] of [
      ["check_in", startsAt],
      ["check_out", endsAt],
    ] as const) {
      const exists = await db.attendanceEvent.findFirst({
        where: { companyId: company.id, workerUserId: s.workerId, siteId: s.siteId, type, occurredAt },
      });
      if (!exists) {
        await db.attendanceEvent.create({
          data: {
            companyId: company.id,
            workerUserId: s.workerId,
            siteId: s.siteId,
            shiftId: id,
            type,
            occurredAt,
            latitude: site.latitude,
            longitude: site.longitude,
            accuracyM: 8,
            distanceM: 0,
            insideFence: true,
            policy: "none",
            verification: "none",
            status: "verified",
            networkMode: "internet",
          },
        });
      }
    }
  }

  console.log("✓ المرحلة 6أ/6ب: ملفات أجور 3 عمال (ساعي/ساعي/يومي) + عطل 2026 الثابتة + ورديات وحضور الأسبوع الفائت");

  // 11) المرحلة 6ج — بذور المسارات والتصاريح (⚠️ بانتظار مراجعة المساعد الثاني):
  //     قوالب المنصة (general/agricultural/حزمتان فارغتان) + عينات مواصفات SAMPLE-NOT-OFFICIAL
  //     + إسنادات العمال الثلاثة للمسار العام + رقم CNSS للشركة (لتصريح Damancom)
  await seedRegimes();
  await db.company.update({
    where: { id: company.id },
    data: { cnssNumber: "1234567", taxId: "001234567000089" },
  });
  const generalTemplate = await db.payRegime.findFirst({
    where: { companyId: null, key: "general", isActive: true },
    orderBy: { version: "desc" },
  });
  if (generalTemplate) {
    for (const [idx, workerId] of (["user-employee", "user-employee-2", "user-employee-3"] as const).entries()) {
      const existing = await db.regimeAssignment.findFirst({
        where: { companyId: company.id, workerUserId: workerId },
      });
      if (!existing) {
        await db.regimeAssignment.create({
          data: {
            companyId: company.id,
            regimeId: generalTemplate.id,
            workerUserId: workerId,
            effectiveFrom: new Date("2026-01-01T00:00:00Z"),
            createdBy: "user-owner",
          },
        });
      }
    }
    console.log("✓ المرحلة 6ج: إسنادات 3 عمال للمسار العام + CNSS/ICE للشركة التجريبية");
  }
  console.log(`  كلمة المرور التجريبية للكل: ${DEMO_PASSWORD}`);
  console.log("  owner@fwms.local | admin@demo.ma | accountant@demo.ma | supervisor@demo.ma | worker@demo.ma | worker2@demo.ma | worker3@demo.ma");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
