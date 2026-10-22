import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import { getSession } from "@/lib/auth/session";
import { sessionCan } from "@/lib/rbac";
import { hasPermission } from "@/lib/delegations";
import { LOCALE_COOKIE, resolveLocale } from "@/i18n/config";
import { getDictionary, tServer } from "@/i18n/get-dictionary";
import { SitesManager } from "@/components/fwms/sites-manager";

export async function generateMetadata(): Promise<Metadata> {
  const store = await cookies();
  const dict = getDictionary(resolveLocale(store.get(LOCALE_COOKIE)?.value));
  return { title: tServer(dict, "sites.title") };
}

export default async function SitesPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const store = await cookies();
  const locale = resolveLocale(store.get(LOCALE_COOKIE)?.value);
  const dict = getDictionary(locale);

  // معيار قبول المرحلة 2 (SPEC §8): إنشاء موقع بنصف قطر وعرضه على الخريطة
  if (!sessionCan(session, "company.manage")) {
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-col items-center gap-3 py-16 text-center">
        <ShieldAlert className="size-10 text-muted-foreground" aria-hidden />
        <p className="text-sm font-medium text-muted-foreground">{tServer(dict, "common.forbidden")}</p>
      </div>
    );
  }

  // الحذف النهائي: data.delete — السوبر بطبعه أو مفوَّض (أمر المالك 2026-10-23)
  const canDelete =
    session.role === "super_admin" || (await hasPermission(session, "data.delete"));

  return <SitesManager canDelete={canDelete} />;
}
