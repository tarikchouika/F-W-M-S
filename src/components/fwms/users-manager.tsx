"use client";

// FWMS — إدارة المستخدمين (المرحلة 9): إنشاء الحسابات للسوبر أدمن حصرًا (أو مفوَّض)،
// تعطيل/تفعيل وتعيين المسمى الوظيفي لمن يملك users.manage، ولوحة تفويض الصلاحيات
// للسوبر أدمن وحده. كلمة المرور الابتدائية تُعرض مرة واحدة في استجابة الإنشاء فقط.
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  UserPlus,
  Users,
  LoaderCircle,
  KeyRound,
  Copy,
  Check,
  Ban,
  CheckCircle2,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useI18n } from "@/i18n/provider";
import { ListState, apiRequest, apiErrorMessage } from "@/components/fwms/org-bits";
import { JOB_TITLE_CATEGORIES, jobTitleLabel } from "@/lib/job-titles";

const NONE = "none"; // قيمة حارسة (درس Radix Select — قيمة نصية فارغة مرفوضة)

type UserRow = {
  userId: string;
  email: string;
  fullName: string;
  phone: string | null;
  role: string;
  isActive: boolean;
  lastLoginAt: string | null;
  jobTitleKey: string | null;
  jobTitleCustom: string | null;
};

type DelegationRow = {
  id: string;
  granteeId: string;
  granteeName: string;
  permission: string;
  note: string | null;
  grantedAt: string;
  grantedByName: string;
  expiresAt: string | null;
};

const ROLE_KEYS = ["super_admin", "admin", "co_admin", "accountant", "employee"] as const;
const roleLabelKey = (role: string) =>
  ({
    super_admin: "dashboard.roleSuperAdmin",
    admin: "dashboard.roleAdmin",
    co_admin: "dashboard.roleCoAdmin",
    accountant: "dashboard.roleAccountant",
    employee: "dashboard.roleEmployee",
  })[role] ?? "dashboard.roleEmployee";

export function UsersManager({
  canCreate,
  isSuperAdmin,
  myUserId,
}: {
  canCreate: boolean;
  isSuperAdmin: boolean;
  myUserId: string;
}) {
  const { t, locale } = useI18n();
  const { toast } = useToast();

  const [rows, setRows] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [q, setQ] = useState("");

  const [createOpen, setCreateOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [initialPassword, setInitialPassword] = useState<{ email: string; password: string } | null>(null);

  const [form, setForm] = useState({
    fullName: "",
    email: "",
    phone: "",
    role: "employee" as (typeof ROLE_KEYS)[number],
    jobTitleKey: NONE as string,
    password: "",
  });

  // تفويض
  const [delegations, setDelegations] = useState<DelegationRow[]>([]);
  const [delegable, setDelegable] = useState<string[]>([]);
  const [delegOpen, setDelegOpen] = useState(false);
  const [delegSaving, setDelegSaving] = useState(false);
  const [delegForm, setDelegForm] = useState({ granteeId: NONE, permission: NONE, expiresInDays: "", note: "" });

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const data = await apiRequest<{ users: UserRow[] }>("/api/users");
      setRows(data.users);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadDelegations = useCallback(async () => {
    if (!isSuperAdmin) return;
    try {
      const data = await apiRequest<{ delegations: DelegationRow[]; delegablePermissions: string[] }>(
        "/api/users/delegations",
      );
      setDelegations(data.delegations);
      setDelegable(data.delegablePermissions);
    } catch {
      /* تحسينية */
    }
  }, [isSuperAdmin]);

  useEffect(() => {
    void load();
    void loadDelegations();
  }, [load, loadDelegations]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((r) =>
      [r.fullName, r.email, r.jobTitleKey ? jobTitleLabel(r.jobTitleKey, locale) ?? "" : ""]
        .some((v) => v.toLowerCase().includes(needle)),
    );
  }, [rows, q, locale]);

  async function onCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (saving) return;
    if (form.fullName.trim().length < 2 || !form.email.includes("@")) {
      toast({ variant: "destructive", description: t("common.invalidInput") });
      return;
    }
    setSaving(true);
    try {
      const body = JSON.stringify({
        fullName: form.fullName.trim(),
        email: form.email.trim(),
        phone: form.phone.trim() || null,
        role: form.role,
        jobTitleKey: form.jobTitleKey === NONE ? null : form.jobTitleKey,
        ...(form.password.trim() ? { password: form.password.trim() } : {}),
      });
      const data = await apiRequest<{ initialPassword: string; user: { email: string } }>("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });
      setCreateOpen(false);
      setInitialPassword({ email: data.user.email, password: data.initialPassword });
      setForm({ fullName: "", email: "", phone: "", role: "employee", jobTitleKey: NONE, password: "" });
      await load();
    } catch (err) {
      toast({ variant: "destructive", description: apiErrorMessage(t, err) });
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(row: UserRow) {
    const next = !row.isActive;
    try {
      await apiRequest(`/api/users/${row.userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: next }),
      });
      await load();
    } catch (err) {
      toast({ variant: "destructive", description: apiErrorMessage(t, err) });
    }
  }

  async function setJobTitle(row: UserRow, jobTitleKey: string) {
    try {
      await apiRequest(`/api/users/${row.userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobTitleKey: jobTitleKey === NONE ? null : jobTitleKey }),
      });
      await load();
    } catch (err) {
      toast({ variant: "destructive", description: apiErrorMessage(t, err) });
    }
  }

  async function grantDelegation(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (delegSaving) return;
    if (delegForm.granteeId === NONE || delegForm.permission === NONE) {
      toast({ variant: "destructive", description: t("common.invalidInput") });
      return;
    }
    setDelegSaving(true);
    try {
      await apiRequest("/api/users/delegations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          granteeId: delegForm.granteeId,
          permission: delegForm.permission,
          note: delegForm.note.trim() || null,
          expiresInDays: delegForm.expiresInDays.trim() ? Number(delegForm.expiresInDays) : null,
        }),
      });
      setDelegOpen(false);
      setDelegForm({ granteeId: NONE, permission: NONE, expiresInDays: "", note: "" });
      await loadDelegations();
    } catch (err) {
      toast({ variant: "destructive", description: apiErrorMessage(t, err) });
    } finally {
      setDelegSaving(false);
    }
  }

  async function revokeDelegation(id: string) {
    try {
      await apiRequest(`/api/users/delegations?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      await loadDelegations();
    } catch (err) {
      toast({ variant: "destructive", description: apiErrorMessage(t, err) });
    }
  }

  if (loading) return <ListState loading error={false} empty={false} />;
  if (error) return <ListState loading={false} error empty={false} onRetry={() => void load()} />;

  return (
    <div className="flex flex-col gap-6">
      {/* كلمة المرور الابتدائية — تُعرض مرة واحدة */}
      {initialPassword && (
        <div className="flex flex-col gap-2 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/40 dark:text-amber-200">
          <span className="font-bold">{t("usersPage.initialPasswordTitle")} — {initialPassword.email}</span>
          <div className="flex items-center gap-2">
            <code dir="ltr" className="rounded bg-amber-100 px-2 py-1 font-mono text-base font-bold dark:bg-amber-900 dark:text-amber-100">
              {initialPassword.password}
            </code>
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => {
                void navigator.clipboard?.writeText(initialPassword.password).then(() =>
                  toast({ description: t("common.copy") }),
                );
              }}
            >
              <Copy className="size-3.5" aria-hidden />
              {t("common.copy")}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setInitialPassword(null)}>
              {t("common.ok")}
            </Button>
          </div>
          <span className="text-xs">{t("usersPage.initialPasswordHint")}</span>
        </div>
      )}

      {/* التفويض — السوبر أدمن وحده */}
      {isSuperAdmin && (
        <Card className="border-border/70">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="flex items-center gap-2 text-base font-bold">
              <ShieldCheck className="size-4 text-primary" aria-hidden />
              {t("usersPage.delegationsTitle")}
            </CardTitle>
            <Button variant="outline" size="sm" onClick={() => setDelegOpen(true)} className="gap-2">
              <KeyRound className="size-3.5" aria-hidden />
              {t("usersPage.grantDelegation")}
            </Button>
          </CardHeader>
          <CardContent>
            {delegations.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">{t("usersPage.noDelegations")}</p>
            ) : (
              <div className="max-h-64 overflow-y-auto rounded-lg border border-border/60">
                <Table>
                  <TableHeader className="sticky top-0 bg-muted/95 backdrop-blur">
                    <TableRow>
                      <TableHead className="text-xs">{t("usersPage.grantee")}</TableHead>
                      <TableHead className="text-xs">{t("usersPage.permission")}</TableHead>
                      <TableHead className="text-xs">{t("usersPage.expires")}</TableHead>
                      <TableHead className="text-xs">{t("common.actions")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {delegations.map((d) => (
                      <TableRow key={d.id}>
                        <TableCell className="font-medium">{d.granteeName}</TableCell>
                        <TableCell>
                          <code dir="ltr" className="rounded bg-muted px-1.5 py-0.5 text-xs">{d.permission}</code>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground tabular-nums">
                          {d.expiresAt
                            ? new Date(d.expiresAt).toLocaleDateString(locale)
                            : t("usersPage.noExpiry")}
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon" className="size-7 text-red-600" onClick={() => void revokeDelegation(d.id)} aria-label={t("usersPage.revoke")}>
                            <Trash2 className="size-3.5" aria-hidden />
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
      )}

      {/* قائمة المستخدمين */}
      <Card className="border-border/70">
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 pb-3">
          <CardTitle className="flex items-center gap-2 text-base font-bold">
            <Users className="size-4 text-primary" aria-hidden />
            {t("usersPage.listTitle")} ({rows.length})
          </CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t("common.search")}
              className="h-9 w-44 sm:w-56"
              aria-label={t("common.search")}
            />
            {canCreate && (
              <Button size="sm" onClick={() => setCreateOpen(true)} className="gap-2">
                <UserPlus className="size-4" aria-hidden />
                <span className="hidden sm:inline">{t("usersPage.createTitle")}</span>
                <span className="sm:hidden">+</span>
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-muted-foreground">{t("common.noData")}</p>
          ) : (
            <div className="max-h-[520px] overflow-y-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-muted/95 backdrop-blur">
                  <TableRow>
                    <TableHead className="text-xs">{t("usersPage.user")}</TableHead>
                    <TableHead className="text-xs">{t("usersPage.jobTitle")}</TableHead>
                    <TableHead className="text-xs">{t("usersPage.role")}</TableHead>
                    <TableHead className="text-xs">{t("common.status")}</TableHead>
                    <TableHead className="text-xs">{t("common.actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((r) => (
                    <TableRow key={r.userId}>
                      <TableCell>
                        <div className="flex flex-col leading-tight">
                          <span className="font-medium">{r.fullName}</span>
                          <span className="text-[11px] text-muted-foreground" dir="ltr">{r.email}</span>
                        </div>
                      </TableCell>
                      <TableCell className="min-w-44">
                        <Select
                          value={r.jobTitleKey ?? NONE}
                          onValueChange={(v) => void setJobTitle(r, v)}
                          disabled={r.userId === myUserId && false}
                        >
                          <SelectTrigger className="h-8 w-40 text-xs" aria-label={t("usersPage.jobTitle")}>
                            <SelectValue placeholder={t("presence.noJobTitle")} />
                          </SelectTrigger>
                          <SelectContent className="max-h-72">
                            <SelectItem value={NONE}>{t("presence.noJobTitle")}</SelectItem>
                            {JOB_TITLE_CATEGORIES.map((cat) => (
                              <div key={cat.key}>
                                <div className="px-2 pt-2 text-[11px] font-bold text-muted-foreground">
                                  {cat.labels[locale]}
                                </div>
                                {cat.titles.map((title) => (
                                  <SelectItem key={title.key} value={title.key} className="text-xs">
                                    {title.labels[locale]}
                                  </SelectItem>
                                ))}
                              </div>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="font-semibold">{t(roleLabelKey(r.role))}</Badge>
                      </TableCell>
                      <TableCell>
                        {r.isActive ? (
                          <Badge className="bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300">
                            {t("common.active")}
                          </Badge>
                        ) : (
                          <Badge variant="destructive">{t("common.suspended")}</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {r.userId === myUserId ? (
                          <span className="text-[11px] text-muted-foreground">{t("usersPage.you")}</span>
                        ) : (
                          <Button
                            variant={r.isActive ? "outline" : "secondary"}
                            size="sm"
                            className="h-8 gap-1.5 px-2 text-xs"
                            onClick={() => void toggleActive(r)}
                          >
                            {r.isActive ? (
                              <>
                                <Ban className="size-3.5 text-red-600" aria-hidden />
                                {t("usersPage.deactivate")}
                              </>
                            ) : (
                              <>
                                <CheckCircle2 className="size-3.5 text-green-600" aria-hidden />
                                {t("usersPage.activate")}
                              </>
                            )}
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* حوار الإنشاء */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("usersPage.createTitle")}</DialogTitle>
            <DialogDescription>{t("usersPage.createHint")}</DialogDescription>
          </DialogHeader>
          <form onSubmit={onCreate} className="flex flex-col gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="u-fullname">{t("usersPage.fullName")}</Label>
                <Input id="u-fullname" value={form.fullName} onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))} required minLength={2} maxLength={120} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="u-email">{t("usersPage.email")}</Label>
                <Input id="u-email" type="email" dir="ltr" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} required />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="u-phone">{t("usersPage.phone")}</Label>
                <Input id="u-phone" dir="ltr" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} maxLength={32} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="u-role">{t("usersPage.role")}</Label>
                <Select value={form.role} onValueChange={(v) => setForm((f) => ({ ...f, role: v as typeof f.role }))}>
                  <SelectTrigger id="u-role"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ROLE_KEYS.map((role) => (
                      <SelectItem key={role} value={role}>{t(roleLabelKey(role))}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <Label htmlFor="u-title">{t("usersPage.jobTitle")}</Label>
                <Select value={form.jobTitleKey} onValueChange={(v) => setForm((f) => ({ ...f, jobTitleKey: v }))}>
                  <SelectTrigger id="u-title"><SelectValue placeholder={t("presence.noJobTitle")} /></SelectTrigger>
                  <SelectContent className="max-h-72">
                    <SelectItem value={NONE}>{t("presence.noJobTitle")}</SelectItem>
                    {JOB_TITLE_CATEGORIES.map((cat) => (
                      <div key={cat.key}>
                        <div className="px-2 pt-2 text-[11px] font-bold text-muted-foreground">{cat.labels[locale]}</div>
                        {cat.titles.map((title) => (
                          <SelectItem key={title.key} value={title.key} className="text-xs">{title.labels[locale]}</SelectItem>
                        ))}
                      </div>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <Label htmlFor="u-password">{t("usersPage.password")}</Label>
                <Input id="u-password" type="text" dir="ltr" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} placeholder={t("usersPage.passwordPlaceholder")} minLength={8} maxLength={72} />
                <span className="text-[11px] text-muted-foreground">{t("usersPage.passwordHint")}</span>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>{t("common.cancel")}</Button>
              <Button type="submit" disabled={saving} className="gap-2">
                {saving && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
                {t("common.create")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* حوار التفويض */}
      <Dialog open={delegOpen} onOpenChange={setDelegOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("usersPage.grantDelegation")}</DialogTitle>
            <DialogDescription>{t("usersPage.delegationHint")}</DialogDescription>
          </DialogHeader>
          <form onSubmit={grantDelegation} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="d-grantee">{t("usersPage.grantee")}</Label>
              <Select value={delegForm.granteeId} onValueChange={(v) => setDelegForm((f) => ({ ...f, granteeId: v }))}>
                <SelectTrigger id="d-grantee"><SelectValue placeholder={t("usersPage.grantee")} /></SelectTrigger>
                <SelectContent className="max-h-64">
                  {rows
                    .filter((r) => r.isActive && r.userId !== myUserId)
                    .map((r) => (
                      <SelectItem key={r.userId} value={r.userId}>{r.fullName} — {t(roleLabelKey(r.role))}</SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="d-perm">{t("usersPage.permission")}</Label>
              <Select value={delegForm.permission} onValueChange={(v) => setDelegForm((f) => ({ ...f, permission: v }))}>
                <SelectTrigger id="d-perm"><SelectValue placeholder={t("usersPage.permission")} /></SelectTrigger>
                <SelectContent className="max-h-64">
                  {delegable.map((p) => (
                    <SelectItem key={p} value={p} className="text-xs">{p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="d-exp">{t("usersPage.expires")}</Label>
                <Input id="d-exp" dir="ltr" inputMode="numeric" value={delegForm.expiresInDays} onChange={(e) => setDelegForm((f) => ({ ...f, expiresInDays: e.target.value }))} placeholder={t("usersPage.noExpiry")} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="d-note">{t("usersPage.note")}</Label>
                <Input id="d-note" value={delegForm.note} onChange={(e) => setDelegForm((f) => ({ ...f, note: e.target.value }))} maxLength={240} />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDelegOpen(false)}>{t("common.cancel")}</Button>
              <Button type="submit" disabled={delegSaving} className="gap-2">
                {delegSaving && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
                <Check className="size-4" aria-hidden />
                {t("usersPage.grantDelegation")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
