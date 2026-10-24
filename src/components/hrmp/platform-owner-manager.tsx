"use client";

// HRMP — مدير ملكية المنصة (SPEC §3.2 — المرحلة 8): هوية المالك (white-label) + أداة نقل الملكية
// كل فعل حساسة يمر بـ /api/platform/ownership بإعادة مصادقة كلمة المرور — الخادم هو الحكم.
// بيانات التسليم (كلمة المرور الابتدائية / سر JWT المقترح) تُعرض مرة واحدة ولا تُخزَّن.
import { useCallback, useEffect, useState } from "react";
import { Copy, Eye, FileCog, KeyRound, Landmark, LoaderCircle, RefreshCcw, ShieldCheck, Snowflake } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useI18n } from "@/i18n/provider";
import { ApiError, PageHeader, apiRequest, apiErrorMessage, formatDate } from "@/components/hrmp/org-bits";

type OwnerIdentity = {
  id: string;
  legalName: string;
  displayName: string;
  contactEmail: string | null;
  contactPhone: string | null;
  logoUrl: string | null;
  websiteUrl: string | null;
  termsUrl: string | null;
  footerText: string | null;
  defaultLocale: string;
  defaultCurrency: string;
  modulesJson: string | null;
};

type TransferRow = {
  id: string;
  state: string;
  reason: string | null;
  newOwnerLegalName: string;
  newOwnerDisplayName: string;
  newOwnerInitialAdminEmail: string;
  initiatedAt: string;
  currentOwnerApprovedAt: string | null;
  newOwnerApprovedAt: string | null;
  executedAt: string | null;
  secretsRotatedAt: string | null;
  cancelledAt: string | null;
  backupSha256: string | null;
  exportSha256: string | null;
  integrityCheckStatus: string | null;
  revokedSuperAdminCount: number | null;
  sessionsInvalidatedUsers: number | null;
};

type StatusResponse = {
  owner: OwnerIdentity & { transferFreeze: boolean };
  freeze: boolean;
  activeTransfer: TransferRow | null;
  lastCompleted: { id: string; executedAt: string; newOwnerLegalName: string; secretsRotatedAt: string | null } | null;
  history: TransferRow[];
};

type ExecuteResult = {
  backupSha256: string;
  backupTableCount: number;
  exportSha256: string;
  integrityCheckStatus: string;
  revokedSuperAdminCount: number;
  sessionsInvalidatedUsers: number;
  newAdminEmail: string;
  newAdminTempPassword: string;
  suggestedAuthSecret: string;
};

const MODULE_KEYS = [
  "module.scheduling",
  "module.attendance",
  "module.coverage",
  "module.payroll",
  "module.declarations",
  "module.reports",
  "regime.general",
  "regime.agricultural",
  "regime.public_civil_service",
  "regime.public_entreprise",
] as const;

const STATE_KEY: Record<string, string> = {
  awaiting_current_owner: "platform.stateAwaitingCurrent",
  awaiting_new_owner: "platform.stateAwaitingNew",
  approved: "platform.stateApproved",
  completed: "platform.stateCompleted",
  cancelled: "platform.stateCancelled",
};

const STATE_VARIANT: Record<string, string> = {
  awaiting_current_owner: "secondary",
  awaiting_new_owner: "secondary",
  approved: "default",
  completed: "outline",
  cancelled: "destructive",
};

export function PlatformOwnerManager() {
  const { t, locale } = useI18n();
  const { toast } = useToast();

  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [pw, setPw] = useState("");
  const [code, setCode] = useState("");
  const [issuedCode, setIssuedCode] = useState<string | null>(null);
  const [executeResult, setExecuteResult] = useState<ExecuteResult | null>(null);

  // نموذج الهوية (white-label)
  const [identity, setIdentity] = useState({
    legalName: "",
    displayName: "",
    contactEmail: "",
    contactPhone: "",
    logoUrl: "",
    websiteUrl: "",
    termsUrl: "",
    footerText: "",
    defaultLocale: "ar",
    defaultCurrency: "MAD",
  });
  const [modules, setModules] = useState<Record<string, boolean>>({});

  // نموذج بدء النقل
  const [newOwner, setNewOwner] = useState({
    newOwnerLegalName: "",
    newOwnerDisplayName: "",
    newOwnerContactEmail: "",
    newOwnerInitialAdminEmail: "",
    reason: "",
  });

  const [cancelReason, setCancelReason] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiRequest<StatusResponse>("/api/platform/ownership");
      setStatus(data);
      setIdentity({
        legalName: data.owner.legalName ?? "",
        displayName: data.owner.displayName ?? "",
        contactEmail: data.owner.contactEmail ?? "",
        contactPhone: data.owner.contactPhone ?? "",
        logoUrl: data.owner.logoUrl ?? "",
        websiteUrl: data.owner.websiteUrl ?? "",
        termsUrl: data.owner.termsUrl ?? "",
        footerText: data.owner.footerText ?? "",
        defaultLocale: data.owner.defaultLocale ?? "ar",
        defaultCurrency: data.owner.defaultCurrency ?? "MAD",
      });
      try {
        const parsed = data.owner.modulesJson ? (JSON.parse(data.owner.modulesJson) as Record<string, boolean>) : {};
        const m: Record<string, boolean> = {};
        for (const k of MODULE_KEYS) m[k] = parsed[k] === undefined ? true : parsed[k] === true;
        setModules(m);
      } catch {
        const m: Record<string, boolean> = {};
        for (const k of MODULE_KEYS) m[k] = true;
        setModules(m);
      }
    } catch (error) {
      toast({ title: apiErrorMessage(t, error), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [t, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const requirePw = (): string | null => {
    if (!pw.trim()) {
      toast({ title: t("platform.passwordRequired"), variant: "destructive" });
      return null;
    }
    return pw;
  };

  async function post(body: Record<string, unknown>, successTitle: string) {
    setBusy(true);
    try {
      const data = await apiRequest<Record<string, unknown>>("/api/platform/ownership", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      toast({ title: successTitle });
      setPw("");
      return data;
    } catch (error) {
      toast({ title: apiErrorMessage(t, error instanceof ApiError ? error : null), variant: "destructive" });
      if (error instanceof ApiError && error.code === "reauth_failed") setPw("");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function saveIdentity() {
    const password = requirePw();
    if (!password) return;
    const modulesJson = Object.fromEntries(MODULE_KEYS.map((k) => [k, modules[k] === true]));
    const ok = await post(
      {
        action: "update-owner",
        password,
        legalName: identity.legalName,
        displayName: identity.displayName,
        contactEmail: identity.contactEmail || null,
        contactPhone: identity.contactPhone || null,
        logoUrl: identity.logoUrl || null,
        websiteUrl: identity.websiteUrl || null,
        termsUrl: identity.termsUrl || null,
        footerText: identity.footerText || null,
        defaultLocale: identity.defaultLocale,
        defaultCurrency: identity.defaultCurrency,
        modulesJson: JSON.stringify(modulesJson),
      },
      t("platform.saved")
    );
    if (ok) await load();
  }

  async function initiate() {
    const password = requirePw();
    if (!password) return;
    const ok = await post(
      {
        action: "initiate",
        password,
        newOwnerLegalName: newOwner.newOwnerLegalName,
        newOwnerDisplayName: newOwner.newOwnerDisplayName,
        newOwnerContactEmail: newOwner.newOwnerContactEmail || null,
        newOwnerInitialAdminEmail: newOwner.newOwnerInitialAdminEmail,
        reason: newOwner.reason || null,
      },
      t("platform.initiated")
    );
    if (ok) await load();
  }

  async function approveCurrent() {
    const password = requirePw();
    if (!password) return;
    const ok = await post({ action: "approve-current", password }, t("platform.currentApproved"));
    if (ok) await load();
  }

  async function issueCode() {
    const password = requirePw();
    if (!password) return;
    const data = await post({ action: "issue-code", password }, t("platform.codeIssued"));
    if (data && typeof data.approvalCode === "string") {
      setIssuedCode(data.approvalCode);
      await load();
    }
  }

  async function approveNew() {
    const password = requirePw();
    if (!password) return;
    if (!code.trim()) {
      toast({ title: t("platform.codeRequired"), variant: "destructive" });
      return;
    }
    const ok = await post({ action: "approve-new", password, approvalCode: code.trim() }, t("platform.newApproved"));
    if (ok) {
      setCode("");
      setIssuedCode(null);
      await load();
    }
  }

  async function execute() {
    const password = requirePw();
    if (!password) return;
    const data = await post({ action: "execute", password }, t("platform.executed"));
    if (data) {
      setExecuteResult({
        backupSha256: String(data.backupSha256 ?? ""),
        backupTableCount: Number(data.backupTableCount ?? 0),
        exportSha256: String(data.exportSha256 ?? ""),
        integrityCheckStatus: String(data.integrityCheckStatus ?? ""),
        revokedSuperAdminCount: Number(data.revokedSuperAdminCount ?? 0),
        sessionsInvalidatedUsers: Number(data.sessionsInvalidatedUsers ?? 0),
        newAdminEmail: String(data.newAdminEmail ?? ""),
        newAdminTempPassword: String(data.newAdminTempPassword ?? ""),
        suggestedAuthSecret: String(data.suggestedAuthSecret ?? ""),
      });
      await load();
    }
  }

  async function confirmRotation() {
    const password = requirePw();
    if (!password) return;
    const ok = await post({ action: "confirm-rotation", password }, t("platform.rotationConfirmed"));
    if (ok) await load();
  }

  async function cancel() {
    const password = requirePw();
    if (!password) return;
    const ok = await post({ action: "cancel", password, reason: cancelReason || undefined }, t("platform.cancelled"));
    if (ok) {
      setCancelReason("");
      setIssuedCode(null);
      await load();
    }
  }

  if (loading && !status) {
    return (
      <div className="flex items-center justify-center py-16">
        <LoaderCircle className="size-6 animate-spin text-muted-foreground" aria-hidden />
      </div>
    );
  }
  if (!status) return null;

  const active = status.activeTransfer;
  const state = active?.state ?? null;
  const rotationPending = !active && status.lastCompleted && !status.lastCompleted.secretsRotatedAt;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <PageHeader
        icon={<Landmark className="size-5" aria-hidden />}
        title={t("platform.title")}
        subtitle={t("platform.subtitle")}
        actions={
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCcw className="me-1.5 size-3.5" aria-hidden />
            {t("common.refresh")}
          </Button>
        }
      />

      {status.freeze && (
        <Alert>
          <Snowflake className="size-4" aria-hidden />
          <AlertTitle>{t("platform.freezeTitle")}</AlertTitle>
          <AlertDescription>{t("platform.freezeHint")}</AlertDescription>
        </Alert>
      )}

      {executeResult && (
        <Alert variant="destructive" className="border-2">
          <KeyRound className="size-4" aria-hidden />
          <AlertTitle>{t("platform.credentialsTitle")}</AlertTitle>
          <AlertDescription>
            <div className="space-y-2 pt-1">
              <p className="font-semibold">{t("platform.credentialsHint")}</p>
              <div className="space-y-1.5 font-mono text-xs">
                <div className="flex items-center gap-2">
                  <span className="w-40 shrink-0 font-sans font-medium">{t("platform.newAdminEmail")}:</span>
                  <span dir="ltr">{executeResult.newAdminEmail}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-40 shrink-0 font-sans font-medium">{t("platform.newAdminPassword")}:</span>
                  <code dir="ltr" className="rounded bg-muted px-1.5 py-0.5">{executeResult.newAdminTempPassword}</code>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t("common.copy")}
                    onClick={() => void navigator.clipboard?.writeText(executeResult.newAdminTempPassword)}
                  >
                    <Copy className="size-3" aria-hidden />
                  </Button>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-40 shrink-0 font-sans font-medium">{t("platform.suggestedSecret")}:</span>
                  <code dir="ltr" className="truncate rounded bg-muted px-1.5 py-0.5">{executeResult.suggestedAuthSecret}</code>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t("common.copy")}
                    onClick={() => void navigator.clipboard?.writeText(executeResult.suggestedAuthSecret)}
                  >
                    <Copy className="size-3" aria-hidden />
                  </Button>
                </div>
              </div>
              <p className="text-xs">{t("platform.applySecretHint")}</p>
              <p className="text-xs">
                {t("platform.backupHash")}: <code dir="ltr" className="text-[10px]">{executeResult.backupSha256.slice(0, 24)}…</code> ·{" "}
                {t("platform.exportHash")}: <code dir="ltr" className="text-[10px]">{executeResult.exportSha256.slice(0, 24)}…</code> ·{" "}
                {t("platform.integrity")}: {executeResult.integrityCheckStatus === "ok" ? t("common.ok") : t("common.failed")}
              </p>
              <p className="text-xs">
                {t("platform.revokedAdmins")}: {executeResult.revokedSuperAdminCount} ·{" "}
                {t("platform.invalidatedSessions")}: {executeResult.sessionsInvalidatedUsers}
              </p>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* ── هوية المالك (white-label) ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="size-4 text-primary" aria-hidden />
            {t("platform.identityTitle")}
          </CardTitle>
          <p className="text-xs text-muted-foreground">{t("platform.identityHint")}</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="po-legal">{t("platform.legalName")}</Label>
              <Input id="po-legal" value={identity.legalName} onChange={(e) => setIdentity((s) => ({ ...s, legalName: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="po-display">{t("platform.displayName")}</Label>
              <Input id="po-display" value={identity.displayName} onChange={(e) => setIdentity((s) => ({ ...s, displayName: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="po-email">{t("platform.contactEmail")}</Label>
              <Input id="po-email" dir="ltr" value={identity.contactEmail} onChange={(e) => setIdentity((s) => ({ ...s, contactEmail: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="po-phone">{t("platform.contactPhone")}</Label>
              <Input id="po-phone" dir="ltr" value={identity.contactPhone} onChange={(e) => setIdentity((s) => ({ ...s, contactPhone: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="po-website">{t("platform.websiteUrl")}</Label>
              <Input id="po-website" dir="ltr" value={identity.websiteUrl} onChange={(e) => setIdentity((s) => ({ ...s, websiteUrl: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="po-logo">{t("platform.logoUrl")}</Label>
              <Input id="po-logo" dir="ltr" value={identity.logoUrl} onChange={(e) => setIdentity((s) => ({ ...s, logoUrl: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="po-terms">{t("platform.termsUrl")}</Label>
              <Input id="po-terms" dir="ltr" value={identity.termsUrl} onChange={(e) => setIdentity((s) => ({ ...s, termsUrl: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="po-footer">{t("platform.footerText")}</Label>
              <Input id="po-footer" value={identity.footerText} onChange={(e) => setIdentity((s) => ({ ...s, footerText: e.target.value }))} />
              <p className="text-[11px] text-muted-foreground">{t("platform.footerTextHint")}</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="po-locale">{t("platform.defaultLocale")}</Label>
              <Select value={identity.defaultLocale} onValueChange={(v) => setIdentity((s) => ({ ...s, defaultLocale: v }))}>
                <SelectTrigger id="po-locale">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ar">العربية</SelectItem>
                  <SelectItem value="fr">Français</SelectItem>
                  <SelectItem value="en">English</SelectItem>
                  <SelectItem value="es">Español</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="po-currency">{t("platform.defaultCurrency")}</Label>
              <Input id="po-currency" dir="ltr" value={identity.defaultCurrency} onChange={(e) => setIdentity((s) => ({ ...s, defaultCurrency: e.target.value.toUpperCase() }))} />
            </div>
          </div>

          <div className="space-y-2 rounded-lg border p-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <FileCog className="size-4 text-muted-foreground" aria-hidden />
              {t("platform.modules")}
            </div>
            <p className="text-[11px] text-muted-foreground">{t("platform.modulesHint")}</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {MODULE_KEYS.map((k) => (
                <label key={k} className="flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs">
                  <input
                    type="checkbox"
                    checked={modules[k] !== false}
                    onChange={(e) => setModules((s) => ({ ...s, [k]: e.target.checked }))}
                    className="size-3.5 accent-primary"
                  />
                  {t(`platform.${k.replace(/\./g, "_")}`)}
                </label>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <div className="w-56 space-y-1.5">
              <Label htmlFor="po-pw">{t("platform.password")}</Label>
              <Input id="po-pw" type="password" dir="ltr" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" />
            </div>
            <Button onClick={() => void saveIdentity()} disabled={busy || status.freeze}>
              {busy && <LoaderCircle className="me-1.5 size-3.5 animate-spin" aria-hidden />}
              {t("platform.save")}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ── نقل الملكية ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Landmark className="size-4 text-primary" aria-hidden />
            {t("platform.transferTitle")}
          </CardTitle>
          <p className="text-xs text-muted-foreground">{t("platform.transferHint")}</p>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* الحالة الحالية */}
          {active ? (
            <div className="space-y-3 rounded-lg border p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={STATE_VARIANT[state ?? ""] as "secondary" | "default" | "outline" | "destructive" ?? "secondary"}>
                  {t(STATE_KEY[state ?? ""] ?? "platform.stateUnknown")}
                </Badge>
                <span className="text-sm font-medium">{active.newOwnerLegalName}</span>
                <span className="text-xs text-muted-foreground" dir="ltr">
                  {active.newOwnerInitialAdminEmail}
                </span>
              </div>
              {active.reason && <p className="text-xs text-muted-foreground">{active.reason}</p>}
              <p className="text-[11px] text-muted-foreground">
                {t("platform.initiatedAt")}: {formatDate(active.initiatedAt, locale)}
                {active.currentOwnerApprovedAt && <> · {t("platform.currentApprovedAt")}: {formatDate(active.currentOwnerApprovedAt, locale)}</>}
                {active.newOwnerApprovedAt && <> · {t("platform.newApprovedAt")}: {formatDate(active.newOwnerApprovedAt, locale)}</>}
              </p>

              {issuedCode && (
                <Alert>
                  <Eye className="size-4" aria-hidden />
                  <AlertTitle>{t("platform.codeIssuedTitle")}</AlertTitle>
                  <AlertDescription>
                    <div className="space-y-1">
                      <code dir="ltr" className="rounded bg-muted px-2 py-1 font-mono text-sm tracking-widest">{issuedCode}</code>
                      <p className="text-xs">{t("platform.issueCodeHint")}</p>
                    </div>
                  </AlertDescription>
                </Alert>
              )}

              {/* خطوات الحالة */}
              <div className="flex flex-wrap items-end gap-3">
                <div className="w-56 space-y-1.5">
                  <Label htmlFor="tr-pw">{t("platform.password")}</Label>
                  <Input id="tr-pw" type="password" dir="ltr" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" />
                </div>

                {state === "awaiting_current_owner" && (
                  <Button onClick={() => void approveCurrent()} disabled={busy}>
                    {busy && <LoaderCircle className="me-1.5 size-3.5 animate-spin" aria-hidden />}
                    {t("platform.approveCurrent")}
                  </Button>
                )}

                {state === "awaiting_new_owner" && (
                  <>
                    <Button variant="outline" onClick={() => void issueCode()} disabled={busy}>
                      {t("platform.issueCode")}
                    </Button>
                    <div className="w-44 space-y-1.5">
                      <Label htmlFor="tr-code">{t("platform.approvalCode")}</Label>
                      <Input id="tr-code" dir="ltr" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} className="font-mono tracking-widest" />
                    </div>
                    <Button onClick={() => void approveNew()} disabled={busy}>
                      {t("platform.approveNew")}
                    </Button>
                  </>
                )}

                {state === "approved" && (
                  <div className="space-y-2">
                    <Button variant="destructive" onClick={() => void execute()} disabled={busy}>
                      {busy && <LoaderCircle className="me-1.5 size-3.5 animate-spin" aria-hidden />}
                      {t("platform.execute")}
                    </Button>
                    <p className="text-[11px] text-muted-foreground">{t("platform.executeHint")}</p>
                  </div>
                )}

                <div className="ms-auto flex items-end gap-2">
                  <div className="w-48 space-y-1.5">
                    <Label htmlFor="tr-cancel">{t("platform.cancelReason")}</Label>
                    <Input id="tr-cancel" value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} />
                  </div>
                  <Button variant="outline" onClick={() => void cancel()} disabled={busy}>
                    {t("platform.cancel")}
                  </Button>
                </div>
              </div>
            </div>
          ) : rotationPending ? (
            <div className="space-y-3 rounded-lg border border-amber-300 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950">
              <p className="text-sm font-medium">{t("platform.secretRotationPending")}</p>
              <p className="text-xs text-muted-foreground">{t("platform.confirmRotationHint")}</p>
              <div className="flex flex-wrap items-end gap-3">
                <div className="w-56 space-y-1.5">
                  <Label htmlFor="rot-pw">{t("platform.password")}</Label>
                  <Input id="rot-pw" type="password" dir="ltr" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" />
                </div>
                <Button onClick={() => void confirmRotation()} disabled={busy}>
                  {busy && <LoaderCircle className="me-1.5 size-3.5 animate-spin" aria-hidden />}
                  {t("platform.confirmRotation")}
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3 rounded-lg border p-4">
              <p className="text-sm text-muted-foreground">
                {status.lastCompleted
                  ? t("platform.lastCompleted", { name: status.lastCompleted.newOwnerLegalName })
                  : t("platform.noTransfer")}
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="no-legal">{t("platform.newOwnerLegalName")}</Label>
                  <Input id="no-legal" value={newOwner.newOwnerLegalName} onChange={(e) => setNewOwner((s) => ({ ...s, newOwnerLegalName: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="no-display">{t("platform.newOwnerDisplayName")}</Label>
                  <Input id="no-display" value={newOwner.newOwnerDisplayName} onChange={(e) => setNewOwner((s) => ({ ...s, newOwnerDisplayName: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="no-email">{t("platform.newOwnerEmail")}</Label>
                  <Input id="no-email" dir="ltr" value={newOwner.newOwnerContactEmail} onChange={(e) => setNewOwner((s) => ({ ...s, newOwnerContactEmail: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="no-admin">{t("platform.newOwnerAdminEmail")}</Label>
                  <Input id="no-admin" dir="ltr" value={newOwner.newOwnerInitialAdminEmail} onChange={(e) => setNewOwner((s) => ({ ...s, newOwnerInitialAdminEmail: e.target.value }))} />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="no-reason">{t("platform.reason")}</Label>
                  <Input id="no-reason" value={newOwner.reason} onChange={(e) => setNewOwner((s) => ({ ...s, reason: e.target.value }))} />
                </div>
              </div>
              <div className="flex flex-wrap items-end gap-3">
                <div className="w-56 space-y-1.5">
                  <Label htmlFor="no-pw">{t("platform.password")}</Label>
                  <Input id="no-pw" type="password" dir="ltr" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" />
                </div>
                <Button onClick={() => void initiate()} disabled={busy}>
                  {busy && <LoaderCircle className="me-1.5 size-3.5 animate-spin" aria-hidden />}
                  {t("platform.initiate")}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── سجل النقلات ── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("platform.history")}</CardTitle>
        </CardHeader>
        <CardContent>
          {status.history.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">{t("platform.noHistory")}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("platform.newOwner")}</TableHead>
                  <TableHead>{t("platform.stateLabel")}</TableHead>
                  <TableHead>{t("platform.initiatedAt")}</TableHead>
                  <TableHead>{t("platform.executedAt")}</TableHead>
                  <TableHead className="text-end">{t("platform.integrity")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {status.history.map((h) => (
                  <TableRow key={h.id}>
                    <TableCell className="font-medium">{h.newOwnerLegalName}</TableCell>
                    <TableCell>
                      <Badge variant={STATE_VARIANT[h.state] as "secondary" | "default" | "outline" | "destructive" ?? "secondary"}>
                        {t(STATE_KEY[h.state] ?? "platform.stateUnknown")}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{formatDate(h.initiatedAt, locale)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{h.executedAt ? formatDate(h.executedAt, locale) : "—"}</TableCell>
                    <TableCell className="text-end text-xs">
                      {h.integrityCheckStatus === "ok" ? t("common.ok") : h.integrityCheckStatus ? t("common.failed") : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
