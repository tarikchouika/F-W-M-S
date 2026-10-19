// FWMS — صفحة الإعدادات (جولة 2026-10-19): «قريبا» صارت صفحة فعلية
// تبويبان: الملف الشخصي (للجميع) + إعدادات الشركة (company.manage).
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { sessionCan } from "@/lib/rbac";
import { LOCALE_COOKIE, resolveLocale } from "@/i18n/config";
import { getDictionary, tServer } from "@/i18n/get-dictionary";
import { SettingsView } from "@/components/fwms/settings-view";

export async function generateMetadata(): Promise<Metadata> {
  const store = await cookies();
  const dict = getDictionary(resolveLocale(store.get(LOCALE_COOKIE)?.value));
  return { title: tServer(dict, "settingsPage.title") };
}

export default async function SettingsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <SettingsView
      initialName={session.name}
      email={session.email}
      canManageCompany={sessionCan(session, "company.manage")}
    />
  );
}
