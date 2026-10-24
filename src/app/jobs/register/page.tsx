import type { Metadata } from "next";
import { cookies } from "next/headers";
import { PublicLegalShell } from "@/components/hrmp/public-legal-shell";
import { SeekerRegisterForm } from "@/components/hrmp-jobs/seeker-register-form";
import { readLocaleCookie, resolveLocale } from "@/i18n/config";
import { getDictionary, tServer } from "@/i18n/get-dictionary";

export async function generateMetadata(): Promise<Metadata> {
  const store = await cookies();
  const dict = getDictionary(resolveLocale(readLocaleCookie(store)));
  return { title: tServer(dict, "jobs.register.title") };
}

export default function SeekerRegisterPage() {
  return (
    <PublicLegalShell>
      <SeekerRegisterForm />
    </PublicLegalShell>
  );
}
