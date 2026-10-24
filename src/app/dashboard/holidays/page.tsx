import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { sessionCan } from "@/lib/rbac";
import { readLocaleCookie, resolveLocale } from "@/i18n/config";
import { getDictionary, tServer } from "@/i18n/get-dictionary";
import { HolidaysManager } from "@/components/hrmp/holidays-manager";

export async function generateMetadata(): Promise<Metadata> {
  const store = await cookies();
  const dict = getDictionary(resolveLocale(readLocaleCookie(store)));
  return { title: tServer(dict, "holidays.title") };
}

export default async function HolidaysPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  // العطل (SPEC §11.5): يراها من يملك payroll.view — إدخالها company.manage (admin)
  if (!sessionCan(session, "payroll.view")) redirect("/dashboard");

  return <HolidaysManager canManage={sessionCan(session, "company.manage")} />;
}
