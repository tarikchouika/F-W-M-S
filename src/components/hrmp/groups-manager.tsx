"use client";

// HRMP — مدير مجموعات العمال = الفرق الميدانية (المرحلة 2 + المرحلة 9):
// قائمة + إنشاء/تعديل/أرشفة/استعادة + إعداد الفريق (القائد/النوع/المنطقة/الأعضاء)
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { UsersRound, Plus, Pencil, Archive, ArchiveRestore, Search, LoaderCircle, UserCog } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useI18n } from "@/i18n/provider";
import { PageHeader, StatusBadge, ConfirmAction, ListState, formatDate, apiRequest, apiErrorMessage } from "@/components/hrmp/org-bits";
import { TeamSetup } from "@/components/hrmp/team-setup";

type GroupRow = {
  id: string;
  name: string;
  description: string | null;
  status: string;
  kind: string;
  leaderUserId: string | null;
  leaderName: string | null;
  siteId: string | null;
  siteName: string | null;
  memberCount: number;
  zone: { lat: number; lng: number; radiusM: number } | null;
  createdAt: string;
};

type GroupForm = { name: string; description: string };

const EMPTY_FORM: GroupForm = { name: "", description: "" };

export function GroupsManager() {
  const { t, locale } = useI18n();
  const { toast } = useToast();

  const [rows, setRows] = useState<GroupRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [q, setQ] = useState("");
  const [showArchived, setShowArchived] = useState(false);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<GroupForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  // إعداد الفريق (المرحلة 9)
  const [teamSetupId, setTeamSetupId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const data = await apiRequest<{ groups: GroupRow[] }>("/api/worker-groups");
      setRows(data.groups);
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
      return [r.name, r.description].some((v) => v?.toLowerCase().includes(needle));
    }
    return true;
  });

  function openCreate() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  }

  function openEdit(row: GroupRow) {
    setEditingId(row.id);
    setForm({ name: row.name, description: row.description ?? "" });
    setDialogOpen(true);
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (saving) return;
    if (form.name.trim().length < 2) {
      toast({ variant: "destructive", description: t("common.invalidInput") });
      return;
    }
    const body = JSON.stringify({ name: form.name.trim(), description: form.description.trim() });
    setSaving(true);
    try {
      if (editingId) {
        await apiRequest(`/api/worker-groups/${editingId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body });
        toast({ description: t("groups.updated") });
      } else {
        await apiRequest("/api/worker-groups", { method: "POST", headers: { "Content-Type": "application/json" }, body });
        toast({ description: t("groups.created") });
      }
      setDialogOpen(false);
      await load();
    } catch (err) {
      toast({ variant: "destructive", description: apiErrorMessage(t, err) });
    } finally {
      setSaving(false);
    }
  }

  async function onArchive(row: GroupRow) {
    try {
      await apiRequest(`/api/worker-groups/${row.id}`, { method: "DELETE" });
      toast({ description: t("groups.archived") });
    } catch (err) {
      toast({ variant: "destructive", description: apiErrorMessage(t, err) });
    }
    await load();
  }

  async function onRestore(row: GroupRow) {
    try {
      await apiRequest(`/api/worker-groups/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "active" }),
      });
      toast({ description: t("groups.restored") });
    } catch (err) {
      toast({ variant: "destructive", description: apiErrorMessage(t, err) });
    }
    await load();
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <PageHeader title={t("groups.title")} subtitle={t("groups.subtitle")}>
        <Button onClick={openCreate} className="gap-2 font-bold">
          <Plus className="size-4" aria-hidden />
          {t("groups.createTitle")}
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
            <UsersRound className="size-4 text-primary" aria-hidden />
            {t("groups.title")}
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
                    <TableHead className="text-xs">{t("common.description")}</TableHead>
                    <TableHead className="text-xs">{t("common.status")}</TableHead>
                    <TableHead className="text-xs">{t("common.actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>
                        <p className="font-semibold">{row.name}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-1">
                          {row.kind === "reserve" && <Badge variant="outline" className="h-4 px-1 text-[10px]">{t("groups.kindReserve")}</Badge>}
                          {row.status === "active" && (
                            <span className="text-[11px] text-muted-foreground/80">
                              {t("groups.membersCount", { count: row.memberCount })}
                              {row.leaderName ? ` · ${t("presence.leader")}: ${row.leaderName}` : ""}
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-muted-foreground/80">{formatDate(row.createdAt, locale)}</p>
                      </TableCell>
                      <TableCell className="max-w-72 text-xs text-muted-foreground">
                        <p className="truncate">{row.description ?? "—"}</p>
                      </TableCell>
                      <TableCell><StatusBadge status={row.status} /></TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          {row.status === "active" && (
                            <Button variant="outline" size="sm" className="h-8 gap-1.5 px-2 text-xs" onClick={() => setTeamSetupId(row.id)}>
                              <UserCog className="size-3.5" aria-hidden />
                              <span className="hidden sm:inline">{t("groups.teamSetup")}</span>
                            </Button>
                          )}
                          <Button variant="ghost" size="icon" className="size-8" onClick={() => openEdit(row)} aria-label={t("common.edit")}>
                            <Pencil className="size-4" aria-hidden />
                          </Button>
                          {row.status === "active" ? (
                            <ConfirmAction
                              triggerLabel={<><Archive className="size-4" aria-hidden />{t("common.archive")}</>}
                              triggerClassName="h-8 gap-1.5 px-2 text-xs text-destructive hover:text-destructive"
                              title={t("groups.title")}
                              description={t("groups.confirmArchive")}
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

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? t("groups.editTitle") : t("groups.createTitle")}</DialogTitle>
            <DialogDescription>{t("groups.subtitle")}</DialogDescription>
          </DialogHeader>
          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="group-name">{t("common.name")}</Label>
              <Input id="group-name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required minLength={2} maxLength={120} disabled={saving} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="group-desc">{t("common.description")}</Label>
              <Textarea id="group-desc" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} maxLength={240} rows={3} disabled={saving} />
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

      {/* إعداد الفريق (المرحلة 9) — قائد/نوع/منطقة/أعضاء */}
      <Dialog open={teamSetupId !== null} onOpenChange={(o) => !o && setTeamSetupId(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t("groups.teamSetup")}</DialogTitle>
            <DialogDescription>{t("groups.teamSetupHint")}</DialogDescription>
          </DialogHeader>
          {teamSetupId && (
            <TeamSetup
              groupId={teamSetupId}
              onSaved={() => void load()}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
