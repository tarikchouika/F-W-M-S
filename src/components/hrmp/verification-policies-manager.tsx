"use client";

// HRMP — مدير سياسات التحقق (المرحلة 4 — SPEC §4.2): المنصة ← الشركة ← الموقع
// «فقط ضمن ما يسمح به المالك» (تخصيص أضيق) + تفعيل الوجه يتطلب إقرار المالك القانوني (09-08/CNDP)
import { useCallback, useEffect, useMemo, useState } from "react";
import { LoaderCircle, Pencil, RefreshCcw, ScanFace, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useI18n } from "@/i18n/provider";
import { ListState, PageHeader, apiRequest, apiErrorMessage } from "@/components/hrmp/org-bits";

type PolicyRow = { policy: string; faceAcknowledged: boolean; updatedAt: string };
type SitePolicyRow = PolicyRow & { siteId: string; siteName: string };
type SiteOption = { id: string; name: string; status: string };

type PoliciesResponse = {
  platform: PolicyRow | null;
  company: PolicyRow | null;
  sites: SitePolicyRow[];
};

const POLICY_MODES = ["none", "qr", "face", "qr_and_face", "qr_or_face"] as const;
const NONE = "none"; // قيمة حارسة لقائمة المواقع (Radix يرفض القيمة الفارغة — درس المرحلة 2)

const POLICY_KEYS: Record<string, string> = {
  none: "policies.modeNone",
  qr: "policies.modeQr",
  face: "policies.modeFace",
  qr_and_face: "policies.modeQrAndFace",
  qr_or_face: "policies.modeQrOrFace",
};

function policyBadge(policy: string) {
  const key = POLICY_KEYS[policy];
  return <Badge variant="outline" className="font-mono text-[11px]">{key ? key.replace("policies.mode", "") : policy}</Badge>;
}

export function VerificationPoliciesManager({ isSuperAdmin }: { isSuperAdmin: boolean }) {
  const { t } = useI18n();
  const { toast } = useToast();

  const [data, setData] = useState<PoliciesResponse | null>(null);
  const [siteOptions, setSiteOptions] = useState<SiteOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  // حوار التعديل
  const [level, setLevel] = useState<"platform" | "company" | "site">("company");
  const [siteId, setSiteId] = useState<string>(NONE);
  const [policy, setPolicy] = useState<string>("none");
  const [faceAck, setFaceAck] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const [res, sites] = await Promise.all([
        apiRequest<PoliciesResponse>("/api/verification-policies"),
        apiRequest<{ sites: SiteOption[] }>("/api/sites"),
      ]);
      setData(res);
      setSiteOptions(sites.sites.filter((s) => s.status === "active"));
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // المواقع النشطة الكاملة للاختيار في حوار التخصيص
  const selectableSites = useMemo(() => siteOptions, [siteOptions]);

  async function openDialog(target: "platform" | "company" | "site", row?: SitePolicyRow) {
    setLevel(target);
    if (target === "site" && row) {
      setSiteId(row.siteId);
      setPolicy(row.policy);
      setFaceAck(row.faceAcknowledged);
    } else if (target === "platform" && data?.platform) {
      setPolicy(data.platform.policy);
      setFaceAck(data.platform.faceAcknowledged);
    } else if (target === "company" && data?.company) {
      setPolicy(data.company.policy);
      setFaceAck(data.company.faceAcknowledged);
    } else {
      setPolicy("none");
      setFaceAck(false);
      setSiteId(NONE);
    }
    setDialogOpen(true);
  }

  async function save() {
    if (saving) return;
    if (level === "site" && siteId === NONE) {
      toast({ variant: "destructive", description: t("policies.selectSiteFirst") });
      return;
    }
    setSaving(true);
    try {
      await apiRequest("/api/verification-policies", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          level,
          siteId: level === "site" ? siteId : null,
          policy,
          faceAcknowledged: faceAck,
        }),
      });
      toast({ description: t("policies.updated") });
      setDialogOpen(false);
      await load();
    } catch (err) {
      toast({ variant: "destructive", description: apiErrorMessage(t, err) });
    } finally {
      setSaving(false);
    }
  }

  const needsFaceAck = policy === "face" || policy === "qr_and_face" || policy === "qr_or_face";

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <PageHeader title={t("policies.title")} subtitle={t("policies.subtitle")} />

      <p className="rounded-lg border border-sky-500/40 bg-sky-500/10 px-4 py-3 text-xs leading-relaxed text-sky-700 dark:text-sky-300">
        {t("policies.narrowingNote")}
      </p>

      <Card className="border-border/70">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="size-4 text-primary" aria-hidden />
            {t("policies.chainTitle")}
            <Button variant="ghost" size="sm" onClick={() => void load()} disabled={loading} className="ms-auto gap-1.5">
              {loading ? <LoaderCircle className="size-3.5 animate-spin" aria-hidden /> : <RefreshCcw className="size-3.5" aria-hidden />}
              {t("common.retry")}
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ListState loading={loading && !data} error={error} empty={false} onRetry={() => void load()} />
          {!loading && !error && data && (
            <div className="flex flex-col gap-4">
              {/* المنصة */}
              <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/30 px-4 py-3">
                <Badge variant="secondary">{t("policies.levelPlatform")}</Badge>
                {data.platform ? (
                  <>
                    {policyBadge(data.platform.policy)}
                    {data.platform.faceAcknowledged && (
                      <Badge variant="outline" className="gap-1 border-violet-500/50 text-violet-600 dark:text-violet-400">
                        <ScanFace className="size-3" aria-hidden />
                        {t("policies.faceAck")}
                      </Badge>
                    )}
                  </>
                ) : (
                  <span className="text-xs text-muted-foreground">{t("policies.notSet")} — {t("policies.allAllowed")}</span>
                )}
                {isSuperAdmin && (
                  <Button variant="outline" size="sm" className="ms-auto h-8 gap-1.5 px-2 text-xs" onClick={() => void openDialog("platform")}>
                    <Pencil className="size-3.5" aria-hidden />
                    {t("common.edit")}
                  </Button>
                )}
              </div>

              {/* الشركة */}
              <div className="flex flex-wrap items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3">
                <Badge>{t("policies.levelCompany")}</Badge>
                {data.company ? (
                  <>
                    {policyBadge(data.company.policy)}
                    {data.company.faceAcknowledged && (
                      <Badge variant="outline" className="gap-1 border-violet-500/50 text-violet-600 dark:text-violet-400">
                        <ScanFace className="size-3" aria-hidden />
                        {t("policies.faceAck")}
                      </Badge>
                    )}
                  </>
                ) : (
                  <span className="text-xs text-muted-foreground">{t("policies.notSet")} — {t("policies.inheritsPlatform")}</span>
                )}
                <Button variant="outline" size="sm" className="ms-auto h-8 gap-1.5 px-2 text-xs" onClick={() => void openDialog("company")}>
                  <Pencil className="size-3.5" aria-hidden />
                  {t("common.edit")}
                </Button>
              </div>

              {/* المواقع */}
              <div className="rounded-lg border border-border/60">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 px-4 py-2.5">
                  <span className="text-sm font-semibold">{t("policies.levelSite")}</span>
                  <Button variant="outline" size="sm" className="h-8 gap-1.5 px-2 text-xs" onClick={() => void openDialog("site")}>
                    {t("policies.addSitePolicy")}
                  </Button>
                </div>
                {data.sites.length === 0 ? (
                  <p className="px-4 py-3 text-xs text-muted-foreground">{t("policies.noSitePolicies")}</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">{t("shifts.site")}</TableHead>
                        <TableHead className="text-xs">{t("policies.mode")}</TableHead>
                        <TableHead className="text-xs">{t("policies.faceAck")}</TableHead>
                        <TableHead className="text-xs">{t("common.actions")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.sites.map((row) => (
                        <TableRow key={row.siteId}>
                          <TableCell className="font-medium">{row.siteName}</TableCell>
                          <TableCell>{policyBadge(row.policy)}</TableCell>
                          <TableCell>
                            {row.faceAcknowledged ? (
                              <Badge variant="outline" className="gap-1 border-violet-500/50 text-violet-600 dark:text-violet-400">
                                <ScanFace className="size-3" aria-hidden />
                                {t("policies.faceAck")}
                              </Badge>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Button variant="ghost" size="icon" className="size-8" onClick={() => void openDialog("site", row)} aria-label={t("common.edit")}>
                              <Pencil className="size-4" aria-hidden />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* حوار التعديل */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {level === "platform" ? t("policies.editPlatform") : level === "company" ? t("policies.editCompany") : t("policies.editSite")}
            </DialogTitle>
            <DialogDescription>{t("policies.editDescription")}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            {level === "site" && (
              <div className="flex flex-col gap-2">
                <Label htmlFor="pol-site">{t("shifts.site")}</Label>
                <Select value={siteId} onValueChange={setSiteId}>
                  <SelectTrigger id="pol-site" className="w-full">
                    <SelectValue placeholder={t("myAttendance.selectSite")} />
                  </SelectTrigger>
                  <SelectContent>
                    {selectableSites.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">{t("policies.siteHint")}</p>
              </div>
            )}
            <div className="flex flex-col gap-2">
              <Label htmlFor="pol-mode">{t("policies.mode")}</Label>
              <Select value={policy} onValueChange={setPolicy}>
                <SelectTrigger id="pol-mode" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {POLICY_MODES.map((m) => (
                    <SelectItem key={m} value={m}>{t(POLICY_KEYS[m])}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {needsFaceAck && (
              <div className="flex flex-col gap-2 rounded-lg border border-violet-500/40 bg-violet-500/10 px-3 py-3">
                <Label htmlFor="pol-face-ack" className="flex items-start gap-2 text-xs leading-relaxed">
                  <Checkbox
                    id="pol-face-ack"
                    checked={faceAck}
                    onCheckedChange={(v) => setFaceAck(v === true)}
                    disabled={saving}
                  />
                  {t("policies.faceAckLabel")}
                </Label>
                <p className="text-[11px] leading-relaxed text-violet-700/80 dark:text-violet-300/80">
                  {t("policies.faceLegalNote")}
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button onClick={() => void save()} disabled={saving} className="gap-2 font-bold">
              {saving && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
              {saving ? t("common.saving") : t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
