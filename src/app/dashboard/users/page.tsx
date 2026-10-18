import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import { PageHeader } from "@/components/fwms/org-bits";
import { getSession } from "@/lib/auth/session";
import { roleHas } from "@/lib/rbac";
import { hasPermission } from "@/lib/delegations";
import { LOCALE_COOKIE, resolveLocale } from "@/i18n/config";
import { getDictionary, tServer } from "@/i18n/get-dictionary";
import { UsersManager } from "@/components/fwms/users-manager";

export async function generateMetadata(): Promise<Metadata> {
  const store = await cookies();
  const dict = getDictionary(resolveLocale(store.get(LOCALE_COOKIE)?.value));
  return { title: tServer(dict, "usersPage.title") };
}

export default async function UsersPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const store = await cookies();
  const locale = resolveLocale(store.get(LOCALE_COOKIE)?.value);
  const dict = getDictionary(locale);

  // الدخول: users.manage (سوبر/أدمن بطبعهما أو تفويض) — إنشاء الحسابات أضيق (users.create)
  const manage =
    roleHas(session.role, "users.manage") || (await hasPermission(session, "users.manage"));
  if (!manage) {
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-col items-center gap-3 py-16 text-center">
        <ShieldAlert className="size-10 text-muted-foreground" aria-hidden />
        <p className="text-sm font-medium text-muted-foreground">{tServer(dict, "common.forbidden")}</p>
      </div>
    );
  }

  const canCreate =
    session.role === "super_admin" || (await hasPermission(session, "users.create"));

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <PageHeader title={tServer(dict, "usersPage.title")} subtitle={tServer(dict, "usersPage.subtitle")} />
      <UsersManager canCreate={canCreate} isSuperAdmin={session.role === "super_admin"} myUserId={session.sub} />
    </div>
  );
}
