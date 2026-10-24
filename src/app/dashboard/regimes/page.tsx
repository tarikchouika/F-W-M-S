import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { sessionCan } from "@/lib/rbac";
import { readLocaleCookie, resolveLocale } from "@/i18n/config";
import { getDictionary, tServer } from "@/i18n/get-dictionary";
import { RegimesManager } from "@/components/hrmp/regimes-manager";

export async function generateMetadata(): Promise<Metadata> {
  const store = await cookies();
  const dict = getDictionary(resolveLocale(readLocaleCookie(store)));
  return { title: tServer(dict, "regimes.title") };
}

export default async function RegimesPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  // المرحلة 6ج (SPEC §12): المسارات لمن يملك payroll.view (مدير/محاسب/مالك)
  if (!sessionCan(session, "payroll.view")) redirect("/dashboard");

  return <RegimesManager role={session.role} />;
}
