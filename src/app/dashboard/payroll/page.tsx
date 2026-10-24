import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { sessionCan } from "@/lib/rbac";
import { readLocaleCookie, resolveLocale } from "@/i18n/config";
import { getDictionary, tServer } from "@/i18n/get-dictionary";
import { PayrollManager } from "@/components/hrmp/payroll-manager";

export async function generateMetadata(): Promise<Metadata> {
  const store = await cookies();
  const dict = getDictionary(resolveLocale(readLocaleCookie(store)));
  return { title: tServer(dict, "payroll.title") };
}

export default async function PayrollPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  // المرحلة 6أ/6ب (SPEC §4.3 و§8): الأجور لمن يملك payroll.view (مدير/محاسب/مالك)
  // العامل له «أجوري» (/dashboard/my-payslips) — co_admin بلا أرقام أجور افتراضيًا (SPEC §4.4.1)
  if (!sessionCan(session, "payroll.view")) redirect("/dashboard");

  return <PayrollManager role={session.role} canApprove={sessionCan(session, "payroll.approve")} />;
}
