"use client";

// HRMP — مدير الورديات المتكررة والمتناوبة (المرحلة 3 — SPEC §4.1): قواعد تولّد الورديات تلقائيًا
// fixed: قالب ثابت بأيام أسبوع | rotating: دورة قوالب مرتبة تتقدم كل N يومًا
// الأمان: الصلاحية تُفحص في الخادم (API) — هذه الواجهة عرض فقط
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Repeat, Plus, Pencil, Archive, ArchiveRestore, WandSparkles, ArrowUp, ArrowDown, X, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";
import { addDaysToLocalDate } from "@/lib/scheduling";
import { PageHeader, StatusBadge, ConfirmAction, ListState, apiRequest, apiErrorMessage } from "@/components/hrmp/org-bits";

type RecurrenceRow = {
  id: string;
  mode: string;
  status: string;
  startsOn: string;
  endsOn: string | null;
  rotationStepDays: number;
  weekdays: number[] | null;
  worker: { id: string; fullName: string } | null;
  site: { id: string; name: string } | null;
  template: { id: string; name: string } | null;
  rotation: { id: string; name: string; archived: boolean }[] | null;
  createdAt: string;
};

type Member = { userId: string; fullName: string };
type SiteOption = { id: string; name: string };
type TemplateOption = { id: string; name: string; status: string };

type RecForm = {
  mode: "fixed" | "rotating";
  workerId: string;
  siteId: string;
  templateId: string; // "none" = لم يُختر (fixed)
  weekdays: number[];
  rotation: string[]; // معرفات قوالب مرتبة (rotating)
  rotationStepDays: string;
  startsOn: string;
  endsOn: string;
};

type GenerateResult = { created: number; skippedCount: number; skipped: { localDate: string; templateName: string }[] };

const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

const EMPTY_FORM: RecForm = {
  mode: "fixed",
  workerId: "",
  siteId: "",
  templateId: "none",
  weekdays: [0, 1, 2, 3, 4],
  rotation: [],
  rotationStepDays: "7",
  startsOn: "",
  endsOn: "",
};

export function RecurrencesManager({ today }: { today: string }) {
  const { t } = useI18n();
  const { toast } = useToast();

  const [rows, setRows] = useState<RecurrenceRow[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [sites, setSites] = useState<SiteOption[]>([]);
  const [templates, setTemplates] = useState<TemplateOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [statusFilter, setStatusFilter] = useState<"active" | "archived" | "all">("active");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<RecForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  // توليد الورديات
  const [genRow, setGenRow] = useState<RecurrenceRow | null>(null);
  const [genFrom, setGenFrom] = useState(today);
  const [genTo, setGenTo] = useState(addDaysToLocalDate(today, 13));
  const [genResult, setGenResult] = useState<GenerateResult | null>(null);
  const [generating, setGenerating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      const data = await apiRequest<{ recurrences: RecurrenceRow[] }>(`/api/shift-recurrences?${params.toString()}`);
      setRows(data.recurrences);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void apiRequest<{ members: Member[] }>("/api/members")
      .then((d) => setMembers(d.members))
      .catch(() => setMembers([]));
    void apiRequest<{ sites: SiteOption[] }>("/api/sites-options")
      .then((d) => setSites(d.sites))
      .catch(() => setSites([]));
    void apiRequest<{ templates: TemplateOption[] }>("/api/shift-templates")
      .then((d) => setTemplates(d.templates))
      .catch(() => setTemplates([]));
  }, []);

  function openCreate() {
    setEditingId(null);
    setForm({ ...EMPTY_FORM, startsOn: today, workerId: members[0]?.userId ?? "", siteId: "" });
    setDialogOpen(true);
  }

  function openEdit(row: RecurrenceRow) {
    setEditingId(row.id);
    setForm({
      mode: row.mode === "rotating" ? "rotating" : "fixed",
      workerId: row.worker?.id ?? "",
      siteId: row.site?.id ?? "",
      templateId: row.template?.id ?? "none",
      weekdays: row.weekdays ?? [0, 1, 2, 3, 4],
      rotation: row.rotation?.map((r) => r.id) ?? [],
      rotationStepDays: String(row.rotationStepDays),
      startsOn: row.startsOn,
      endsOn: row.endsOn ?? "",
    });
    setDialogOpen(true);
  }

  function toggleWeekday(day: number) {
    setForm((f) => ({
      ...f,
      weekdays: f.weekdays.includes(day) ? f.weekdays.filter((d) => d !== day) : [...f.weekdays, day].sort((a, b) => a - b),
    }));
  }

  function addRotationTemplate(templateId: string) {
    setForm((f) => (f.rotation.includes(templateId) ? f : { ...f, rotation: [...f.rotation, templateId] }));
  }

  function moveRotation(index: number, delta: -1 | 1) {
    setForm((f) => {
      const next = [...f.rotation];
      const target = index + delta;
      if (target < 0 || target >= next.length) return f;
      [next[index], next[target]] = [next[target], next[index]];
      return { ...f, rotation: next };
    });
  }

  function templateById(id: string): TemplateOption | undefined {
    return templates.find((x) => x.id === id);
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (saving) return;

    const stepDays = Number.parseInt(form.rotationStepDays, 10) || 7;
    const valid =
      form.workerId &&
      form.siteId &&
      form.startsOn &&
      (form.mode === "fixed"
        ? form.templateId !== "none" && form.weekdays.length > 0
        : form.rotation.length >= 2) &&
      stepDays >= 1 &&
      stepDays <= 28 &&
      (!form.endsOn || form.startsOn <= form.endsOn);

    if (!valid) {
      toast({ variant: "destructive", description: t("common.invalidInput") });
      return;
    }

    const body = JSON.stringify({
      workerUserId: form.workerId,
      siteId: form.siteId,
      mode: form.mode,
      templateId: form.mode === "fixed" ? form.templateId : "",
      weekdays: form.mode === "fixed" ? form.weekdays : undefined,
      rotationTemplateIds: form.mode === "rotating" ? form.rotation : undefined,
      rotationStepDays: stepDays,
      startsOn: form.startsOn,
      endsOn: form.endsOn,
    });

    setSaving(true);
    try {
      if (editingId) {
        // تعديل محدود للنطاق والأيام والخطوة (تبديل العامل/الموقع/القوالب بقاعدة جديدة)
        const patch =
          form.mode === "fixed"
            ? JSON.stringify({ startsOn: form.startsOn, endsOn: form.endsOn, weekdays: form.weekdays })
            : JSON.stringify({ startsOn: form.startsOn, endsOn: form.endsOn, rotationStepDays: stepDays });
        await apiRequest(`/api/shift-recurrences/${editingId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: patch,
        });
        toast({ description: t("recurrences.updated") });
      } else {
        await apiRequest("/api/shift-recurrences", { method: "POST", headers: { "Content-Type": "application/json" }, body });
        toast({ description: t("recurrences.created") });
      }
      setDialogOpen(false);
      await load();
    } catch (err) {
      toast({ variant: "destructive", description: apiErrorMessage(t, err) });
    } finally {
      setSaving(false);
    }
  }

  function openGenerate(row: RecurrenceRow) {
    setGenRow(row);
    setGenFrom(today);
    setGenTo(addDaysToLocalDate(today, 13));
    setGenResult(null);
  }

  async function onGenerate() {
    if (!genRow || generating) return;
    setGenerating(true);
    try {
      const res = await apiRequest<GenerateResult>(`/api/shift-recurrences/${genRow.id}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from: genFrom, to: genTo }),
      });
      setGenResult(res);
      toast({
        description: `${res.created} ${t("recurrences.generatedCreated")} — ${res.skippedCount} ${t("recurrences.generatedSkipped")}`,
      });
      await load();
    } catch (err) {
      toast({ variant: "destructive", description: apiErrorMessage(t, err) });
    } finally {
      setGenerating(false);
    }
  }

  async function onArchive(row: RecurrenceRow) {
    try {
      await apiRequest(`/api/shift-recurrences/${row.id}`, { method: "DELETE" });
      toast({ description: t("recurrences.archived") });
    } catch (err) {
      toast({ variant: "destructive", description: apiErrorMessage(t, err) });
    }
    await load();
  }

  async function onRestore(row: RecurrenceRow) {
    try {
      await apiRequest(`/api/shift-recurrences/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "active" }),
      });
      toast({ description: t("recurrences.restored") });
    } catch (err) {
      toast({ variant: "destructive", description: apiErrorMessage(t, err) });
    }
    await load();
  }

  function weekdaysLabel(weekdays: number[] | null): string {
    if (!weekdays || weekdays.length === 0) return "—";
    return weekdays.map((d) => t(`daysShort.${DAY_KEYS[d]}`)).join("، ");
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <PageHeader title={t("recurrences.title")} subtitle={t("recurrences.subtitle")}>
        <Button onClick={openCreate} className="gap-2 font-bold">
          <Plus className="size-4" aria-hidden />
          {t("recurrences.createTitle")}
        </Button>
      </PageHeader>

      <div className="flex flex-wrap items-center gap-2">
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
          <SelectTrigger className="w-40" aria-label={t("common.status")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="active">{t("common.active")}</SelectItem>
            <SelectItem value="archived">{t("common.archived")}</SelectItem>
            <SelectItem value="all">{t("common.showArchived")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card className="border-border/70">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base font-bold">
            <Repeat className="size-4 text-primary" aria-hidden />
            {t("recurrences.title")}
            <Badge variant="secondary" className="ms-1 tabular-nums">{rows.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ListState loading={loading && rows.length === 0} error={error} empty={!error && rows.length === 0} onRetry={() => void load()} />
          {!loading && !error && rows.length > 0 && (
            <div className="max-h-96 overflow-y-auto rounded-lg border border-border/60">
              <Table>
                <TableHeader className="sticky top-0 bg-muted/95 backdrop-blur">
                  <TableRow>
                    <TableHead className="text-xs">{t("shifts.worker")}</TableHead>
                    <TableHead className="text-xs">{t("shifts.site")}</TableHead>
                    <TableHead className="text-xs">{t("recurrences.mode")}</TableHead>
                    <TableHead className="text-xs">{t("recurrences.startsOn")}</TableHead>
                    <TableHead className="text-xs">{t("recurrences.endsOn")}</TableHead>
                    <TableHead className="text-xs">{t("common.status")}</TableHead>
                    <TableHead className="text-xs">{t("common.actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="text-xs font-semibold">{row.worker?.fullName ?? "—"}</TableCell>
                      <TableCell className="text-xs">{row.site?.name ?? "—"}</TableCell>
                      <TableCell className="max-w-72 text-xs">
                        {row.mode === "fixed" ? (
                          <div className="flex flex-col gap-0.5">
                            <Badge variant="outline" className="w-fit text-[10px] font-semibold">{t("recurrences.modeFixed")}</Badge>
                            <span className="text-muted-foreground">
                              {row.template?.name ?? "—"} — {weekdaysLabel(row.weekdays)}
                            </span>
                          </div>
                        ) : (
                          <div className="flex flex-col gap-0.5">
                            <Badge variant="outline" className="w-fit text-[10px] font-semibold">{t("recurrences.modeRotating")}</Badge>
                            <span className="text-muted-foreground" dir="ltr">
                              {row.rotation?.map((r) => r.name).join(" → ") ?? "—"}
                            </span>
                            <span className="text-[10px] text-muted-foreground">
                              {row.rotationStepDays} {t("recurrences.rotationStepDays")}
                            </span>
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-xs tabular-nums" dir="ltr">{row.startsOn}</TableCell>
                      <TableCell className="font-mono text-xs tabular-nums" dir="ltr">
                        {row.endsOn ?? t("recurrences.openEnded")}
                      </TableCell>
                      <TableCell><StatusBadge status={row.status} /></TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          {row.status === "active" && (
                            <Button variant="ghost" size="sm" className="h-8 gap-1.5 px-2 text-xs font-semibold" onClick={() => openGenerate(row)}>
                              <WandSparkles className="size-4 text-primary" aria-hidden />
                              {t("recurrences.generate")}
                            </Button>
                          )}
                          <Button variant="ghost" size="icon" className="size-8" onClick={() => openEdit(row)} aria-label={t("common.edit")}>
                            <Pencil className="size-4" aria-hidden />
                          </Button>
                          {row.status === "active" ? (
                            <ConfirmAction
                              triggerLabel={<><Archive className="size-4" aria-hidden />{t("common.archive")}</>}
                              triggerClassName="h-8 gap-1.5 px-2 text-xs text-destructive hover:text-destructive"
                              title={t("recurrences.title")}
                              description={t("recurrences.confirmArchive")}
                              confirmLabel={t("common.archive")}
                              onConfirm={() => onArchive(row)}
                            />
                          ) : (
                            <Button variant="ghost" size="sm" className="h-8 gap-1.5 px-2 text-xs" onClick={() => void onRestore(row)}>
                              <ArchiveRestore className="size-4" aria-hidden />
                              {t("common.restore")}
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

      {/* حوار الإنشاء/التعديل */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingId ? t("common.edit") : t("recurrences.createTitle")}</DialogTitle>
            <DialogDescription>{t("recurrences.subtitle")}</DialogDescription>
          </DialogHeader>

          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label htmlFor="rec-mode">{t("recurrences.mode")}</Label>
                <Select
                  value={form.mode}
                  onValueChange={(v) => setForm((f) => ({ ...f, mode: v as RecForm["mode"] }))}
                  disabled={Boolean(editingId)}
                >
                  <SelectTrigger id="rec-mode">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fixed">{t("recurrences.modeFixed")}</SelectItem>
                    <SelectItem value="rotating">{t("recurrences.modeRotating")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="rec-worker">{t("shifts.worker")}</Label>
                <Select
                  value={form.workerId}
                  onValueChange={(v) => setForm((f) => ({ ...f, workerId: v }))}
                  disabled={Boolean(editingId)}
                >
                  <SelectTrigger id="rec-worker">
                    <SelectValue placeholder={t("shifts.worker")} />
                  </SelectTrigger>
                  <SelectContent>
                    {members.map((m) => (
                      <SelectItem key={m.userId} value={m.userId}>{m.fullName}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-2 sm:col-span-2">
                <Label htmlFor="rec-site">{t("shifts.site")}</Label>
                <Select
                  value={form.siteId}
                  onValueChange={(v) => setForm((f) => ({ ...f, siteId: v }))}
                  disabled={Boolean(editingId)}
                >
                  <SelectTrigger id="rec-site">
                    <SelectValue placeholder={t("shifts.site")} />
                  </SelectTrigger>
                  <SelectContent>
                    {sites.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {form.mode === "fixed" ? (
                <>
                  <div className="flex flex-col gap-2 sm:col-span-2">
                    <Label htmlFor="rec-template">{t("shifts.template")}</Label>
                    <Select
                      value={form.templateId}
                      onValueChange={(v) => setForm((f) => ({ ...f, templateId: v }))}
                      disabled={Boolean(editingId)}
                    >
                      <SelectTrigger id="rec-template">
                        <SelectValue placeholder={t("shifts.template")} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">{t("templates.noTemplate")}</SelectItem>
                        {templates
                          .filter((x) => x.status === "active")
                          .map((x) => (
                            <SelectItem key={x.id} value={x.id}>{x.name}</SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex flex-col gap-2 sm:col-span-2">
                    <Label>{t("recurrences.weekdays")}</Label>
                    <div className="flex flex-wrap gap-1.5" role="group" aria-label={t("recurrences.weekdays")}>
                      {DAY_KEYS.map((day, index) => {
                        const active = form.weekdays.includes(index);
                        return (
                          <button
                            key={day}
                            type="button"
                            onClick={() => toggleWeekday(index)}
                            aria-pressed={active}
                            className={cn(
                              "h-9 min-w-11 rounded-lg border px-2 text-xs font-semibold transition-colors",
                              active
                                ? "border-primary bg-primary text-primary-foreground"
                                : "border-border bg-background text-muted-foreground hover:bg-muted"
                            )}
                          >
                            {t(`daysShort.${day}`)}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex flex-col gap-2 sm:col-span-2">
                    <Label>{t("recurrences.rotationTemplates")}</Label>
                    <p className="text-xs text-muted-foreground">{t("recurrences.rotationOrderHint")}</p>
                    <div className="flex flex-col gap-1.5">
                      {form.rotation.map((id, index) => {
                        const tpl = templateById(id);
                        return (
                          <div key={id} className="flex items-center gap-2 rounded-lg border border-border/60 bg-muted/30 px-3 py-2">
                            <Badge variant="secondary" className="tabular-nums">{index + 1}</Badge>
                            <span className="flex-1 truncate text-sm font-medium">{tpl?.name ?? id}</span>
                            <Button type="button" variant="ghost" size="icon" className="size-7" onClick={() => moveRotation(index, -1)} disabled={index === 0} aria-label={t("recurrences.moveUp")}>
                              <ArrowUp className="size-3.5" aria-hidden />
                            </Button>
                            <Button type="button" variant="ghost" size="icon" className="size-7" onClick={() => moveRotation(index, 1)} disabled={index === form.rotation.length - 1} aria-label={t("recurrences.moveDown")}>
                              <ArrowDown className="size-3.5" aria-hidden />
                            </Button>
                            <Button type="button" variant="ghost" size="icon" className="size-7 text-destructive" onClick={() => setForm((f) => ({ ...f, rotation: f.rotation.filter((x) => x !== id) }))} aria-label={t("recurrences.remove")} disabled={Boolean(editingId)}>
                              <X className="size-3.5" aria-hidden />
                            </Button>
                          </div>
                        );
                      })}
                      {!editingId && (
                        <div className="flex items-center gap-2">
                          <Select value="" onValueChange={addRotationTemplate}>
                            <SelectTrigger className="flex-1" aria-label={t("recurrences.addTemplate")}>
                              <SelectValue placeholder={t("recurrences.addTemplate")} />
                            </SelectTrigger>
                            <SelectContent>
                              {templates
                                .filter((x) => x.status === "active" && !form.rotation.includes(x.id))
                                .map((x) => (
                                  <SelectItem key={x.id} value={x.id}>{x.name}</SelectItem>
                                ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col gap-2">
                    <Label htmlFor="rec-step">{t("recurrences.rotationStepDays")}</Label>
                    <Input
                      id="rec-step"
                      type="number"
                      min={1}
                      max={28}
                      value={form.rotationStepDays}
                      onChange={(e) => setForm((f) => ({ ...f, rotationStepDays: e.target.value }))}
                      dir="ltr"
                      disabled={saving}
                    />
                    <p className="text-xs text-muted-foreground">{t("recurrences.stepHint")}</p>
                  </div>
                </>
              )}

              <div className="flex flex-col gap-2">
                <Label htmlFor="rec-starts">{t("recurrences.startsOn")}</Label>
                <Input
                  id="rec-starts"
                  type="date"
                  value={form.startsOn}
                  onChange={(e) => setForm((f) => ({ ...f, startsOn: e.target.value }))}
                  dir="ltr"
                  required
                  disabled={saving}
                />
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="rec-ends">{t("recurrences.endsOn")}</Label>
                <Input
                  id="rec-ends"
                  type="date"
                  value={form.endsOn}
                  onChange={(e) => setForm((f) => ({ ...f, endsOn: e.target.value }))}
                  dir="ltr"
                  disabled={saving}
                />
              </div>
            </div>

            <DialogFooter>
              <Button type="submit" disabled={saving} className="gap-2 font-bold">
                {saving && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
                {saving ? t("common.saving") : t("common.save")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* حوار توليد الورديات مع تقرير النتيجة */}
      <Dialog open={genRow !== null} onOpenChange={(open) => !open && setGenRow(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("recurrences.generateTitle")}</DialogTitle>
            <DialogDescription>{t("recurrences.generateHint")}</DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4">
            {genRow && (
              <p className="text-sm">
                <span className="font-semibold">{genRow.worker?.fullName ?? "—"}</span>
                {" — "}
                <span className="text-muted-foreground">{genRow.site?.name ?? "—"}</span>
              </p>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label htmlFor="gen-from">{t("recurrences.generateFrom")}</Label>
                <Input id="gen-from" type="date" value={genFrom} onChange={(e) => setGenFrom(e.target.value)} dir="ltr" />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="gen-to">{t("recurrences.generateTo")}</Label>
                <Input id="gen-to" type="date" value={genTo} onChange={(e) => setGenTo(e.target.value)} dir="ltr" />
              </div>
            </div>

            {genResult && (
              <Alert role="status">
                <AlertDescription className="flex flex-col gap-1">
                  <span className="font-semibold">
                    {genResult.created} {t("recurrences.generatedCreated")} — {genResult.skippedCount} {t("recurrences.generatedSkipped")}
                  </span>
                  {genResult.skipped.slice(0, 10).map((s, i) => (
                    <span key={`${s.localDate}-${i}`} className="text-xs text-muted-foreground" dir="ltr">
                      • {s.localDate} — {s.templateName}
                    </span>
                  ))}
                </AlertDescription>
              </Alert>
            )}

            <DialogFooter>
              <Button onClick={() => void onGenerate()} disabled={generating} className="gap-2 font-bold">
                {generating && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
                <WandSparkles className="size-4" aria-hidden />
                {t("recurrences.generate")}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
