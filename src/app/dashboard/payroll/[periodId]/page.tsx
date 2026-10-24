import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { sessionCan } from "@/lib/rbac";
import { readLocaleCookie, resolveLocale } from "@/i18n/config";
import { getDictionary, tServer } from "@/i18n/get-dictionary";
import { PayrollPeriodView } from "@/components/hrmp/payroll-period-view";

export async function generateMetadata(): Promise<Metadata> {
  const store = await cookies();
  const dict = getDictionary(resolveLocale(readLocaleCookie(store)));
  return { title: tServer(dict, "payroll.periodDetail") };
}

export default async function PayrollPeriodPage({ params }: { params: Promise<{ periodId: string }> }) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!sessionCan(session, "payroll.view")) redirect("/dashboard");

  const { periodId } = await params;

  return <PayrollPeriodView periodId={periodId} canApprove={sessionCan(session, "payroll.approve")} />;
}
