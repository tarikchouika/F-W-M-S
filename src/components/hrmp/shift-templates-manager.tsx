"use client";

// HRMP — مدير قوالب الورديات (المرحلة 3 — SPEC §4.1): قوالب قطاعية بأوقات افتراضية
// الأمان: الصلاحية تُفحص في الخادم (API) — هذه الواجهة عرض فقط
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { MoonStar, Plus, Pencil, Archive, ArchiveRestore, Search, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useI18n } from "@/i18n/provider";
import { minutesToLabel, grossMinutesOf, MAX_WORK_MINUTES, SHIFT_SECTORS } from "@/lib/scheduling";
import { PageHeader, StatusBadge, ConfirmAction, ListState, apiRequest, apiErrorMessage } from "@/components/hrmp/org-bits";

type TemplateRow = {
  id: string;
  name: string;
  sector: string;
  startTimeMin: number;
  endTimeMin: number;
  breakMinutes: number;
  notes: string | null;
  status: string;
  createdAt: string;
};

type TemplateForm = {
  name: string;
  sector: string;
  startTime: string; // "HH:MM"
  endTime: string;
  breakMinutes: string;
  notes: string;
};

const EMPTY_FORM: TemplateForm = {
  name: "",
  sector: "security",
  startTime: "08:00",
  endTime: "17:00",
  breakMinutes: "0",
  notes: "",
};

const SECTOR_LABEL_KEYS: Record<string, string> = {
  security: "templates.sectorSecurity",
  construction: "templates.sectorConstruction",
  cleaning: "templates.sectorCleaning",
  gardening: "templates.sectorGardening",
  crafts: "templates.sectorCrafts",
  other: "templates.sectorOther",
};

function toMinutes(label: string): number {
  const [h, m] = label.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

function hoursLabel(workMinutes: number): string {
  const h = workMinutes / 60;
  return Number.isInteger(h) ? String(h) : h.toFixed(1);
}

export function ShiftTemplatesManager({ canManage }: { canManage: boolean }) {
  const { t } = useI18n();
  const { toast } = useToast();

  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<"active" | "archived" | "all">("active");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<TemplateForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (q.trim()) params.set("q", q.trim());
      const data = await apiRequest<{ templates: TemplateRow[] }>(`/api/shift-templates?${params.toString()}`);
      setTemplates(data.templates);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, q]);

  useEffect(() => {
    void load();
  }, [load]);

  // بحث مؤجّل
  useEffect(() => {
    const timer = setTimeout(() => void load(), 350);
    return () => clearTimeout(timer);
  }, [q]);

  function openCreate() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  }

  function openEdit(row: TemplateRow) {
    setEditingId(row.id);
    setForm({
      name: row.name,
      sector: row.sector,
      startTime: minutesToLabel(row.startTimeMin),
      endTime: minutesToLabel(row.endTimeMin),
      breakMinutes: String(row.breakMinutes),
      notes: row.notes ?? "",
    });
    setDialogOpen(true);
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (saving) return;

    const startTimeMin = toMinutes(form.startTime);
    const endTimeMin = toMinutes(form.endTime);
    const breakMinutes = Number.parseInt(form.breakMinutes, 10) || 0;
    const work = grossMinutesOf(startTimeMin, endTimeMin) - breakMinutes;

    // تحقق مطابق للخادم: مدة موجبة ضمن السقف المنطقي (16 س)
    if (form.name.trim().length < 2 || !form.startTime || !form.endTime || work <= 0 || work > MAX_WORK_MINUTES) {
      toast({ variant: "destructive", description: t("common.invalidInput") });
      return;
    }

    const body = JSON.stringify({
      name: form.name.trim(),
      sector: form.sector,
      startTimeMin,
      endTimeMin,
      breakMinutes,
      notes: form.notes.trim(),
    });

    setSaving(true);
    try {
      if (editingId) {
        await apiRequest(`/api/shift-templates/${editingId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body });
        toast({ description: t("templates.updated") });
      } else {
        await apiRequest("/api/shift-templates", { method: "POST", headers: { "Content-Type": "application/json" }, body });
        toast({ description: t("templates.created") });
      }
      setDialogOpen(false);
      await load();
    } catch (err) {
      toast({ variant: "destructive", description: apiErrorMessage(t, err) });
    } finally {
      setSaving(false);
    }
  }

  async function onArchive(row: TemplateRow) {
    try {
      await apiRequest(`/api/shift-templates/${row.id}`, { method: "DELETE" });
      toast({ description: t("templates.archived") });
    } catch (err) {
      toast({ variant: "destructive", description: apiErrorMessage(t, err) });
    }
    await load();
  }

  async function onRestore(row: TemplateRow) {
    try {
      await apiRequest(`/api/shift-templates/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "active" }),
      });
      toast({ description: t("templates.restored") });
    } catch (err) {
      toast({ variant: "destructive", description: apiErrorMessage(t, err) });
    }
    await load();
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <PageHeader title={t("templates.title")} subtitle={t("templates.subtitle")}>
        {canManage && (
          <Button onClick={openCreate} className="gap-2 font-bold">
            <Plus className="size-4" aria-hidden />
            {t("templates.createTitle")}
          </Button>
        )}
      </PageHeader>

      {/* أدوات التصفية */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-52 flex-1">
          <Search className="pointer-events-none absolute inset-y-0 start-3 my-auto size-4 text-muted-foreground" aria-hidden />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("common.search")}
            className="ps-9"
            aria-label={t("common.search")}
          />
        </div>
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
            <MoonStar className="size-4 text-primary" aria-hidden />
            {t("templates.title")}
            <Badge variant="secondary" className="ms-1 tabular-nums">{templates.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ListState loading={loading && templates.length === 0} error={error} empty={!error && templates.length === 0} onRetry={() => void load()} />
          {!loading && !error && templates.length > 0 && (
            <div className="max-h-96 overflow-y-auto rounded-lg border border-border/60">
              <Table>
                <TableHeader className="sticky top-0 bg-muted/95 backdrop-blur">
                  <TableRow>
                    <TableHead className="text-xs">{t("common.name")}</TableHead>
                    <TableHead className="text-xs">{t("templates.sector")}</TableHead>
                    <TableHead className="text-xs">{t("templates.startTime")}</TableHead>
                    <TableHead className="text-xs">{t("templates.endTime")}</TableHead>
                    <TableHead className="text-xs">{t("templates.breakMinutes")}</TableHead>
                    <TableHead className="text-xs">{t("templates.workHours")}</TableHead>
                    <TableHead className="text-xs">{t("common.status")}</TableHead>
                    {canManage && <TableHead className="text-xs">{t("common.actions")}</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {templates.map((row) => {
                    const crosses = row.endTimeMin <= row.startTimeMin;
                    const work = grossMinutesOf(row.startTimeMin, row.endTimeMin) - row.breakMinutes;
                    return (
                      <TableRow key={row.id}>
                        <TableCell>
                          <p className="font-semibold">{row.name}</p>
                          {row.notes && <p className="text-xs text-muted-foreground">{row.notes}</p>}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs font-semibold">
                            {t(SECTOR_LABEL_KEYS[row.sector] ?? "templates.sectorOther")}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono text-xs tabular-nums" dir="ltr">
                          {minutesToLabel(row.startTimeMin)}
                        </TableCell>
                        <TableCell className="font-mono text-xs tabular-nums" dir="ltr">
                          <span className="inline-flex items-center gap-1">
                            {minutesToLabel(row.endTimeMin)}
                            {crosses && <MoonStar className="size-3.5 text-amber-500" aria-hidden />}
                          </span>
                        </TableCell>
                        <TableCell className="text-xs tabular-nums" dir="ltr">
                          {row.breakMinutes > 0 ? `${row.breakMinutes} ${t("shifts.minutesShort")}` : "—"}
                        </TableCell>
                        <TableCell className="text-xs tabular-nums" dir="ltr">
                          {hoursLabel(work)} {t("shifts.hours")}
                        </TableCell>
                        <TableCell><StatusBadge status={row.status} /></TableCell>
                        {canManage && (
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <Button variant="ghost" size="icon" className="size-8" onClick={() => openEdit(row)} aria-label={t("common.edit")}>
                                <Pencil className="size-4" aria-hidden />
                              </Button>
                              {row.status === "active" ? (
                                <ConfirmAction
                                  triggerLabel={<><Archive className="size-4" aria-hidden />{t("common.archive")}</>}
                                  triggerClassName="h-8 gap-1.5 px-2 text-xs text-destructive hover:text-destructive"
                                  title={t("templates.title")}
                                  description={t("templates.confirmArchive")}
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
                        )}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* حوار الإنشاء/التعديل */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? t("templates.editTitle") : t("templates.createTitle")}</DialogTitle>
            <DialogDescription>{t("templates.subtitle")}</DialogDescription>
          </DialogHeader>

          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-2 sm:col-span-2">
                <Label htmlFor="tpl-name">{t("common.name")}</Label>
                <Input
                  id="tpl-name"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  required
                  minLength={2}
                  maxLength={120}
                  disabled={saving}
                />
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="tpl-sector">{t("templates.sector")}</Label>
                <Select value={form.sector} onValueChange={(v) => setForm((f) => ({ ...f, sector: v }))}>
                  <SelectTrigger id="tpl-sector">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SHIFT_SECTORS.map((s) => (
                      <SelectItem key={s} value={s}>{t(SECTOR_LABEL_KEYS[s])}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="tpl-break">{t("templates.breakMinutes")}</Label>
                <Input
                  id="tpl-break"
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
                <Label htmlFor="tpl-start">{t("templates.startTime")}</Label>
                <Input
                  id="tpl-start"
                  type="time"
                  value={form.startTime}
                  onChange={(e) => setForm((f) => ({ ...f, startTime: e.target.value }))}
                  dir="ltr"
                  required
                  disabled={saving}
                />
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="tpl-end">{t("templates.endTime")}</Label>
                <Input
                  id="tpl-end"
                  type="time"
                  value={form.endTime}
                  onChange={(e) => setForm((f) => ({ ...f, endTime: e.target.value }))}
                  dir="ltr"
                  required
                  disabled={saving}
                />
                {toMinutes(form.endTime) <= toMinutes(form.startTime) && form.endTime && form.startTime && (
                  <p className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
                    <MoonStar className="size-3.5" aria-hidden />
                    {t("templates.crossesMidnight")}
                  </p>
                )}
              </div>

              <div className="flex flex-col gap-2 sm:col-span-2">
                <Label htmlFor="tpl-notes">{t("common.description")}</Label>
                <Input
                  id="tpl-notes"
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  maxLength={240}
                  placeholder={t("templates.notesHint")}
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
