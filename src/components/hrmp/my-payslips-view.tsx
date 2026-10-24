"use client";

// HRMP — «أجوري» (SPEC §4.5): كشوف العامل المعتمدة — محفظة شفافة تشرح كيف حُسب كل مبلغ (SPEC §4.3)
// المرحلة 7: أزرار تصدير القسيمة PDF/DOCX/PNG بلغة المستخدم (SPEC §4.4.1)
import { useCallback, useEffect, useState } from "react";
import { FileDown, LoaderCircle, ReceiptText, RefreshCcw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useI18n } from "@/i18n/provider";
import { apiRequest, ListState, PageHeader } from "@/components/hrmp/org-bits";
import { formatMoney } from "@/lib/money";
// (بلاغ المالك 2026-10-24 «لا أستطيع تحرير أو تصدير أو تحميل بعض الوثائق مثل قسيمة الأجر"):
// تسليم الملف عبر الجسر الأصلي — <a download> على روابط blob لا يعمل داخل WebView
// أندرويد (لا DownloadListener في الغلاف) فيبدو التصدير معطوبًا في التطبيق.
import { deliverFile } from "@/lib/native-bridge";

type MyPayslip = {
  id: string;
  refNumber: string;
  periodLabel: string;
  workedMinutes: number;
  overtimeMinutes: number;
  grossCents: number;
  cnssEmployeeCents: number;
  amoEmployeeCents: number;
  irNetCents: number;
  netCents: number;
};

type PayslipDetail = {
  id: string;
  refNumber: string;
  period: { label: string; status: string };
  worker: { id: string; fullName: string } | null;
  workedMinutes: number;
  overtimeMinutes: number;
  netCents: number;
  lines: { id: string; kind: string; minutes: number | null; rateBp: number | null; amountCents: number; reason: string | null }[];
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

function hoursLabel(minutes: number): string {
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}`;
}

/** تصدير قسيمة وتنزيلها من نسختها الثابتة (SPEC §4.4.1) — عبر الجسر الأصلي
 * داخل تطبيق أندرويد (مشاركة النظام: حفظ/فتح/إرسال) وتنزيل عادي في المتصفح */
async function exportPayslip(payslipId: string, format: string, language: string): Promise<void> {
  const res = await apiRequest<{ downloadUrl: string; fileName: string; reused: boolean }>("/api/reports/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind: "payslip", targetId: payslipId, format, language }),
  });
  const file = await fetch(res.downloadUrl, { cache: "no-store" });
  if (!file.ok) throw new Error("download_failed");
  await deliverFile(await file.blob(), res.fileName);
}

export function MyPayslipsView() {
  const { t, locale } = useI18n();
  const { toast } = useToast();
  const [exporting, setExporting] = useState<string | null>(null);

  const [payslips, setPayslips] = useState<MyPayslip[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [detail, setDetail] = useState<PayslipDetail | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const data = await apiRequest<{ payslips: MyPayslip[] }>("/api/my-payslips", { cache: "no-store" });
      setPayslips(data.payslips);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function openDetail(id: string) {
    setDetailOpen(true);
    setDetail(null);
    setDetailLoading(true);
    try {
      setDetail(await apiRequest<PayslipDetail>(`/api/payslips/${id}`, { cache: "no-store" }));
    } catch {
      toast({ variant: "destructive", description: t("common.operationFailed") });
      setDetailOpen(false);
    } finally {
      setDetailLoading(false);
    }
  }

  const money = (c: number) => formatMoney(c, locale);

  async function doExport(payslipId: string, format: string) {
    setExporting(format);
    try {
      await exportPayslip(payslipId, format, locale);
      toast({ description: t("reports.exportOk") });
    } catch {
      toast({ variant: "destructive", description: t("reports.exportFailed") });
    } finally {
      setExporting(null);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t("myPayslips.title")} subtitle={t("myPayslips.subtitle")}>
        <Button size="sm" variant="outline" onClick={() => void load()} className="gap-1.5">
          <RefreshCcw className="size-3.5" aria-hidden />
          {t("common.retry")}
        </Button>
      </PageHeader>

      <ListState loading={loading} error={error} empty={payslips.length === 0} onRetry={() => void load()} />

      {!loading && !error && payslips.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {payslips.map((ps) => (
            <Card key={ps.id}>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center justify-between text-base">
                  <span>{ps.periodLabel}</span>
                  <span dir="ltr" className="font-mono text-xs font-normal text-muted-foreground">{ps.refNumber}</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <div className="text-[11px] text-muted-foreground">{t("myPayslips.hours")}</div>
                    <div className="font-semibold tabular-nums" dir="ltr">{hoursLabel(ps.workedMinutes)}</div>
                  </div>
                  <div>
                    <div className="text-[11px] text-muted-foreground">{t("myPayslips.overtime")}</div>
                    <div className="font-semibold tabular-nums" dir="ltr">{hoursLabel(ps.overtimeMinutes)}</div>
                  </div>
                  <div>
                    <div className="text-[11px] text-muted-foreground">{t("myPayslips.gross")}</div>
                    <div className="tabular-nums" dir="ltr">{money(ps.grossCents)}</div>
                  </div>
                  <div>
                    <div className="text-[11px] text-muted-foreground">{t("myPayslips.deductions")}</div>
                    <div className="tabular-nums text-destructive" dir="ltr">−{money(ps.cnssEmployeeCents + ps.amoEmployeeCents + ps.irNetCents)}</div>
                  </div>
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-[11px] text-muted-foreground">{t("myPayslips.net")}</div>
                    <div className="text-lg font-bold tabular-nums text-primary" dir="ltr">{money(ps.netCents)}</div>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => void openDetail(ps.id)} className="gap-1.5">
                    <ReceiptText className="size-3.5" aria-hidden />
                    {t("myPayslips.details")}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {detail?.period.label ?? ""}
              {detail && <span dir="ltr" className="ms-2 font-mono text-xs font-normal text-muted-foreground">{detail.refNumber}</span>}
            </DialogTitle>
            <DialogDescription>{t("myPayslips.detailDesc")}</DialogDescription>
          </DialogHeader>
          {detailLoading && (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
              <LoaderCircle className="size-4 animate-spin" aria-hidden />
              {t("common.loading")}
            </div>
          )}
          {detail && (
            <div className="space-y-1.5 text-sm">
              {detail.lines
                .filter((l) => !l.kind.startsWith("employer_")) // حصة المشغّل لا تُعرض للأجير (SPEC §4.4.1)
                .map((line) => (
                  <div key={line.id} className="flex items-center justify-between gap-2">
                    <span className="min-w-0 flex-1 truncate text-muted-foreground">
                      {t(LINE_KIND_KEY[line.kind] ?? "payroll.lineUnknown")}
                      {line.minutes !== null && <span dir="ltr" className="ms-1 text-[11px] opacity-70">{hoursLabel(line.minutes)}</span>}
                    </span>
                    <span className={`tabular-nums ${line.amountCents < 0 ? "text-destructive" : ""}`} dir="ltr">
                      {money(line.amountCents)}
                    </span>
                  </div>
                ))}
              <Separator />
              <div className="flex items-center justify-between font-bold">
                <span>{t("myPayslips.net")}</span>
                <span className="tabular-nums text-primary" dir="ltr">{money(detail.netCents)}</span>
              </div>
              <Separator />
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-muted-foreground">{t("reports.format")}:</span>
                {(["pdf", "docx", "png"] as const).map((f) => (
                  <Button
                    key={f}
                    size="sm"
                    variant="outline"
                    disabled={exporting !== null}
                    onClick={() => void doExport(detail.id, f)}
                    className="gap-1.5 uppercase"
                  >
                    {exporting === f ? <LoaderCircle className="size-3.5 animate-spin" aria-hidden /> : <FileDown className="size-3.5" aria-hidden />}
                    {f}
                  </Button>
                ))}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
