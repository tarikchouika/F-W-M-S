import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { readLocaleCookie, resolveLocale } from "@/i18n/config";
import { getDictionary, tServer } from "@/i18n/get-dictionary";
import { MyPayslipsView } from "@/components/hrmp/my-payslips-view";

export async function generateMetadata(): Promise<Metadata> {
  const store = await cookies();
  const dict = getDictionary(resolveLocale(readLocaleCookie(store)));
  return { title: tServer(dict, "myPayslips.title") };
}

export default async function MyPayslipsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  // «أجوري» (SPEC §4.5): لكل مستخدم — العامل يرى كشوفه المعتمدة فقط (عزل ذاتي)
  return <MyPayslipsView />;
}
