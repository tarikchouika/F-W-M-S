"use client";

// FWMS — مدير الفروع (المرحلة 2): قائمة + إنشاء/تعديل/أرشفة/استعادة
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { GitBranch, Plus, Pencil, Archive, ArchiveRestore, Search, LoaderCircle, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useI18n } from "@/i18n/provider";
import { LocaleNamesFields, EMPTY_LOCALE_NAMES, localeNamesFromRow, localeNamesBody } from "@/components/fwms/locale-names-fields";
import { LocaleAddressesFields, EMPTY_LOCALE_ADDRESSES, localeAddressesFromRow, localeAddressesBody } from "@/components/fwms/locale-addresses-fields";
import { PageHeader, StatusBadge, ConfirmAction, ListState, formatDate, apiRequest, apiErrorMessage } from "@/components/fwms/org-bits";

type BranchRow = {
  baseName?: string;
  names?: string | null;
  id: string;
  name: string;
  code: string | null;
  city: string | null;
  address: string | null;
  status: string;
  baseAddress?: string | null;
  addresses?: string | null;
  createdAt: string;
  activeSites: number;
};

type BranchForm = { name: string; code: string; city: string; address: string; namesAr: string; namesFr: string; namesEn: string; namesEs: string; addrAr: string; addrFr: string; addrEn: string; addrEs: string };

const EMPTY_FORM: BranchForm = { ...EMPTY_LOCALE_NAMES, ...EMPTY_LOCALE_ADDRESSES, name: "", code: "", city: "", address: "" };

export function BranchesManager({ canDelete = false }: { canDelete?: boolean }) {
  const { t, locale } = useI18n();
  const { toast } = useToast();

  const [rows, setRows] = useState<BranchRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [q, setQ] = useState("");
  const [showArchived, setShowArchived] = useState(false);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<BranchForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const data = await apiRequest<{ branches: BranchRow[] }>("/api/branches");
      setRows(data.branches);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = rows.filter((r) => {
    if (!showArchived && r.status !== "active") return false;
    if (q.trim()) {
      const needle = q.trim().toLowerCase();
      return [r.name, r.code, r.city, r.address].some((v) => v?.toLowerCase().includes(needle));
    }
    return true;
  });

  function openCreate() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  }

  function openEdit(row: BranchRow) {
    setEditingId(row.id);
    setForm({ ...localeNamesFromRow(row), ...localeAddressesFromRow(row), name: row.baseName ?? row.name, code: row.code ?? "", city: row.city ?? "", address: row.baseAddress ?? row.address ?? "" });
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
      city: form.city.trim(),
      address: form.address.trim(),
      addresses: localeAddressesBody(form),
    });
    setSaving(true);
    try {
      if (editingId) {
        await apiRequest(`/api/branches/${editingId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body });
        toast({ description: t("branches.updated") });
      } else {
        await apiRequest("/api/branches", { method: "POST", headers: { "Content-Type": "application/json" }, body });
        toast({ description: t("branches.created") });
      }
      setDialogOpen(false);
      await load();
    } catch (err) {
      toast({ variant: "destructive", description: apiErrorMessage(t, err) });
    } finally {
      setSaving(false);
    }
  }

  async function onArchive(row: BranchRow) {
    try {
      await apiRequest(`/api/branches/${row.id}`, { method: "DELETE" });
      toast({ description: t("branches.archived") });
    } catch (err) {
      toast({ variant: "destructive", description: apiErrorMessage(t, err) });
    }
    await load();
  }

  /** الحذف النهائي (?purge=1) — data.delete؛ حرّاس السلامة في الخادم ترشد عند الرفض */
  async function onPurge(row: BranchRow) {
    try {
      await apiRequest(`/api/branches/${row.id}?purge=1`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: null }),
      });
      toast({ description: t("branches.deleted") });
    } catch (err) {
      toast({ variant: "destructive", description: apiErrorMessage(t, err) });
    }
    await load();
  }

  async function onRestore(row: BranchRow) {
    try {
      await apiRequest(`/api/branches/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "active" }),
      });
      toast({ description: t("branches.restored") });
    } catch (err) {
      toast({ variant: "destructive", description: apiErrorMessage(t, err) });
    }
    await load();
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <PageHeader title={t("branches.title")} subtitle={t("branches.subtitle")}>
        <Button onClick={openCreate} className="gap-2 font-bold">
          <Plus className="size-4" aria-hidden />
          {t("branches.createTitle")}
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
            <GitBranch className="size-4 text-primary" aria-hidden />
            {t("branches.title")}
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
                    <TableHead className="text-xs">{t("common.code")}</TableHead>
                    <TableHead className="text-xs">{t("common.city")}</TableHead>
                    <TableHead className="text-xs">{t("branches.activeSites")}</TableHead>
                    <TableHead className="text-xs">{t("common.status")}</TableHead>
                    <TableHead className="text-xs">{t("common.actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>
                        <p className="font-semibold">{row.name}</p>
                        {row.address && <p className="text-xs text-muted-foreground">{row.address}</p>}
                        <p className="text-[11px] text-muted-foreground/80">{formatDate(row.createdAt, locale)}</p>
                      </TableCell>
                      <TableCell className="font-mono text-xs" dir="ltr">{row.code ?? "—"}</TableCell>
                      <TableCell className="text-xs">{row.city ?? "—"}</TableCell>
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
                              title={t("branches.title")}
                              description={t("branches.confirmArchive")}
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
                                title={t("deleteDialog.branchTitle")}
                                description={t("deleteDialog.branchDesc")}
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
            <DialogTitle>{editingId ? t("branches.editTitle") : t("branches.createTitle")}</DialogTitle>
            <DialogDescription>{t("branches.subtitle")}</DialogDescription>
          </DialogHeader>
          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="branch-name">{t("common.name")}</Label>
              <Input id="branch-name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required minLength={2} maxLength={120} disabled={saving} />
            </div>

            <LocaleNamesFields form={form} setForm={setForm} disabled={saving} />
            {/* العنوان بلغات أخرى — يتبع لغة الواجهة (بلاغ المالك 2026-10-23) */}
            <LocaleAddressesFields form={form} setForm={setForm} disabled={saving} />
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label htmlFor="branch-code">{t("common.code")}</Label>
                <Input id="branch-code" value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} maxLength={32} dir="ltr" disabled={saving} />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="branch-city">{t("common.city")}</Label>
                <Input id="branch-city" value={form.city} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} maxLength={80} disabled={saving} />
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="branch-address">{t("common.address")}</Label>
              <Input id="branch-address" value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} maxLength={240} disabled={saving} />
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
