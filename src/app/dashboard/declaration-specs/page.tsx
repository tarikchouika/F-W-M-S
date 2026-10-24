import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { sessionCan } from "@/lib/rbac";
import { readLocaleCookie, resolveLocale } from "@/i18n/config";
import { getDictionary, tServer } from "@/i18n/get-dictionary";
import { DeclarationSpecsManager } from "@/components/hrmp/declaration-specs-manager";

export async function generateMetadata(): Promise<Metadata> {
  const store = await cookies();
  const dict = getDictionary(resolveLocale(readLocaleCookie(store)));
  return { title: tServer(dict, "specRegistry.title") };
}

export default async function DeclarationSpecsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  // المرحلة 6ج (SPEC §4.6): سجل المواصفات للمحاسب والمالك حصرًا («شاشة للمحاسب وللمالك»)
  if (!sessionCan(session, "declarations.review")) redirect("/dashboard");

  return <DeclarationSpecsManager />;
}
