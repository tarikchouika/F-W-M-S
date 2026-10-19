// FWMS — عارض سجل التدقيق (جولة 2026-10-19): فلاتر + ترقيم + تفاصيل قبل/بعد
"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "@/i18n/provider";
import { PageHeader, apiRequest, apiErrorMessage } from "@/components/fwms/org-bits";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { ChevronLeft, ChevronRight, Filter, RotateCcw, Search } from "lucide-react";

type AuditRow = {
  id: string;
  at: string;
  action: string;
  actor: string;
  actorEmail: string | null;
  company: string | null;
  entity: string | null;
  entityId: string | null;
  reason: string | null;
  ip: string | null;
  beforeJson: string | null;
  afterJson: string | null;
};

type AuditResponse = { total: number; page: number; pageSize: number; pages: number; logs: AuditRow[] };

function pretty(value: string | null): string | null {
  if (!value) return null;
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
}

export function AuditLogViewer({ isSuperAdmin }: { isSuperAdmin: boolean }) {
  const { t, locale } = useI18n();
  const { toast } = useToast();

  const [actionQ, setActionQ] = useState("");
  const [userQ, setUserQ] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<AuditResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: "25" });
      if (actionQ.trim()) params.set("action", actionQ.trim());
      if (userQ.trim()) params.set("user", userQ.trim());
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      const res = await apiRequest<AuditResponse>(`/api/audit?${params.toString()}`);
      setData(res);
    } catch (err) {
      toast({ variant: "destructive", description: apiErrorMessage(t, err) });
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [page, actionQ, userQ, from, to, t, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const fmt = useMemo(
    () => new Intl.DateTimeFormat(locale === "ar" ? "ar-MA" : locale === "fr" ? "fr-MA" : locale === "es" ? "es-MA" : "en-GB", { dateStyle: "short", timeStyle: "medium" }),
    [locale]
  );

  return (
    <div className="space-y-6">
      <PageHeader title={t("audit.title")} subtitle={t("audit.subtitle")} />

      <section className="grid gap-3 rounded-xl border border-border/70 bg-card p-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className="space-y-1.5">
          <Label htmlFor="audit-action">{t("audit.filterAction")}</Label>
          <div className="relative">
            <Search className="absolute start-2.5 top-2.5 size-4 text-muted-foreground" aria-hidden />
            <Input id="audit-action" className="ps-8" value={actionQ} onChange={(e) => { setActionQ(e.target.value); setPage(1); }} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="audit-user">{t("audit.filterUser")}</Label>
          <Input id="audit-user" value={userQ} onChange={(e) => { setUserQ(e.target.value); setPage(1); }} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="audit-from">{t("audit.from")}</Label>
          <Input id="audit-from" type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="audit-to">{t("audit.to")}</Label>
          <Input id="audit-to" type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} />
        </div>
        <div className="flex items-end">
          <Button
            variant="outline"
            onClick={() => { setActionQ(""); setUserQ(""); setFrom(""); setTo(""); setPage(1); }}
          >
            <RotateCcw className="me-1 size-4" aria-hidden />
            {t("audit.clear")}
          </Button>
        </div>
      </section>

      {data ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Filter className="size-4" aria-hidden />
          {t("audit.total", { total: data.total })} · {t("audit.page", { page: data.page, pages: data.pages })}
        </p>
      ) : null}

      <div className="overflow-x-auto rounded-xl border border-border/70">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">{t("audit.colTime")}</TableHead>
              <TableHead className="text-xs">{t("audit.colActor")}</TableHead>
              <TableHead className="text-xs">{t("audit.colAction")}</TableHead>
              <TableHead className="text-xs">{t("audit.colEntity")}</TableHead>
              {isSuperAdmin ? <TableHead className="text-xs">{t("audit.colCompany")}</TableHead> : null}
              <TableHead className="text-xs">{t("audit.colIp")}</TableHead>
              <TableHead className="text-xs" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={isSuperAdmin ? 7 : 6} className="py-10 text-center text-sm text-muted-foreground">…</TableCell>
              </TableRow>
            ) : !data || data.logs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={isSuperAdmin ? 7 : 6} className="py-10 text-center text-sm text-muted-foreground">
                  {t("audit.empty")}
                </TableCell>
              </TableRow>
            ) : (
              data.logs.map((l) => {
                const before = pretty(l.beforeJson);
                const after = pretty(l.afterJson);
                return (
                  <Fragment key={l.id}>
                  <TableRow>
                    <TableCell className="whitespace-nowrap text-xs" dir="ltr">{fmt.format(new Date(l.at))}</TableCell>
                    <TableCell className="text-xs">
                      <span className="font-medium">{l.actor}</span>
                      {l.actorEmail ? <span className="block text-muted-foreground" dir="ltr">{l.actorEmail}</span> : null}
                    </TableCell>
                    <TableCell className="font-mono text-xs" dir="ltr">{l.action}</TableCell>
                    <TableCell className="text-xs">
                      {l.entity ? (
                        <span>
                          {l.entity}
                          {l.entityId ? <span className="block text-muted-foreground" dir="ltr">{l.entityId}</span> : null}
                        </span>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    {isSuperAdmin ? <TableCell className="text-xs">{l.company ?? "—"}</TableCell> : null}
                    <TableCell className="font-mono text-xs" dir="ltr">{l.ip ?? "—"}</TableCell>
                    <TableCell>
                      {before || after ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setExpanded(expanded === l.id ? null : l.id)}
                          aria-expanded={expanded === l.id}
                        >
                          {t("audit.colDetails")}
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground">{t("audit.noDetails")}</span>
                      )}
                    </TableCell>
                    {expanded === l.id ? (
                      <TableRow>
                        <TableCell colSpan={isSuperAdmin ? 7 : 6} className="bg-muted/40">
                          <div className="grid gap-3 md:grid-cols-2">
                            <div>
                              <p className="mb-1 text-xs font-semibold">{t("audit.before")}</p>
                              <pre className="max-h-56 overflow-auto rounded-lg bg-background p-3 text-[11px] leading-5" dir="ltr">
                                {before ?? t("audit.noDetails")}
                              </pre>
                            </div>
                            <div>
                              <p className="mb-1 text-xs font-semibold">{t("audit.after")}</p>
                              <pre className="max-h-56 overflow-auto rounded-lg bg-background p-3 text-[11px] leading-5" dir="ltr">
                                {after ?? t("audit.noDetails")}
                              </pre>
                            </div>
                          </div>
                          {l.reason ? <p className="mt-2 text-xs"><strong>{t("audit.colReason")}:</strong> {l.reason}</p> : null}
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </TableRow>
                  </Fragment>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {data && data.pages > 1 ? (
        <div className="flex items-center justify-center gap-3">
          <Button variant="outline" disabled={data.page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
            <ChevronLeft className="me-1 size-4" aria-hidden />
            {t("audit.prev")}
          </Button>
          <span className="text-sm text-muted-foreground">{t("audit.page", { page: data.page, pages: data.pages })}</span>
          <Button variant="outline" disabled={data.page >= data.pages} onClick={() => setPage((p) => p + 1)}>
            {t("audit.next")}
            <ChevronRight className="ms-1 size-4" aria-hidden />
          </Button>
        </div>
      ) : null}
    </div>
  );
}
