import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/fwms/org-bits";
import { getSession } from "@/lib/auth/session";
import { LOCALE_COOKIE, resolveLocale } from "@/i18n/config";
import { getDictionary, tServer } from "@/i18n/get-dictionary";
import { TeamPresenceView } from "@/components/fwms/team-presence-view";

export async function generateMetadata(): Promise<Metadata> {
  const store = await cookies();
  const dict = getDictionary(resolveLocale(store.get(LOCALE_COOKIE)?.value));
  return { title: tServer(dict, "presence.title") };
}

export default async function TeamPresencePage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const store = await cookies();
  const locale = resolveLocale(store.get(LOCALE_COOKIE)?.value);
  const dict = getDictionary(locale);

  // الوصول الدقيق يُفحص داخل API (قادة الفرق بغض النظر عن دورهم + أصحاب location.view)
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <PageHeader title={tServer(dict, "presence.title")} subtitle={tServer(dict, "presence.subtitle")} />
      <TeamPresenceView />
    </div>
  );
}
