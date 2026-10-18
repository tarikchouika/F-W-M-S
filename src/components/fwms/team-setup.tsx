"use client";

// FWMS — إعداد الفريق (المرحلة 9): القائد + النوع (عادي/احتياطي) + المنطقة الجغرافية
// (صريحة أو من موقع مرجعي) + الأعضاء بمسماهم الوظيفي من الكتالوج.
// كل تغيير يمر عبر PATCH /api/worker-groups/[id] و members — الخادم هو الحكم.
import { useCallback, useEffect, useMemo, useState } from "react";
import { LoaderCircle, MapPin, UsersRound, UserCog, Trash2, UserPlus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { useI18n } from "@/i18n/provider";
import { apiRequest, apiErrorMessage } from "@/components/fwms/org-bits";
import { JOB_TITLE_CATEGORIES, jobTitleLabel } from "@/lib/job-titles";

const NONE = "none"; // قيمة حارسة (درس Radix Select)

type TeamInfo = {
  group: {
    id: string;
    name: string;
    kind: string;
    leaderUserId: string | null;
    leaderName: string | null;
    siteId: string | null;
    zone: { lat: number; lng: number; radiusM: number } | null;
  };
  members: { userId: string; fullName: string; email: string; jobTitleKey: string | null; addedAt: string }[];
};

type MemberOption = { userId: string; fullName: string; email: string; role: string };

export function TeamSetup({
  groupId,
  onSaved,
}: {
  groupId: string;
  onSaved?: () => void;
}) {
  const { t, locale } = useI18n();
  const { toast } = useToast();

  const [info, setInfo] = useState<TeamInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [membersOptions, setMembersOptions] = useState<MemberOption[]>([]);
  const [sites, setSites] = useState<{ id: string; name: string }[]>([]);

  // نموذج الإعدادات
  const [kind, setKind] = useState("regular");
  const [leader, setLeader] = useState(NONE);
  const [site, setSite] = useState(NONE);
  const [zoneMode, setZoneMode] = useState<"site" | "explicit">("site");
  const [zoneLat, setZoneLat] = useState("");
  const [zoneLng, setZoneLng] = useState("");
  const [zoneRadius, setZoneRadius] = useState("150");

  // إضافة عضو
  const [newMember, setNewMember] = useState(NONE);
  const [newMemberTitle, setNewMemberTitle] = useState(NONE);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiRequest<TeamInfo>(`/api/worker-groups/${groupId}/members`);
      setInfo(data);
      setKind(data.group.kind === "reserve" ? "reserve" : "regular");
      setLeader(data.group.leaderUserId ?? NONE);
      setSite(data.group.siteId ?? NONE);
      if (data.group.zone) {
        setZoneMode("explicit");
        setZoneLat(String(data.group.zone.lat));
        setZoneLng(String(data.group.zone.lng));
        setZoneRadius(String(data.group.zone.radiusM));
      } else {
        setZoneMode("site");
        setZoneRadius("150");
      }
      setError(null);
    } catch (err) {
      setError(apiErrorMessage(t, err));
    } finally {
      setLoading(false);
    }
  }, [groupId, t]);

  const loadOptions = useCallback(async () => {
    try {
      const [m, s] = await Promise.all([
        apiRequest<{ members: MemberOption[] }>("/api/members"),
        apiRequest<{ sites: { id: string; name: string }[] }>("/api/sites-options"),
      ]);
      setMembersOptions(m.members);
      setSites(s.sites);
    } catch {
      /* القوائم التحسينية */
    }
  }, []);

  useEffect(() => {
    void load();
    void loadOptions();
  }, [load, loadOptions]);

  const memberMap = useMemo(() => new Map(membersOptions.map((m) => [m.userId, m])), [membersOptions]);

  async function saveSettings() {
    if (saving) return;
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        kind,
        leaderUserId: leader === NONE ? "" : leader,
        siteId: site === NONE ? "" : site,
      };
      if (zoneMode === "explicit") {
        const lat = Number(zoneLat);
        const lng = Number(zoneLng);
        const radius = Number(zoneRadius);
        if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180 || !Number.isFinite(radius) || radius < 20 || radius > 5000) {
          toast({ variant: "destructive", description: t("common.invalidInput") });
          setSaving(false);
          return;
        }
        body.zoneLat = lat;
        body.zoneLng = lng;
        body.zoneRadiusM = Math.round(radius);
      } else if (info?.group.zone) {
        // العودة إلى اشتقاق الموقع المرجعي: أفرغ المنطقة الصريحة
        body.zoneLat = null;
        body.zoneLng = null;
        body.zoneRadiusM = Number(zoneRadius) >= 20 ? Math.round(Number(zoneRadius)) : undefined;
      } else {
        body.zoneRadiusM = Number.isFinite(Number(zoneRadius)) && Number(zoneRadius) >= 20 ? Math.round(Number(zoneRadius)) : undefined;
      }
      await apiRequest(`/api/worker-groups/${groupId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      toast({ description: t("groups.teamSaved") });
      await load();
      onSaved?.();
    } catch (err) {
      toast({ variant: "destructive", description: apiErrorMessage(t, err) });
    } finally {
      setSaving(false);
    }
  }

  async function addMember() {
    if (newMember === NONE) return;
    try {
      await apiRequest(`/api/worker-groups/${groupId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: newMember, jobTitleKey: newMemberTitle === NONE ? null : newMemberTitle }),
      });
      setNewMember(NONE);
      setNewMemberTitle(NONE);
      await load();
      onSaved?.();
    } catch (err) {
      toast({ variant: "destructive", description: apiErrorMessage(t, err) });
    }
  }

  async function removeMember(userId: string) {
    try {
      await apiRequest(`/api/worker-groups/${groupId}/members?userId=${encodeURIComponent(userId)}`, {
        method: "DELETE",
      });
      await load();
      onSaved?.();
    } catch (err) {
      toast({ variant: "destructive", description: apiErrorMessage(t, err) });
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-10">
        <LoaderCircle className="size-6 animate-spin text-muted-foreground" aria-hidden />
      </div>
    );
  }
  if (error) {
    return <p className="py-8 text-center text-sm text-red-600 dark:text-red-400">{error}</p>;
  }
  if (!info) return null;

  return (
    <div className="flex flex-col gap-5">
      {/* إعدادات الفريق */}
      <Card className="border-border/70">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-bold">
            <UserCog className="size-4 text-primary" aria-hidden />
            {t("groups.teamSettings")} — {info.group.name}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label>{t("groups.teamKind")}</Label>
              <Select value={kind} onValueChange={setKind}>
                <SelectTrigger aria-label={t("groups.teamKind")}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="regular">{t("groups.kindRegular")}</SelectItem>
                  <SelectItem value="reserve">{t("groups.kindReserve")}</SelectItem>
                </SelectContent>
              </Select>
              <span className="text-[11px] text-muted-foreground">{t("groups.teamKindHint")}</span>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>{t("groups.teamLeader")}</Label>
              <Select value={leader} onValueChange={setLeader}>
                <SelectTrigger aria-label={t("groups.teamLeader")}><SelectValue /></SelectTrigger>
                <SelectContent className="max-h-64">
                  <SelectItem value={NONE}>{t("groups.noLeader")}</SelectItem>
                  {membersOptions.map((m) => (
                    <SelectItem key={m.userId} value={m.userId} className="text-xs">
                      {m.fullName} — {m.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="text-[11px] text-muted-foreground">{t("groups.teamLeaderHint")}</span>
            </div>
          </div>

          <Separator />

          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2 text-sm font-bold">
              <MapPin className="size-4 text-primary" aria-hidden />
              {t("groups.zoneTitle")}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label>{t("groups.workSite")}</Label>
                <Select value={site} onValueChange={setSite}>
                  <SelectTrigger aria-label={t("groups.workSite")}><SelectValue /></SelectTrigger>
                  <SelectContent className="max-h-64">
                    <SelectItem value={NONE}>{t("groups.noSite")}</SelectItem>
                    {sites.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span className="text-[11px] text-muted-foreground">{t("groups.workSiteHint")}</span>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>{t("groups.zoneMode")}</Label>
                <Select value={zoneMode} onValueChange={(v) => setZoneMode(v as "site" | "explicit")}>
                  <SelectTrigger aria-label={t("groups.zoneMode")}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="site">{t("groups.zoneFromSite")}</SelectItem>
                    <SelectItem value="explicit">{t("groups.zoneExplicit")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {zoneMode === "explicit" && (
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="flex flex-col gap-1.5">
                  <Label>{t("groups.zoneLat")}</Label>
                  <Input dir="ltr" inputMode="decimal" value={zoneLat} onChange={(e) => setZoneLat(e.target.value)} placeholder="33.5731" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>{t("groups.zoneLng")}</Label>
                  <Input dir="ltr" inputMode="decimal" value={zoneLng} onChange={(e) => setZoneLng(e.target.value)} placeholder="-7.5898" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>{t("groups.zoneRadius")}</Label>
                  <Input dir="ltr" inputMode="numeric" value={zoneRadius} onChange={(e) => setZoneRadius(e.target.value)} placeholder="150" />
                </div>
              </div>
            )}
            {zoneMode === "site" && (
              <div className="flex max-w-40 flex-col gap-1.5">
                <Label>{t("groups.zoneRadius")}</Label>
                <Input dir="ltr" inputMode="numeric" value={zoneRadius} onChange={(e) => setZoneRadius(e.target.value)} placeholder="150" />
              </div>
            )}
            <span className="text-[11px] text-muted-foreground">{t("groups.zoneHint")}</span>
          </div>

          <Button onClick={() => void saveSettings()} disabled={saving} className="gap-2 self-start">
            {saving && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
            {t("groups.saveTeam")}
          </Button>
        </CardContent>
      </Card>

      {/* الأعضاء */}
      <Card className="border-border/70">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-bold">
            <UsersRound className="size-4 text-primary" aria-hidden />
            {t("groups.membersTitle")} ({info.members.length})
            {info.group.leaderName && (
              <Badge variant="outline" className="ms-1 font-normal">
                {t("presence.leader")}: {info.group.leaderName}
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {/* إضافة عضو */}
          <div className="grid gap-3 rounded-xl border border-border/60 bg-muted/40 p-3 sm:grid-cols-[1fr,1fr,auto]">
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">{t("groups.addMember")}</Label>
              <Select value={newMember} onValueChange={setNewMember}>
                <SelectTrigger className="h-9" aria-label={t("groups.addMember")}><SelectValue placeholder={t("groups.pickMember")} /></SelectTrigger>
                <SelectContent className="max-h-64">
                  <SelectItem value={NONE}>{t("groups.pickMember")}</SelectItem>
                  {membersOptions
                    .filter((m) => !info.members.some((x) => x.userId === m.userId))
                    .map((m) => (
                      <SelectItem key={m.userId} value={m.userId} className="text-xs">
                        {m.fullName} — {m.email}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">{t("groups.memberJobTitle")}</Label>
              <Select value={newMemberTitle} onValueChange={setNewMemberTitle}>
                <SelectTrigger className="h-9" aria-label={t("groups.memberJobTitle")}><SelectValue placeholder={t("presence.noJobTitle")} /></SelectTrigger>
                <SelectContent className="max-h-64">
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
            <div className="flex items-end">
              <Button onClick={() => void addMember()} disabled={newMember === NONE} className="gap-2">
                <UserPlus className="size-4" aria-hidden />
                {t("groups.addMember")}
              </Button>
            </div>
          </div>

          {/* قائمة الأعضاء */}
          <div className="max-h-72 overflow-y-auto rounded-lg border border-border/60">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted/95 backdrop-blur">
                <tr className="text-start">
                  <th className="px-3 py-2 text-start text-xs font-semibold">{t("groups.member")}</th>
                  <th className="px-3 py-2 text-start text-xs font-semibold">{t("groups.memberJobTitle")}</th>
                  <th className="px-3 py-2 text-start text-xs font-semibold">{t("common.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {info.members.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-3 py-8 text-center text-muted-foreground">
                      {t("presence.noMembers")}
                    </td>
                  </tr>
                ) : (
                  info.members.map((m) => {
                    const isLeader = info.group.leaderUserId === m.userId;
                    return (
                      <tr key={m.userId} className="border-t border-border/60">
                        <td className="px-3 py-2">
                          <div className="flex flex-col leading-tight">
                            <span className="font-medium">
                              {m.fullName}
                              {isLeader && <Badge variant="outline" className="ms-1.5 h-4 px-1 text-[10px]">{t("presence.leader")}</Badge>}
                            </span>
                            <span className="text-[11px] text-muted-foreground" dir="ltr">{m.email}</span>
                        </div>
                      </td>
                        <td className="px-3 py-2 text-sm text-muted-foreground">
                          {jobTitleLabel(m.jobTitleKey, locale) ?? t("presence.noJobTitle")}
                        </td>
                        <td className="px-3 py-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-7 text-red-600"
                            onClick={() => void removeMember(m.userId)}
                            aria-label={t("groups.removeMember")}
                          >
                            <Trash2 className="size-3.5" aria-hidden />
                          </Button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          <span className="text-[11px] text-muted-foreground">{t("groups.membersHint")}</span>
        </CardContent>
      </Card>
    </div>
  );
}
