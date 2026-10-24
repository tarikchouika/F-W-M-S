import type { Metadata } from "next";
import { cookies } from "next/headers";
import { PublicLegalShell } from "@/components/hrmp/public-legal-shell";
import { SeekerLoginForm } from "@/components/hrmp-jobs/seeker-login-form";
import { readLocaleCookie, resolveLocale } from "@/i18n/config";
import { getDictionary, tServer } from "@/i18n/get-dictionary";

export async function generateMetadata(): Promise<Metadata> {
  const store = await cookies();
  const dict = getDictionary(resolveLocale(readLocaleCookie(store)));
  return { title: tServer(dict, "jobs.login.title") };
}

export default function SeekerLoginPage() {
  return (
    <PublicLegalShell>
      <SeekerLoginForm />
    </PublicLegalShell>
  );
}
