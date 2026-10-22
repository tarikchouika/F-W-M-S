"use client";

// FWMS — مدير الشركات (المرحلة 2): super_admin فقط — إنشاء/تعديل/تعليق/تنشيط (SPEC §3)
// إنشاء شركة يمنح المنشئ عضوية super_admin فيها (للتبديل الصريح) — راجع API
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Building2, Plus, Pencil, Ban, PlayCircle, Search, LoaderCircle, Trash2 } from "lucide-react";
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
import { LocaleNamesFields, EMPTY_LOCALE_NAMES, localeNamesFromRow, localeNamesBody } from "@/components/fwms/locale-names-fields";
import { PageHeader, StatusBadge, ConfirmAction, ListState, formatDate, apiRequest, apiErrorMessage } from "@/components/fwms/org-bits";

type CompanyRow = {
  baseName?: string;
  names?: string | null;
  id: string;
  legalName: string;
  tradeName: string | null;
  taxId: string | null;
  cnssNumber: string | null;
  locale: string;
  timezone: string;
  status: string;
  createdAt: string;
  membersCount: number;
  sitesCount: number;
};

type CompanyForm = {
  legalName: string;
  tradeName: string;
  taxId: string;
  cnssNumber: string;
  locale: string;
  timezone: string;
  namesAr: string;
  namesFr: string;
  namesEn: string;
  namesEs: string;
};

const EMPTY_FORM: CompanyForm = {
  ...EMPTY_LOCALE_NAMES,
  legalName: "",
  tradeName: "",
  taxId: "",
  cnssNumber: "",
  locale: "ar",
  timezone: "Africa/Casablanca",
};

export function CompaniesManager({ currentCompanyId }: { currentCompanyId: string }) {
  const { t, locale } = useI18n();
  const { toast } = useToast();
  const router = useRouter();

  const [rows, setRows] = useState<CompanyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [q, setQ] = useState("");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<CompanyForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  // حوار الحذف النهائي (أمر المالك 2026-10-23): تأكيد بكتابة اسم الشركة
  const [deleteRow, setDeleteRow] = useState<CompanyRow | null>(null);
  const [deleteName, setDeleteName] = useState("");
  const [deleteReason, setDeleteReason] = useState("");
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const data = await apiRequest<{ companies: CompanyRow[] }>("/api/companies");
      setRows(data.companies);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = q.trim()
    ? rows.filter((r) =>
        [r.legalName, r.tradeName, r.taxId].some((v) => v?.toLowerCase().includes(q.trim().toLowerCase()))
      )
    : rows;

  function openCreate() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  }

  function openEdit(row: CompanyRow) {
    setEditingId(row.id);
    setForm({
      legalName: row.baseName ?? row.legalName,
      ...localeNamesFromRow(row),
      tradeName: row.tradeName ?? "",
      taxId: row.taxId ?? "",
      cnssNumber: row.cnssNumber ?? "",
      locale: row.locale,
      timezone: row.timezone,
    });
    setDialogOpen(true);
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (saving) return;
    if (form.legalName.trim().length < 2 || form.timezone.trim().length < 3) {
      toast({ variant: "destructive", description: t("common.invalidInput") });
      return;
    }
    const body = JSON.stringify({
      legalName: form.legalName.trim(),
      names: localeNamesBody(form),
      tradeName: form.tradeName.trim(),
      taxId: form.taxId.trim(),
      cnssNumber: form.cnssNumber.trim(),
      locale: form.locale,
      timezone: form.timezone.trim(),
    });
    setSaving(true);
    try {
      if (editingId) {
        await apiRequest(`/api/companies/${editingId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body });
        toast({ description: t("companies.updated") });
        router.refresh(); // تحديث مبدّل الشركة في الترويسة
      } else {
        await apiRequest("/api/companies", { method: "POST", headers: { "Content-Type": "application/json" }, body });
        toast({ description: t("companies.created") });
        router.refresh(); // الشركة الجديدة تظهر في مبدّل الشركة
      }
      setDialogOpen(false);
      await load();
    } catch (err) {
      toast({ variant: "destructive", description: apiErrorMessage(t, err) });
    } finally {
      setSaving(false);
    }
  }

  async function onSuspend(row: CompanyRow) {
    try {
      await apiRequest(`/api/companies/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "suspended" }),
      });
      toast({ description: t("companies.suspended") });
    } catch (err) {
      // حارس قفل النفس: الخادم يرفض تعليق شركتك النشطة
      const code = err instanceof Error ? err.message : "";
      toast({
        variant: "destructive",
        description: code === "own_active_company" ? t("companies.cannotSuspendCurrent") : apiErrorMessage(t, err),
      });
    }
    await load();
  }

  async function onActivate(row: CompanyRow) {
    try {
      await apiRequest(`/api/companies/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "active" }),
      });
      toast({ description: t("companies.activated") });
    } catch (err) {
      toast({ variant: "destructive", description: apiErrorMessage(t, err) });
    }
    await load();
  }

  /** الحذف النهائي المتتالي — data.delete؛ تأكيد مزدوج: كتابة الاسم + سبب اختياري */
  async function confirmDelete() {
    if (!deleteRow || deleting) return;
    if (deleteName.trim() !== (deleteRow.baseName ?? deleteRow.legalName).trim()) {
      toast({ variant: "destructive", description: t("deleteDialog.typeNameMismatch") });
      return;
    }
    setDeleting(true);
    try {
      await apiRequest(`/api/companies/${deleteRow.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: deleteReason.trim() || null }),
      });
      setDeleteRow(null);
      setDeleteName("");
      setDeleteReason("");
      toast({ description: t("companies.deleted") });
      await load();
      router.refresh();
    } catch (err) {
      toast({ variant: "destructive", description: apiErrorMessage(t, err) });
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <PageHeader title={t("companies.title")} subtitle={t("companies.subtitle")}>
        <Button onClick={openCreate} className="gap-2 font-bold">
          <Plus className="size-4" aria-hidden />
          {t("companies.createTitle")}
        </Button>
      </PageHeader>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-52 flex-1">
          <Search className="pointer-events-none absolute inset-y-0 start-3 my-auto size-4 text-muted-foreground" aria-hidden />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("common.search")} className="ps-9" aria-label={t("common.search")} />
        </div>
      </div>

      <Card className="border-border/70">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base font-bold">
            <Building2 className="size-4 text-primary" aria-hidden />
            {t("companies.title")}
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
                    <TableHead className="text-xs">{t("companies.legalName")}</TableHead>
                    <TableHead className="text-xs">{t("companies.members")}</TableHead>
                    <TableHead className="text-xs">{t("companies.activeSites")}</TableHead>
                    <TableHead className="text-xs">{t("companies.locale")}</TableHead>
                    <TableHead className="text-xs">{t("common.status")}</TableHead>
                    <TableHead className="text-xs">{t("common.actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>
                        <p className="font-semibold">{row.legalName}</p>
                        {row.tradeName && <p className="text-xs text-muted-foreground">{row.tradeName}</p>}
                        {row.taxId && <p className="font-mono text-[11px] text-muted-foreground/80" dir="ltr">{row.taxId}</p>}
                        <p className="text-[11px] text-muted-foreground/70">{formatDate(row.createdAt, locale)}</p>
                      </TableCell>
                      <TableCell className="text-xs tabular-nums">{row.membersCount}</TableCell>
                      <TableCell className="text-xs tabular-nums">{row.sitesCount}</TableCell>
                      <TableCell className="text-xs uppercase" dir="ltr">{row.locale}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <StatusBadge status={row.status} />
                          {row.id === currentCompanyId && (
                            <Badge variant="outline" className="text-[10px]">{t("dashboard.activeCompany")}</Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="icon" className="size-8" onClick={() => openEdit(row)} aria-label={t("common.edit")}>
                            <Pencil className="size-4" aria-hidden />
                          </Button>
                          {row.status === "active" ? (
                            <ConfirmAction
                              triggerLabel={<><Ban className="size-4" aria-hidden />{t("companies.suspend")}</>}
                              triggerClassName="h-8 gap-1.5 px-2 text-xs text-destructive hover:text-destructive"
                              title={t("companies.suspend")}
                              description={t("companies.confirmSuspend")}
                              confirmLabel={t("companies.suspend")}
                              onConfirm={() => onSuspend(row)}
                            />
                          ) : (
                            <Button variant="ghost" size="sm" className="h-8 gap-1.5 px-2 text-xs" onClick={() => void onActivate(row)}>
                              <PlayCircle className="size-4" aria-hidden />
                              {t("companies.activate")}
                            </Button>
                          )}
                          {row.id !== currentCompanyId && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-8 text-destructive hover:text-destructive"
                              onClick={() => { setDeleteRow(row); setDeleteName(""); setDeleteReason(""); }}
                              aria-label={t("common.delete")}
                              title={t("common.delete")}
                            >
                              <Trash2 className="size-4" aria-hidden />
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

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? t("companies.editTitle") : t("companies.createTitle")}</DialogTitle>
            <DialogDescription>{t("companies.subtitle")}</DialogDescription>
          </DialogHeader>
          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="company-legal">{t("companies.legalName")}</Label>
              <Input id="company-legal" value={form.legalName} onChange={(e) => setForm((f) => ({ ...f, legalName: e.target.value }))} required minLength={2} maxLength={120} disabled={saving} />
            </div>

            <LocaleNamesFields form={form} setForm={setForm} disabled={saving} />
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label htmlFor="company-trade">{t("companies.tradeName")}</Label>
                <Input id="company-trade" value={form.tradeName} onChange={(e) => setForm((f) => ({ ...f, tradeName: e.target.value }))} maxLength={120} disabled={saving} />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="company-tax">{t("companies.taxId")}</Label>
                <Input id="company-tax" value={form.taxId} onChange={(e) => setForm((f) => ({ ...f, taxId: e.target.value }))} maxLength={32} dir="ltr" disabled={saving} />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="company-cnss">{t("companies.cnssNumber")}</Label>
                <Input id="company-cnss" value={form.cnssNumber} onChange={(e) => setForm((f) => ({ ...f, cnssNumber: e.target.value }))} maxLength={32} dir="ltr" disabled={saving} />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="company-locale">{t("companies.locale")}</Label>
                <Select value={form.locale} onValueChange={(v) => setForm((f) => ({ ...f, locale: v }))}>
                  <SelectTrigger id="company-locale">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ar">{t("lang.ar")}</SelectItem>
                    <SelectItem value="fr">{t("lang.fr")}</SelectItem>
                    <SelectItem value="en">{t("lang.en")}</SelectItem>
                    <SelectItem value="es">{t("lang.es")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-2 sm:col-span-2">
                <Label htmlFor="company-tz">{t("companies.timezone")}</Label>
                <Input id="company-tz" value={form.timezone} onChange={(e) => setForm((f) => ({ ...f, timezone: e.target.value }))} dir="ltr" disabled={saving} />
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

      {/* حوار الحذف النهائي — تأكيد بكتابة اسم الشركة (أمر المالك 2026-10-23) */}
      <Dialog open={deleteRow !== null} onOpenChange={(open) => { if (!open) { setDeleteRow(null); setDeleteName(""); setDeleteReason(""); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-red-600">{t("deleteDialog.companyTitle")}</DialogTitle>
            <DialogDescription>{t("deleteDialog.companyDesc")}</DialogDescription>
          </DialogHeader>
          {deleteRow && (
            <div className="flex flex-col gap-3">
              <div className="rounded-lg border border-border/70 bg-muted/40 p-3 text-sm">
                <p className="font-semibold">{deleteRow.legalName}</p>
                <p className="text-xs text-muted-foreground">
                  {t("companies.members")}: {deleteRow.membersCount} · {t("companies.activeSites")}: {deleteRow.sitesCount}
                </p>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="c-delete-name">{t("deleteDialog.typeName", { name: deleteRow.baseName ?? deleteRow.legalName })}</Label>
                <Input id="c-delete-name" value={deleteName} onChange={(e) => setDeleteName(e.target.value)} maxLength={120} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="c-delete-reason">{t("deleteDialog.reasonLabel")}</Label>
                <Input id="c-delete-reason" value={deleteReason} onChange={(e) => setDeleteReason(e.target.value)} maxLength={500} placeholder={t("deleteDialog.reasonPlaceholder")} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => { setDeleteRow(null); setDeleteName(""); setDeleteReason(""); }}>{t("common.cancel")}</Button>
            <Button type="button" variant="destructive" disabled={deleting || deleteName.trim() !== (deleteRow?.baseName ?? deleteRow?.legalName ?? "").trim()} className="gap-2" onClick={() => void confirmDelete()}>
              {deleting && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
              <Trash2 className="size-4" aria-hidden />
              {t("common.confirmDelete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
