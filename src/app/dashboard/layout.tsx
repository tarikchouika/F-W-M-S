import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { localizedName, localizeRow, localizeNested } from "@/lib/localized-name";
import { getUiLocale } from "@/i18n/ui-locale";
import { DashboardSidebar, MobileNav } from "@/components/hrmp/dashboard-sidebar";
import { LocationWatcher } from "@/components/hrmp/location-watcher";
import { CompanySwitcher } from "@/components/hrmp/company-switcher";
import { LogoutButton } from "@/components/hrmp/logout-button";
import { LangSwitcher } from "@/components/hrmp/lang-switcher";
import { ThemeSwitcher } from "@/components/hrmp/theme-switcher";
import { NotificationBell } from "@/components/hrmp/notification-bell";
// (بلاغ المالك 2026-10-24): مدير الاتصال المباشر — يعيش في التخطيط فيصلك
// الرن في أي صفحة (WebRTC نظير-إلى-نظير: الوسائط لا تمر بالخادم ولا تُخزَّن)
import { CallManager } from "@/components/hrmp/call-manager";
import { getPlatformBranding, parseModules, isModuleEnabled, MODULE_KEYS } from "@/lib/branding";

/** مفاتيح عناصر الشريط الجانبي التي تحكمها وحدة مالك المنصة (white-label — SPEC §3.2) */
const NAV_MODULE_OF: Record<string, string> = {
  shiftTemplates: "module.scheduling",
  shifts: "module.scheduling",
  recurrences: "module.scheduling",
  mySchedule: "module.scheduling",
  attendance: "module.attendance",
  myAttendance: "module.attendance",
  coverage: "module.coverage",
  payroll: "module.payroll",
  payrollWorkers: "module.payroll",
  regimes: "module.payroll",
  declarations: "module.declarations",
  declarationSpecs: "module.declarations",
  reports: "module.reports",
  myPayslips: "module.reports",
};

export default async function DashboardLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // حارس الوصول: لا لوحة بلا جلسة سارية (SPEC §3: التحقق في الخادم دائمًا)
  const session = await getSession();
  if (!session) redirect("/login");

  // عضويات المستخدم السارية للشركات النشطة (للتبديل الصريح — SPEC §3.1)
  const memberships = await db.userMembership.findMany({
    where: { userId: session.sub, revokedAt: null, company: { status: "active" } },
    include: { company: { select: { id: true, legalName: true, names: true, status: true } } },
    orderBy: { isDefault: "desc" },
  });
  const locale = await getUiLocale();
  const companies = memberships.map((m) => ({ id: m.company.id, legalName: localizedName(m.company, locale, "legalName") }));

  // هوية المالك + تفعيل الوحدات (white-label — SPEC §3.2): تُمرَّر للشريط الجانبي
  const branding = await getPlatformBranding();
  const modules = parseModules(branding.modulesJson);
  const hiddenKeys = MODULE_KEYS.filter((k) => !isModuleEnabled(modules, k))
    .flatMap((k) => Object.entries(NAV_MODULE_OF).filter(([, mod]) => mod === k).map(([nav]) => nav));

  // المرحلة 9: هل المستخدم شخص ميداني (عضو فريق أو قائده)؟ — إذا فنعّل مراقب الموقع
  // (يبث موقعه أثناء فتح اللوحة ليُخطر قائد فريقه آنيًا عند دخول/مغادرة المنطقة)
  const [memberCount, ledCount] = await Promise.all([
    db.workerGroupMember.count({
      where: { companyId: session.companyId, userId: session.sub, status: "active", group: { status: "active" } },
    }),
    db.workerGroup.count({ where: { companyId: session.companyId, leaderUserId: session.sub, status: "active" } }),
  ]);
  const isFieldUser = memberCount > 0 || ledCount > 0;

  // اسم المستخدم المعروض يتبع لغة الواجهة (بلاغ المالك 2026-10-23) — أسماء محلية
  // مع سقوط آمن إلى الاسم الأساسي المخزَّن في الجلسة
  const meRow = await db.user.findUnique({
    where: { id: session.sub },
    select: { names: true, fullName: true },
  });
  const displayUserName = (meRow ? localizedName(meRow, locale, "fullName") : "") || session.name;

  return (
    <div className="flex min-h-dvh flex-col bg-background md:flex-row">
      {/* سطح المكتب: شريط جانبي ثابت — الجوال (v0.10.0): زر قائمة في الترويسة يفتح Sheet */}
      <DashboardSidebar role={session.role} brandName={branding.displayName} hiddenKeys={hiddenKeys} />

      <div className="flex min-w-0 flex-1 flex-col">
        {/* (بلاغ المالك 2026-10-24 — خلل الهواتف): تداخل اسم الشركة مع أيقونة الإشعارات
            على الشاشات الضيقة (≤360px). الجذر: مجموعة "مبدّل الشركة" كانت بعرض ثابت
            w-44 (176px) بلا قابلية انكماش، والمجموعة اليمنى (الأزرار) بلا shrink-0
            — فيفوق مجموعهما عرض الشاشة ويتداخلان بصريًا فوق بعضهما.
            العلاج: جانب أيسر مرن flex-1 min-w-0 (زر القائمة shrink-0 + منطقة الشركة
            min-w-0 flex-1 تقتطع النص الطويل truncate)، وجانب أيمن shrink-0 ثابت —
            فلا يبقى أي عنصر قادر على تجاوز حدود الشريط مهما طال اسم الشركة أو صغرت الشاشة. */}
        <header className="hrmp-sticky-top sticky top-0 z-40 flex h-14 items-center justify-between gap-2 border-b border-border/60 bg-background/90 px-2 backdrop-blur-md sm:px-5">
          <div className="flex min-w-0 flex-1 items-center gap-1.5">
            <div className="shrink-0 md:hidden">
              <MobileNav role={session.role} brandName={branding.displayName} hiddenKeys={hiddenKeys} />
            </div>
            <div className="min-w-0 flex-1">
              <CompanySwitcher companies={companies} activeId={session.companyId} />
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1 sm:gap-2">
            {/* المرحلة 5: جرس الإشعارات — لكل مستخدم (self.view) — استطلاع 20ث/120ث */}
            <NotificationBell />
            <LangSwitcher />
            <ThemeSwitcher />
            <div className="hidden items-center gap-2 text-end sm:flex">
              <div className="flex flex-col leading-tight">
                <span className="text-sm font-semibold text-foreground">{displayUserName}</span>
                <span className="text-[11px] text-muted-foreground" dir="ltr">
                  {session.email}
                </span>
              </div>
            </div>
            <LogoutButton variant="secondary" />
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6">{children}</main>
      </div>
      {isFieldUser && <LocationWatcher />}
      {/* الاتصال المباشر لكل مستخدم (حسب صلاحيات المراسلة في الخادم) */}
      <CallManager myUserId={session.sub} />
    </div>
  );
}
