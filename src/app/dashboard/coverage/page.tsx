import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { sessionCan } from "@/lib/rbac";
import { todayInZone } from "@/lib/scheduling";
import { readLocaleCookie, resolveLocale } from "@/i18n/config";
import { getDictionary, tServer } from "@/i18n/get-dictionary";
import { CoverageManager } from "@/components/hrmp/coverage-manager";

export async function generateMetadata(): Promise<Metadata> {
  const store = await cookies();
  const dict = getDictionary(resolveLocale(readLocaleCookie(store)));
  return { title: tServer(dict, "coverage.title") };
}

export default async function CoveragePage() {
  const session = await getSession();
  if (!session) redirect("/login");

  // المرحلة 5 (SPEC §4.1 و§8): التغطية السريعة لمن يملك attendance.manage (admin/co_admin)
  // معيار القبول: «البديل يصله الإشعار ويظهر الموقع في برنامجه» — هذه شاشة السحب
  if (!sessionCan(session, "attendance.manage")) redirect("/dashboard");

  return <CoverageManager today={todayInZone(session.companyTimezone)} />;
}
