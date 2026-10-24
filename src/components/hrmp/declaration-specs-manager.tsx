"use client";

// HRMP — سجل المواصفات الرسمية (SPEC §4.6 — المرحلة 6ج): الجهة/النوع/الإصدار/الحالة
// CNSS: تخطيط eBDS قابل للتعريف والتعديل من الواجهة (JSON) | DGI: رفع XSD
// العينات موسومة SAMPLE-NOT-OFFICIAL ولا تُفعَّل في الإنتاج أبدًا
import { useCallback, useEffect, useState } from "react";
import { FileCheck2, FileUp, LoaderCircle, ShieldAlert, UploadCloud } from "lucide-react";
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

type SpecRow = {
  id: string;
  authority: string;
  kind: string;
  version: number;
  effectiveFrom: string;
  sourceRef: string | null;
  status: string;
  isSample: boolean;
  scope: "platform" | "company";
  uploadedBy: string;
  approvedBy: string | null;
  approvedAt: string | null;
  declarationsCount: number;
};

const AUTHORITIES = ["cnss", "dgi"] as const;
const KINDS = ["monthly", "annual_9421", "corrective", "neant"] as const;

export function DeclarationSpecsManager() {
  const { t, locale } = useI18n();
  const { toast } = useToast();

  const [specs, setSpecs] = useState<SpecRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);

  const [form, setForm] = useState({
    authority: "cnss" as (typeof AUTHORITIES)[number],
    kind: "monthly" as (typeof KINDS)[number],
    effectiveFrom: "",
    sourceRef: "",
    layoutJson: JSON.stringify(
      {
        encoding: "utf-8",
        recordSeparator: "\n",
        fieldSeparator: null,
        records: [
          { type: "header", fields: [{ source: "literal", value: "01", width: 2 }, { source: "company.cnssNumber", width: 10, pad: "left", padChar: "0" }, { source: "period.year", width: 4 }, { source: "period.month", width: 2 }] },
          { type: "per_worker", fields: [{ source: "worker.cnssNumber", width: 10, pad: "left", padChar: "0" }, { source: "worker.fullName", width: 25 }, { source: "payslip.workedDays", width: 3, pad: "left", padChar: "0" }, { source: "payslip.grossCents", width: 12, pad: "left", padChar: "0", format: "cents_to_mad" }] },
          { type: "trailer", fields: [{ source: "literal", value: "99", width: 2 }, { source: "total.workers", width: 3, pad: "left", padChar: "0" }, { source: "total.grossCents", width: 12, pad: "left", padChar: "0", format: "cents_to_mad" }] },
        ],
      },
      null,
      2
    ),
    xsdContent: "",
    mappingJson: JSON.stringify(
      {
        rootElement: "Declaration9421",
        fields: [
          { source: "declaration.year", element: "Annee", scope: "header" },
          { source: "company.taxId", element: "ICE", scope: "header" },
          { source: "worker.cin", element: "CIN", scope: "per_worker" },
          { source: "payslip.workedDays", element: "Jours", scope: "per_worker", format: "int" },
          { source: "payslip.grossCents", element: "Brut", scope: "per_worker", format: "cents_to_mad" },
          { source: "total.irNetCents", element: "TotalIR", scope: "trailer", format: "cents_to_mad" },
        ],
      },
      null,
      2
    ),
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const data = await apiRequest<{ specs: SpecRow[] }>("/api/declaration-specs", { cache: "no-store" });
      setSpecs(data.specs);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function uploadSpec() {
    if (busy) return;
    setBusy(true);
    try {
      await apiRequest("/api/declaration-specs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          authority: form.authority,
          kind: form.kind,
          effectiveFrom: form.effectiveFrom,
          sourceRef: form.sourceRef || undefined,
          layoutJson: form.authority === "cnss" ? form.layoutJson : undefined,
          xsdContent: form.authority === "dgi" ? form.xsdContent : undefined,
          mappingJson: form.authority === "dgi" ? form.mappingJson : undefined,
        }),
      });
      toast({ description: t("specRegistry.uploaded") });
      setUploadOpen(false);
      await load();
    } catch (e) {
      if (e instanceof ApiError) {
        toast({ variant: "destructive", description: t(`specRegistry.errors.${e.code}`, { defaultValue: e.code }) });
      } else {
        toast({ variant: "destructive", description: t("common.operationFailed") });
      }
    } finally {
      setBusy(false);
    }
  }

  async function activate(id: string) {
    if (busy) return;
    setBusy(true);
    try {
      await apiRequest(`/api/declaration-specs/${id}/activate`, { method: "POST" });
      toast({ description: t("specRegistry.activated") });
      await load();
    } catch (e) {
      if (e instanceof ApiError) {
        toast({ variant: "destructive", description: t(`specRegistry.errors.${e.code}`, { defaultValue: e.code }) });
      } else {
        toast({ variant: "destructive", description: t("common.operationFailed") });
      }
    } finally {
      setBusy(false);
    }
  }

  async function retire(id: string) {
    if (busy) return;
    setBusy(true);
    try {
      await apiRequest(`/api/declaration-specs/${id}/retire`, { method: "POST" });
      toast({ description: t("specRegistry.retired") });
      await load();
    } catch (e) {
      if (e instanceof ApiError) {
        toast({ variant: "destructive", description: t(`specRegistry.errors.${e.code}`, { defaultValue: e.code }) });
      } else {
        toast({ variant: "destructive", description: t("common.operationFailed") });
      }
    } finally {
      setBusy(false);
    }
  }

  const statusBadge = (s: string) => {
    switch (s) {
      case "active":
        return <Badge>{t("specRegistry.statusActive")}</Badge>;
      case "retired":
        return <Badge variant="secondary">{t("specRegistry.statusRetired")}</Badge>;
      case "testing":
        return <Badge variant="outline">{t("specRegistry.statusTesting")}</Badge>;
      default:
        return <Badge variant="outline">{t("specRegistry.statusDraft")}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader title={t("specRegistry.title")} subtitle={t("specRegistry.subtitle")} />

      <div className="flex flex-wrap gap-2">
        <Button onClick={() => setUploadOpen(true)} className="gap-1.5">
          <UploadCloud className="size-4" aria-hidden />
          {t("specRegistry.upload")}
        </Button>
      </div>

      {specs.some((s) => s.isSample) && (
        <Card className="border-amber-500/50 bg-amber-500/5">
          <CardContent className="flex items-start gap-2 pt-4 text-xs">
            <ShieldAlert className="mt-0.5 size-4 shrink-0 text-amber-600" aria-hidden />
            <p>{t("specRegistry.sampleWarning")}</p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-1.5 text-base">
            <FileCheck2 className="size-4" aria-hidden />
            {t("specRegistry.listTitle")}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <ListState loading={loading} error={error} empty={specs.length === 0} onRetry={() => void load()} />
          {!loading && !error && specs.length > 0 && (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("specRegistry.authority")}</TableHead>
                    <TableHead>{t("specRegistry.kind")}</TableHead>
                    <TableHead>{t("regimes.version")}</TableHead>
                    <TableHead>{t("specRegistry.status")}</TableHead>
                    <TableHead>{t("specRegistry.source")}</TableHead>
                    <TableHead>{t("specRegistry.declarations")}</TableHead>
                    <TableHead className="text-end">{t("common.actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {specs.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-mono text-xs uppercase">{s.authority}</TableCell>
                      <TableCell className="text-xs">{t(`specRegistry.kinds.${s.kind}`, { defaultValue: s.kind })}</TableCell>
                      <TableCell dir="ltr" className="font-mono text-xs">v{s.version}</TableCell>
                      <TableCell className="space-y-1">
                        {statusBadge(s.status)}
                        {s.isSample && (
                          <div>
                            <Badge variant="outline" className="border-amber-500 text-[10px] text-amber-600">SAMPLE-NOT-OFFICIAL</Badge>
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="max-w-56 truncate text-xs text-muted-foreground" title={s.sourceRef ?? ""}>
                        {s.scope === "platform" ? t("specRegistry.platformScope") : t("specRegistry.companyScope")}
                      </TableCell>
                      <TableCell dir="ltr" className="font-mono text-xs">{s.declarationsCount}</TableCell>
                      <TableCell className="text-end">
                        <div className="flex justify-end gap-1">
                          {(s.status === "draft" || s.status === "testing") && (
                            <Button size="sm" variant="outline" disabled={busy} onClick={() => void activate(s.id)}>
                              {t("specRegistry.activate")}
                            </Button>
                          )}
                          {s.status === "active" && s.scope === "company" && (
                            <Button size="sm" variant="ghost" disabled={busy} onClick={() => void retire(s.id)}>
                              {t("specRegistry.retire")}
                            </Button>
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

      {/* حوار رفع إصدار جديد */}
      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-1.5">
              <FileUp className="size-4" aria-hidden />
              {t("specRegistry.uploadTitle")}
            </DialogTitle>
            <DialogDescription>{t("specRegistry.uploadDesc")}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="spec-authority">{t("specRegistry.authority")}</Label>
              <Select value={form.authority} onValueChange={(v) => setForm({ ...form, authority: v as (typeof AUTHORITIES)[number] })}>
                <SelectTrigger id="spec-authority">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {AUTHORITIES.map((a) => (
                    <SelectItem key={a} value={a}>{a.toUpperCase()}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="spec-kind">{t("specRegistry.kind")}</Label>
              <Select value={form.kind} onValueChange={(v) => setForm({ ...form, kind: v as (typeof KINDS)[number] })}>
                <SelectTrigger id="spec-kind">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {KINDS.map((k) => (
                    <SelectItem key={k} value={k}>{t(`specRegistry.kinds.${k}`, { defaultValue: k })}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="spec-from">{t("regimes.effectiveFrom")}</Label>
              <Input id="spec-from" type="date" value={form.effectiveFrom} onChange={(e) => setForm({ ...form, effectiveFrom: e.target.value })} />
            </div>
            <div className="space-y-1.5 sm:col-span-3">
              <Label htmlFor="spec-ref">{t("specRegistry.sourceRef")}</Label>
              <Input id="spec-ref" maxLength={500} value={form.sourceRef} onChange={(e) => setForm({ ...form, sourceRef: e.target.value })} placeholder={t("specRegistry.sourceRefPlaceholder")} />
            </div>

            {form.authority === "cnss" && (
              <div className="space-y-1.5 sm:col-span-3">
                <Label htmlFor="spec-layout">{t("specRegistry.layoutJson")}</Label>
                <Textarea
                  id="spec-layout"
                  dir="ltr"
                  className="min-h-64 font-mono text-xs"
                  value={form.layoutJson}
                  onChange={(e) => setForm({ ...form, layoutJson: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">{t("specRegistry.layoutHint")}</p>
              </div>
            )}

            {form.authority === "dgi" && (
              <>
                <div className="space-y-1.5 sm:col-span-3">
                  <Label htmlFor="spec-xsd">{t("specRegistry.xsdContent")}</Label>
                  <Textarea
                    id="spec-xsd"
                    dir="ltr"
                    className="min-h-40 font-mono text-xs"
                    value={form.xsdContent}
                    onChange={(e) => setForm({ ...form, xsdContent: e.target.value })}
                    placeholder='<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">…'
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-3">
                  <Label htmlFor="spec-mapping">{t("specRegistry.mappingJson")}</Label>
                  <Textarea
                    id="spec-mapping"
                    dir="ltr"
                    className="min-h-32 font-mono text-xs"
                    value={form.mappingJson}
                    onChange={(e) => setForm({ ...form, mappingJson: e.target.value })}
                  />
                  <p className="text-xs text-muted-foreground">{t("specRegistry.mappingHint")}</p>
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUploadOpen(false)}>{t("common.cancel")}</Button>
            <Button onClick={() => void uploadSpec()} disabled={busy || !form.effectiveFrom} className="gap-1.5">
              {busy && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
              {t("specRegistry.upload")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <p className="sr-only">{locale}</p>
    </div>
  );
}
