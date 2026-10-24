import type { Metadata } from "next";
import { cookies } from "next/headers";
import { PublicLegalShell } from "@/components/hrmp/public-legal-shell";
import { JobsListView } from "@/components/hrmp-jobs/jobs-list-view";
import { listPublicVacancies } from "@/lib/recruitment/service";
import { readLocaleCookie, resolveLocale } from "@/i18n/config";
import { getDictionary, tServer } from "@/i18n/get-dictionary";

type JobsProps = {
  searchParams: Promise<{ q?: string; page?: string }>;
};

async function pageLocale() {
  const store = await cookies();
  return resolveLocale(readLocaleCookie(store));
}

export async function generateMetadata(): Promise<Metadata> {
  const dict = getDictionary(await pageLocale());
  return { title: tServer(dict, "jobs.title") };
}

export default async function JobsPage({ searchParams }: JobsProps) {
  const { q, page } = await searchParams;
  const locale = await pageLocale();

  // بيانات عامة فقط (status=published ولم تبلغ أجل الإغلاق) — من الخدمة مباشرة
  const { items, total, pages, page: current } = await listPublicVacancies(locale, {
    q,
    page: Number(page ?? "1") || 1,
  });

  return (
    <PublicLegalShell>
      <JobsListView items={items} total={total} pages={pages} page={current} q={q ?? ""} />
    </PublicLegalShell>
  );
}
