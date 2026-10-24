// HRMP — عرض الإعدادات (جولة 2026-10-19): الملف الشخصي + إعدادات الشركة
"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/i18n/provider";
import { useToast } from "@/hooks/use-toast";
import { PageHeader, apiRequest, apiErrorMessage } from "@/components/hrmp/org-bits";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { KeyRound, Save, ShieldAlert } from "lucide-react";

type CompanySettings = {
  workWeekHours: number;
  restDay: number;
  monthlyHoursDivisor: number;
  overtimeCapAnnual: number | null;
  showWagesToSupervisor: boolean;
  dualApprovalEnabled: boolean;
  showEmployerShareToEmployee: boolean;
};

export function SettingsView({
  initialName,
  email,
  canManageCompany,
}: {
  initialName: string;
  email: string;
  canManageCompany: boolean;
}) {
  const { t } = useI18n();
  const { toast } = useToast();

  // ── الملف الشخصي ──
  const [fullName, setFullName] = useState(initialName);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);

  // ── إعدادات الشركة ──
  const [settings, setSettings] = useState<CompanySettings | null>(null);
  const [settingsError, setSettingsError] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [capInput, setCapInput] = useState("");

  useEffect(() => {
    if (!canManageCompany) return;
    apiRequest<{ settings: CompanySettings }>("/api/company-settings")
      .then((d) => {
        setSettings(d.settings);
        setCapInput(d.settings.overtimeCapAnnual === null ? "" : String(d.settings.overtimeCapAnnual));
      })
      .catch(() => setSettingsError(true));
  }, [canManageCompany]);

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    if (savingProfile) return;
    setSavingProfile(true);
    try {
      const body: Record<string, string> = {};
      if (fullName.trim() !== initialName) body.fullName = fullName.trim();
      if (newPassword) {
        body.currentPassword = currentPassword;
        body.newPassword = newPassword;
      }
      if (Object.keys(body).length === 0) return;
      const res = await apiRequest<{ passwordChanged: boolean }>("/api/auth/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      toast({
        description: res.passwordChanged
          ? t("settingsPage.passwordChanged")
          : t("settingsPage.profileSaved"),
      });
      if (res.passwordChanged) {
        setCurrentPassword("");
        setNewPassword("");
      }
    } catch (err) {
      toast({ variant: "destructive", description: apiErrorMessage(t, err) });
    } finally {
      setSavingProfile(false);
    }
  }

  async function saveSettings(e: React.FormEvent) {
    e.preventDefault();
    if (!settings || savingSettings) return;
    setSavingSettings(true);
    try {
      const cap = capInput.trim() === "" ? 0 : Number(capInput);
      const res = await apiRequest<{ settings: CompanySettings }>("/api/company-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workWeekHours: settings.workWeekHours,
          restDay: settings.restDay,
          monthlyHoursDivisor: settings.monthlyHoursDivisor,
          overtimeCapAnnual: cap, // 0 = بلا سقف
          showWagesToSupervisor: settings.showWagesToSupervisor,
          dualApprovalEnabled: settings.dualApprovalEnabled,
          showEmployerShareToEmployee: settings.showEmployerShareToEmployee,
        }),
      });
      setSettings(res.settings);
      setCapInput(res.settings.overtimeCapAnnual === null ? "" : String(res.settings.overtimeCapAnnual));
      toast({ description: t("settingsPage.companySettingsSaved") });
    } catch (err) {
      toast({ variant: "destructive", description: apiErrorMessage(t, err) });
    } finally {
      setSavingSettings(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t("settingsPage.title")} subtitle={t("settingsPage.subtitle")} />

      <Tabs defaultValue="profile">
        <TabsList>
          <TabsTrigger value="profile">{t("settingsPage.tabProfile")}</TabsTrigger>
          {canManageCompany ? (
            <TabsTrigger value="company">{t("settingsPage.tabCompany")}</TabsTrigger>
          ) : null}
        </TabsList>

        <TabsContent value="profile">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("settingsPage.tabProfile")}</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={saveProfile} className="max-w-xl space-y-5">
                <div className="space-y-1.5">
                  <Label htmlFor="settings-name">{t("settingsPage.profileName")}</Label>
                  <Input id="settings-name" value={fullName} onChange={(e) => setFullName(e.target.value)} minLength={2} maxLength={120} required />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="settings-email">{t("settingsPage.profileEmail")}</Label>
                  <Input id="settings-email" value={email} disabled dir="ltr" />
                </div>

                <div className="rounded-lg border border-border/70 bg-muted/30 p-3">
                  <p className="mb-3 flex items-center gap-2 text-sm font-semibold">
                    <KeyRound className="size-4" aria-hidden />
                    {t("settingsPage.changePassword")}
                  </p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="settings-current">{t("settingsPage.currentPassword")}</Label>
                      <Input id="settings-current" type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} disabled={!newPassword} autoComplete="current-password" />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="settings-new">{t("settingsPage.newPassword")}</Label>
                      <Input id="settings-new" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} minLength={8} maxLength={72} autoComplete="new-password" />
                    </div>
                  </div>
                </div>

                <Button type="submit" disabled={savingProfile || (fullName.trim() === initialName && !newPassword)}>
                  <Save className="me-1 size-4" aria-hidden />
                  {t("common.save")}
                </Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        {canManageCompany ? (
          <TabsContent value="company">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t("settingsPage.tabCompany")}</CardTitle>
                <CardDescription>{t("settingsPage.companySettingsHint")}</CardDescription>
              </CardHeader>
              <CardContent>
                {settingsError || !settings ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <ShieldAlert className="size-4" aria-hidden />
                    {t("settingsPage.needCompanyManage")}
                  </div>
                ) : (
                  <form onSubmit={saveSettings} className="max-w-2xl space-y-5">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label htmlFor="s-week">{t("settingsPage.workWeekHours")}</Label>
                        <Input
                          id="s-week" type="number" min={20} max={60} dir="ltr"
                          value={settings.workWeekHours}
                          onChange={(e) => setSettings((s) => s && { ...s, workWeekHours: Number(e.target.value) })}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="s-rest">{t("settingsPage.restDay")}</Label>
                        <Select value={String(settings.restDay)} onValueChange={(v) => setSettings((s) => s && { ...s, restDay: Number(v) })}>
                          <SelectTrigger id="s-rest"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {["0", "1", "2", "3", "4", "5", "6"].map((d) => (
                              <SelectItem key={d} value={d}>{t(`settingsPage.restDayOptions.${d}`)}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="s-divisor">{t("settingsPage.monthlyHoursDivisor")}</Label>
                        <Input
                          id="s-divisor" type="number" min={150} max={240} dir="ltr"
                          value={settings.monthlyHoursDivisor}
                          onChange={(e) => setSettings((s) => s && { ...s, monthlyHoursDivisor: Number(e.target.value) })}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="s-cap">{t("settingsPage.overtimeCapAnnual")}</Label>
                        <Input
                          id="s-cap" type="number" min={0} max={2000} dir="ltr" placeholder="—"
                          value={capInput}
                          onChange={(e) => setCapInput(e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="space-y-3 rounded-lg border border-border/70 bg-muted/30 p-3">
                      {([
                        ["showWagesToSupervisor", "showWagesToSupervisor"],
                        ["dualApprovalEnabled", "dualApprovalEnabled"],
                        ["showEmployerShareToEmployee", "showEmployerShareToEmployee"],
                      ] as const).map(([key, labelKey]) => (
                        <div key={key} className="flex items-center justify-between gap-3">
                          <Label htmlFor={`s-${key}`} className="text-sm font-normal">{t(`settingsPage.${labelKey}`)}</Label>
                          <Switch
                            id={`s-${key}`}
                            checked={settings[key]}
                            onCheckedChange={(v) => setSettings((s) => s && { ...s, [key]: v })}
                          />
                        </div>
                      ))}
                    </div>

                    <Button type="submit" disabled={savingSettings}>
                      <Save className="me-1 size-4" aria-hidden />
                      {t("common.save")}
                    </Button>
                  </form>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        ) : null}
      </Tabs>
    </div>
  );
}
