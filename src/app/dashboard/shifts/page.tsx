import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import { getSession } from "@/lib/auth/session";
import { sessionCan } from "@/lib/rbac";
import { todayInZone } from "@/lib/scheduling";
import { readLocaleCookie, resolveLocale } from "@/i18n/config";
import { getDictionary, tServer } from "@/i18n/get-dictionary";
import { ShiftsManager } from "@/components/hrmp/shifts-manager";

export async function generateMetadata(): Promise<Metadata> {
  const store = await cookies();
  const dict = getDictionary(resolveLocale(readLocaleCookie(store)));
  return { title: tServer(dict, "shifts.title") };
}

export default async function ShiftsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const store = await cookies();
  const locale = resolveLocale(readLocaleCookie(store));
  const dict = getDictionary(locale);

  // معيار قبول المرحلة 3 (SPEC §8): إدارة الورديات + رفض التعارض
  if (!sessionCan(session, "scheduling.manage")) {
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-col items-center gap-3 py-16 text-center">
        <ShieldAlert className="size-10 text-muted-foreground" aria-hidden />
        <p className="text-sm font-medium text-muted-foreground">{tServer(dict, "common.forbidden")}</p>
      </div>
    );
  }

  // «اليوم» يُحسب في الخادم بتوقيت الشركة — أساس قاعدة «طوارئ اليوم» لـ co_admin
  return <ShiftsManager role={session.role} today={todayInZone(session.companyTimezone)} />;
}
