"use client";

// FWMS — الشريط الجانبي للوحة: عناصر بحسب صلاحيات الدور (SPEC §3) — الوحدات غير المنجزة تظهر «قريبًا» بصدق
// جوال (v0.10.0): القائمة الجانبية كانت تُرسم كاملة بعرض الشاشة أعلى الصفحة على الهواتف (خلل التوافق) —
// الآن: سطح المكتب شريط ثابت كالمعتاد، والجوال زر همبرغر في الترويسة يفتح Sheet بالتنقل نفسه.
// الإصدار يُعرض من APP_VERSION حصرًا (درس 2026-10-18): لا رقم إصدار مثبَّت في أي مكون.
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  UsersRound,
  ScrollText,
  CalendarClock,
  CalendarCheck,
  ClipboardCheck,
  LayoutTemplate,
  Repeat,
  MapPin,
  FolderKanban,
  GitBranch,
  Building2,
  Calculator,
  FileText,
  Settings,
  ShieldCheck,
  UserCheck,
  ArrowLeftRight,
  CalendarDays,
  ReceiptText,
  Layers,
  FileCog,
  Landmark,
  Radio,
  Footprints,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { FwmsLogo } from "@/components/fwms/logo";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";
import { APP_VERSION } from "@/lib/version";

export type NavItem = {
  key: string;
  labelKey: string;
  icon: LucideIcon;
  href?: string;
  soon?: boolean;
};

const ALL_ITEMS: NavItem[] = [
  { key: "overview", labelKey: "dashboard.overview", icon: LayoutDashboard, href: "/dashboard" },
  { key: "companies", labelKey: "dashboard.companies", icon: Building2, href: "/dashboard/companies" },
  { key: "branches", labelKey: "dashboard.branches", icon: GitBranch, href: "/dashboard/branches" },
  { key: "projects", labelKey: "dashboard.projects", icon: FolderKanban, href: "/dashboard/projects" },
  { key: "sites", labelKey: "dashboard.sites", icon: MapPin, href: "/dashboard/sites" },
  { key: "groups", labelKey: "dashboard.groups", icon: UsersRound, href: "/dashboard/groups" },
  { key: "teamPresence", labelKey: "dashboard.teamPresence", icon: Footprints, href: "/dashboard/team-presence" },
  { key: "voice", labelKey: "dashboard.voice", icon: Radio, href: "/dashboard/voice" },
  { key: "shiftTemplates", labelKey: "dashboard.shiftTemplates", icon: LayoutTemplate, href: "/dashboard/shift-templates" },
  { key: "shifts", labelKey: "dashboard.shifts", icon: CalendarClock, href: "/dashboard/shifts" },
  { key: "recurrences", labelKey: "dashboard.recurrences", icon: Repeat, href: "/dashboard/shift-recurrences" },
  { key: "mySchedule", labelKey: "dashboard.mySchedule", icon: CalendarCheck, href: "/dashboard/my-schedule" },
  { key: "myAttendance", labelKey: "dashboard.myAttendance", icon: ClipboardCheck, href: "/dashboard/my-attendance" },
  { key: "attendance", labelKey: "dashboard.attendance", icon: UserCheck, href: "/dashboard/attendance" },
  { key: "coverage", labelKey: "dashboard.coverage", icon: ArrowLeftRight, href: "/dashboard/coverage" },
  { key: "verificationPolicies", labelKey: "dashboard.verificationPolicies", icon: ShieldCheck, href: "/dashboard/verification-policies" },
  { key: "payroll", labelKey: "dashboard.payroll", icon: Calculator, href: "/dashboard/payroll" },
  { key: "regimes", labelKey: "dashboard.regimes", icon: Layers, href: "/dashboard/regimes" },
  { key: "declarationSpecs", labelKey: "dashboard.declarationSpecs", icon: FileCog, href: "/dashboard/declaration-specs" },
  { key: "declarations", labelKey: "dashboard.declarations", icon: Landmark, href: "/dashboard/declarations" },
  { key: "holidays", labelKey: "dashboard.holidays", icon: CalendarDays, href: "/dashboard/holidays" },
  { key: "platform", labelKey: "dashboard.platform", icon: Landmark, href: "/dashboard/platform" },
  { key: "myPayslips", labelKey: "dashboard.myPayslips", icon: ReceiptText, href: "/dashboard/my-payslips" },
  { key: "users", labelKey: "dashboard.users", icon: Users, href: "/dashboard/users" },
  { key: "reports", labelKey: "dashboard.reports", icon: FileText, href: "/dashboard/reports" },
  { key: "audit", labelKey: "dashboard.audit", icon: ScrollText, soon: true },
  { key: "settings", labelKey: "dashboard.settings", icon: Settings, soon: true },
];

// إظهار العناصر بحسب الدور (SPEC §3): العامل يرى الأساسيات وبرنامجه وحضوره وأجوره فقط
// المرحلة 6أ/6ب: «الأجور» لمن يملك payroll.view (مدير/محاسب/مالك) — «أجوري» للجميع (self.view)
// «العطل الرسمية» لمستخدمي الأجور (إدخالها admin) — co_admin بلا أرقام أجور (SPEC §4.4.1)
// المرحلة 6ج (SPEC §12 و§4.6): المسارات لمستخدمي الأجور — المواصفات والتصاريح للمحاسب/المالك حصرًا
// المرحلة 9 (v0.10.0): «حضور الفريق» لكل من له location.view (قادة الفرق + الكوأدمن فأعلى)،
// «الرسائل الصوتية» للجميع (عزل الفرق يُطبَّق في الخادم)، و«المستخدمون» للسوبر أدمن + من فوَّضهم.
const visibleKeys: Record<string, string[]> = {
  super_admin: ["overview", "companies", "branches", "projects", "sites", "groups", "teamPresence", "voice", "shiftTemplates", "shifts", "recurrences", "mySchedule", "myAttendance", "attendance", "coverage", "verificationPolicies", "payroll", "regimes", "declarationSpecs", "declarations", "holidays", "platform", "myPayslips", "users", "reports", "audit", "settings"],
  accountant: ["overview", "mySchedule", "myAttendance", "payroll", "regimes", "declarationSpecs", "declarations", "holidays", "myPayslips", "reports", "audit"],
  admin: ["overview", "branches", "projects", "sites", "groups", "teamPresence", "voice", "shiftTemplates", "shifts", "recurrences", "mySchedule", "myAttendance", "attendance", "coverage", "verificationPolicies", "payroll", "regimes", "holidays", "myPayslips", "users", "reports", "audit", "settings"],
  co_admin: ["overview", "teamPresence", "voice", "shiftTemplates", "shifts", "recurrences", "mySchedule", "myAttendance", "attendance", "coverage", "myPayslips", "reports"],
  employee: ["overview", "voice", "mySchedule", "myAttendance", "myPayslips", "reports"],
};

/** بناء عناصر التنقل لدور معين — مصدر واحد يشترك فيه سطح المكتب والجوال */
export function navItemsFor(role: string, hiddenKeys: string[] = []): NavItem[] {
  const keys = visibleKeys[role] ?? ["overview"];
  return ALL_ITEMS.filter((i) => keys.includes(i.key) && !hiddenKeys.includes(i.key));
}

function VersionTag({ brandName }: { brandName?: string }) {
  // من version.ts حصرًا — يتحدث تلقائيًا مع كل إصدار (علاج خلل «v0.8.0 — Phase 7» المثبَّت)
  return (
    <div className="border-t border-sidebar-border px-4 py-3 text-[11px] text-sidebar-foreground/60">
      <span dir="ltr">
        {brandName ?? "FWMS"} · v{APP_VERSION}
      </span>
    </div>
  );
}

function NavList({
  items,
  onNavigate,
}: {
  items: NavItem[];
  onNavigate?: () => void;
}) {
  const { t } = useI18n();
  const pathname = usePathname();

  return (
    <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4" aria-label="dashboard">
      {items.map((item) => {
        const active = item.href !== undefined && pathname === item.href;
        const content = (
          <>
            <item.icon className="size-4 shrink-0" aria-hidden />
            <span className="flex-1 truncate text-sm">{t(item.labelKey)}</span>
            {item.soon && (
              <Badge
                variant="secondary"
                className="ms-1 h-5 px-1.5 text-[10px] font-semibold text-sidebar-accent-foreground"
              >
                {t("dashboard.comingSoon")}
              </Badge>
            )}
          </>
        );
        const baseClass = cn(
          "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sidebar-foreground/85 transition-colors",
          active
            ? "bg-sidebar-accent font-semibold text-sidebar-accent-foreground"
            : item.soon
              ? "cursor-default opacity-60"
              : "hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground",
        );
        return item.href && !item.soon ? (
          <Link
            key={item.key}
            href={item.href}
            className={baseClass}
            aria-current={active ? "page" : undefined}
            onClick={onNavigate}
          >
            {content}
          </Link>
        ) : (
          <span key={item.key} className={baseClass} aria-disabled="true">
            {content}
          </span>
        );
      })}
    </nav>
  );
}

export function DashboardSidebar({
  role,
  brandName,
  hiddenKeys = [],
}: {
  role: string;
  brandName?: string; // اسم مالك المنصة (white-label — SPEC §3.2) — من الخادم
  hiddenKeys?: string[]; // عناصر وحدات عطّلها المالك (تفعيل/تعطيل الوحدات — SPEC §3.2)
}) {
  const { t } = useI18n();
  const items = navItemsFor(role, hiddenKeys);

  return (
    <aside className="hidden w-64 shrink-0 flex-col bg-sidebar text-sidebar-foreground md:flex">
      {/* الهوية */}
      <div className="flex items-center gap-2.5 border-b border-sidebar-border px-4 py-4">
        <FwmsLogo className="size-8" />
        <div className="flex flex-col leading-tight">
          <span className="text-base font-extrabold tracking-tight">{brandName ?? "FWMS"}</span>
          <span className="text-[11px] text-sidebar-foreground/70">{t("dashboard.title")}</span>
        </div>
      </div>

      <NavList items={items} />

      <VersionTag brandName={brandName} />
    </aside>
  );
}

/**
 * قائمة الجوال (v0.10.0): زر همبرغر يظهر في ترويسة اللوحة على الشاشات < md فقط،
 * ويفتح Sheet بنفس التنقل — بديل الشريط كامل العرض الذي كان يشوه أعلى الصفحة على الهواتف.
 * يُغلق تلقائيًا عند التنقل، والاتجاه (يمين/يسار) يتبع اتجاه اللغة (RTL → يمين).
 */
export function MobileNav({
  role,
  brandName,
  hiddenKeys = [],
}: {
  role: string;
  brandName?: string;
  hiddenKeys?: string[];
}) {
  const { t, dir } = useI18n();
  const [open, setOpen] = useState(false);
  const items = navItemsFor(role, hiddenKeys);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-9 shrink-0"
          aria-label={t("dashboard.openMenu")}
        >
          {/* أيقونة محايدة لغويًا (درس v0.9.2: تجنب الرموز القابلة للتأويل) */}
          <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
            <path d="M4 6h16" />
            <path d="M4 12h16" />
            <path d="M4 18h16" />
          </svg>
        </Button>
      </SheetTrigger>
      <SheetContent
        side={dir === "rtl" ? "right" : "left"}
        className="flex w-72 flex-col gap-0 bg-sidebar p-0 text-sidebar-foreground [&>button]:text-sidebar-foreground"
      >
        <SheetHeader className="border-b border-sidebar-border px-4 py-4 text-start">
          <SheetTitle className="flex items-center gap-2.5 text-sidebar-foreground">
            <FwmsLogo className="size-8" />
            <span className="flex flex-col leading-tight">
              <span className="text-base font-extrabold tracking-tight">{brandName ?? "FWMS"}</span>
              <span className="text-[11px] font-normal text-sidebar-foreground/70">{t("dashboard.title")}</span>
            </span>
          </SheetTitle>
        </SheetHeader>
        <NavList items={items} onNavigate={() => setOpen(false)} />
        <VersionTag brandName={brandName} />
      </SheetContent>
    </Sheet>
  );
}
