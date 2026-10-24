import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { todayInZone } from "@/lib/scheduling";
import { readLocaleCookie, resolveLocale } from "@/i18n/config";
import { getDictionary, tServer } from "@/i18n/get-dictionary";
import { MyAttendanceView } from "@/components/hrmp/my-attendance-view";

export async function generateMetadata(): Promise<Metadata> {
  const store = await cookies();
  const dict = getDictionary(resolveLocale(readLocaleCookie(store)));
  return { title: tServer(dict, "myAttendance.title") };
}

export default async function MyAttendancePage() {
  const session = await getSession();
  if (!session) redirect("/login");

  // المرحلة 4 (SPEC §4.2 و§4.5): تسجيل العامل دخوله/انصرافه بنفسه — self.view لكل الأدوار
  // التحقق الجغرافي والقرار في الخادم حصراً
  return <MyAttendanceView today={todayInZone(session.companyTimezone)} />;
}
