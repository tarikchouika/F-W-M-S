"use client";

// HRMP — العطل الرسمية (SPEC §11.5): يدخلها admin سنويًا بتاريخ مؤكد — العطلة = يوم راحة في الإضافي (§11.4)
import { useCallback, useEffect, useState } from "react";
import { CalendarPlus, LoaderCircle, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useI18n } from "@/i18n/provider";
import { apiRequest, ApiError, ListState, PageHeader } from "@/components/hrmp/org-bits";

type HolidayRow = { id: string; localDate: string; name: string };

export function HolidaysManager({ canManage }: { canManage: boolean }) {
  const { t, locale } = useI18n();
  const { toast } = useToast();

  const [year] = useState(() => new Date().getFullYear());
  const [rows, setRows] = useState<HolidayRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [name, setName] = useState("");
  const [localDate, setLocalDate] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const data = await apiRequest<{ holidays: HolidayRow[] }>(`/api/holidays?year=${year}`, { cache: "no-store" });
      setRows(data.holidays);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [year]);

  useEffect(() => {
    void load();
  }, [load]);

  async function addHoliday() {
    if (busy) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(localDate) || name.trim().length < 2) {
      toast({ variant: "destructive", description: t("common.invalidInput") });
      return;
    }
    setBusy(true);
    try {
      await apiRequest("/api/holidays", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ localDate, name: name.trim() }),
      });
      toast({ description: t("holidays.added") });
      setName("");
      setLocalDate("");
      await load();
    } catch (e) {
      if (e instanceof ApiError && e.code === "holiday_exists") {
        toast({ variant: "destructive", description: t("holidays.exists") });
      } else {
        toast({ variant: "destructive", description: t("common.operationFailed") });
      }
    } finally {
      setBusy(false);
    }
  }

  async function removeHoliday(id: string) {
    if (busy) return;
    setBusy(true);
    try {
      await apiRequest(`/api/holidays/${id}`, { method: "DELETE" });
      toast({ description: t("holidays.removed") });
      await load();
    } catch {
      toast({ variant: "destructive", description: t("common.operationFailed") });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t("holidays.title")} subtitle={t("holidays.subtitle", { year })} />

      {canManage && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-1.5 text-base">
              <CalendarPlus className="size-4" aria-hidden />
              {t("holidays.addTitle")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-[1fr_2fr_auto]">
              <div className="space-y-1.5">
                <Label htmlFor="holiday-date">{t("holidays.date")}</Label>
                <Input id="holiday-date" type="date" value={localDate} onChange={(e) => setLocalDate(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="holiday-name">{t("common.name")}</Label>
                <Input id="holiday-name" maxLength={120} value={name} onChange={(e) => setName(e.target.value)} placeholder={t("holidays.namePlaceholder")} />
              </div>
              <div className="flex items-end">
                <Button onClick={() => void addHoliday()} disabled={busy} className="gap-1.5">
                  {busy ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <Plus className="size-4" aria-hidden />}
                  {t("holidays.add")}
                </Button>
              </div>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">{t("holidays.religiousNote")}</p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("holidays.listTitle", { year })}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <ListState loading={loading} error={error} empty={rows.length === 0} onRetry={() => void load()} />
          {!loading && !error && rows.length > 0 && (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("holidays.date")}</TableHead>
                    <TableHead>{t("common.name")}</TableHead>
                    {canManage && <TableHead className="text-end">{t("common.actions")}</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((h) => (
                    <TableRow key={h.id}>
                      <TableCell dir="ltr" className="font-mono text-xs">{h.localDate}</TableCell>
                      <TableCell className="font-semibold">{h.name}</TableCell>
                      {canManage && (
                        <TableCell className="text-end">
                          <Button size="icon" variant="ghost" className="size-7 text-destructive" disabled={busy} onClick={() => void removeHoliday(h.id)} aria-label={t("common.archive")}>
                            <Trash2 className="size-3.5" aria-hidden />
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {!canManage && (
        <Badge variant="secondary">{t("holidays.viewOnly")}</Badge>
      )}
      <p className="sr-only">{locale}</p>
    </div>
  );
}
