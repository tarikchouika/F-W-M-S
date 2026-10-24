import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import { getSession } from "@/lib/auth/session";
import { sessionCan } from "@/lib/rbac";
import { readLocaleCookie, resolveLocale } from "@/i18n/config";
import { getDictionary, tServer } from "@/i18n/get-dictionary";
import { SiteQrKiosk } from "@/components/hrmp/qr-kiosk-view";

export async function generateMetadata(): Promise<Metadata> {
  const store = await cookies();
  const dict = getDictionary(resolveLocale(readLocaleCookie(store)));
  return { title: tServer(dict, "qr.siteQr") };
}

export default async function SiteQrPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const { id } = await params;
  const store = await cookies();
  const locale = resolveLocale(readLocaleCookie(store));
  const dict = getDictionary(locale);

  // المرحلة 4 (SPEC §4.2): «شاشة عند الباب» — attendance.manage (مشرف/مدير يفتحها على جهاز الباب)
  if (!sessionCan(session, "attendance.manage")) {
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-col items-center gap-3 py-16 text-center">
        <ShieldAlert className="size-10 text-muted-foreground" aria-hidden />
        <p className="text-sm font-medium text-muted-foreground">{tServer(dict, "common.forbidden")}</p>
      </div>
    );
  }

  return <SiteQrKiosk siteId={id} />;
}
