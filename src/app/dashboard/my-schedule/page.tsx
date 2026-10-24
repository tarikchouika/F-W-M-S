import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { todayInZone } from "@/lib/scheduling";
import { readLocaleCookie, resolveLocale } from "@/i18n/config";
import { getDictionary, tServer } from "@/i18n/get-dictionary";
import { MyScheduleView } from "@/components/hrmp/my-schedule-view";

export async function generateMetadata(): Promise<Metadata> {
  const store = await cookies();
  const dict = getDictionary(resolveLocale(readLocaleCookie(store)));
  return { title: tServer(dict, "mySchedule.title") };
}

export default async function MySchedulePage() {
  const session = await getSession();
  if (!session) redirect("/login");

  // معيار قبول المرحلة 3 (SPEC §8): «العامل يرى برنامجه»
  // self.view متاحة لكل الأدوار المصادقة (SPEC §3) — البرنامج شخصي دائمًا والعزل في الخادم
  return <MyScheduleView today={todayInZone(session.companyTimezone)} />;
}
