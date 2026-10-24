import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { readLocaleCookie, resolveLocale } from "@/i18n/config";
import { getDictionary, tServer } from "@/i18n/get-dictionary";
import { ReportsManager } from "@/components/hrmp/reports-manager";

export async function generateMetadata(): Promise<Metadata> {
  const store = await cookies();
  const dict = getDictionary(resolveLocale(readLocaleCookie(store)));
  return { title: tServer(dict, "reports.title") };
}

export default async function ReportsPage() {
  const session = await getSession();
  if (!session) redirect("/dashboard");

  // كل دور يرى تقاريره (SPEC §4.4.1) — البوابة تنظم ما يظهر داخلها
  return <ReportsManager />;
}
