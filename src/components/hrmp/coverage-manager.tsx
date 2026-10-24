"use client";

// HRMP — مدير التغطية السريعة (المرحلة 5 — SPEC §4.1 و§8)
// معيار القبول: «البديل يصله الإشعار ويظهر الموقع في برنامجه» — هنا الجزء الأول: سحب البديل
import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeftRight,
  CalendarClock,
  LoaderCircle,
  MapPin,
  RefreshCcw,
  UserCheck,
  UserX,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { useI18n } from "@/i18n/provider";
import { formatDate } from "@/components/hrmp/org-bits";

type ShiftRow = {
  id: string;
  localDate: string;
  startLabel: string;
  endLabel: string;
  breakMinutes: number;
  status: string;
  source: string;
  worker: { id: string; fullName: string } | null;
  site: { id: string; name: string };
  template: { id: string; name: string } | null;
  attendance: "checked_in" | "checked_out" | "pending_review" | "no_events";
  absentLikely: boolean;
  replaceable: boolean;
};

type AvailableWorker = {
  userId: string;
  fullName: string;
  email: string;
  sameDayShifts: { startLabel: string; endLabel: string; siteName: string }[];
  conflict: { startLabel: string; endLabel: string; siteName: string } | null;
};

const ATT_LABEL: Record<ShiftRow["attendance"], string> = {
  checked_in: "attIn",
  checked_out: "attOut",
  pending_review: "attPending",
  no_events: "attNone",
};

export function CoverageManager({ today }: { today: string }) {
  const { t, locale } = useI18n();
  const { toast } = useToast();

  const [date, setDate] = useState(today);
  const [rows, setRows] = useState<ShiftRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  // حوار السحب
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogShift, setDialogShift] = useState<ShiftRow | null>(null);
  const [available, setAvailable] = useState<AvailableWorker[]>([]);
  const [availableLoading, setAvailableLoading] = useState(false);
  const [selectedWorker, setSelectedWorker] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch(`/api/coverage?date=${date}`, { cache: "no-store" });
      if (!res.ok) throw new Error("load failed");
      const data = (await res.json()) as { shifts: ShiftRow[] };
      setRows(data.shifts);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    void load();
  }, [load]);

  async function openDialog(shift: ShiftRow) {
    setDialogShift(shift);
    setSelectedWorker("");
    setReason("");
    setDialogOpen(true);
    setAvailableLoading(true);
    setAvailable([]);
    try {
      const res = await fetch(`/api/coverage/available?shiftId=${shift.id}`, { cache: "no-store" });
      if (!res.ok) throw new Error("available failed");
      const data = (await res.json()) as { workers: AvailableWorker[] };
      setAvailable(data.workers);
    } catch {
      toast({ variant: "destructive", description: t("coverage.availableLoadError") });
    } finally {
      setAvailableLoading(false);
    }
  }

  async function confirmReplace() {
    if (!dialogShift || !selectedWorker) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/coverage/replace", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          shiftId: dialogShift.id,
          replacementUserId: selectedWorker,
          reason: reason || undefined,
        }),
      });
      if (res.status === 409) {
        toast({ variant: "destructive", description: t("coverage.conflictRejected") });
        return;
      }
      if (!res.ok) {
        toast({ variant: "destructive", description: t("coverage.replaceError") });
        return;
      }
      toast({ description: t("coverage.replaced") });
      setDialogOpen(false);
      await load();
    } catch {
      toast({ variant: "destructive", description: t("coverage.replaceError") });
    } finally {
      setSubmitting(false);
    }
  }

  const absentCount = rows.filter((r) => r.absentLikely).length;
  const presentCount = rows.filter(
    (r) => r.attendance === "checked_in" || r.attendance === "checked_out",
  ).length;

  return (
    <div className="flex w-full flex-col gap-6">
      {/* الفلاتر والإحصاءات */}
      <Card>
        <CardContent className="flex flex-wrap items-end gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="coverage-date">{t("coverage.date")}</Label>
            <Input
              id="coverage-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
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
          <div className="ms-auto flex flex-wrap items-center gap-3 self-center">
            <Badge variant="secondary" className="gap-1.5 font-semibold">
              <CalendarClock className="size-3.5" aria-hidden />
              {rows.length} {t("coverage.totalShifts")}
            </Badge>
            <Badge variant="secondary" className="gap-1.5 font-semibold">
              <UserCheck className="size-3.5" aria-hidden />
              {presentCount} {t("coverage.present")}
            </Badge>
            <Badge variant="destructive" className="gap-1.5 font-semibold">
              <UserX className="size-3.5" aria-hidden />
              {absentCount} {t("coverage.absent")}
            </Badge>
          </div>
        </CardContent>
      </Card>

      {loading && <p className="py-6 text-center text-sm text-muted-foreground">{t("common.loading")}</p>}
      {error && (
        <p className="py-6 text-center text-sm text-destructive">{t("common.error")}</p>
      )}
      {!loading && !error && rows.length === 0 && (
        <p className="py-6 text-center text-sm text-muted-foreground">{t("coverage.empty")}</p>
      )}

      {/* لوحة الورديات */}
      {!loading && !error && rows.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <ArrowLeftRight className="size-4 text-primary" aria-hidden />
              {t("coverage.boardTitle")}
              <span className="text-xs font-normal text-muted-foreground">
                {formatDate(date, locale)}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-3">
              {rows.map((row) => (
                <li
                  key={row.id}
                  className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-lg border bg-muted/30 px-4 py-3"
                >
                  <span className="text-lg font-bold tracking-tight" dir="ltr">
                    {row.startLabel} – {row.endLabel}
                  </span>
                  <span className="flex items-center gap-1.5 text-sm">
                    <MapPin className="size-4 text-muted-foreground" aria-hidden />
                    {row.site.name}
                  </span>
                  <span className="text-sm font-medium">{row.worker?.fullName ?? "—"}</span>
                  {row.template && <Badge variant="secondary">{row.template.name}</Badge>}

                  {/* حالة الحضور */}
                  <Badge
                    variant={
                      row.attendance === "checked_in" || row.attendance === "checked_out"
                        ? "default"
                        : row.absentLikely
                          ? "destructive"
                          : "outline"
                    }
                    className="font-medium"
                  >
                    {t(`coverage.${ATT_LABEL[row.attendance]}`)}
                  </Badge>
                  {row.absentLikely && (
                    <span className="text-xs font-semibold text-destructive">
                      {t("coverage.absentLikely")}
                    </span>
                  )}

                  <Button
                    size="sm"
                    className="ms-auto gap-1.5"
                    onClick={() => void openDialog(row)}
                    disabled={!row.replaceable}
                  >
                    <ArrowLeftRight className="size-3.5" aria-hidden />
                    {t("coverage.replaceAction")}
                  </Button>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* حوار سحب البديل */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("coverage.replaceTitle")}</DialogTitle>
            <DialogDescription>
              {dialogShift
                ? `${t("coverage.replaceFor")} ${dialogShift.site.name} — ${t("coverage.replaceWindow")} ${dialogShift.startLabel}–${dialogShift.endLabel} (${dialogShift.worker?.fullName ?? "—"})`
                : ""}
            </DialogDescription>
          </DialogHeader>

          {availableLoading ? (
            <p className="py-6 text-center text-sm text-muted-foreground">{t("common.loading")}</p>
          ) : available.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {t("coverage.noAvailable")}
            </p>
          ) : (
            <RadioGroup value={selectedWorker} onValueChange={setSelectedWorker} className="gap-0">
              <ScrollArea className="max-h-72 rounded-md border">
                <ul className="divide-y divide-border/60">
                  {available.map((w) => (
                    <li key={w.userId} className="px-3 py-2.5">
                      <label
                        htmlFor={`worker-${w.userId}`}
                        className="flex cursor-pointer flex-col gap-1"
                      >
                        <span className="flex items-center gap-2.5">
                          <RadioGroupItem value={w.userId} id={`worker-${w.userId}`} />
                          <span className="text-sm font-semibold">{w.fullName}</span>
                          <span className="text-xs text-muted-foreground" dir="ltr">
                            {w.email}
                          </span>
                        </span>
                        <span className="ps-7 text-xs text-muted-foreground">
                          {w.sameDayShifts.length === 0
                            ? t("coverage.freeAllDay")
                            : `${t("coverage.sameDayShifts")}: ${w.sameDayShifts
                                .map((s) => `${s.startLabel}–${s.endLabel} (${s.siteName})`)
                                .join(" · ")}`}
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              </ScrollArea>
            </RadioGroup>
          )}

          <Separator />
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="coverage-reason">{t("coverage.reason")}</Label>
            <Input
              id="coverage-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t("coverage.reasonPlaceholder")}
              maxLength={240}
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              onClick={() => void confirmReplace()}
              disabled={!selectedWorker || submitting}
              className="gap-1.5"
            >
              {submitting && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
              {t("coverage.confirmReplace")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
