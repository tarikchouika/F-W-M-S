import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/hrmp/org-bits";
import { getSession } from "@/lib/auth/session";
import { readLocaleCookie, resolveLocale } from "@/i18n/config";
import { getDictionary, tServer } from "@/i18n/get-dictionary";
import { VoiceConsole } from "@/components/hrmp/voice-console";

export async function generateMetadata(): Promise<Metadata> {
  const store = await cookies();
  const dict = getDictionary(resolveLocale(readLocaleCookie(store)));
  return { title: tServer(dict, "voice.title") };
}

export default async function VoicePage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const store = await cookies();
  const locale = resolveLocale(readLocaleCookie(store));
  const dict = getDictionary(locale);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <PageHeader title={tServer(dict, "voice.title")} subtitle={tServer(dict, "voice.subtitle")} />
      <VoiceConsole myUserId={session.sub} />
    </div>
  );
}
