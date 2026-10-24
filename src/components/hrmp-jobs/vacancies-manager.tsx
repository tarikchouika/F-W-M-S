"use client";

// HRMP — مدير الوظائف الشاغرة للشركة (طلب المالك 2026-10-24): إقرار/إنشاء/تعديل/
// نشر/إغلاق + عرض طلبات التقديم ونتقالاتها. الأجر يُدخل بالدرهم ويعرض بالدرهم
// ويُخزَّن بالسنتيم (قاعدة المنصة النافذة) — التحويل في حدَّي الإرسال والاستلام.
import { useCallback, useEffect, useState } from "react";
import {
  Briefcase,
  ExternalLink,
  Eye,
  LoaderCircle,
  Pencil,
  Plus,
  Send,
  UserCheck,
  UserRoundX,
  Users,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useI18n } from "@/i18n/provider";
import { PageHeader, ListState, formatDate, apiRequest } from "@/components/hrmp/org-bits";
import { dirhamsToCents, formatMoney } from "@/lib/money";

type VacancyRow = {
  id: string;
  title: string;
  description: string;
  requirements: string | null;
  employmentType: string;
  salaryMin: number | null;
  salaryMax: number | null;
  openings: number;
  contactEmail: string | null;
  contactPhone: string | null;
  status: string;
  publishedAt: string | null;
  closesAt: string | null;
  project: { id: string; name: string };
  applicationsCount: number;
  effectivelyOpen: boolean;
};

type ApplicationRow = {
  id: string;
  status: string;
  createdAt: string;
  coverNote: string | null;
  seeker: {
    id: string;
    fullName: string;
    email: string;
    phone: string;
    accountStatus: string;
    documentType: string | null;
    emailVerified: boolean;
    phoneVerified: boolean;
  };
};

type VacancyForm = {
  projectId: string;
  title: string;
  description: string;
  requirements: string;
  employmentType: string;
  salaryMin: string; // درهم — نص للمرونة
  salaryMax: string;
  openings: string;
  contactEmail: string;
  contactPhone: string;
  closesAt: string; // yyyy-mm-dd
};

const EMPTY_FORM: VacancyForm = {
  projectId: "",
  title: "",
  description: "",
  requirements: "",
  employmentType: "full_time",
  salaryMin: "",
  salaryMax: "",
  openings: "1",
  contactEmail: "",
  contactPhone: "",
  closesAt: "",
};

function centsToInput(cents: number | null): string {
  if (cents == null) return "";
  return String(Math.round(cents / 100));
}

const STATUS_VARIANT: Record<string, "secondary" | "default" | "outline"> = {
  draft: "secondary",
  published: "default",
  closed: "outline",
};

const APP_STATUS_VARIANT: Record<string, "secondary" | "default" | "destructive" | "outline"> = {
  submitted: "secondary",
  viewed: "secondary",
  shortlisted: "default",
  rejected: "destructive",
  hired: "default",
  withdrawn: "outline",
};

export function VacanciesManager({ projects }: { projects: { id: string; name: string }[] }) {
  const { t, locale } = useI18n();
  const { toast } = useToast();

  const [rows, setRows] = useState<VacancyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<VacancyForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const [appsFor, setAppsFor] = useState<VacancyRow | null>(null);
  const [applications, setApplications] = useState<ApplicationRow[]>([]);
  const [appsLoading, setAppsLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const data = await apiRequest<{ vacancies: VacancyRow[] }>("/api/vacancies");
      setRows(data.vacancies);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function openCreate() {
    setEditingId(null);
    setForm({ ...EMPTY_FORM, projectId: projects[0]?.id ?? "" });
    setDialogOpen(true);
  }

  function openEdit(row: VacancyRow) {
    setEditingId(row.id);
    setForm({
      projectId: row.project.id,
      title: row.title,
      description: row.description,
      requirements: row.requirements ?? "",
      employmentType: row.employmentType,
      salaryMin: centsToInput(row.salaryMin),
      salaryMax: centsToInput(row.salaryMax),
      openings: String(row.openings),
      contactEmail: row.contactEmail ?? "",
      contactPhone: row.contactPhone ? row.contactPhone.replace("+", "") : "",
      closesAt: row.closesAt ? row.closesAt.slice(0, 10) : "",
    });
    setDialogOpen(true);
  }

  function formBody(): Record<string, unknown> | null {
    const salaryMin = form.salaryMin.trim() === "" ? null : dirhamsToCents(Number(form.salaryMin));
    const salaryMax = form.salaryMax.trim() === "" ? null : dirhamsToCents(Number(form.salaryMax));
    if (salaryMin != null && !Number.isFinite(salaryMin)) return null;
    if (salaryMax != null && !Number.isFinite(salaryMax)) return null;
    const openings = Number(form.openings);
    if (!Number.isInteger(openings) || openings < 1 || openings > 999) return null;
    return {
      projectId: form.projectId,
      title: form.title.trim(),
      description: form.description.trim(),
      requirements: form.requirements.trim() || null,
      employmentType: form.employmentType,
      salaryMin,
      salaryMax,
      openings,
      contactEmail: form.contactEmail.trim() || null,
      contactPhone: form.contactPhone.trim() || null,
      closesAt: form.closesAt ? new Date(`${form.closesAt}T23:59:59Z`).toISOString() : null,
    };
  }

  async function save() {
    const body = formBody();
    if (!body || !form.projectId) {
      toast({ variant: "destructive", description: t("jobs.errors.invalid_input") });
      return;
    }
    setSaving(true);
    try {
      if (editingId) {
        await apiRequest(`/api/vacancies/${editingId}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
        toast({ description: t("vacanciesPage.updateOk") });
      } else {
        await apiRequest("/api/vacancies", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
        toast({ description: t("vacanciesPage.createOk") });
      }
      setDialogOpen(false);
      await load();
    } catch (e) {
      toast({ variant: "destructive", description: apiRequestError(t, e) });
    } finally {
      setSaving(false);
    }
  }

  async function setStatus(id: string, status: "published" | "closed" | "draft") {
    try {
      await apiRequest(`/api/vacancies/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status }),
      });
      toast({ description: t(status === "published" ? "vacanciesPage.publishOk" : status === "closed" ? "vacanciesPage.closeOk" : "vacanciesPage.updateOk") });
      await load();
    } catch (e) {
      toast({ variant: "destructive", description: apiRequestError(t, e) });
    }
  }

  const loadApplications = useCallback(async (vacancy: VacancyRow) => {
    setAppsFor(vacancy);
    setAppsLoading(true);
    setApplications([]);
    try {
      const data = await apiRequest<{ items: ApplicationRow[] }>(`/api/vacancies/${vacancy.id}/applications`);
      setApplications(data.items);
    } catch {
      setApplications([]);
    } finally {
      setAppsLoading(false);
    }
  }, []);

  async function setAppStatus(id: string, status: string) {
    try {
      await apiRequest(`/api/vacancy-applications/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (appsFor) await loadApplications(appsFor);
    } catch (e) {
      toast({ variant: "destructive", description: apiRequestError(t, e) });
    }
  }

  function apiRequestError(tt: (k: string) => string, e: unknown): string {
    const code = (e as { code?: string })?.code ?? "";
    const map: Record<string, string> = {
      forbidden: "common.forbidden",
      invalid_input: "jobs.errors.invalid_input",
      project_not_found: "jobs.errors.invalid_input",
      vacancy_not_found: "jobs.errors.vacancy_not_found",
      bad_transition: "jobs.errors.bad_transition",
      not_found: "jobs.errors.not_found",
      network: "common.networkError",
    };
    return tt(map[code] ?? "jobs.errors.internal_error");
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("vacanciesPage.title")}
        subtitle={t("vacanciesPage.subtitle")}
        icon={<Briefcase />}
        actions={
          <Button onClick={openCreate} disabled={projects.length === 0} className="gap-2 font-semibold">
            <Plus className="size-4" aria-hidden />
            {t("vacanciesPage.createCta")}
          </Button>
        }
      />

      {projects.length === 0 && !loading && (
        <Card className="border-dashed">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            {t("vacanciesPage.emptyDesc")}
          </CardContent>
        </Card>
      )}

      <ListState
        loading={loading && rows.length === 0}
        error={error}
        empty={!error && !loading && rows.length === 0 && projects.length > 0}
        onRetry={() => void load()}
      />

      {!loading && !error && rows.length > 0 && (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto rounded-lg border border-border/60">
              <Table>
                <TableHeader className="sticky top-0 bg-muted/95 backdrop-blur">
                  <TableRow>
                    <TableHead className="text-xs">{t("vacanciesPage.titleField")}</TableHead>
                    <TableHead className="text-xs">{t("common.status")}</TableHead>
                    <TableHead className="text-xs">{t("vacanciesPage.openings")}</TableHead>
                    <TableHead className="w-64 text-xs text-end">{t("common.actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="max-w-56">
                        <p className="truncate font-semibold text-foreground">{row.title}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {row.project.name} · {t(`jobs.employmentType.${row.employmentType}`)}
                        </p>
                      </TableCell>
                      <TableCell>
                        <Badge variant={STATUS_VARIANT[row.status] ?? "secondary"}>
                          {t(`vacanciesPage.status.${row.status}`)}
                        </Badge>
                        {!row.effectivelyOpen && row.status === "published" && (
                          <p className="mt-1 text-[11px] text-muted-foreground">{t("jobs.vacancy_closed")}</p>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="space-y-0.5 text-xs text-muted-foreground">
                          <p>
                            {row.openings === 1 ? t("jobs.openingsOne") : t("jobs.openingsMany", { count: row.openings })}
                            {row.salaryMin != null || row.salaryMax != null
                              ? ` · ${row.salaryMin != null && row.salaryMax != null
                                  ? `${formatMoney(row.salaryMin, locale)} — ${formatMoney(row.salaryMax, locale)}`
                                  : formatMoney(row.salaryMin ?? row.salaryMax!, locale)}`
                              : ""}
                          </p>
                          {row.publishedAt && (
                            <p>{t("jobs.publishedOn", { date: formatDate(row.publishedAt.slice(0, 10), locale) })}</p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-end">
                        <div className="flex flex-wrap items-center justify-end gap-1">
                          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => void loadApplications(row)}>
                            <Users className="size-3.5" aria-hidden />
                            {t("vacanciesPage.applicationsCount", { count: row.applicationsCount })}
                          </Button>
                          {row.status === "published" && (
                            <Button asChild variant="ghost" size="sm" className="gap-1.5">
                              <a href={`/jobs/${row.id}`} target="_blank" rel="noopener noreferrer" aria-label={t("vacanciesPage.openPublicPage")}>
                                <ExternalLink className="size-3.5" aria-hidden />
                              </a>
                            </Button>
                          )}
                          <Button variant="ghost" size="sm" onClick={() => openEdit(row)} aria-label={t("vacanciesPage.edit")}>
                            <Pencil className="size-3.5" aria-hidden />
                          </Button>
                          {row.status === "draft" && (
                            <Button variant="secondary" size="sm" className="gap-1.5" onClick={() => void setStatus(row.id, "published")}>
                              <Send className="size-3.5" aria-hidden />
                              {t("vacanciesPage.publish")}
                            </Button>
                          )}
                          {row.status === "published" && (
                            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => void setStatus(row.id, "closed")}>
                              <XCircle className="size-3.5" aria-hidden />
                              {t("vacanciesPage.close")}
                            </Button>
                          )}
                          {row.status === "closed" && (
                            <Button variant="outline" size="sm" onClick={() => void setStatus(row.id, "draft")}>
                              {t("vacanciesPage.unpublish")}
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* حوار الإنشاء/التعديل */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t(editingId ? "vacanciesPage.formTitleEdit" : "vacanciesPage.formTitleCreate")}</DialogTitle>
            <DialogDescription>{t("vacanciesPage.subtitle")}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-1 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label>{t("vacanciesPage.project")}</Label>
              <Select value={form.projectId} onValueChange={(v) => setForm({ ...form, projectId: v })}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>{t("vacanciesPage.titleField")}</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder={t("vacanciesPage.titlePlaceholder")}
                maxLength={120}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>{t("vacanciesPage.description")}</Label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder={t("vacanciesPage.descriptionPlaceholder")}
                rows={5}
                maxLength={6000}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>{t("vacanciesPage.requirements")}</Label>
              <Textarea
                value={form.requirements}
                onChange={(e) => setForm({ ...form, requirements: e.target.value })}
                placeholder={t("vacanciesPage.requirementsPlaceholder")}
                rows={3}
                maxLength={6000}
              />
            </div>
            <div className="space-y-2">
              <Label>{t("vacanciesPage.employmentType")}</Label>
              <Select value={form.employmentType} onValueChange={(v) => setForm({ ...form, employmentType: v })}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(["full_time", "part_time", "temporary", "seasonal", "internship"] as const).map((et) => (
                    <SelectItem key={et} value={et}>
                      {t(`jobs.employmentType.${et}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t("vacanciesPage.openings")}</Label>
              <Input
                type="number"
                min={1}
                max={999}
                value={form.openings}
                onChange={(e) => setForm({ ...form, openings: e.target.value })}
                dir="ltr"
              />
            </div>
            <div className="space-y-2">
              <Label>{t("vacanciesPage.salaryMin")}</Label>
              <Input
                type="number"
                min={0}
                value={form.salaryMin}
                onChange={(e) => setForm({ ...form, salaryMin: e.target.value })}
                dir="ltr"
              />
            </div>
            <div className="space-y-2">
              <Label>{t("vacanciesPage.salaryMax")}</Label>
              <Input
                type="number"
                min={0}
                value={form.salaryMax}
                onChange={(e) => setForm({ ...form, salaryMax: e.target.value })}
                dir="ltr"
              />
            </div>
            <div className="space-y-2">
              <Label>{t("vacanciesPage.contactEmail")}</Label>
              <Input
                type="email"
                dir="ltr"
                value={form.contactEmail}
                onChange={(e) => setForm({ ...form, contactEmail: e.target.value })}
                maxLength={190}
              />
            </div>
            <div className="space-y-2">
              <Label>{t("vacanciesPage.contactPhone")}</Label>
              <Input
                type="tel"
                dir="ltr"
                value={form.contactPhone}
                onChange={(e) => setForm({ ...form, contactPhone: e.target.value })}
                maxLength={20}
              />
            </div>
            <div className="space-y-2">
              <Label>{t("vacanciesPage.closesAt")}</Label>
              <Input
                type="date"
                value={form.closesAt}
                onChange={(e) => setForm({ ...form, closesAt: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              {t("vacanciesPage.cancelCta")}
            </Button>
            <Button onClick={save} disabled={saving || !form.projectId || form.title.trim().length < 3 || form.description.trim().length < 20} className="gap-2 font-semibold">
              {saving && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
              {t("vacanciesPage.saveCta")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* حوار طلبات التقديم */}
      <Dialog open={!!appsFor} onOpenChange={(o) => !o && setAppsFor(null)}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle className="truncate">{appsFor?.title}</DialogTitle>
            <DialogDescription>{t("vacanciesPage.applications")}</DialogDescription>
          </DialogHeader>
          {appsLoading ? (
            <div className="flex items-center justify-center py-10">
              <LoaderCircle className="size-6 animate-spin text-muted-foreground" aria-hidden />
            </div>
          ) : applications.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">{t("vacanciesPage.noApplications")}</p>
          ) : (
            <ul className="space-y-3">
              {applications.map((a) => (
                <li key={a.id} className="rounded-lg border border-border/70 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-bold text-foreground">{a.seeker.fullName}</p>
                      <div className="mt-0.5 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground" dir="auto">
                        <a href={`mailto:${a.seeker.email}`} className="underline-offset-4 hover:underline" dir="ltr">
                          {a.seeker.email}
                        </a>
                        <a href={`tel:${a.seeker.phone.replace(/\s/g, "")}`} className="underline-offset-4 hover:underline" dir="ltr">
                          {a.seeker.phone}
                        </a>
                      </div>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {t("jobs.me.appliedOn", { date: formatDate(a.createdAt.slice(0, 10), locale) })}
                        {a.seeker.documentType ? ` · ${t(`jobs.register.docTypes.${a.seeker.documentType}`)}` : ""}
                      </p>
                    </div>
                    <Badge variant={APP_STATUS_VARIANT[a.status] ?? "secondary"}>
                      {t(`jobs.me.applicationStatus.${a.status}`)}
                    </Badge>
                  </div>
                  {a.coverNote && (
                    <p className="mt-2 whitespace-pre-line rounded-md bg-secondary/50 p-2.5 text-sm leading-relaxed text-muted-foreground">
                      {a.coverNote}
                    </p>
                  )}
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {a.status === "submitted" && (
                      <Button variant="outline" size="sm" className="gap-1.5" onClick={() => void setAppStatus(a.id, "viewed")}>
                        <Eye className="size-3.5" aria-hidden />
                        {t("jobs.me.applicationStatus.viewed")}
                      </Button>
                    )}
                    {(a.status === "submitted" || a.status === "viewed") && (
                      <>
                        <Button variant="secondary" size="sm" className="gap-1.5" onClick={() => void setAppStatus(a.id, "shortlisted")}>
                          <UserCheck className="size-3.5" aria-hidden />
                          {t("jobs.me.applicationStatus.shortlisted")}
                        </Button>
                        <Button variant="ghost" size="sm" className="gap-1.5 text-destructive" onClick={() => void setAppStatus(a.id, "rejected")}>
                          <UserRoundX className="size-3.5" aria-hidden />
                          {t("jobs.me.applicationStatus.rejected")}
                        </Button>
                      </>
                    )}
                    {(a.status === "viewed" || a.status === "shortlisted") && (
                      <Button size="sm" className="gap-1.5" onClick={() => void setAppStatus(a.id, "hired")}>
                        <UserCheck className="size-3.5" aria-hidden />
                        {t("jobs.me.applicationStatus.hired")}
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
