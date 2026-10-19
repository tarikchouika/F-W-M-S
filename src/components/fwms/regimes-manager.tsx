"use client";

// FWMS — مدير المسارات (SPEC §12 — المرحلة 6ج): قائمة القوالب والحزم + منشئ المسارات + الإسناد
// منشئ المسارات: «نسخ مسار موجود وتعديله» — تعريف جزئي فوق القالب (بنود + خطوات) بلا كود
import { useCallback, useEffect, useMemo, useState } from "react";
import { BadgeCheck, Copy, Layers, LoaderCircle, Plus, ShieldQuestion, UserPlus } from "lucide-react";
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
import { apiRequest, ApiError, ListState, PageHeader } from "@/components/fwms/org-bits";

type Contribution = {
  id?: string;
  key: string;
  side: string;
  label: string;
  rateBp: number;
  amountCents: number | null;
  ceilingCents: number | null;
  basis: string;
  order: number;
  source?: string | null;
};

type RegimeRow = {
  id: string;
  companyId: string | null;
  scope: "platform" | "company";
  key: string;
  name: string;
  bundle: string;
  bundleStatus: string;
  minWageType: string;
  minWageCents: number;
  dailyHours: number;
  weeklyHours: number;
  annualHours: number | null;
  nightStart: string;
  nightEnd: string;
  monthlyDaysBasis: number;
  declarationProfile: string;
  version: number;
  isActive: boolean;
  source: string | null;
  needsAccountantConfirmation: boolean;
  confirmedBy: string | null;
  confirmedAt: string | null;
  notes: string | null;
  contributions: Contribution[];
  steps: { id: string; kind: string; order: number }[];
  assignmentsCount: number;
};

type AssignmentRow = {
  id: string;
  workerUserId: string;
  workerName: string;
  regimeKey: string;
  regimeName: string;
  regimeBundle: string;
  effectiveFrom: string;
  endedAt: string | null;
};

const BUNDLES = ["general", "agricultural", "public_civil_service", "public_entreprise", "custom"] as const;
const STEP_KINDS = [
  "employee_contributions",
  "pro_deduction_tiered",
  "ir_brackets",
  "family_deduction",
  "employer_contributions",
  "net_summary",
] as const;

export function RegimesManager({ role }: { role: string }) {
  const { t, locale } = useI18n();
  const { toast } = useToast();

  const [regimes, setRegimes] = useState<RegimeRow[]>([]);
  const [assignments, setAssignments] = useState<AssignmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  // نموذج الإنشاء (منشئ المسارات)
  const [form, setForm] = useState({
    name: "",
    bundle: "custom" as (typeof BUNDLES)[number],
    copyFromId: "",
    effectiveFrom: "",
    contributionsJson: "[]",
  });
  // نموذج الإسناد
  const [assignForm, setAssignForm] = useState({ regimeId: "", workerUserId: "", effectiveFrom: "" });

  const workers = useMemo(() => {
    const seen = new Map<string, string>();
    for (const a of assignments) seen.set(a.workerUserId, a.workerName);
    return [...seen.entries()];
  }, [assignments]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const [regimesData, assignmentsData] = await Promise.all([
        apiRequest<{ regimes: RegimeRow[] }>("/api/regimes", { cache: "no-store" }),
        apiRequest<{ assignments: AssignmentRow[] }>("/api/regime-assignments", { cache: "no-store" }),
      ]);
      setRegimes(regimesData.regimes);
      setAssignments(assignmentsData.assignments);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function createRegime() {
    if (busy) return;
    setBusy(true);
    try {
      let contributions: unknown = undefined;
      try {
        contributions = JSON.parse(form.contributionsJson);
      } catch {
        toast({ variant: "destructive", description: t("regimes.invalidJson") });
        return;
      }
      await apiRequest("/api/regimes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          bundle: form.bundle,
          copyFromId: form.copyFromId || undefined,
          effectiveFrom: form.effectiveFrom,
          definition: {
            ...(Array.isArray(contributions) && contributions.length > 0 ? { contributions } : {}),
          },
        }),
      });
      toast({ description: t("regimes.created") });
      setCreateOpen(false);
      setForm({ name: "", bundle: "custom", copyFromId: "", effectiveFrom: "", contributionsJson: "[]" });
      await load();
    } catch (e) {
      if (e instanceof ApiError) {
        toast({ variant: "destructive", description: t(`regimes.errors.${e.code}`, { defaultValue: e.code }) });
      } else {
        toast({ variant: "destructive", description: t("common.operationFailed") });
      }
    } finally {
      setBusy(false);
    }
  }

  async function confirmRegime(id: string) {
    if (busy) return;
    setBusy(true);
    try {
      await apiRequest(`/api/regimes/${id}/confirm`, { method: "POST" });
      toast({ description: t("regimes.confirmed") });
      await load();
    } catch (e) {
      if (e instanceof ApiError) {
        toast({ variant: "destructive", description: t(`regimes.errors.${e.code}`, { defaultValue: e.code }) });
      } else {
        toast({ variant: "destructive", description: t("common.operationFailed") });
      }
    } finally {
      setBusy(false);
    }
  }

  async function createAssignment() {
    if (busy) return;
    setBusy(true);
    try {
      await apiRequest("/api/regime-assignments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(assignForm),
      });
      toast({ description: t("regimes.assigned") });
      setAssignOpen(false);
      setAssignForm({ regimeId: "", workerUserId: "", effectiveFrom: "" });
      await load();
    } catch (e) {
      if (e instanceof ApiError) {
        toast({ variant: "destructive", description: t(`regimes.errors.${e.code}`, { defaultValue: e.code }) });
      } else {
        toast({ variant: "destructive", description: t("common.operationFailed") });
      }
    } finally {
      setBusy(false);
    }
  }

  const bundleLabel = (b: string) => t(`regimes.bundles.${b}`, { defaultValue: b });
  const isAccountant = role === "accountant" || role === "super_admin";
  const isAdmin = role === "admin" || role === "super_admin";

  return (
    <div className="space-y-6">
      <PageHeader title={t("regimes.title")} subtitle={t("regimes.subtitle")} />

      <div className="flex flex-wrap gap-2">
        <Button onClick={() => setCreateOpen(true)} className="gap-1.5">
          <Plus className="size-4" aria-hidden />
          {t("regimes.create")}
        </Button>
        {isAdmin && (
          <Button variant="outline" onClick={() => setAssignOpen(true)} className="gap-1.5">
            <UserPlus className="size-4" aria-hidden />
            {t("regimes.assignWorker")}
          </Button>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-1.5 text-base">
            <Layers className="size-4" aria-hidden />
            {t("regimes.listTitle")}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <ListState loading={loading} error={error} empty={regimes.length === 0} onRetry={() => void load()} />
          {!loading && !error && regimes.length > 0 && (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("regimes.name")}</TableHead>
                    <TableHead>{t("regimes.bundle")}</TableHead>
                    <TableHead>{t("regimes.status")}</TableHead>
                    <TableHead>{t("regimes.minWage")}</TableHead>
                    <TableHead>{t("regimes.night")}</TableHead>
                    <TableHead>{t("regimes.version")}</TableHead>
                    <TableHead className="text-end">{t("common.actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {regimes.map((r) => (
                    <TableRow key={r.id} className={r.isActive ? "" : "opacity-50"}>
                      <TableCell>
                        <button
                          type="button"
                          className="font-semibold text-start underline-offset-2 hover:underline"
                          onClick={() => setExpanded(expanded === r.id ? null : r.id)}
                        >
                          {r.name}
                        </button>
                        <div className="text-[11px] text-muted-foreground">
                          {r.scope === "platform" ? t("regimes.platformTemplate") : t("regimes.companyRegime")}
                          {r.assignmentsCount > 0 ? ` · ${t("regimes.workersCount", { count: r.assignmentsCount })}` : ""}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{bundleLabel(r.bundle)}</Badge>
                      </TableCell>
                      <TableCell>
                        {r.bundleStatus === "complete" ? (
                          <Badge className="gap-1">
                            <BadgeCheck className="size-3" aria-hidden />
                            {t("regimes.complete")}
                          </Badge>
                        ) : (
                          <Badge variant="destructive">{t("regimes.incomplete")}</Badge>
                        )}
                        {r.needsAccountantConfirmation && (
                          <div className="mt-1">
                            {r.confirmedAt ? (
                              <Badge variant="secondary">{t("regimes.confirmedBy")}</Badge>
                            ) : (
                              <Badge variant="outline" className="gap-1 border-amber-500 text-amber-600">
                                <ShieldQuestion className="size-3" aria-hidden />
                                {t("regimes.needsConfirmation")}
                              </Badge>
                            )}
                          </div>
                        )}
                      </TableCell>
                      <TableCell dir="ltr" className="font-mono text-xs">
                        {r.minWageType === "daily"
                          ? t("regimes.minWageDaily", { value: (r.minWageCents / 100).toFixed(2) })
                          : t("regimes.minWageHourly", { value: (r.minWageCents / 100).toFixed(2) })}
                      </TableCell>
                      <TableCell dir="ltr" className="font-mono text-xs">
                        {r.nightStart}–{r.nightEnd}
                      </TableCell>
                      <TableCell dir="ltr" className="font-mono text-xs">v{r.version}</TableCell>
                      <TableCell className="text-end">
                        <div className="flex justify-end gap-1">
                          {isAccountant && r.needsAccountantConfirmation && !r.confirmedAt && (
                            <Button size="sm" variant="outline" disabled={busy} onClick={() => void confirmRegime(r.id)}>
                              {t("regimes.confirm")}
                            </Button>
                          )}
                          {isAdmin && r.scope === "company" && r.bundleStatus === "complete" && (
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={busy}
                              onClick={() => {
                                setAssignForm({ regimeId: r.id, workerUserId: "", effectiveFrom: "" });
                                setAssignOpen(true);
                              }}
                            >
                              {t("regimes.assign")}
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

      {/* تفصيل المسار الموسّع: البنود والخطوات (شفافية «قائمة بنود لا دالة ثابتة») */}
      {expanded && (() => {
        const r = regimes.find((x) => x.id === expanded);
        if (!r) return null;
        return (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("regimes.detailTitle", { name: r.name })}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-4">
                <div><span className="text-muted-foreground">{t("regimes.dailyHours")}:</span> <span dir="ltr" className="font-mono">{r.dailyHours}h</span></div>
                <div><span className="text-muted-foreground">{t("regimes.weeklyHours")}:</span> <span dir="ltr" className="font-mono">{r.weeklyHours}h</span></div>
                <div><span className="text-muted-foreground">{t("regimes.annualHours")}:</span> <span dir="ltr" className="font-mono">{r.annualHours ? `${r.annualHours}h` : "—"}</span></div>
                <div><span className="text-muted-foreground">{t("regimes.monthlyDaysBasis")}:</span> <span dir="ltr" className="font-mono">{r.monthlyDaysBasis}</span></div>
                <div><span className="text-muted-foreground">{t("regimes.declarationProfile")}:</span> {r.declarationProfile}</div>
                {r.source && <div className="sm:col-span-2 lg:col-span-4"><span className="text-muted-foreground">{t("regimes.source")}:</span> {r.source}</div>}
                {r.notes && <div className="sm:col-span-2 lg:col-span-4 text-muted-foreground">{r.notes}</div>}
              </div>

              <div>
                <h4 className="mb-2 text-sm font-semibold">{t("regimes.contributionsTitle", { count: r.contributions.length })}</h4>
                {r.contributions.length === 0 ? (
                  <p className="text-xs text-muted-foreground">{t("regimes.noContributions")}</p>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{t("regimes.itemKey")}</TableHead>
                          <TableHead>{t("regimes.itemSide")}</TableHead>
                          <TableHead>{t("regimes.itemRate")}</TableHead>
                          <TableHead>{t("regimes.itemCeiling")}</TableHead>
                          <TableHead>{t("regimes.itemBasis")}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {r.contributions.map((c, i) => (
                          <TableRow key={c.key + i}>
                            <TableCell className="font-mono text-xs">{c.key}</TableCell>
                            <TableCell>{t(`regimes.sides.${c.side}`, { defaultValue: c.side })}</TableCell>
                            <TableCell dir="ltr" className="font-mono text-xs">
                              {c.rateBp > 0 ? `${(c.rateBp / 10000).toFixed(2)}%` : `${((c.amountCents ?? 0) / 100).toFixed(2)} MAD`}
                            </TableCell>
                            <TableCell dir="ltr" className="font-mono text-xs">
                              {c.ceilingCents ? `${(c.ceilingCents / 100).toFixed(0)} MAD` : "—"}
                            </TableCell>
                            <TableCell className="text-xs">{c.basis}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>

              <div>
                <h4 className="mb-2 text-sm font-semibold">{t("regimes.stepsTitle", { count: r.steps.length })}</h4>
                {r.steps.length === 0 ? (
                  <p className="text-xs text-muted-foreground">{t("regimes.noSteps")}</p>
                ) : (
                  <ol className="space-y-1 text-xs">
                    {r.steps.map((s) => (
                      <li key={s.id} className="flex items-center gap-2">
                        <Badge variant="secondary" className="font-mono">{s.order}</Badge>
                        <span className="font-mono">{s.kind}</span>
                        <span className="text-muted-foreground">{t(`regimes.stepKinds.${s.kind}`, { defaultValue: "" })}</span>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })()}

      {/* الإسنادات الحالية */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("regimes.assignmentsTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <ListState loading={loading} error={false} empty={assignments.length === 0} onRetry={() => void load()} />
          {!loading && assignments.length > 0 && (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("regimes.worker")}</TableHead>
                    <TableHead>{t("regimes.regime")}</TableHead>
                    <TableHead>{t("regimes.effectiveFrom")}</TableHead>
                    <TableHead>{t("regimes.endedAt")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {assignments.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell className="font-semibold">{a.workerName}</TableCell>
                      <TableCell>{a.regimeName}</TableCell>
                      <TableCell dir="ltr" className="font-mono text-xs">{a.effectiveFrom.slice(0, 10)}</TableCell>
                      <TableCell dir="ltr" className="font-mono text-xs">{a.endedAt ? a.endedAt.slice(0, 10) : "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* حوار منشئ المسارات */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-1.5">
              <Copy className="size-4" aria-hidden />
              {t("regimes.createTitle")}
            </DialogTitle>
            <DialogDescription>{t("regimes.createDesc")}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="regime-name">{t("common.name")}</Label>
              <Input id="regime-name" maxLength={120} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="regime-bundle">{t("regimes.bundle")}</Label>
              <Select value={form.bundle} onValueChange={(v) => setForm({ ...form, bundle: v as (typeof BUNDLES)[number] })}>
                <SelectTrigger id="regime-bundle">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BUNDLES.map((b) => (
                    <SelectItem key={b} value={b}>{bundleLabel(b)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="regime-copy">{t("regimes.copyFrom")}</Label>
              <Select value={form.copyFromId} onValueChange={(v) => setForm({ ...form, copyFromId: v })}>
                <SelectTrigger id="regime-copy">
                  <SelectValue placeholder={t("regimes.copyFromNone")} />
                </SelectTrigger>
                <SelectContent>
                  {regimes.filter((r) => r.bundleStatus === "complete").map((r) => (
                    <SelectItem key={r.id} value={r.id}>{r.name} (v{r.version})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="regime-from">{t("regimes.effectiveFrom")}</Label>
              <Input id="regime-from" type="date" value={form.effectiveFrom} onChange={(e) => setForm({ ...form, effectiveFrom: e.target.value })} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="regime-contributions">{t("regimes.contributionsJson")}</Label>
              <Textarea
                id="regime-contributions"
                dir="ltr"
                className="min-h-24 font-mono text-xs"
                value={form.contributionsJson}
                onChange={(e) => setForm({ ...form, contributionsJson: e.target.value })}
                placeholder={t("regimes.contributionsPlaceholder")}
              />
              <p className="text-xs text-muted-foreground">{t("regimes.contributionsHint")}</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>{t("common.cancel")}</Button>
            <Button onClick={() => void createRegime()} disabled={busy || !form.name.trim() || !form.effectiveFrom} className="gap-1.5">
              {busy && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
              {t("regimes.create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* حوار الإسناد */}
      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("regimes.assignTitle")}</DialogTitle>
            <DialogDescription>{t("regimes.assignDesc")}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="assign-regime">{t("regimes.regime")}</Label>
              <Select value={assignForm.regimeId} onValueChange={(v) => setAssignForm({ ...assignForm, regimeId: v })}>
                <SelectTrigger id="assign-regime">
                  <SelectValue placeholder={t("regimes.selectRegime")} />
                </SelectTrigger>
                <SelectContent>
                  {regimes.filter((r) => r.bundleStatus === "complete" && r.isActive).map((r) => (
                    <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="assign-worker">{t("regimes.worker")}</Label>
              <Select value={assignForm.workerUserId} onValueChange={(v) => setAssignForm({ ...assignForm, workerUserId: v })}>
                <SelectTrigger id="assign-worker">
                  <SelectValue placeholder={t("regimes.selectWorker")} />
                </SelectTrigger>
                <SelectContent>
                  {workers.map(([id, name]) => (
                    <SelectItem key={id} value={id}>{name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="assign-from">{t("regimes.effectiveFrom")}</Label>
              <Input id="assign-from" type="date" value={assignForm.effectiveFrom} onChange={(e) => setAssignForm({ ...assignForm, effectiveFrom: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignOpen(false)}>{t("common.cancel")}</Button>
            <Button onClick={() => void createAssignment()} disabled={busy || !assignForm.regimeId || !assignForm.workerUserId || !assignForm.effectiveFrom} className="gap-1.5">
              {busy && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
              {t("regimes.assign")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <p className="sr-only">{locale}</p>
    </div>
  );
}
