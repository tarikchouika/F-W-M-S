"use client";

// HRMP — إعدادات أجور العمال (SPEC §4.3 أنظمة الاحتساب الثلاثة + §11.6 الأعباء العائلية والنقل)
import { useCallback, useEffect, useState } from "react";
import { LoaderCircle, Pencil, RefreshCcw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useI18n } from "@/i18n/provider";
import { apiRequest, ApiError, ListState, PageHeader } from "@/components/hrmp/org-bits";
import { formatMoney } from "@/lib/money";

type WorkerRow = {
  userId: string;
  fullName: string;
  email: string;
  profile: {
    payType: "hourly" | "daily" | "monthly";
    hourlyRateCents: number | null;
    dailyRateCents: number | null;
    monthlyCents: number | null;
    transportZone: "urban" | "outside";
    dependentsCount: number;
    hireDate: string | null;
    notes: string | null;
    status: string;
  } | null;
};

const PAY_TYPE_KEY: Record<string, string> = {
  hourly: "payroll.payTypeHourly",
  daily: "payroll.payTypeDaily",
  monthly: "payroll.payTypeMonthly",
};

export function WorkerPaySettings() {
  const { t, locale } = useI18n();
  const { toast } = useToast();

  const [workers, setWorkers] = useState<WorkerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<WorkerRow | null>(null);
  const [payType, setPayType] = useState("hourly");
  const [rate, setRate] = useState("");
  const [zone, setZone] = useState("urban");
  const [dependents, setDependents] = useState("0");
  const [hireDate, setHireDate] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const data = await apiRequest<{ workers: WorkerRow[] }>("/api/payroll/workers", { cache: "no-store" });
      setWorkers(data.workers);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function openEdit(w: WorkerRow) {
    setEditing(w);
    const p = w.profile;
    setPayType(p?.payType ?? "hourly");
    setRate(
      p
        ? p.payType === "hourly"
          ? p.hourlyRateCents ? (p.hourlyRateCents / 100).toString() : ""
          : p.payType === "daily"
            ? p.dailyRateCents ? (p.dailyRateCents / 100).toString() : ""
            : p.monthlyCents ? (p.monthlyCents / 100).toString() : ""
        : ""
    );
    setZone(p?.transportZone ?? "urban");
    setDependents(String(p?.dependentsCount ?? 0));
    setHireDate(p?.hireDate ?? "");
    setEditOpen(true);
  }

  async function save() {
    if (!editing || busy) return;
    const rateNum = Number(rate);
    if (!Number.isFinite(rateNum) || rateNum <= 0) {
      toast({ variant: "destructive", description: t("common.invalidInput") });
      return;
    }
    setBusy(true);
    try {
      await apiRequest("/api/payroll/workers", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          userId: editing.userId,
          payType,
          hourlyRateCents: payType === "hourly" ? Math.round(rateNum * 100) : null,
          dailyRateCents: payType === "daily" ? Math.round(rateNum * 100) : null,
          monthlyCents: payType === "monthly" ? Math.round(rateNum * 100) : null,
          transportZone: zone,
          dependentsCount: Math.max(0, Math.min(30, Number(dependents) || 0)),
          ...(hireDate ? { hireDate } : {}),
        }),
      });
      toast({ description: t("payroll.workerSaved") });
      setEditOpen(false);
      await load();
    } catch (e) {
      if (e instanceof ApiError && (e.code === "invalid_reference" || e.code === "missing_rate_for_pay_type")) {
        toast({ variant: "destructive", description: t("common.invalidInput") });
      } else {
        toast({ variant: "destructive", description: t("common.operationFailed") });
      }
    } finally {
      setBusy(false);
    }
  }

  const money = (c: number | null) => (c === null ? "—" : formatMoney(c, locale));

  return (
    <div className="space-y-6">
      <PageHeader title={t("payroll.workersTitle")} subtitle={t("payroll.workersSubtitle")}>
        <Button size="sm" variant="outline" onClick={() => void load()} className="gap-1.5">
          <RefreshCcw className="size-3.5" aria-hidden />
          {t("common.retry")}
        </Button>
      </PageHeader>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("payroll.workersListTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <ListState loading={loading} error={error} empty={workers.length === 0} onRetry={() => void load()} />
          {!loading && !error && workers.length > 0 && (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("payroll.colWorker")}</TableHead>
                    <TableHead>{t("payroll.colPayType")}</TableHead>
                    <TableHead className="text-end">{t("payroll.colRate")}</TableHead>
                    <TableHead className="text-center">{t("payroll.colDependents")}</TableHead>
                    <TableHead>{t("payroll.colZone")}</TableHead>
                    <TableHead className="text-end">{t("common.actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {workers.map((w) => (
                    <TableRow key={w.userId}>
                      <TableCell>
                        <div className="font-semibold">{w.fullName}</div>
                        <div className="text-[11px] text-muted-foreground" dir="ltr">{w.email}</div>
                      </TableCell>
                      <TableCell>
                        {w.profile ? (
                          <Badge variant="outline">{t(PAY_TYPE_KEY[w.profile.payType])}</Badge>
                        ) : (
                          <Badge variant="destructive" className="text-[10px]">{t("payroll.noProfile")}</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-end tabular-nums">
                        {w.profile
                          ? w.profile.payType === "hourly"
                            ? `${money(w.profile.hourlyRateCents)} / ${t("payroll.perHour")}`
                            : w.profile.payType === "daily"
                              ? `${money(w.profile.dailyRateCents)} / ${t("payroll.perDay")}`
                              : `${money(w.profile.monthlyCents)} / ${t("payroll.perMonth")}`
                          : "—"}
                      </TableCell>
                      <TableCell className="text-center tabular-nums">{w.profile?.dependentsCount ?? 0}</TableCell>
                      <TableCell>{t(w.profile?.transportZone === "outside" ? "payroll.zoneOutside" : "payroll.zoneUrban")}</TableCell>
                      <TableCell className="text-end">
                        <Button size="sm" variant="outline" onClick={() => openEdit(w)} className="gap-1.5">
                          <Pencil className="size-3.5" aria-hidden />
                          {t("common.edit")}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing?.fullName}</DialogTitle>
            <DialogDescription>{t("payroll.workerEditDesc")}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="wp-type">{t("payroll.colPayType")}</Label>
                <Select value={payType} onValueChange={setPayType}>
                  <SelectTrigger id="wp-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="hourly">{t("payroll.payTypeHourly")}</SelectItem>
                    <SelectItem value="daily">{t("payroll.payTypeDaily")}</SelectItem>
                    <SelectItem value="monthly">{t("payroll.payTypeMonthly")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="wp-rate">{t("payroll.rateLabel")}</Label>
                <Input id="wp-rate" type="number" inputMode="decimal" min="0" step="0.01" dir="ltr" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="0.00" />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="wp-zone">{t("payroll.colZone")}</Label>
                <Select value={zone} onValueChange={setZone}>
                  <SelectTrigger id="wp-zone">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="urban">{t("payroll.zoneUrban")}</SelectItem>
                    <SelectItem value="outside">{t("payroll.zoneOutside")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="wp-dep">{t("payroll.colDependents")}</Label>
                <Input id="wp-dep" type="number" inputMode="numeric" min="0" max="30" dir="ltr" value={dependents} onChange={(e) => setDependents(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="wp-hire">{t("payroll.hireDate")}</Label>
                <Input id="wp-hire" type="date" value={hireDate} onChange={(e) => setHireDate(e.target.value)} />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">{t("payroll.smigHint")}</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)} disabled={busy}>{t("common.cancel")}</Button>
            <Button onClick={() => void save()} disabled={busy}>
              {busy && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
              <span className="ms-1">{t("common.save")}</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
