// FWMS — عارض سجل التدقيق (جولة 2026-10-19): فلاتر + ترقيم + تفاصيل قبل/بعد
// (علاج بلاغ المالك 2026-10-23 «خلل ترجمة بعض العبارات»): الإجراءات والكيانات
// كانت تُعرض كمفاتيح خام (report.downloaded / user...) أمام كل اللغات — صارت
// تُترجم من قواميس audit.actions.* وaudit.entities.* مع القيمة التقنية أداةً
// تلميحية، + بطاقات جوال بدل الجدول المعصور (علاج «عدم توافق الهاتف عند تغيير اللغة»).
"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "@/i18n/provider";
import { PageHeader, apiRequest, apiErrorMessage } from "@/components/fwms/org-bits";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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

  /** ترجمة الإجراء من قاموس التدقيق مع سقوط آمن للمفتاح الخام (قيم جديدة غير مفهرسة)
   *  مفاتيح القاموس بشرطات سفلية (auth_login) لأن مفاتيح i18n تُفكّ على النقاط */
  const actionLabel = useCallback(
    (action: string): string => {
      const translated = t(`audit.actions.${action.replace(/\./g, "_")}`);
      return translated.startsWith("audit.actions.") ? action : translated;
    },
    [t]
  );

  /** ترجمة الكيان كذلك */
  const entityLabel = useCallback(
    (entity: string | null): string | null => {
      if (!entity) return null;
      const translated = t(`audit.entities.${entity}`);
      return translated === `audit.entities.${entity}` ? entity : translated;
    },
    [t]
  );

  const detailsCell = (l: AuditRow) => {
    const before = pretty(l.beforeJson);
    const after = pretty(l.afterJson);
    if (!before && !after) {
      return <span className="text-xs text-muted-foreground">{t("audit.noDetails")}</span>;
    }
    return (
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setExpanded(expanded === l.id ? null : l.id)}
        aria-expanded={expanded === l.id}
      >
        {t("audit.colDetails")}
      </Button>
    );
  };

  const expandedRow = (l: AuditRow, colSpan: number) => {
    const before = pretty(l.beforeJson);
    const after = pretty(l.afterJson);
    if (expanded !== l.id) return null;
    return (
      <TableRow>
        <TableCell colSpan={colSpan} className="bg-muted/40">
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
    );
  };

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

      {/* جدول الحواسيب — بطاقات الهاتف أدناه (علاج توافق الجوال مع تغيير اللغة) */}
      <div className="hidden overflow-x-auto rounded-xl border border-border/70 md:block">
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
              data.logs.map((l) => (
                <Fragment key={l.id}>
                  <TableRow>
                    <TableCell className="whitespace-nowrap text-xs" dir="ltr">{fmt.format(new Date(l.at))}</TableCell>
                    <TableCell className="text-xs">
                      <span className="font-medium">{l.actor}</span>
                      {l.actorEmail ? <span className="block text-muted-foreground" dir="ltr">{l.actorEmail}</span> : null}
                    </TableCell>
                    <TableCell className="text-xs">
                      <Badge variant="secondary" className="font-semibold">{actionLabel(l.action)}</Badge>
                    </TableCell>
                    <TableCell className="text-xs">
                      {l.entity ? (
                        <span>
                          {entityLabel(l.entity)}
                          {l.entityId ? <span className="block text-muted-foreground" dir="ltr">{l.entityId}</span> : null}
                        </span>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    {isSuperAdmin ? <TableCell className="text-xs">{l.company ?? "—"}</TableCell> : null}
                    <TableCell className="font-mono text-xs" dir="ltr">{l.ip ?? "—"}</TableCell>
                    <TableCell>{detailsCell(l)}</TableCell>
                  </TableRow>
                  {expandedRow(l, isSuperAdmin ? 7 : 6)}
                </Fragment>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* بطاقات الهاتف: عمود واحد قابل للقراءة بلا تمرير أفقي مهما طالت الترجمات */}
      <div className="space-y-3 md:hidden">
        {loading ? (
          <p className="py-10 text-center text-sm text-muted-foreground">…</p>
        ) : !data || data.logs.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">{t("audit.empty")}</p>
        ) : (
          data.logs.map((l) => {
            const before = pretty(l.beforeJson);
            const after = pretty(l.afterJson);
            const hasDetails = Boolean(before || after);
            return (
              <div key={l.id} className="rounded-xl border border-border/70 bg-card p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary" className="font-semibold">{actionLabel(l.action)}</Badge>
                  {l.entity ? <span className="text-xs text-muted-foreground">· {entityLabel(l.entity)}</span> : null}
                </div>
                <p className="mt-2 text-sm font-medium">{l.actor}</p>
                {l.actorEmail ? <p className="text-xs text-muted-foreground" dir="ltr">{l.actorEmail}</p> : null}
                {isSuperAdmin && l.company ? <p className="mt-1 text-xs text-muted-foreground">{l.company}</p> : null}
                <p className="mt-1 text-xs text-muted-foreground" dir="ltr">{fmt.format(new Date(l.at))}</p>
                {hasDetails ? (
                  <>
                    <Button variant="outline" size="sm" className="mt-2" onClick={() => setExpanded(expanded === l.id ? null : l.id)} aria-expanded={expanded === l.id}>
                      {t("audit.colDetails")}
                    </Button>
                    {expanded === l.id ? (
                      <div className="mt-2 grid gap-3">
                        <div>
                          <p className="mb-1 text-xs font-semibold">{t("audit.before")}</p>
                          <pre className="max-h-56 overflow-auto rounded-lg bg-muted/50 p-3 text-[11px] leading-5" dir="ltr">
                            {before ?? t("audit.noDetails")}
                          </pre>
                        </div>
                        <div>
                          <p className="mb-1 text-xs font-semibold">{t("audit.after")}</p>
                          <pre className="max-h-56 overflow-auto rounded-lg bg-muted/50 p-3 text-[11px] leading-5" dir="ltr">
                            {after ?? t("audit.noDetails")}
                          </pre>
                        </div>
                        {l.reason ? <p className="text-xs"><strong>{t("audit.colReason")}:</strong> {l.reason}</p> : null}
                      </div>
                    ) : null}
                  </>
                ) : (
                  <p className="mt-2 text-xs text-muted-foreground">{t("audit.noDetails")}</p>
                )}
              </div>
            );
          })
        )}
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
