"use client";

// HRMP — مدير المشاريع (المرحلة 2): قائمة + إنشاء/تعديل/أرشفة/استعادة + إسناد فرع
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { FolderKanban, Plus, Pencil, Archive, ArchiveRestore, Search, LoaderCircle, Trash2 } from "lucide-react";
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
import { LocaleNamesFields, EMPTY_LOCALE_NAMES, localeNamesFromRow, localeNamesBody } from "@/components/hrmp/locale-names-fields";
import { PageHeader, StatusBadge, ConfirmAction, ListState, formatDate, apiRequest, apiErrorMessage } from "@/components/hrmp/org-bits";

type ProjectRow = {
  baseName?: string;
  names?: string | null;
  id: string;
  name: string;
  code: string | null;
  status: string;
  startsAt: string | null;
  endsAt: string | null;
  createdAt: string;
  branch: { id: string; name: string } | null;
  activeSites: number;
};

type ProjectForm = { name: string; code: string; branchId: string; startsAt: string; endsAt: string; namesAr: string; namesFr: string; namesEn: string; namesEs: string };

const EMPTY_FORM: ProjectForm = { ...EMPTY_LOCALE_NAMES, name: "", code: "", branchId: "none", startsAt: "", endsAt: "" };

function toDateInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

export function ProjectsManager({ canDelete = false }: { canDelete?: boolean }) {
  const { t, locale } = useI18n();
  const { toast } = useToast();

  const [rows, setRows] = useState<ProjectRow[]>([]);
  const [branches, setBranches] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [q, setQ] = useState("");
  const [showArchived, setShowArchived] = useState(false);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ProjectForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const data = await apiRequest<{ projects: ProjectRow[] }>("/api/projects");
      setRows(data.projects);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // خيارات الفروع النشطة (تُجلب عند فتح الحوار)
  useEffect(() => {
    if (!dialogOpen) return;
    void apiRequest<{ branches: { id: string; name: string; status: string }[] }>("/api/branches")
      .then((d) => setBranches(d.branches.filter((b) => b.status === "active").map((b) => ({ id: b.id, name: b.name }))))
      .catch(() => setBranches([]));
  }, [dialogOpen]);

  const filtered = rows.filter((r) => {
    if (!showArchived && r.status !== "active") return false;
    if (q.trim()) {
      const needle = q.trim().toLowerCase();
      return [r.name, r.code, r.branch?.name].some((v) => v?.toLowerCase().includes(needle));
    }
    return true;
  });

  function openCreate() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  }

  function openEdit(row: ProjectRow) {
    setEditingId(row.id);
    setForm({
      ...localeNamesFromRow(row),
      name: row.baseName ?? row.name,
      code: row.code ?? "",
      branchId: row.branch?.id ?? "none",
      startsAt: toDateInput(row.startsAt),
      endsAt: toDateInput(row.endsAt),
    });
    setDialogOpen(true);
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (saving) return;
    if (form.name.trim().length < 2) {
      toast({ variant: "destructive", description: t("common.invalidInput") });
      return;
    }
    const body = JSON.stringify({
      name: form.name.trim(),
      names: localeNamesBody(form),
      code: form.code.trim(),
      branchId: form.branchId === "none" ? "" : form.branchId,
      startsAt: form.startsAt,
      endsAt: form.endsAt,
    });
    setSaving(true);
    try {
      if (editingId) {
        await apiRequest(`/api/projects/${editingId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body });
        toast({ description: t("projects.updated") });
      } else {
        await apiRequest("/api/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body });
        toast({ description: t("projects.created") });
      }
      setDialogOpen(false);
      await load();
    } catch (err) {
      toast({ variant: "destructive", description: apiErrorMessage(t, err) });
    } finally {
      setSaving(false);
    }
  }

  async function onArchive(row: ProjectRow) {
    try {
      await apiRequest(`/api/projects/${row.id}`, { method: "DELETE" });
      toast({ description: t("projects.archived") });
    } catch (err) {
      toast({ variant: "destructive", description: apiErrorMessage(t, err) });
    }
    await load();
  }

  /** الحذف النهائي (?purge=1) — data.delete؛ حرّاس السلامة في الخادم ترشد عند الرفض */
  async function onPurge(row: ProjectRow) {
    try {
      await apiRequest(`/api/projects/${row.id}?purge=1`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: null }),
      });
      toast({ description: t("projects.deleted") });
    } catch (err) {
      toast({ variant: "destructive", description: apiErrorMessage(t, err) });
    }
    await load();
  }

  async function onRestore(row: ProjectRow) {
    try {
      await apiRequest(`/api/projects/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "active" }),
      });
      toast({ description: t("projects.restored") });
    } catch (err) {
      toast({ variant: "destructive", description: apiErrorMessage(t, err) });
    }
    await load();
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <PageHeader title={t("projects.title")} subtitle={t("projects.subtitle")}>
        <Button onClick={openCreate} className="gap-2 font-bold">
          <Plus className="size-4" aria-hidden />
          {t("projects.createTitle")}
        </Button>
      </PageHeader>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-52 flex-1">
          <Search className="pointer-events-none absolute inset-y-0 start-3 my-auto size-4 text-muted-foreground" aria-hidden />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("common.search")} className="ps-9" aria-label={t("common.search")} />
        </div>
        <Button variant={showArchived ? "secondary" : "outline"} size="sm" onClick={() => setShowArchived((v) => !v)} className="gap-1.5">
          <Archive className="size-3.5" aria-hidden />
          {t("common.showArchived")}
        </Button>
      </div>

      <Card className="border-border/70">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base font-bold">
            <FolderKanban className="size-4 text-primary" aria-hidden />
            {t("projects.title")}
            <Badge variant="secondary" className="ms-1 tabular-nums">{filtered.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ListState loading={loading && rows.length === 0} error={error} empty={!error && filtered.length === 0} onRetry={() => void load()} />
          {!loading && !error && filtered.length > 0 && (
            <div className="max-h-96 overflow-y-auto rounded-lg border border-border/60">
              <Table>
                <TableHeader className="sticky top-0 bg-muted/95 backdrop-blur">
                  <TableRow>
                    <TableHead className="text-xs">{t("common.name")}</TableHead>
                    <TableHead className="text-xs">{t("projects.branch")}</TableHead>
                    <TableHead className="text-xs">{t("projects.startsAt")}</TableHead>
                    <TableHead className="text-xs">{t("projects.endsAt")}</TableHead>
                    <TableHead className="text-xs">{t("projects.activeSites")}</TableHead>
                    <TableHead className="text-xs">{t("common.status")}</TableHead>
                    <TableHead className="text-xs">{t("common.actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>
                        <p className="font-semibold">{row.name}</p>
                        {row.code && <p className="font-mono text-[11px] text-muted-foreground" dir="ltr">{row.code}</p>}
                      </TableCell>
                      <TableCell className="text-xs">{row.branch?.name ?? t("projects.unassigned")}</TableCell>
                      <TableCell className="text-xs">{formatDate(row.startsAt, locale)}</TableCell>
                      <TableCell className="text-xs">{formatDate(row.endsAt, locale)}</TableCell>
                      <TableCell className="text-xs tabular-nums">{row.activeSites}</TableCell>
                      <TableCell><StatusBadge status={row.status} /></TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="icon" className="size-8" onClick={() => openEdit(row)} aria-label={t("common.edit")}>
                            <Pencil className="size-4" aria-hidden />
                          </Button>
                          {row.status === "active" ? (
                            <ConfirmAction
                              triggerLabel={<><Archive className="size-4" aria-hidden />{t("common.archive")}</>}
                              triggerClassName="h-8 gap-1.5 px-2 text-xs text-destructive hover:text-destructive"
                              title={t("projects.title")}
                              description={t("projects.confirmArchive")}
                              confirmLabel={t("common.archive")}
                              onConfirm={() => onArchive(row)}
                            />
                          ) : (
                            <Button variant="ghost" size="sm" className="h-8 gap-1.5 px-2 text-xs" onClick={() => void onRestore(row)}>
                              <ArchiveRestore className="size-4" aria-hidden />
                              {t("common.restore")}
                            </Button>
                          )}
                            {canDelete && (
                              <ConfirmAction
                                triggerLabel={<Trash2 className="size-4" aria-hidden />}
                                triggerClassName="h-8 gap-1.5 px-2 text-xs text-destructive hover:text-destructive"
                                title={t("deleteDialog.projectTitle")}
                                description={t("deleteDialog.projectDesc")}
                                confirmLabel={t("common.confirmDelete")}
                                onConfirm={() => onPurge(row)}
                              />
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

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? t("projects.editTitle") : t("projects.createTitle")}</DialogTitle>
            <DialogDescription>{t("projects.subtitle")}</DialogDescription>
          </DialogHeader>
          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="project-name">{t("common.name")}</Label>
              <Input id="project-name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required minLength={2} maxLength={120} disabled={saving} />
            </div>

            <LocaleNamesFields form={form} setForm={setForm} disabled={saving} />
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label htmlFor="project-code">{t("common.code")}</Label>
                <Input id="project-code" value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} maxLength={32} dir="ltr" disabled={saving} />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="project-branch">{t("projects.branch")}</Label>
                <Select value={form.branchId} onValueChange={(v) => setForm((f) => ({ ...f, branchId: v }))}>
                  <SelectTrigger id="project-branch">
                    <SelectValue placeholder={t("projects.unassigned")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t("projects.unassigned")}</SelectItem>
                    {branches.map((b) => (
                      <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="project-starts">{t("projects.startsAt")}</Label>
                <Input id="project-starts" type="date" value={form.startsAt} onChange={(e) => setForm((f) => ({ ...f, startsAt: e.target.value }))} disabled={saving} />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="project-ends">{t("projects.endsAt")}</Label>
                <Input id="project-ends" type="date" value={form.endsAt} onChange={(e) => setForm((f) => ({ ...f, endsAt: e.target.value }))} disabled={saving} />
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
