"use client";

// HRMP — مركز الأجور (SPEC §4.3 و§8 — المرحلة 6أ/6ب): الفترات + دورة الاعتماد + حالة توثيق القواعد
// الأدوار: المدير (إنشاء/توليد/إرسال/اعتماد) — المحاسب (عرض + توثيق القواعد) — العامل خارج هذه الصفحة («أجوري»)
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarPlus, Calculator, FileCheck2, LoaderCircle, RefreshCcw, RotateCcw, Send, ShieldCheck, Trophy } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useI18n } from "@/i18n/provider";
import { apiRequest, ApiError, formatDate, ListState, PageHeader } from "@/components/hrmp/org-bits";
import { formatMoney } from "@/lib/money";

type PeriodRow = {
  id: string;
  year: number;
  month: number;
  label: string;
  status: "draft" | "reviewing" | "approved";
  generatedAt: string | null;
  submittedAt: string | null;
  approvedAt: string | null;
  payslipCount: number;
  totalGrossCents: number;
  totalNetCents: number;
  totalEmployerCostCents: number;
  smigBreachedCount: number;
};

const STATUS_KEY: Record<PeriodRow["status"], string> = {
  draft: "payroll.statusDraft",
  reviewing: "payroll.statusReviewing",
  approved: "payroll.statusApproved",
};

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);
const YEARS = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i);

export function PayrollManager({ role, canApprove }: { role: string; canApprove: boolean }) {
  const { t, locale } = useI18n();
  const { toast } = useToast();
  const router = useRouter();

  const [periods, setPeriods] = useState<PeriodRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [unverifiedCount, setUnverifiedCount] = useState<number | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [newYear, setNewYear] = useState(String(new Date().getFullYear()));
  const [newMonth, setNewMonth] = useState(String(new Date().getMonth() + 1).padStart(2, "0"));
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const canVerifyRules = role === "accountant" || role === "super_admin";

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const data = await apiRequest<{ periods: PeriodRow[] }>("/api/pay-periods", { cache: "no-store" });
      setPeriods(data.periods);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
    try {
      const rules = await apiRequest<{ unverifiedCount: number }>("/api/pay-rules", { cache: "no-store" });
      setUnverifiedCount(rules.unverifiedCount);
    } catch {
      setUnverifiedCount(null);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function createPeriod() {
    if (creating) return;
    setCreating(true);
    try {
      await apiRequest("/api/pay-periods", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ year: Number(newYear), month: Number(newMonth) }),
      });
      toast({ description: t("payroll.periodCreated") });
      setCreateOpen(false);
      await load();
    } catch (e) {
      toast({ variant: "destructive", description: periodErrorMessage(e) });
    } finally {
      setCreating(false);
    }
  }

  async function act(period: PeriodRow, action: "generate" | "submit" | "approve" | "reopen") {
    if (busyId) return;
    setBusyId(period.id);
    try {
      const result = await apiRequest<{ created?: number; skipped?: number; payslipCount?: number }>(
        `/api/pay-periods/${period.id}/${action}`,
        { method: "POST" }
      );
      if (action === "generate") {
        toast({ description: t("payroll.generatedOk", { count: result.created ?? 0, skipped: result.skipped ?? 0 }) });
      } else if (action === "submit") {
        toast({ description: t("payroll.submittedOk") });
      } else if (action === "reopen") {
        toast({ description: t("payroll.reopenedOk") });
      } else {
        toast({ description: t("payroll.approvedOk", { count: result.payslipCount ?? 0 }) });
      }
      await load();
    } catch (e) {
      toast({ variant: "destructive", description: periodErrorMessage(e) });
    } finally {
      setBusyId(null);
    }
  }

  async function verifyAllRules() {
    setBusyId("rules");
    try {
      const res = await apiRequest<{ verified: number }>("/api/pay-rules/verify-all", { method: "POST" });
      toast({ description: t("payroll.rulesVerifiedAll", { count: res.verified }) });
      setUnverifiedCount(0);
    } catch (e) {
      toast({ variant: "destructive", description: e instanceof ApiError ? t("common.operationFailed") : t("common.operationFailed") });
    } finally {
      setBusyId(null);
    }
  }

  function periodErrorMessage(e: unknown): string {
    if (e instanceof ApiError) {
      if (e.code === "period_exists") return t("payroll.periodExists");
      if (e.code === "future_period") return t("payroll.futurePeriod");
      if (e.code === "smig_breached") return t("payroll.smigBlocked");
      if (e.code === "unverified_rules") return t("payroll.unverifiedBlocked");
      if (e.code === "regime_needs_confirmation") return t("payroll.regimeNeedsConfirmation");
      if (e.code === "regime_incomplete") return t("payroll.regimeIncomplete");
      if (e.code === "no_payslips") return t("payroll.noPayslips");
      if (e.code === "period_not_draft") return t("payroll.notDraft");
      if (e.code === "period_not_reviewing") return t("payroll.notReviewing");
      if (e.code === "invalid_input") return t("common.invalidInput");
    }
    return t("common.operationFailed");
  }

  const totalNet = periods.reduce((a, p) => a + p.totalNetCents, 0);

  return (
    <div className="space-y-6">
      <PageHeader title={t("payroll.title")} subtitle={t("payroll.subtitle")}>
        <Button variant="outline" size="sm" onClick={() => void load()} className="gap-1.5">
          <RefreshCcw className="size-3.5" aria-hidden />
          {t("common.retry")}
        </Button>
        <Button asChild size="sm" variant="outline" className="gap-1.5">
          <Link href="/dashboard/holidays">
            <CalendarPlus className="size-3.5" aria-hidden />
            {t("payroll.holidaysLink")}
          </Link>
        </Button>
        {canApprove && (
          <>
            <Button asChild size="sm" variant="outline" className="gap-1.5">
              <Link href="/dashboard/payroll/workers">
                <Calculator className="size-3.5" aria-hidden />
                {t("payroll.workersLink")}
              </Link>
            </Button>
            <Button size="sm" className="gap-1.5" onClick={() => setCreateOpen(true)}>
              <CalendarPlus className="size-3.5" aria-hidden />
              {t("payroll.createPeriod")}
            </Button>
          </>
        )}
      </PageHeader>

      {unverifiedCount !== null && unverifiedCount > 0 && (
        <Alert>
          <ShieldCheck className="size-4" aria-hidden />
          <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
            <span>{t("payroll.unverifiedRules", { count: unverifiedCount })}</span>
            {canVerifyRules && (
              <Button size="sm" variant="outline" onClick={() => void verifyAllRules()} disabled={busyId === "rules"} className="gap-1.5">
                {busyId === "rules" ? <LoaderCircle className="size-3.5 animate-spin" aria-hidden /> : <ShieldCheck className="size-3.5" aria-hidden />}
                {t("payroll.verifyAll")}
              </Button>
            )}
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{t("payroll.statPeriods")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums">{periods.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{t("payroll.statApproved")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums">{periods.filter((p) => p.status === "approved").length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{t("payroll.statNetTotal")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums">{formatMoney(totalNet, locale)}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("payroll.periodsTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <ListState loading={loading} error={error} empty={periods.length === 0} onRetry={() => void load()} />
          {!loading && !error && periods.length > 0 && (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("payroll.colPeriod")}</TableHead>
                    <TableHead>{t("common.status")}</TableHead>
                    <TableHead className="text-center">{t("payroll.colPayslips")}</TableHead>
                    <TableHead className="text-end">{t("payroll.colGross")}</TableHead>
                    <TableHead className="text-end">{t("payroll.colNet")}</TableHead>
                    <TableHead className="text-end">{t("payroll.colEmployerCost")}</TableHead>
                    <TableHead className="text-end">{t("common.actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {periods.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-semibold">
                        <Link href={`/dashboard/payroll/${p.id}`} className="hover:underline">
                          {p.label}
                        </Link>
                        {p.smigBreachedCount > 0 && (
                          <Badge variant="destructive" className="ms-2 text-[10px]">{t("payroll.smigBadge")}</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={p.status === "approved" ? "default" : p.status === "reviewing" ? "secondary" : "outline"}
                          className="font-semibold"
                        >
                          {t(STATUS_KEY[p.status])}
                        </Badge>
                        <div className="mt-0.5 text-[11px] text-muted-foreground">
                          {p.status === "approved" && p.approvedAt ? formatDate(p.approvedAt, locale) : p.generatedAt ? t("payroll.generatedOn", { date: formatDate(p.generatedAt, locale) }) : "—"}
                        </div>
                      </TableCell>
                      <TableCell className="text-center tabular-nums">{p.payslipCount}</TableCell>
                      <TableCell className="text-end tabular-nums">{formatMoney(p.totalGrossCents, locale)}</TableCell>
                      <TableCell className="text-end font-semibold tabular-nums">{formatMoney(p.totalNetCents, locale)}</TableCell>
                      <TableCell className="text-end tabular-nums text-muted-foreground">{formatMoney(p.totalEmployerCostCents, locale)}</TableCell>
                      <TableCell className="text-end">
                        <div className="flex flex-wrap justify-end gap-1.5">
                          <Button asChild size="sm" variant="ghost">
                            <Link href={`/dashboard/payroll/${p.id}`}>{t("payroll.viewPeriod")}</Link>
                          </Button>
                          {canApprove && p.status === "draft" && (
                            <Button size="sm" variant="outline" disabled={busyId === p.id} onClick={() => void act(p, "generate")}>
                              {busyId === p.id ? <LoaderCircle className="size-3.5 animate-spin" aria-hidden /> : <RefreshCcw className="size-3.5" aria-hidden />}
                              <span className="ms-1">{t("payroll.generate")}</span>
                            </Button>
                          )}
                          {canApprove && p.status === "draft" && (
                            <Button size="sm" variant="secondary" disabled={busyId === p.id} onClick={() => void act(p, "submit")}>
                              <Send className="size-3.5" aria-hidden />
                              <span className="ms-1">{t("payroll.submit")}</span>
                            </Button>
                          )}
                          {canApprove && p.status === "reviewing" && (
                            <>
                              <Button size="sm" variant="outline" disabled={busyId === p.id} onClick={() => void act(p, "reopen")}>
                                <RotateCcw className="size-3.5" aria-hidden />
                                <span className="ms-1">{t("payroll.reopen")}</span>
                              </Button>
                              <Button size="sm" disabled={busyId === p.id} onClick={() => void act(p, "approve")}>
                                {busyId === p.id ? <LoaderCircle className="size-3.5 animate-spin" aria-hidden /> : <FileCheck2 className="size-3.5" aria-hidden />}
                                <span className="ms-1">{t("payroll.approve")}</span>
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("payroll.createPeriod")}</DialogTitle>
            <DialogDescription>{t("payroll.createPeriodDesc")}</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="period-year">{t("payroll.year")}</Label>
              <Select value={newYear} onValueChange={setNewYear}>
                <SelectTrigger id="period-year" dir="ltr">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {YEARS.map((y) => (
                    <SelectItem key={y} value={String(y)}>{String(y)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="period-month">{t("payroll.month")}</Label>
              <Select value={newMonth} onValueChange={setNewMonth}>
                <SelectTrigger id="period-month" dir="ltr">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MONTHS.map((m) => (
                    <SelectItem key={m} value={String(m).padStart(2, "0")}>{String(m).padStart(2, "0")}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={creating}>{t("common.cancel")}</Button>
            <Button onClick={() => void createPeriod()} disabled={creating}>
              {creating ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <Trophy className="size-4" aria-hidden />}
              <span className="ms-1">{t("payroll.createConfirm")}</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
