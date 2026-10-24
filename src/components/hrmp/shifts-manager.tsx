"use client";

// HRMP — مدير الورديات (المرحلة 3 — SPEC §4.1 و§8): إسناد عامل/موقع/وقت مع منع التعارض
// معيار قبول المرحلة: النظام يرفض تعارضاً — يُعرض التعارض في الحوار فور المحاولة
// الأمان: الصلاحية تُفحص في الخادم (API)؛ co_admin يرى ويدرّج تعديلات اليوم فقط (SPEC §3)
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { CalendarDays, MoonStar, Plus, Pencil, Ban, RotateCcw, LoaderCircle, TriangleAlert } from "lucide-react";
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
import {
  minutesToLabel,
  grossMinutesOf,
  addDaysToLocalDate,
  weekdayOfLocalDate,
  isShiftManager,
  MAX_WORK_MINUTES,
} from "@/lib/scheduling";
import { PageHeader, StatusBadge, ConfirmAction, ListState, formatDate, apiRequest, apiErrorMessage, ApiError } from "@/components/hrmp/org-bits";

type ShiftRow = {
  id: string;
  localDate: string;
  startTimeMin: number;
  endTimeMin: number;
  breakMinutes: number;
  status: string;
  source: string;
  notes: string | null;
  worker: { id: string; fullName: string } | null;
  site: { id: string; name: string } | null;
  template: { id: string; name: string } | null;
};

type Member = { userId: string; fullName: string; email: string; role: string };
type SiteOption = { id: string; name: string };
type TemplateOption = { id: string; name: string; startTimeMin: number; endTimeMin: number; breakMinutes: number; status: string };

type ConflictRow = {
  id: string;
  localDate: string;
  startLabel: string;
  endLabel: string;
  siteName: string | null;
  templateName: string | null;
};

type ShiftForm = {
  workerId: string;
  siteId: string;
  templateId: string; // "none" = بلا قالب
  localDate: string;
  startTime: string;
  endTime: string;
  breakMinutes: string;
  notes: string;
};

const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
const SOURCE_LABEL_KEYS: Record<string, string> = {
  manual: "shifts.sourceManual",
  recurrence: "shifts.sourceRecurrence",
  rotation: "shifts.sourceRotation",
};

function toMinutes(label: string): number {
  const [h, m] = label.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

function hoursLabel(workMinutes: number): string {
  const h = workMinutes / 60;
  return Number.isInteger(h) ? String(h) : h.toFixed(1);
}

export function ShiftsManager({ role, today }: { role: string; today: string }) {
  const { t, locale } = useI18n();
  const { toast } = useToast();

  const canManage = isShiftManager(role);

  const [shifts, setShifts] = useState<ShiftRow[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [sites, setSites] = useState<SiteOption[]>([]);
  const [templates, setTemplates] = useState<TemplateOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  // التصفية
  const [from, setFrom] = useState(addDaysToLocalDate(today, -7));
  const [to, setTo] = useState(addDaysToLocalDate(today, 30));
  const [workerFilter, setWorkerFilter] = useState("all");
  const [siteFilter, setSiteFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<"scheduled" | "cancelled" | "all">("scheduled");

  // الحوار
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ShiftForm>({
    workerId: "",
    siteId: "",
    templateId: "none",
    localDate: today,
    startTime: "08:00",
    endTime: "17:00",
    breakMinutes: "0",
    notes: "",
  });
  const [saving, setSaving] = useState(false);
  const [conflicts, setConflicts] = useState<ConflictRow[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const params = new URLSearchParams({ from, to });
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (workerFilter !== "all") params.set("workerUserId", workerFilter);
      if (siteFilter !== "all") params.set("siteId", siteFilter);
      const data = await apiRequest<{ shifts: ShiftRow[] }>(`/api/shifts?${params.toString()}`);
      setShifts(data.shifts);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [from, to, statusFilter, workerFilter, siteFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  // خيارات التصفية والنماذج: الأعضاء والمواقع عند التحميل، القوالب عند فتح الحوار
  useEffect(() => {
    void apiRequest<{ members: Member[] }>("/api/members")
      .then((d) => setMembers(d.members))
      .catch(() => setMembers([]));
    void apiRequest<{ sites: SiteOption[] }>("/api/sites-options")
      .then((d) => setSites(d.sites))
      .catch(() => setSites([]));
  }, []);

  useEffect(() => {
    if (!dialogOpen) return;
    void apiRequest<{ templates: TemplateOption[] }>("/api/shift-templates")
      .then((d) => setTemplates(d.templates))
      .catch(() => setTemplates([]));
  }, [dialogOpen]);

  function openCreate() {
    setEditingId(null);
    setConflicts([]);
    setForm({
      workerId: members[0]?.userId ?? "",
      siteId: "",
      templateId: "none",
      localDate: today,
      startTime: "08:00",
      endTime: "17:00",
      breakMinutes: "0",
      notes: "",
    });
    setDialogOpen(true);
  }

  function openEdit(row: ShiftRow) {
    setEditingId(row.id);
    setConflicts([]);
    setForm({
      workerId: row.worker?.id ?? "",
      siteId: row.site?.id ?? "",
      templateId: row.template?.id ?? "none",
      localDate: row.localDate,
      startTime: minutesToLabel(row.startTimeMin),
      endTime: minutesToLabel(row.endTimeMin),
      breakMinutes: String(row.breakMinutes),
      notes: row.notes ?? "",
    });
    setDialogOpen(true);
  }

  // اختيار قالب يملأ الأوقات تلقائيًا (SPEC §4.1: القالب يحدد قيمًا افتراضية)
  function onTemplateChange(templateId: string) {
    setForm((f) => {
      if (templateId === "none") return { ...f, templateId };
      const tpl = templates.find((x) => x.id === templateId);
      if (!tpl) return { ...f, templateId };
      return {
        ...f,
        templateId,
        startTime: minutesToLabel(tpl.startTimeMin),
        endTime: minutesToLabel(tpl.endTimeMin),
        breakMinutes: String(tpl.breakMinutes),
      };
    });
  }

  function warningsToast(warnings: string[]) {
    const texts = warnings
      .map((w) => (w === "rest_day" ? t("shifts.warningRestDay") : w === "long_day" ? t("shifts.warningLongDay") : null))
      .filter((x): x is string => Boolean(x));
    if (texts.length > 0) {
      toast({ description: `${t("shifts.warnings")}: ${texts.join(" — ")}` });
    }
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (saving) return;

    const startTimeMin = toMinutes(form.startTime);
    const endTimeMin = toMinutes(form.endTime);
    const breakMinutes = Number.parseInt(form.breakMinutes, 10) || 0;
    const work = grossMinutesOf(startTimeMin, endTimeMin) - breakMinutes;

    if (
      !form.workerId ||
      !form.siteId ||
      !form.localDate ||
      !form.startTime ||
      !form.endTime ||
      work <= 0 ||
      work > MAX_WORK_MINUTES
    ) {
      toast({ variant: "destructive", description: t("common.invalidInput") });
      return;
    }

    const body = JSON.stringify({
      workerUserId: form.workerId,
      siteId: form.siteId,
      templateId: form.templateId === "none" ? "" : form.templateId,
      localDate: form.localDate,
      startTimeMin,
      endTimeMin,
      breakMinutes,
      notes: form.notes.trim(),
    });

    setSaving(true);
    setConflicts([]);
    try {
      if (editingId) {
        await apiRequest(`/api/shifts/${editingId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body });
        toast({ description: t("shifts.updated") });
      } else {
        const res = await apiRequest<{ warnings: string[] }>("/api/shifts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
        });
        toast({ description: t("shifts.created") });
        warningsToast(res.warnings ?? []);
      }
      setDialogOpen(false);
      await load();
    } catch (err) {
      // معيار القبول: التعارض يظهر للمستخدم فور المحاولة (409 من الخادم)
      if (err instanceof ApiError && err.code === "shift_conflict") {
        const list = (err.data as { conflicts?: ConflictRow[] } | null)?.conflicts ?? [];
        setConflicts(list);
        toast({ variant: "destructive", description: t("shifts.conflictTitle") });
      } else {
        toast({ variant: "destructive", description: apiErrorMessage(t, err) });
      }
    } finally {
      setSaving(false);
    }
  }

  async function onCancel(row: ShiftRow) {
    try {
      await apiRequest(`/api/shifts/${row.id}`, { method: "DELETE" });
      toast({ description: t("shifts.cancelled") });
    } catch (err) {
      toast({ variant: "destructive", description: apiErrorMessage(t, err) });
    }
    await load();
  }

  async function onRestore(row: ShiftRow) {
    try {
      await apiRequest(`/api/shifts/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "scheduled" }),
      });
      toast({ description: t("shifts.restored") });
    } catch (err) {
      toast({ variant: "destructive", description: apiErrorMessage(t, err) });
    }
    await load();
  }

  const crosses = toMinutes(form.endTime) <= toMinutes(form.startTime);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <PageHeader title={t("shifts.title")} subtitle={t("shifts.subtitle")}>
        {canManage && (
          <Button onClick={openCreate} className="gap-2 font-bold">
            <Plus className="size-4" aria-hidden />
            {t("shifts.createTitle")}
          </Button>
        )}
      </PageHeader>

      {/* أدوات التصفية */}
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor="flt-from" className="text-xs text-muted-foreground">{t("shifts.from")}</Label>
          <Input id="flt-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} dir="ltr" className="w-40" />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="flt-to" className="text-xs text-muted-foreground">{t("shifts.to")}</Label>
          <Input id="flt-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} dir="ltr" className="w-40" />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="flt-worker" className="text-xs text-muted-foreground">{t("shifts.worker")}</Label>
          <Select value={workerFilter} onValueChange={setWorkerFilter}>
            <SelectTrigger id="flt-worker" className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("common.all")}</SelectItem>
              {members.map((m) => (
                <SelectItem key={m.userId} value={m.userId}>{m.fullName}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="flt-site" className="text-xs text-muted-foreground">{t("shifts.site")}</Label>
          <Select value={siteFilter} onValueChange={setSiteFilter}>
            <SelectTrigger id="flt-site" className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("common.all")}</SelectItem>
              {sites.map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="flt-status" className="text-xs text-muted-foreground">{t("common.status")}</Label>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
            <SelectTrigger id="flt-status" className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="scheduled">{t("shifts.statusScheduled")}</SelectItem>
              <SelectItem value="cancelled">{t("shifts.statusCancelled")}</SelectItem>
              <SelectItem value="all">{t("shifts.allStatuses")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Card className="border-border/70">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base font-bold">
            <CalendarDays className="size-4 text-primary" aria-hidden />
            {t("shifts.title")}
            <Badge variant="secondary" className="ms-1 tabular-nums">{shifts.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ListState loading={loading && shifts.length === 0} error={error} empty={!error && shifts.length === 0} onRetry={() => void load()} />
          {!loading && !error && shifts.length > 0 && (
            <div className="max-h-96 overflow-y-auto rounded-lg border border-border/60">
              <Table>
                <TableHeader className="sticky top-0 bg-muted/95 backdrop-blur">
                  <TableRow>
                    <TableHead className="text-xs">{t("shifts.date")}</TableHead>
                    <TableHead className="text-xs">{t("shifts.worker")}</TableHead>
                    <TableHead className="text-xs">{t("shifts.site")}</TableHead>
                    <TableHead className="text-xs">{t("shifts.time")}</TableHead>
                    <TableHead className="text-xs">{t("shifts.durationLabel")}</TableHead>
                    <TableHead className="text-xs">{t("shifts.template")}</TableHead>
                    <TableHead className="text-xs">{t("shifts.source")}</TableHead>
                    <TableHead className="text-xs">{t("common.status")}</TableHead>
                    <TableHead className="text-xs">{t("common.actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {shifts.map((row) => {
                    const work = grossMinutesOf(row.startTimeMin, row.endTimeMin) - row.breakMinutes;
                    const rowCrosses = row.endTimeMin <= row.startTimeMin;
                    const canEdit = canManage || row.localDate === today;
                    return (
                      <TableRow key={row.id} className={row.status === "cancelled" ? "opacity-60" : undefined}>
                        <TableCell className="text-xs">
                          <p className="font-semibold tabular-nums" dir="ltr">{formatDate(row.localDate, locale)}</p>
                          <p className="text-muted-foreground">{t(`daysShort.${DAY_KEYS[weekdayOfLocalDate(row.localDate)]}`)}</p>
                        </TableCell>
                        <TableCell className="text-xs font-semibold">{row.worker?.fullName ?? "—"}</TableCell>
                        <TableCell className="text-xs">{row.site?.name ?? "—"}</TableCell>
                        <TableCell className="font-mono text-xs tabular-nums" dir="ltr">
                          <span className="inline-flex items-center gap-1">
                            {minutesToLabel(row.startTimeMin)}–{minutesToLabel(row.endTimeMin)}
                            {rowCrosses && <MoonStar className="size-3.5 text-amber-500" aria-hidden />}
                          </span>
                        </TableCell>
                        <TableCell className="text-xs tabular-nums" dir="ltr">
                          {hoursLabel(work)} {t("shifts.hours")}
                          {row.breakMinutes > 0 && <span className="text-muted-foreground"> ({row.breakMinutes} {t("shifts.minutesShort")})</span>}
                        </TableCell>
                        <TableCell className="text-xs">{row.template?.name ?? t("templates.noTemplate")}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[10px] font-semibold">
                            {t(SOURCE_LABEL_KEYS[row.source] ?? "shifts.sourceManual")}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {row.status === "scheduled" ? (
                            <Badge className="font-semibold">{t("shifts.statusScheduled")}</Badge>
                          ) : (
                            <Badge variant="secondary" className="font-semibold">{t("shifts.statusCancelled")}</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            {canEdit && (
                              <Button variant="ghost" size="icon" className="size-8" onClick={() => openEdit(row)} aria-label={t("common.edit")}>
                                <Pencil className="size-4" aria-hidden />
                              </Button>
                            )}
                            {canEdit && row.status === "scheduled" && (
                              <ConfirmAction
                                triggerLabel={<><Ban className="size-4" aria-hidden />{t("shifts.statusCancelled")}</>}
                                triggerClassName="h-8 gap-1.5 px-2 text-xs text-destructive hover:text-destructive"
                                title={t("shifts.title")}
                                description={t("shifts.confirmCancel")}
                                confirmLabel={t("common.confirm")}
                                onConfirm={() => onCancel(row)}
                              />
                            )}
                            {canManage && row.status === "cancelled" && (
                              <Button variant="ghost" size="sm" className="h-8 gap-1.5 px-2 text-xs" onClick={() => void onRestore(row)}>
                                <RotateCcw className="size-4" aria-hidden />
                                {t("common.restore")}
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* حوار الإنشاء/التعديل مع عرض التعارض */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingId ? t("shifts.editTitle") : t("shifts.createTitle")}</DialogTitle>
            <DialogDescription>{t("shifts.templateHint")}</DialogDescription>
          </DialogHeader>

          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            {conflicts.length > 0 && (
              <Alert variant="destructive" role="alert">
                <TriangleAlert className="size-4" aria-hidden />
                <AlertDescription className="flex flex-col gap-1">
                  <span className="font-semibold">{t("shifts.conflictError")}</span>
                  {conflicts.map((c) => (
                    <span key={c.id} className="text-xs" dir="ltr">
                      • {c.localDate} {c.startLabel}–{c.endLabel} — {c.siteName ?? "—"}
                      {c.templateName ? ` (${c.templateName})` : ""}
                    </span>
                  ))}
                </AlertDescription>
              </Alert>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label htmlFor="sh-worker">{t("shifts.worker")}</Label>
                <Select value={form.workerId} onValueChange={(v) => setForm((f) => ({ ...f, workerId: v }))}>
                  <SelectTrigger id="sh-worker">
                    <SelectValue placeholder={t("shifts.worker")} />
                  </SelectTrigger>
                  <SelectContent>
                    {members.map((m) => (
                      <SelectItem key={m.userId} value={m.userId}>{m.fullName}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="sh-site">{t("shifts.site")}</Label>
                <Select value={form.siteId} onValueChange={(v) => setForm((f) => ({ ...f, siteId: v }))}>
                  <SelectTrigger id="sh-site">
                    <SelectValue placeholder={t("shifts.site")} />
                  </SelectTrigger>
                  <SelectContent>
                    {sites.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-2 sm:col-span-2">
                <Label htmlFor="sh-template">{t("shifts.template")}</Label>
                <Select value={form.templateId} onValueChange={onTemplateChange}>
                  <SelectTrigger id="sh-template">
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

              <div className="flex flex-col gap-2">
                <Label htmlFor="sh-date">{t("shifts.date")}</Label>
                <Input
                  id="sh-date"
                  type="date"
                  value={form.localDate}
                  onChange={(e) => setForm((f) => ({ ...f, localDate: e.target.value }))}
                  dir="ltr"
                  required
                  disabled={saving}
                />
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="sh-break">{t("templates.breakMinutes")}</Label>
                <Input
                  id="sh-break"
                  type="number"
                  min={0}
                  max={240}
                  step={5}
                  value={form.breakMinutes}
                  onChange={(e) => setForm((f) => ({ ...f, breakMinutes: e.target.value }))}
                  dir="ltr"
                  disabled={saving}
                />
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="sh-start">{t("templates.startTime")}</Label>
                <Input
                  id="sh-start"
                  type="time"
                  value={form.startTime}
                  onChange={(e) => setForm((f) => ({ ...f, startTime: e.target.value }))}
                  dir="ltr"
                  required
                  disabled={saving}
                />
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="sh-end">{t("templates.endTime")}</Label>
                <Input
                  id="sh-end"
                  type="time"
                  value={form.endTime}
                  onChange={(e) => setForm((f) => ({ ...f, endTime: e.target.value }))}
                  dir="ltr"
                  required
                  disabled={saving}
                />
                {crosses && form.endTime && form.startTime && (
                  <p className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
                    <MoonStar className="size-3.5" aria-hidden />
                    {t("templates.crossesMidnight")}
                  </p>
                )}
              </div>

              <div className="flex flex-col gap-2 sm:col-span-2">
                <Label htmlFor="sh-notes">{t("common.description")}</Label>
                <Input
                  id="sh-notes"
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  maxLength={240}
                  placeholder={t("shifts.notesHint")}
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
    </div>
  );
}
