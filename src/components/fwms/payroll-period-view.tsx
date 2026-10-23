"use client";

// FWMS — تفاصيل فترة أجور (SPEC §4.3 — المرحلة 6أ/6ب): جدول الكشوف + حوار الكشف بالبنود
// + البنود اليدوية (مكافأة/بدل نقل/وجبات/خصم) على المسودة وقيد المراجعة + التفصيل اليومي
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, BadgeCheck, CalendarClock, FileDown, LoaderCircle, Plus, RefreshCcw, Trash2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useI18n } from "@/i18n/provider";
import { apiRequest, ApiError, ListState, PageHeader } from "@/components/fwms/org-bits";
// (بلاغ المالك 2026-10-24 «لا أستطيع تحرير أو تصدير أو تحميل بعض الوثائق مثل ملخص الأجور"):
// تسليم الملف عبر الجسر الأصلي — <a download> على روابط blob لا يعمل داخل WebView
// أندرويد (لا DownloadListener في الغلاف) فيبدو التصدير معطوبًا في التطبيق.
import { deliverFile } from "@/lib/native-bridge";
import { formatMoney } from "@/lib/money";

type PeriodDetail = {
  period: { id: string; year: number; month: number; label: string; status: "draft" | "reviewing" | "approved" };
  payslips: PayslipRow[];
  totals: {
    payslipCount: number;
    grossCents: number;
    cnssEmployeeCents: number;
    amoEmployeeCents: number;
    irNetCents: number;
    netCents: number;
    employerCostCents: number;
    totalCostCents: number;
  };
  warnings: { unverifiedRuleKeys: string[]; missingProfiles: number; smigBreachedCount: number };
};

type PayslipRow = {
  id: string;
  refNumber: string;
  worker: { id: string; fullName: string } | null;
  workedMinutes: number;
  overtimeMinutes: number;
  workedDays: number;
  grossCents: number;
  cnssEmployeeCents: number;
  amoEmployeeCents: number;
  irNetCents: number;
  netCents: number;
  employerCostCents: number;
  totalCostCents: number;
  smigBreached: boolean;
  warnings: string[];
};

type PayslipLine = {
  id: string;
  kind: string;
  minutes: number | null;
  rateBp: number | null;
  amountCents: number;
  exemptIrCents: number;
  exemptCnssCents: number;
  reason: string | null;
  isManual: boolean;
};

type DailyRow = { date: string; minutes: number; dayKind: "normal" | "rest" | "holiday"; otMinutes: number };

type PayslipDetail = {
  id: string;
  refNumber: string;
  period: { id: string; label: string; status: string };
  worker: { id: string; fullName: string } | null;
  workedMinutes: number;
  breakMinutes: number;
  overtimeMinutes: number;
  workedDays: number;
  grossCents: number;
  sbiCents: number;
  cnssBaseCents: number;
  cnssEmployeeCents: number;
  amoEmployeeCents: number;
  proDeductionCents: number;
  rniCents: number;
  irGrossCents: number;
  familyDeductionCents: number;
  irNetCents: number;
  netCents: number;
  employerCostCents: number;
  totalCostCents: number;
  smigBreached: boolean;
  warnings: string[];
  lines: PayslipLine[];
  daily: DailyRow[];
};

const LINE_KIND_KEY: Record<string, string> = {
  base_hours: "payroll.lineBaseHours",
  base_days: "payroll.lineBaseDays",
  base_monthly: "payroll.lineBaseMonthly",
  absence_deduction: "payroll.lineAbsence",
  ot_day_normal: "payroll.lineOtDayNormal",
  ot_night_normal: "payroll.lineOtNightNormal",
  ot_day_rest: "payroll.lineOtDayRest",
  ot_night_rest: "payroll.lineOtNightRest",
  bonus: "payroll.lineBonus",
  allowance_transport: "payroll.lineTransport",
  allowance_meals: "payroll.lineMeals",
  deduction: "payroll.lineDeduction",
  cnss_employee_short: "payroll.lineCnssShort",
  cnss_employee_long: "payroll.lineCnssLong",
  amo_employee: "payroll.lineAmo",
  pro_deduction: "payroll.linePro",
  ir_gross: "payroll.lineIr",
  family_deduction: "payroll.lineFamily",
  employer_prest_short: "payroll.lineEmpPrestShort",
  employer_prest_long: "payroll.lineEmpPrestLong",
  employer_family: "payroll.lineEmpFamily",
  employer_amo: "payroll.lineEmpAmo",
  employer_tfp: "payroll.lineEmpTfp",
};

const ADJ_KINDS = [
  { value: "bonus", key: "payroll.adjBonus" },
  { value: "allowance_transport", key: "payroll.adjTransport" },
  { value: "allowance_meals", key: "payroll.adjMeals" },
  { value: "deduction", key: "payroll.adjDeduction" },
] as const;

function hoursLabel(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}:${String(m).padStart(2, "0")}`;
}

export function PayrollPeriodView({ periodId, canApprove }: { periodId: string; canApprove: boolean }) {
  const { t, locale } = useI18n();
  const { toast } = useToast();

  const [detail, setDetail] = useState<PeriodDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const [payslipOpen, setPayslipOpen] = useState(false);
  const [payslip, setPayslip] = useState<PayslipDetail | null>(null);
  const [payslipLoading, setPayslipLoading] = useState(false);

  const [adjKind, setAdjKind] = useState<string>("bonus");
  const [adjAmount, setAdjAmount] = useState("");
  const [adjReason, setAdjReason] = useState("");
  const [adjBusy, setAdjBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      setDetail(await apiRequest<PeriodDetail>(`/api/pay-periods/${periodId}`, { cache: "no-store" }));
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [periodId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function openPayslip(id: string) {
    setPayslipOpen(true);
    setPayslip(null);
    setPayslipLoading(true);
    setAdjKind("bonus");
    setAdjAmount("");
    setAdjReason("");
    try {
      setPayslip(await apiRequest<PayslipDetail>(`/api/payslips/${id}`, { cache: "no-store" }));
    } catch {
      toast({ variant: "destructive", description: t("common.operationFailed") });
      setPayslipOpen(false);
    } finally {
      setPayslipLoading(false);
    }
  }

  async function reloadPayslip(id: string) {
    try {
      setPayslip(await apiRequest<PayslipDetail>(`/api/payslips/${id}`, { cache: "no-store" }));
      await load();
    } catch {
      toast({ variant: "destructive", description: t("common.operationFailed") });
    }
  }

  async function addAdjustment() {
    if (!payslip || adjBusy) return;
    const amount = Number(adjAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast({ variant: "destructive", description: t("common.invalidInput") });
      return;
    }
    setAdjBusy(true);
    try {
      await apiRequest(`/api/payslips/${payslip.id}/adjustments`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind: adjKind,
          amountCents: Math.round(amount * 100),
          reason: adjReason.trim() || t("payroll.adjDefaultReason"),
        }),
      });
      toast({ description: t("payroll.adjustmentAdded") });
      setAdjAmount("");
      setAdjReason("");
      await reloadPayslip(payslip.id);
    } catch (e) {
      if (e instanceof ApiError && e.code === "payslip_locked") {
        toast({ variant: "destructive", description: t("payroll.lockedError") });
      } else {
        toast({ variant: "destructive", description: t("common.operationFailed") });
      }
    } finally {
      setAdjBusy(false);
    }
  }

  async function removeAdjustment(lineId: string) {
    if (!payslip || adjBusy) return;
    setAdjBusy(true);
    try {
      await apiRequest(`/api/payslips/${payslip.id}/adjustments?lineId=${lineId}`, { method: "DELETE" });
      toast({ description: t("payroll.adjustmentRemoved") });
      await reloadPayslip(payslip.id);
    } catch (e) {
      if (e instanceof ApiError && e.code === "payslip_locked") {
        toast({ variant: "destructive", description: t("payroll.lockedError") });
      } else {
        toast({ variant: "destructive", description: t("common.operationFailed") });
      }
    } finally {
      setAdjBusy(false);
    }
  }

  const editable = detail ? detail.period.status !== "approved" : false;
  const money = (c: number) => formatMoney(c, locale);

  // المرحلة 7: تصدير ملخص أجور الفترة (PDF/DOCX) بلغة المستخدم — عن الفترات المعتمدة فقط
  const [summaryExporting, setSummaryExporting] = useState<string | null>(null);
  async function exportSummary(format: string) {
    if (!detail) return;
    setSummaryExporting(format);
    try {
      const res = await apiRequest<{ downloadUrl: string; fileName: string }>("/api/reports/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "payroll_summary", targetId: detail.period.id, format, language: locale }),
      });
      const file = await fetch(res.downloadUrl, { cache: "no-store" });
      if (!file.ok) throw new Error("download_failed");
      // الجسر الأصلي داخل تطبيق أندرويد (مشاركة النظام) — وتنزيل عادي في المتصفح
      await deliverFile(await file.blob(), res.fileName);
      toast({ description: t("reports.exportOk") });
    } catch {
      toast({ variant: "destructive", description: t("reports.exportFailed") });
    } finally {
      setSummaryExporting(null);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title={`${t("payroll.periodDetail")} — ${detail?.period.label ?? ""}`} subtitle={t("payroll.periodDetailSubtitle")}>
        <Button asChild size="sm" variant="ghost" className="gap-1.5">
          <Link href="/dashboard/payroll">
            <ArrowRight className="size-3.5 rtl:rotate-180" aria-hidden />
            {t("payroll.backToPeriods")}
          </Link>
        </Button>
        <Button size="sm" variant="outline" onClick={() => void load()} className="gap-1.5">
          <RefreshCcw className="size-3.5" aria-hidden />
          {t("common.retry")}
        </Button>
        {detail?.period.status === "approved" && (["pdf", "docx"] as const).map((f) => (
          <Button key={f} size="sm" variant="outline" disabled={summaryExporting !== null} onClick={() => void exportSummary(f)} className="gap-1.5">
            {summaryExporting === f ? <LoaderCircle className="size-3.5 animate-spin" aria-hidden /> : <FileDown className="size-3.5" aria-hidden />}
            {t("reports.export")} {f.toUpperCase()}
          </Button>
        ))}
      </PageHeader>

      <ListState loading={loading} error={error} empty={!loading && !error && !detail} onRetry={() => void load()} />

      {detail && (
        <>
          {detail.warnings.smigBreachedCount > 0 && (
            <Alert variant="destructive">
              <AlertDescription>{t("payroll.smigWarning", { count: detail.warnings.smigBreachedCount })}</AlertDescription>
            </Alert>
          )}
          {detail.warnings.missingProfiles > 0 && (
            <Alert>
              <AlertDescription>{t("payroll.missingProfiles", { count: detail.warnings.missingProfiles })}</AlertDescription>
            </Alert>
          )}
          {detail.warnings.unverifiedRuleKeys.length > 0 && (
            <Alert>
              <AlertDescription>
                {t("payroll.unverifiedRules", { count: detail.warnings.unverifiedRuleKeys.length })}
                <span dir="ltr" className="mt-1 block text-[11px] opacity-70">{detail.warnings.unverifiedRuleKeys.join(" · ")}</span>
              </AlertDescription>
            </Alert>
          )}

          <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
            {[
              { label: t("payroll.totGross"), value: money(detail.totals.grossCents) },
              { label: t("payroll.totCnss"), value: money(detail.totals.cnssEmployeeCents) },
              { label: t("payroll.totAmo"), value: money(detail.totals.amoEmployeeCents) },
              { label: t("payroll.totIr"), value: money(detail.totals.irNetCents) },
              { label: t("payroll.totNet"), value: money(detail.totals.netCents), strong: true },
              { label: t("payroll.totEmployer"), value: money(detail.totals.employerCostCents) },
            ].map((s) => (
              <Card key={s.label}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-medium text-muted-foreground">{s.label}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className={`text-lg font-bold tabular-nums ${s.strong ? "text-primary" : ""}`}>{s.value}</div>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {t("payroll.payslipsTitle")}
                <Badge variant="secondary" className="ms-2">{t(STATUS_BADGE[detail.period.status])}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {detail.payslips.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">{t("payroll.noPayslipsYet")}</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("payroll.colRef")}</TableHead>
                        <TableHead>{t("payroll.colWorker")}</TableHead>
                        <TableHead className="text-center">{t("payroll.colHours")}</TableHead>
                        <TableHead className="text-center">{t("payroll.colOt")}</TableHead>
                        <TableHead className="text-end">{t("payroll.colGross")}</TableHead>
                        <TableHead className="text-end">{t("payroll.colDeductions")}</TableHead>
                        <TableHead className="text-end">{t("payroll.colNet")}</TableHead>
                        <TableHead className="text-end">{t("common.actions")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {detail.payslips.map((ps) => (
                        <TableRow key={ps.id}>
                          <TableCell dir="ltr" className="font-mono text-xs">{ps.refNumber}</TableCell>
                          <TableCell className="font-semibold">
                            {ps.worker?.fullName ?? "—"}
                            {ps.smigBreached && <Badge variant="destructive" className="ms-2 text-[10px]">{t("payroll.smigBadge")}</Badge>}
                          </TableCell>
                          <TableCell className="text-center tabular-nums" dir="ltr">{hoursLabel(ps.workedMinutes)}</TableCell>
                          <TableCell className="text-center tabular-nums" dir="ltr">
                            {ps.overtimeMinutes > 0 ? hoursLabel(ps.overtimeMinutes) : "—"}
                          </TableCell>
                          <TableCell className="text-end tabular-nums">{money(ps.grossCents)}</TableCell>
                          <TableCell className="text-end tabular-nums text-muted-foreground" dir="ltr">
                            −{money(ps.cnssEmployeeCents + ps.amoEmployeeCents + ps.irNetCents)}
                          </TableCell>
                          <TableCell className="text-end font-semibold tabular-nums">{money(ps.netCents)}</TableCell>
                          <TableCell className="text-end">
                            <Button size="sm" variant="outline" onClick={() => void openPayslip(ps.id)}>
                              {t("payroll.viewPayslip")}
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
        </>
      )}

      <Dialog open={payslipOpen} onOpenChange={setPayslipOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex flex-wrap items-center gap-2">
              <span dir="ltr" className="font-mono text-sm text-muted-foreground">{payslip?.refNumber ?? ""}</span>
              {payslip?.worker?.fullName ?? ""}
              {payslip?.smigBreached && <Badge variant="destructive">{t("payroll.smigBadge")}</Badge>}
              {payslip?.period.status === "approved" && (
                <Badge className="gap-1"><BadgeCheck className="size-3" aria-hidden />{t("payroll.approvedBadge")}</Badge>
              )}
            </DialogTitle>
            <DialogDescription>{t("payroll.payslipDesc")}</DialogDescription>
          </DialogHeader>

          {payslipLoading && (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
              <LoaderCircle className="size-4 animate-spin" aria-hidden />
              {t("common.loading")}
            </div>
          )}

          {payslip && (
            <div className="space-y-4">
              {/* ملخص الساعات */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  { label: t("payroll.pslHours"), value: hoursLabel(payslip.workedMinutes) },
                  { label: t("payroll.pslOt"), value: hoursLabel(payslip.overtimeMinutes) },
                  { label: t("payroll.pslDays"), value: String(payslip.workedDays) },
                  { label: t("payroll.pslNet"), value: money(payslip.netCents) },
                ].map((s) => (
                  <div key={s.label} className="rounded-lg border border-border/60 p-3">
                    <div className="text-[11px] text-muted-foreground">{s.label}</div>
                    <div className="mt-0.5 text-sm font-bold tabular-nums" dir="ltr">{s.value}</div>
                  </div>
                ))}
              </div>

              {/* البنود */}
              <div className="overflow-x-auto rounded-lg border border-border/60">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("payroll.colLine")}</TableHead>
                      <TableHead className="text-center">{t("payroll.colQty")}</TableHead>
                      <TableHead className="text-center">{t("payroll.colRate")}</TableHead>
                      <TableHead className="text-end">{t("payroll.colAmount")}</TableHead>
                      {editable && canApprove && <TableHead className="text-end">{t("common.actions")}</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {payslip.lines.map((line) => {
                      const isEmployer = line.kind.startsWith("employer_");
                      return (
                        <TableRow key={line.id} className={isEmployer ? "bg-muted/40" : undefined}>
                          <TableCell>
                            {t(LINE_KIND_KEY[line.kind] ?? "payroll.lineUnknown")}
                            {line.reason && <div className="text-[11px] text-muted-foreground">{line.reason}</div>}
                            {line.exemptIrCents > 0 && (
                              <div className="text-[11px] text-muted-foreground">{t("payroll.exemptInfo", { amount: money(line.exemptIrCents) })}</div>
                            )}
                          </TableCell>
                          <TableCell className="text-center tabular-nums" dir="ltr">
                            {line.minutes !== null ? hoursLabel(line.minutes) : "—"}
                          </TableCell>
                          <TableCell className="text-center tabular-nums" dir="ltr">
                            {line.rateBp !== null ? `${(line.rateBp / 10000).toLocaleString("en-US")}%` : "—"}
                          </TableCell>
                          <TableCell className={`text-end tabular-nums ${line.amountCents < 0 ? "text-destructive" : isEmployer ? "text-muted-foreground" : ""}`}>
                            {money(line.amountCents)}
                          </TableCell>
                          {editable && canApprove && (
                            <TableCell className="text-end">
                              {line.isManual ? (
                                <Button size="icon" variant="ghost" className="size-7 text-destructive" disabled={adjBusy} onClick={() => void removeAdjustment(line.id)} aria-label={t("common.archive")}>
                                  <Trash2 className="size-3.5" aria-hidden />
                                </Button>
                              ) : (
                                "—"
                              )}
                            </TableCell>
                          )}
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              {/* شجرة الإجمالي → الصافي */}
              <div className="space-y-1.5 rounded-lg border border-border/60 p-4 text-sm">
                {[
                  [t("payroll.sumGross"), money(payslip.grossCents)],
                  [t("payroll.sumCnss"), `− ${money(payslip.cnssEmployeeCents)}`],
                  [t("payroll.sumAmo"), `− ${money(payslip.amoEmployeeCents)}`],
                  [t("payroll.sumIr"), `− ${money(payslip.irNetCents)}`],
                ].map(([label, value]) => (
                  <div key={label} className="flex items-center justify-between text-muted-foreground">
                    <span>{label}</span>
                    <span className="tabular-nums" dir="ltr">{value}</span>
                  </div>
                ))}
                <Separator />
                <div className="flex items-center justify-between font-bold">
                  <span>{t("payroll.sumNet")}</span>
                  <span className="tabular-nums text-primary" dir="ltr">{money(payslip.netCents)}</span>
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{t("payroll.sumEmployer")}</span>
                  <span className="tabular-nums" dir="ltr">{money(payslip.employerCostCents)}</span>
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{t("payroll.sumTotalCost")}</span>
                  <span className="tabular-nums" dir="ltr">{money(payslip.totalCostCents)}</span>
                </div>
              </div>

              {/* التفصيل اليومي — شفافية «كيف حُسب كل مبلغ» */}
              {payslip.daily.length > 0 && (
                <div>
                  <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
                    <CalendarClock className="size-3.5" aria-hidden />
                    {t("payroll.dailyTitle")}
                  </h3>
                  <div className="max-h-40 overflow-y-auto rounded-lg border border-border/60">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{t("payroll.colDay")}</TableHead>
                          <TableHead>{t("payroll.colDayKind")}</TableHead>
                          <TableHead className="text-center">{t("payroll.colMinutes")}</TableHead>
                          <TableHead className="text-center">{t("payroll.colOt")}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {payslip.daily.map((d) => (
                          <TableRow key={d.date}>
                            <TableCell dir="ltr" className="font-mono text-xs">{d.date}</TableCell>
                            <TableCell>
                              <Badge variant={d.dayKind === "normal" ? "outline" : "secondary"} className="text-[10px]">
                                {t(d.dayKind === "normal" ? "payroll.dayNormal" : d.dayKind === "rest" ? "payroll.dayRest" : "payroll.dayHoliday")}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-center tabular-nums" dir="ltr">{hoursLabel(d.minutes)}</TableCell>
                            <TableCell className="text-center tabular-nums" dir="ltr">{d.otMinutes > 0 ? hoursLabel(d.otMinutes) : "—"}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}

              {/* إضافة بند يدوي — مسودة/مراجعة فقط */}
              {editable && canApprove && (
                <div className="space-y-3 rounded-lg border border-dashed border-border p-4">
                  <h3 className="flex items-center gap-1.5 text-sm font-semibold">
                    <Plus className="size-3.5" aria-hidden />
                    {t("payroll.addAdjustment")}
                  </h3>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="adj-kind">{t("payroll.adjKind")}</Label>
                      <Select value={adjKind} onValueChange={setAdjKind}>
                        <SelectTrigger id="adj-kind">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ADJ_KINDS.map((k) => (
                            <SelectItem key={k.value} value={k.value}>{t(k.key)}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="adj-amount">{t("payroll.adjAmount")}</Label>
                      <Input id="adj-amount" type="number" inputMode="decimal" min="0" step="0.01" dir="ltr" value={adjAmount} onChange={(e) => setAdjAmount(e.target.value)} placeholder="0.00" />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="adj-reason">{t("payroll.adjReason")}</Label>
                      <Input id="adj-reason" maxLength={240} value={adjReason} onChange={(e) => setAdjReason(e.target.value)} placeholder={t("payroll.adjReasonPlaceholder")} />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button size="sm" onClick={() => void addAdjustment()} disabled={adjBusy || !adjAmount}>
                      {adjBusy ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <Plus className="size-4" aria-hidden />}
                      <span className="ms-1">{t("payroll.adjAdd")}</span>
                    </Button>
                  </DialogFooter>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

const STATUS_BADGE: Record<string, string> = {
  draft: "payroll.statusDraft",
  reviewing: "payroll.statusReviewing",
  approved: "payroll.statusApproved",
};
