"use client";

// HRMP — عرض قائمة الوظائف الشاغرة العامة (طلب المالك 2026-10-24): بحث SSR عبر
// معامل الرابط (نموذج GET بلا جافاسكربت) + بطاقات نظيفة + ترقيم صفحات بروابط.
import Link from "next/link";
import { Briefcase, Building2, FolderKanban, MapPin, CalendarClock, Users, Search, LogIn, UserPlus, ArrowLeft, ArrowRight, Banknote } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { useI18n } from "@/i18n/provider";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/components/hrmp/org-bits";
import type { PublicVacancy } from "@/lib/recruitment/service";

type Props = {
  items: PublicVacancy[];
  total: number;
  page: number;
  pages: number;
  q: string;
};

export function JobsListView({ items, total, page, pages, q }: Props) {
  const { t, locale, dir } = useI18n();
  const ForwardArrow = dir === "rtl" ? ArrowLeft : ArrowRight;
  const pageHref = (p: number) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (p > 1) params.set("page", String(p));
    const qs = params.toString();
    return `/jobs${qs ? `?${qs}` : ""}`;
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* الترويسة */}
      <div className="space-y-2 pt-6 text-center">
        <h1 className="text-balance text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
          {t("jobs.title")}
        </h1>
        <p className="mx-auto max-w-2xl text-pretty text-sm text-muted-foreground sm:text-base">
          {t("jobs.subtitle")}
        </p>
        <div className="hrmp-gold-line mx-auto mt-4 w-24" aria-hidden />
      </div>

      {/* البحث + بوابة الباحثين */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <form action="/jobs" method="get" className="flex w-full max-w-md items-center gap-2" role="search">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              name="q"
              defaultValue={q}
              maxLength={120}
              placeholder={t("jobs.searchPlaceholder")}
              className="ps-9"
              aria-label={t("jobs.searchPlaceholder")}
            />
          </div>
          <Button type="submit" variant="secondary" className="shrink-0 font-semibold">
            {t("jobs.searchCta")}
          </Button>
        </form>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm" className="gap-2 font-medium">
            <Link href="/jobs/login">
              <LogIn className="size-4" aria-hidden />
              <span className="hidden sm:inline">{t("jobs.applyLogin")}</span>
            </Link>
          </Button>
          <Button asChild size="sm" className="gap-2 font-semibold">
            <Link href="/jobs/register">
              <UserPlus className="size-4" aria-hidden />
              <span className="hidden sm:inline">{t("jobs.applyRegister")}</span>
            </Link>
          </Button>
        </div>
      </div>

      {total > 0 && (
        <p className="text-sm font-medium text-muted-foreground" role="status">
          {t("jobs.resultsCount", { count: total })}
        </p>
      )}

      {/* القائمة */}
      {items.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
            <Briefcase className="size-10 text-muted-foreground/60" aria-hidden />
            <p className="text-base font-bold text-foreground">{t("jobs.emptyTitle")}</p>
            <p className="max-w-md text-sm leading-relaxed text-muted-foreground">{t("jobs.emptyDesc")}</p>
          </CardContent>
        </Card>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((v) => (
            <li key={v.id}>
              <Card className="hrmp-card-hover h-full border-border/70">
                <CardContent className="flex h-full flex-col gap-3 p-5">
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="text-base font-bold leading-snug text-card-foreground">{v.title}</h2>
                    <Badge variant="secondary" className="shrink-0 whitespace-nowrap">
                      {t(`jobs.employmentType.${v.employmentType}`)}
                    </Badge>
                  </div>
                  <div className="space-y-1.5 text-sm text-muted-foreground">
                    <p className="flex items-center gap-2">
                      <Building2 className="size-3.5 shrink-0 text-primary" aria-hidden />
                      <span className="truncate">{v.companyName}</span>
                    </p>
                    <p className="flex items-center gap-2">
                      <FolderKanban className="size-3.5 shrink-0 text-primary" aria-hidden />
                      <span className="truncate">{v.projectName}</span>
                    </p>
                    {v.branchCity && (
                      <p className="flex items-center gap-2">
                        <MapPin className="size-3.5 shrink-0 text-primary" aria-hidden />
                        <span className="truncate">{v.branchCity}</span>
                      </p>
                    )}
                  </div>
                  <p className="line-clamp-3 text-sm leading-relaxed text-muted-foreground">{v.description}</p>
                  <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <Users className="size-3.5" aria-hidden />
                      {v.openings === 1 ? t("jobs.openingsOne") : t("jobs.openingsMany", { count: v.openings })}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <CalendarClock className="size-3.5" aria-hidden />
                      {t("jobs.publishedOn", { date: formatDate(v.publishedAt.slice(0, 10), locale) })}
                    </span>
                  </div>
                  {(v.salaryMin != null || v.salaryMax != null) && (
                    <p className="flex items-center gap-1.5 text-xs font-semibold text-primary" dir="ltr">
                      <Banknote className="size-3.5" aria-hidden />
                      {v.salaryMin != null && v.salaryMax != null
                        ? `${formatMoney(v.salaryMin, locale)} — ${formatMoney(v.salaryMax, locale)}`
                        : formatMoney(v.salaryMin ?? v.salaryMax!, locale)}
                    </p>
                  )}
                  <Button asChild variant="secondary" size="sm" className="mt-1 w-full gap-2 font-semibold">
                    <Link href={`/jobs/${v.id}`}>
                      {t("jobs.viewDetails")}
                      <ForwardArrow className="size-4" aria-hidden />
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}

      {/* الترقيم */}
      {pages > 1 && (
        <nav className="flex items-center justify-center gap-2 pt-2" aria-label="pagination">
          {page > 1 && (
            <Button asChild variant="outline" size="sm">
              <Link href={pageHref(page - 1)} rel="prev">
                {dir === "rtl" ? <ArrowRight className="size-4" aria-hidden /> : <ArrowLeft className="size-4" aria-hidden />}
              </Link>
            </Button>
          )}
          {Array.from({ length: pages }, (_, i) => i + 1)
            .filter((p) => Math.abs(p - page) <= 2 || p === 1 || p === pages)
            .map((p, idx, arr) => (
              <span key={p} className="flex items-center gap-2">
                {idx > 0 && p - arr[idx - 1] > 1 && <span className="text-muted-foreground">…</span>}
                <Button asChild variant={p === page ? "default" : "outline"} size="sm" aria-current={p === page ? "page" : undefined}>
                  <Link href={pageHref(p)}>{p}</Link>
                </Button>
              </span>
            ))}
          {page < pages && (
            <Button asChild variant="outline" size="sm">
              <Link href={pageHref(page + 1)} rel="next">
                {dir === "rtl" ? <ArrowLeft className="size-4" aria-hidden /> : <ArrowRight className="size-4" aria-hidden />}
              </Link>
            </Button>
          )}
        </nav>
      )}
    </div>
  );
}
