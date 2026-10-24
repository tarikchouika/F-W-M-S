import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { PublicLegalShell } from "@/components/hrmp/public-legal-shell";
import { JobDetailView } from "@/components/hrmp-jobs/job-detail-view";
import { getPublicVacancy } from "@/lib/recruitment/service";
import { readLocaleCookie, resolveLocale } from "@/i18n/config";
import { getDictionary, tServer } from "@/i18n/get-dictionary";

type Props = {
  params: Promise<{ id: string }>;
};

async function pageLocale() {
  const store = await cookies();
  return resolveLocale(readLocaleCookie(store));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const locale = await pageLocale();
  const vacancy = await getPublicVacancy(id, locale);
  const dict = getDictionary(locale);
  return {
    title: vacancy ? `${vacancy.title} — ${vacancy.companyName}` : tServer(dict, "jobs.title"),
  };
}

export default async function JobDetailPage({ params }: Props) {
  const { id } = await params;
  const locale = await pageLocale();
  const vacancy = await getPublicVacancy(id, locale);
  if (!vacancy) notFound();

  return (
    <PublicLegalShell>
      <JobDetailView vacancy={vacancy} />
    </PublicLegalShell>
  );
}
