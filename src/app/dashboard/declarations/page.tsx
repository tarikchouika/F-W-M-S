import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { sessionCan } from "@/lib/rbac";
import { readLocaleCookie, resolveLocale } from "@/i18n/config";
import { getDictionary, tServer } from "@/i18n/get-dictionary";
import { DeclarationsManager } from "@/components/hrmp/declarations-manager";

export async function generateMetadata(): Promise<Metadata> {
  const store = await cookies();
  const dict = getDictionary(resolveLocale(readLocaleCookie(store)));
  return { title: tServer(dict, "declarations.title") };
}

export default async function DeclarationsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  // المرحلة 6ج (SPEC §4.6): التصاريح للمحاسب والمالك (الاعتماد والتصدير حصرًا للمحاسب)
  if (!sessionCan(session, "declarations.review")) redirect("/dashboard");

  return <DeclarationsManager />;
}
