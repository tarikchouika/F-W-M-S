"use client";

// HRMP — التصاريح الرسمية (SPEC §4.6 — المرحلة 6ج): دورة الاعتماد الكاملة وصفحة مراجعة المحاسب
// مسودة ← مولَّد ← قيد المراجعة ← معتمد ← مُصدَّر ← مُودَع — ملخص الأرقام والأخطاء والمقارنة والتنزيل
import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Download,
  FileDown,
  FileText,
  LoaderCircle,
  Plus,
  Send,
  Stamp,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useI18n } from "@/i18n/provider";
import { apiRequest, ApiError, ListState, PageHeader } from "@/components/hrmp/org-bits";
// (بلاغ المالك 2026-10-24): تسليم الملفات عبر الجسر الأصلي — <a download> على روابط
// blob لا يعمل داخل WebView أندرويد (لا DownloadListener في الغلاف).
import { deliverFile } from "@/lib/native-bridge";

type DeclarationRow = {
  id: string;
  authority: string;
  kind: string;
  periodKey: string;
  status: string;
  specVersion: number;
  isSample: boolean;
  correctsWith: string | null;
  createdAt: string;
  approvedAt: string | null;
  exportedAt: string | null;
  filedAt: string | null;
  filesCount: number;
  receiptsCount: number;
};

type DeclarationDetail = DeclarationRow & {
  summaryJson: string | null;
  validationJson: string | null;
  reviewNote: string | null;
  filedRef: string | null;
  spec: { version: number; isSample: boolean };
  files: { id: string; sha256: string; specVersion: number; format: string; sizeBytes: number; exportedBy: string; createdAt: string }[];
  receipts: { id: string; filedAt: string; filedRef: string | null }[];
};

type PeriodRow = { id: string; year: number; month: number; status: string };
type Deadline = { authority: string; kind: string; periodKey: string; dueDate: string; status: string; lateFeeNote: boolean };

const STATUS_FLOW = ["draft", "generated", "accountant_review", "approved", "exported", "filed"] as const;

export function DeclarationsManager() {
  const { t, locale } = useI18n();
  const { toast } = useToast();
  const [complianceBusy, setComplianceBusy] = useState<string | null>(null);

  // المرحلة 7: تقرير المطابقة PDF/DOCX بلغة المستخدم (كشوف معتمدة ↔ الملف الرسمي)
  async function exportCompliance(format: string) {
    if (!detail) return;
    setComplianceBusy(format);
    try {
      const res = await apiRequest<{ downloadUrl: string; fileName: string }>("/api/reports/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "compliance_report", targetId: detail.id, format, language: locale }),
      });
      const file = await fetch(res.downloadUrl, { cache: "no-store" });
      if (!file.ok) throw new Error("download_failed");
      // الجسر الأصلي داخل تطبيق أندرويد (مشاركة النظام) — وتنزيل عادي في المتصفح
      await deliverFile(await file.blob(), res.fileName);
      toast({ description: t("reports.exportOk") });
    } catch {
      toast({ variant: "destructive", description: t("reports.exportFailed") });
    } finally {
      setComplianceBusy(null);
    }
  }

  const [rows, setRows] = useState<DeclarationRow[]>([]);
  const [periods, setPeriods] = useState<PeriodRow[]>([]);
  const [deadlines, setDeadlines] = useState<Deadline[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [detail, setDetail] = useState<DeclarationDetail | null>(null);
  const [reviewNote, setReviewNote] = useState("");
  const [fileForm, setFileForm] = useState({ filedAt: "", filedRef: "" });

  const [form, setForm] = useState({
    authority: "cnss" as "cnss" | "dgi",
    kind: "monthly" as "monthly" | "annual_9421" | "neant",
    periodId: "",
    year: String(new Date().getFullYear() - 1),
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const [decls, periodsData, deadlinesData] = await Promise.all([
        apiRequest<{ declarations: DeclarationRow[] }>("/api/declarations", { cache: "no-store" }),
        apiRequest<{ periods: PeriodRow[] }>("/api/pay-periods", { cache: "no-store" }).catch(() => ({ periods: [] as PeriodRow[] })),
        apiRequest<{ deadlines: Deadline[] }>("/api/declarations/deadlines", { cache: "no-store" }).catch(() => ({ deadlines: [] as Deadline[] })),
      ]);
      setRows(decls.declarations);
      setPeriods(periodsData.periods);
      setDeadlines(deadlinesData.deadlines);
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
    try {
      const data = await apiRequest<DeclarationDetail>(`/api/declarations/${id}`, { cache: "no-store" });
      setDetail(data);
      setReviewNote("");
      setFileForm({ filedAt: "", filedRef: "" });
    } catch (e) {
      if (e instanceof ApiError) {
        toast({ variant: "destructive", description: t(`declarations.errors.${e.code}`, { defaultValue: e.code }) });
      }
    }
  }

  async function createDeclaration() {
    if (busy) return;
    setBusy(true);
    try {
      await apiRequest("/api/declarations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          authority: form.authority,
          kind: form.kind,
          ...(form.kind === "annual_9421" ? { year: Number(form.year) } : { periodId: form.periodId || undefined }),
        }),
      });
      toast({ description: t("declarations.created") });
      setCreateOpen(false);
      await load();
    } catch (e) {
      if (e instanceof ApiError) {
        toast({ variant: "destructive", description: t(`declarations.errors.${e.code}`, { defaultValue: e.code }) });
      } else {
        toast({ variant: "destructive", description: t("common.operationFailed") });
      }
    } finally {
      setBusy(false);
    }
  }

  async function transition(id: string, action: string, extra?: Record<string, unknown>) {
    if (busy) return;
    setBusy(true);
    try {
      const result = await apiRequest<Record<string, unknown>>(`/api/declarations/${id}/transition`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, ...extra }),
      });
      toast({ description: t(`declarations.transitioned.${action}`, { defaultValue: t("declarations.transitionedOk") }) });
      await load();
      await openDetail(id);
      // إن كان تصديرًا: نسلّم الملف فورًا (الجسر الأصلي في التطبيق / تنزيل في المتصفح)
      if (action === "export" && typeof result.content === "string") {
        const blob = new Blob([result.content], { type: result.format === "xml" ? "application/xml" : "text/plain" });
        await deliverFile(blob, `hrmp-${result.format}-${String(result.sha256).slice(0, 12)}.${result.format === "xml" ? "xml" : "txt"}`);
      }
    } catch (e) {
      if (e instanceof ApiError) {
        toast({ variant: "destructive", description: t(`declarations.errors.${e.code}`, { defaultValue: e.code }) });
      } else {
        toast({ variant: "destructive", description: t("common.operationFailed") });
      }
    } finally {
      setBusy(false);
    }
  }

  const statusBadge = (s: string) => {
    const idx = STATUS_FLOW.indexOf(s as (typeof STATUS_FLOW)[number]);
    const label = t(`declarations.statuses.${s}`, { defaultValue: s });
    if (s === "filed" || s === "approved" || s === "exported") return <Badge className="gap-1"><CheckCircle2 className="size-3" aria-hidden />{label}</Badge>;
    if (s === "rejected") return <Badge variant="destructive" className="gap-1"><XCircle className="size-3" aria-hidden />{label}</Badge>;
    if (s === "accountant_review") return <Badge variant="outline" className="gap-1 border-amber-500 text-amber-600"><Stamp className="size-3" aria-hidden />{label}</Badge>;
    return <Badge variant="secondary">{label}</Badge>;
  };

  const summary = detail?.summaryJson ? (JSON.parse(detail.summaryJson) as { totals?: Record<string, number>; previousPeriod?: Record<string, number> | null }) : null;
  const validationIssues = (() => {
    if (!detail?.validationJson) return [] as { element: string; reason: string; detail?: string }[];
    try {
      return JSON.parse(detail.validationJson);
    } catch {
      return [];
    }
  })();

  const approvedPeriods = periods.filter((p) => p.status === "approved");

  return (
    <div className="space-y-6">
      <PageHeader title={t("declarations.title")} subtitle={t("declarations.subtitle")} />

      {/* المواعيد (تذكير SPEC §4.6: قبل 10 الشهر الموالي و1 مارس + غرامات كمعلومة) */}
      {deadlines.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-1.5 text-base">
              <CalendarClock className="size-4" aria-hidden />
              {t("declarations.deadlinesTitle")}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 sm:grid-cols-2">
            {deadlines.map((d, i) => (
              <div key={i} className="flex items-center justify-between rounded-lg border px-3 py-2 text-xs">
                <div>
                  <span className="font-semibold uppercase">{d.authority}</span>
                  <span className="text-muted-foreground"> · {t(`specRegistry.kinds.${d.kind}`, { defaultValue: d.kind })} · {d.periodKey}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span dir="ltr" className="font-mono">{d.dueDate}</span>
                  {d.status === "filed" ? (
                    <Badge><CheckCircle2 className="size-3" aria-hidden />{t("declarations.filed")}</Badge>
                  ) : d.status === "late" ? (
                    <Badge variant="destructive" className="gap-1"><AlertTriangle className="size-3" aria-hidden />{t("declarations.late")}</Badge>
                  ) : (
                    <Badge variant="outline">{t("declarations.dueSoon")}</Badge>
                  )}
                </div>
              </div>
            ))}
            {deadlines.some((d) => d.lateFeeNote) && (
              <p className="text-xs text-muted-foreground sm:col-span-2">{t("declarations.lateFeeNote")}</p>
            )}
          </CardContent>
        </Card>
      )}

      <div className="flex flex-wrap gap-2">
        <Button onClick={() => setCreateOpen(true)} className="gap-1.5">
          <Plus className="size-4" aria-hidden />
          {t("declarations.create")}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-1.5 text-base">
            <FileText className="size-4" aria-hidden />
            {t("declarations.listTitle")}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <ListState loading={loading} error={error} empty={rows.length === 0} onRetry={() => void load()} />
          {!loading && !error && rows.length > 0 && (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("specRegistry.authority")}</TableHead>
                    <TableHead>{t("specRegistry.kind")}</TableHead>
                    <TableHead>{t("declarations.period")}</TableHead>
                    <TableHead>{t("specRegistry.status")}</TableHead>
                    <TableHead>{t("regimes.version")}</TableHead>
                    <TableHead>{t("declarations.filed")}</TableHead>
                    <TableHead className="text-end">{t("common.actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((d) => (
                    <TableRow key={d.id}>
                      <TableCell className="font-mono text-xs uppercase">
                        {d.authority}
                        {d.correctsWith && <div className="text-[10px] text-muted-foreground">{t("declarations.corrective")}</div>}
                      </TableCell>
                      <TableCell className="text-xs">{t(`specRegistry.kinds.${d.kind}`, { defaultValue: d.kind })}</TableCell>
                      <TableCell dir="ltr" className="font-mono text-xs">{d.periodKey}</TableCell>
                      <TableCell>
                        {statusBadge(d.status)}
                        {d.isSample && (
                          <div className="mt-1"><Badge variant="outline" className="border-amber-500 text-[10px] text-amber-600">SAMPLE</Badge></div>
                        )}
                      </TableCell>
                      <TableCell dir="ltr" className="font-mono text-xs">v{d.specVersion}</TableCell>
                      <TableCell dir="ltr" className="font-mono text-xs">{d.filedAt ? d.filedAt.slice(0, 10) : "—"}</TableCell>
                      <TableCell className="text-end">
                        <Button size="sm" variant="outline" onClick={() => void openDetail(d.id)}>
                          {t("declarations.review")}
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

      {/* إنشاء تصريح */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("declarations.createTitle")}</DialogTitle>
            <DialogDescription>{t("declarations.createDesc")}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="decl-authority">{t("specRegistry.authority")}</Label>
                <Select value={form.authority} onValueChange={(v) => setForm({ ...form, authority: v as "cnss" | "dgi" })}>
                  <SelectTrigger id="decl-authority"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cnss">CNSS (Damancom)</SelectItem>
                    <SelectItem value="dgi">DGI (SIMPL-IR)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="decl-kind">{t("specRegistry.kind")}</Label>
                <Select value={form.kind} onValueChange={(v) => setForm({ ...form, kind: v as typeof form.kind })}>
                  <SelectTrigger id="decl-kind"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">{t("specRegistry.kinds.monthly")}</SelectItem>
                    <SelectItem value="annual_9421">{t("specRegistry.kinds.annual_9421")}</SelectItem>
                    <SelectItem value="neant">{t("specRegistry.kinds.neant")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {form.kind === "annual_9421" ? (
              <div className="space-y-1.5">
                <Label htmlFor="decl-year">{t("declarations.year")}</Label>
                <Input id="decl-year" type="number" min={2020} max={2100} value={form.year} onChange={(e) => setForm({ ...form, year: e.target.value })} />
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label htmlFor="decl-period">{t("declarations.period")}</Label>
                <Select value={form.periodId} onValueChange={(v) => setForm({ ...form, periodId: v })}>
                  <SelectTrigger id="decl-period"><SelectValue placeholder={t("declarations.selectPeriod")} /></SelectTrigger>
                  <SelectContent>
                    {approvedPeriods.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.year}-{String(p.month).padStart(2, "0")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">{t("declarations.periodHint")}</p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>{t("common.cancel")}</Button>
            <Button onClick={() => void createDeclaration()} disabled={busy || (form.kind !== "annual_9421" && !form.periodId)} className="gap-1.5">
              {busy && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
              {t("declarations.create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* حوار المراجعة (صفحة المحاسب — SPEC §4.6) */}
      <Dialog open={detail !== null} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          {detail && (
            <>
              <DialogHeader>
                <DialogTitle className="flex flex-wrap items-center gap-2">
                  <span className="font-mono uppercase">{detail.authority}</span>
                  <span className="text-sm font-normal text-muted-foreground">
                    {t(`specRegistry.kinds.${detail.kind}`, { defaultValue: detail.kind })} · {detail.periodKey} · v{detail.specVersion}
                  </span>
                  {statusBadge(detail.status)}
                </DialogTitle>
                <DialogDescription>{t("declarations.reviewDesc")}</DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                {/* ملخص الأرقام للمحاسب */}
                {summary?.totals && (
                  <Card>
                    <CardHeader><CardTitle className="text-sm">{t("declarations.summaryTitle")}</CardTitle></CardHeader>
                    <CardContent className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                      {Object.entries(summary.totals).map(([k, v]) => (
                        <div key={k} className="rounded border p-2">
                          <div className="text-muted-foreground">{t(`declarations.totals.${k}`, { defaultValue: k })}</div>
                          <div dir="ltr" className="font-mono text-sm font-semibold">
                            {k === "workers" || k === "days" ? v : (v / 100).toLocaleString("fr-MA", { minimumFractionDigits: 2 })}
                          </div>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}

                {/* أخطاء وتحذيرات التحقق */}
                {validationIssues.length > 0 && (
                  <Card className="border-destructive/50">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-1.5 text-sm text-destructive">
                        <AlertTriangle className="size-4" aria-hidden />
                        {t("declarations.issuesTitle", { count: validationIssues.length })}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-1 text-xs">
                      {validationIssues.map((i, idx) => (
                        <div key={idx} className="flex items-start gap-2">
                          <span dir="ltr" className="font-mono">{i.element}</span>
                          <span className="text-destructive">{t(`declarations.issueReasons.${i.reason}`, { defaultValue: i.reason })}</span>
                          {i.detail && <span dir="ltr" className="font-mono text-muted-foreground">{i.detail}</span>}
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}

                {/* مقارنة مع الفترة السابقة */}
                {summary?.previousPeriod && (
                  <Card>
                    <CardHeader><CardTitle className="text-sm">{t("declarations.previousPeriodTitle")}</CardTitle></CardHeader>
                    <CardContent className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                      {Object.entries(summary.previousPeriod).slice(0, 8).map(([k, v]) => {
                        const current = summary.totals?.[k] ?? 0;
                        const diff = Number(v) - current;
                        return (
                          <div key={k} className="rounded border p-2">
                            <div className="text-muted-foreground">{t(`declarations.totals.${k}`, { defaultValue: k })}</div>
                            <div dir="ltr" className="font-mono">
                              {typeof v === "number" && k !== "workers" && k !== "days" ? (v / 100).toFixed(2) : v}
                              {diff !== 0 && (
                                <span className={diff > 0 ? "text-amber-600" : "text-emerald-600"}>
                                  {" "}({diff > 0 ? "+" : ""}{typeof v === "number" && k !== "workers" && k !== "days" ? (diff / 100).toFixed(2) : diff})
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </CardContent>
                  </Card>
                )}

                {/* المرحلة 7 — تقرير المطابقة (SPEC §4.6): يُصدَّر مع كل تصريح */}
                {["approved", "exported", "filed"].includes(detail.status) && (
                  <Card>
                    <CardHeader><CardTitle className="text-sm">{t("reports.kind.compliance_report")}</CardTitle></CardHeader>
                    <CardContent className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="text-muted-foreground">{t("reports.doc.complianceIntro")}</span>
                      {(["pdf", "docx"] as const).map((f) => (
                        <Button
                          key={f}
                          size="sm"
                          variant="outline"
                          disabled={complianceBusy !== null}
                          onClick={() => void exportCompliance(f)}
                          className="gap-1.5 uppercase"
                        >
                          {complianceBusy === f ? <LoaderCircle className="size-3.5 animate-spin" aria-hidden /> : <FileDown className="size-3.5" aria-hidden />}
                          {f}
                        </Button>
                      ))}
                    </CardContent>
                  </Card>
                )}

                {/* الملفات والإشعارات */}
                {detail.files.length > 0 && (
                  <Card>
                    <CardHeader><CardTitle className="text-sm">{t("declarations.filesTitle")}</CardTitle></CardHeader>
                    <CardContent className="space-y-2 text-xs">
                      {detail.files.map((f) => (
                        <div key={f.id} className="flex flex-wrap items-center gap-2">
                          <FileDown className="size-3.5" aria-hidden />
                          <span dir="ltr" className="font-mono">{f.format} · {f.sizeBytes}B · v{f.specVersion}</span>
                          <span dir="ltr" className="font-mono text-muted-foreground">sha256:{f.sha256.slice(0, 16)}…</span>
                          <a href={`/api/declarations/${detail.id}/file`} className="text-primary underline" download>
                            <Download className="inline size-3" aria-hidden /> {t("declarations.download")}
                          </a>
                        </div>
                      ))}
                      {detail.receipts.map((rc) => (
                        <div key={rc.id} className="text-muted-foreground">
                          {t("declarations.receiptLine", { date: rc.filedAt.slice(0, 10), ref: rc.filedRef ?? "—" })}
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}

                {/* أزرار الانتقالات بحسب الحالة */}
                <div className="flex flex-wrap gap-2">
                  {(detail.status === "draft" || detail.status === "rejected") && (
                    <Button size="sm" disabled={busy} onClick={() => void transition(detail.id, "generate")} className="gap-1.5">
                      {busy ? <LoaderCircle className="size-3.5 animate-spin" aria-hidden /> : <FileText className="size-3.5" aria-hidden />}
                      {t("declarations.generate")}
                    </Button>
                  )}
                  {detail.status === "generated" && (
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => void transition(detail.id, "submit_review")} className="gap-1.5">
                      <Send className="size-3.5" aria-hidden />
                      {t("declarations.submitReview")}
                    </Button>
                  )}
                  {detail.status === "accountant_review" && (
                    <>
                      <Button size="sm" disabled={busy} onClick={() => void transition(detail.id, "approve", { note: reviewNote || undefined })} className="gap-1.5">
                        <CheckCircle2 className="size-3.5" aria-hidden />
                        {t("declarations.approve")}
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={busy || reviewNote.trim() === ""}
                        onClick={() => void transition(detail.id, "reject", { note: reviewNote })}
                        className="gap-1.5"
                      >
                        <XCircle className="size-3.5" aria-hidden />
                        {t("declarations.reject")}
                      </Button>
                    </>
                  )}
                  {detail.status === "approved" && (
                    <Button size="sm" disabled={busy} onClick={() => void transition(detail.id, "export")} className="gap-1.5">
                      <FileDown className="size-3.5" aria-hidden />
                      {t("declarations.exportFile")}
                    </Button>
                  )}
                  {detail.status === "exported" && (
                    <div className="flex w-full flex-wrap items-end gap-2 rounded-lg border p-3">
                      <div className="space-y-1">
                        <Label htmlFor="filed-at" className="text-xs">{t("declarations.filedAt")}</Label>
                        <Input id="filed-at" type="date" className="h-8 w-40" value={fileForm.filedAt} onChange={(e) => setFileForm({ ...fileForm, filedAt: e.target.value })} />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="filed-ref" className="text-xs">{t("declarations.filedRef")}</Label>
                        <Input id="filed-ref" maxLength={120} className="h-8 w-56" value={fileForm.filedRef} onChange={(e) => setFileForm({ ...fileForm, filedRef: e.target.value })} placeholder="CNSS-2026-10-REF001" />
                      </div>
                      <Button size="sm" disabled={busy || !fileForm.filedAt} onClick={() => void transition(detail.id, "file", { filedAt: fileForm.filedAt, filedRef: fileForm.filedRef || undefined })}>
                        {t("declarations.markFiled")}
                      </Button>
                    </div>
                  )}
                </div>

                {/* ملاحظة المراجعة (إلزامية للرفض) */}
                {(detail.status === "accountant_review" || detail.reviewNote) && (
                  <div className="space-y-1.5">
                    <Label htmlFor="review-note">{t("declarations.reviewNote")}</Label>
                    <Textarea
                      id="review-note"
                      maxLength={2000}
                      value={detail.status === "accountant_review" ? reviewNote : detail.reviewNote ?? ""}
                      readOnly={detail.status !== "accountant_review"}
                      onChange={(e) => setReviewNote(e.target.value)}
                      placeholder={t("declarations.reviewNotePlaceholder")}
                    />
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
      <p className="sr-only">{locale}</p>
    </div>
  );
}
