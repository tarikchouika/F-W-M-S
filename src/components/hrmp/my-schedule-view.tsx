"use client";

// HRMP — «برنامجي» (المرحلة 3 — SPEC §4.1 و§8): برنامج المستخدم نفسه — عرض فقط
// معيار قبول المرحلة: العامل يرى برنامجه — البيانات من /api/my-schedule (عزله في الخادم حصرًا)
// لا مفاتيح ترجمة جديدة: كل النصوص من mySchedule.* وshifts.* وcommon.* القائمة
import { useCallback, useEffect, useState } from "react";
import { CalendarCheck, CalendarClock, Coffee, LoaderCircle, MapPin, RefreshCcw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useI18n } from "@/i18n/provider";
import { addDaysToLocalDate, minutesToLabel, weekdayOfLocalDate } from "@/lib/scheduling";
import { ListState, PageHeader, apiRequest, formatDate } from "@/components/hrmp/org-bits";

type ScheduleRow = {
  id: string;
  localDate: string;
  startTimeMin: number;
  endTimeMin: number;
  breakMinutes: number;
  status: string;
  source: string;
  notes: string | null;
  site: { id: string; name: string; address: string | null } | null;
  template: { id: string; name: string } | null;
};

const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
const SOURCE_LABEL_KEYS: Record<string, string> = {
  manual: "shifts.sourceManual",
  recurrence: "shifts.sourceRecurrence",
  rotation: "shifts.sourceRotation",
  replacement: "shifts.sourceReplacement", // المرحلة 5: وردية تغطية مُسحوبة كبديل
};

export function MyScheduleView({ today }: { today: string }) {
  const { t, locale } = useI18n();

  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(addDaysToLocalDate(today, 13));
  const [rows, setRows] = useState<ScheduleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const data = await apiRequest<{ shifts: ScheduleRow[] }>(
        `/api/my-schedule?from=${from}&to=${to}`
      );
      setRows(data.shifts);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    void load();
  }, [load]);

  const todayRows = rows.filter((r) => r.localDate === today);
  const nextRows = rows.filter((r) => r.localDate > today);
  const hasRows = rows.length > 0;

  function weekdayLabel(date: string): string {
    return t(`daysShort.${DAY_KEYS[weekdayOfLocalDate(date)]}`);
  }

  function sourceBadge(source: string) {
    const key = SOURCE_LABEL_KEYS[source];
    return key ? <Badge variant="outline" className="font-medium">{t(key)}</Badge> : null;
  }

  return (
    <div className="flex w-full flex-col gap-6">
      <PageHeader title={t("mySchedule.title")} subtitle={t("mySchedule.subtitle")} />

      {/* الفترة الزمنية */}
      <Card>
        <CardContent className="flex flex-wrap items-end gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="my-schedule-from">{t("shifts.from")}</Label>
            <Input
              id="my-schedule-from"
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="w-44"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="my-schedule-to">{t("shifts.to")}</Label>
            <Input
              id="my-schedule-to"
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="w-44"
            />
          </div>
          <Button variant="outline" onClick={() => void load()} disabled={loading} className="gap-1.5">
            {loading ? (
              <LoaderCircle className="size-4 animate-spin" aria-hidden />
            ) : (
              <RefreshCcw className="size-4" aria-hidden />
            )}
            {t("common.retry")}
          </Button>
          <span className="ms-auto self-center text-xs text-muted-foreground">
            {t("mySchedule.range")}: <span dir="ltr">{from} → {to}</span>
          </span>
        </CardContent>
      </Card>

      <ListState loading={loading} error={error} empty={!hasRows && !loading} onRetry={load} />
      {!hasRows && !loading && !error && (
        <p className="py-6 text-center text-sm text-muted-foreground">{t("mySchedule.empty")}</p>
      )}

      {/* وردية اليوم */}
      {hasRows && (
        <Card className="border-primary/30">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarCheck className="size-4 text-primary" aria-hidden />
              {t("mySchedule.todayShift")}
              <span className="text-xs font-normal text-muted-foreground">
                {t("mySchedule.today")} — {weekdayLabel(today)} {formatDate(today, locale)}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {todayRows.length === 0 ? (
              <p className="py-2 text-sm text-muted-foreground">{t("mySchedule.empty")}</p>
            ) : (
              <div className="flex flex-col gap-3">
                {todayRows.map((row) => (
                  <div
                    key={row.id}
                    className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border bg-muted/30 px-4 py-3"
                  >
                    <span className="text-lg font-bold tracking-tight" dir="ltr">
                      {minutesToLabel(row.startTimeMin)} – {minutesToLabel(row.endTimeMin)}
                    </span>
                    <span className="flex items-center gap-1.5 text-sm">
                      <MapPin className="size-4 text-muted-foreground" aria-hidden />
                      {t("mySchedule.atSite")} {row.site?.name ?? "—"}
                      {row.site?.address ? (
                        <span className="text-muted-foreground">({row.site.address})</span>
                      ) : null}
                    </span>
                    {row.template && <Badge variant="secondary">{row.template.name}</Badge>}
                    {row.breakMinutes > 0 && (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Coffee className="size-3.5" aria-hidden />
                        {t("mySchedule.breakLabel")}: {row.breakMinutes} {t("mySchedule.minutes")}
                      </span>
                    )}
                    {sourceBadge(row.source)}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* الورديات القادمة */}
      {hasRows && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarClock className="size-4 text-primary" aria-hidden />
              {t("mySchedule.nextShifts")}
              <Badge variant="secondary" className="font-semibold">{nextRows.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {nextRows.length === 0 ? (
              <p className="py-2 text-sm text-muted-foreground">{t("mySchedule.empty")}</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("shifts.date")}</TableHead>
                    <TableHead>{t("shifts.time")}</TableHead>
                    <TableHead>{t("shifts.site")}</TableHead>
                    <TableHead>{t("shifts.template")}</TableHead>
                    <TableHead>{t("shifts.source")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {nextRows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="whitespace-nowrap font-medium">
                        {weekdayLabel(row.localDate)} {formatDate(row.localDate, locale)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap" dir="ltr">
                        {minutesToLabel(row.startTimeMin)} – {minutesToLabel(row.endTimeMin)}
                        {row.breakMinutes > 0 && (
                          <span className="block text-xs text-muted-foreground">
                            {t("mySchedule.breakLabel")}: {row.breakMinutes} {t("mySchedule.minutes")}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        {row.site?.name ?? "—"}
                        {row.site?.address ? (
                          <span className="block text-xs text-muted-foreground">{row.site.address}</span>
                        ) : null}
                      </TableCell>
                      <TableCell>{row.template?.name ?? t("templates.noTemplate")}</TableCell>
                      <TableCell>{sourceBadge(row.source)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
