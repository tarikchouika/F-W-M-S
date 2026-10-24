import type { Metadata } from "next";
import { cookies } from "next/headers";
import { PublicLegalShell } from "@/components/hrmp/public-legal-shell";
import { SeekerPortal } from "@/components/hrmp-jobs/seeker-portal";
import { readLocaleCookie, resolveLocale } from "@/i18n/config";
import { getDictionary, tServer } from "@/i18n/get-dictionary";

export async function generateMetadata(): Promise<Metadata> {
  const store = await cookies();
  const dict = getDictionary(resolveLocale(readLocaleCookie(store)));
  return { title: tServer(dict, "jobs.me.title") };
}

export default function SeekerPortalPage() {
  return (
    <PublicLegalShell>
      <SeekerPortal />
    </PublicLegalShell>
  );
}
