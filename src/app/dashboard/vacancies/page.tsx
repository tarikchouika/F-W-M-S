import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import { getSession } from "@/lib/auth/session";
import { sessionCan } from "@/lib/rbac";
import { db } from "@/lib/db";
import { localizedName } from "@/lib/localized-name";
import { getUiLocale } from "@/i18n/ui-locale";
import { readLocaleCookie, resolveLocale } from "@/i18n/config";
import { getDictionary, tServer } from "@/i18n/get-dictionary";
import { VacanciesManager } from "@/components/hrmp-jobs/vacancies-manager";

export async function generateMetadata(): Promise<Metadata> {
  const store = await cookies();
  const dict = getDictionary(resolveLocale(readLocaleCookie(store)));
  return { title: tServer(dict, "vacanciesPage.title") };
}

export default async function VacanciesPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const store = await cookies();
  const locale = resolveLocale(readLocaleCookie(store));

  if (!sessionCan(session, "recruitment.manage")) {
    const dict = getDictionary(locale);
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-col items-center gap-3 py-16 text-center">
        <ShieldAlert className="size-10 text-muted-foreground" aria-hidden />
        <p className="text-sm font-medium text-muted-foreground">{tServer(dict, "common.forbidden")}</p>
      </div>
    );
  }

  // مشاريع الشركة النشطة (للاختيار في النموذج) — أسماء محلية بلغة الواجهة
  const uiLocale = await getUiLocale();
  const projects = await db.project.findMany({
    where: { companyId: session.companyId, status: "active" },
    select: { id: true, name: true, names: true },
    orderBy: { createdAt: "desc" },
  });

  return (
    <VacanciesManager
      projects={projects.map((p) => ({ id: p.id, name: localizedName(p, uiLocale, "name") }))}
    />
  );
}
