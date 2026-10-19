// FWMS — صفحة سجل التدقيق (جولة 2026-10-19): «قريبا» صارت صفحة كاملة
// بفلاتر (إجراء/فاعل/مدى زمني) وترقيم صفحات وتفاصيل قبل/بعد.
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import { getSession } from "@/lib/auth/session";
import { sessionCan } from "@/lib/rbac";
import { LOCALE_COOKIE, resolveLocale } from "@/i18n/config";
import { getDictionary, tServer } from "@/i18n/get-dictionary";
import { AuditLogViewer } from "@/components/fwms/audit-log-viewer";

export async function generateMetadata(): Promise<Metadata> {
  const store = await cookies();
  const dict = getDictionary(resolveLocale(store.get(LOCALE_COOKIE)?.value));
  return { title: tServer(dict, "audit.title") };
}

export default async function AuditPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const store = await cookies();
  const locale = resolveLocale(store.get(LOCALE_COOKIE)?.value);
  const dict = getDictionary(locale);

  if (!sessionCan(session, "audit.view")) {
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-col items-center gap-3 py-16 text-center">
        <ShieldAlert className="size-10 text-muted-foreground" aria-hidden />
        <p className="text-sm font-medium text-muted-foreground">{tServer(dict, "common.forbidden")}</p>
      </div>
    );
  }

  return <AuditLogViewer isSuperAdmin={session.role === "super_admin"} />;
}
