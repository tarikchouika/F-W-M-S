"use client";

// HRMP — واجهة الحضور الحي (المرحلة 9): لقطة آنية لفرق المتصل — خريطة + قوائم الأعضاء
// بحالاتهم (داخل/خارج/منقطع/بلا نبضة). التحديث استطلاعي كل 30ث + زر تحديث يدوي.
// «أني» = نبضة أحدث من 10 دقائق؛ الاستطلاع خفيف (فهرس companyId,reportedAt).
import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { Footprints, LoaderCircle, MapPin, RefreshCw, ShieldAlert, UsersRound, WifiOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useI18n } from "@/i18n/provider";
import { ListState, apiRequest } from "@/components/hrmp/org-bits";
import { jobTitleLabel } from "@/lib/job-titles";
import type { GroupPresence } from "@/lib/team-presence";

// Leaflet يحتاج window — استيراد ديناميكي إلزامي (درس المرحلة 2)
const PresenceMap = dynamic(() => import("@/components/hrmp/presence-map").then((m) => m.PresenceMap), {
  ssr: false,
  loading: () => <div className="h-[320px] w-full animate-pulse rounded-xl bg-muted/60 sm:h-[420px]" />,
});

const POLL_MS = 30_000;

type Snapshot = { scope: string; serverTime: string; groups: GroupPresence[] };

export function TeamPresenceView() {
  const { t, locale } = useI18n();
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await apiRequest<Snapshot>("/api/team-presence");
      setSnap(data);
      setError(null);
    } catch (err) {
      setError((err as { code?: string })?.code === "forbidden" ? "forbidden" : "failed");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(id);
  }, [load]);

  if (loading) {
    return <ListState loading error={false} empty={false} />;
  }

  if (error === "forbidden") {
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-col items-center gap-3 py-16 text-center">
        <ShieldAlert className="size-10 text-muted-foreground" aria-hidden />
        <p className="max-w-md text-sm font-medium text-muted-foreground">{t("presence.notLeaderHint")}</p>
      </div>
    );
  }
  if (error) {
    return <ListState loading={false} error empty={false} onRetry={() => void load()} />;
  }

  const groups = snap?.groups ?? [];
  const totals = groups.reduce(
    (acc, g) => ({
      inside: acc.inside + g.counts.inside,
      outside: acc.outside + g.counts.outside,
      stale: acc.stale + g.counts.stale,
      no_ping: acc.no_ping + g.counts.no_ping,
    }),
    { inside: 0, outside: 0, stale: 0, no_ping: 0 },
  );

  const stateBadge = (state: string) => {
    if (state === "inside") return <Badge className="bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300">{t("presence.stateInside")}</Badge>;
    if (state === "outside") return <Badge className="bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300">{t("presence.stateOutside")}</Badge>;
    if (state === "stale") return <Badge variant="secondary">{t("presence.stateStale")}</Badge>;
    return <Badge variant="outline">{t("presence.stateNoPing")}</Badge>;
  };

  return (
    <div className="flex flex-col gap-6">
      {/* ملخص الحالات */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: t("presence.stateInside"), value: totals.inside, icon: MapPin, cls: "text-green-600 dark:text-green-400" },
          { label: t("presence.stateOutside"), value: totals.outside, icon: MapPin, cls: "text-red-600 dark:text-red-400" },
          { label: t("presence.stateStale"), value: totals.stale, icon: WifiOff, cls: "text-amber-600 dark:text-amber-400" },
          { label: t("presence.stateNoPing"), value: totals.no_ping, icon: UsersRound, cls: "text-muted-foreground" },
        ].map((s) => (
          <Card key={s.label} className="border-border/70">
            <CardContent className="flex items-center justify-between gap-2 p-4">
              <div className="flex flex-col">
                <span className="text-2xl font-extrabold tabular-nums" dir="ltr">{s.value}</span>
                <span className="text-[11px] font-medium text-muted-foreground">{s.label}</span>
              </div>
              <s.icon className={`size-6 ${s.cls}`} aria-hidden />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* الخريطة */}
      <Card className="border-border/70">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="flex items-center gap-2 text-base font-bold">
            <Footprints className="size-4 text-primary" aria-hidden />
            {t("presence.mapTitle")}
          </CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setRefreshing(true);
              void load();
            }}
            disabled={refreshing}
            className="gap-2"
          >
            {refreshing ? <LoaderCircle className="size-3.5 animate-spin" aria-hidden /> : <RefreshCw className="size-3.5" aria-hidden />}
            {t("presence.refresh")}
          </Button>
        </CardHeader>
        <CardContent>
          {groups.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">{t("presence.noGroups")}</p>
          ) : (
            <PresenceMap groups={groups} />
          )}
        </CardContent>
      </Card>

      {/* فرق وعضويات */}
      {groups.map((g) => (
        <Card key={g.id} className="border-border/70">
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 pb-2">
            <CardTitle className="flex flex-wrap items-center gap-2 text-base font-bold">
              <UsersRound className="size-4 text-primary" aria-hidden />
              {g.name}
              {g.kind === "reserve" && <Badge variant="outline">{t("presence.reserveTeam")}</Badge>}
              <span className="text-xs font-normal text-muted-foreground">
                {g.leaderName ? `${t("presence.leader")}: ${g.leaderName}` : t("presence.noLeader")}
              </span>
            </CardTitle>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="font-semibold text-green-700 dark:text-green-400">{g.counts.inside}</span>/
              <span className="font-semibold">{g.counts.total}</span>
              {g.siteName ? ` · ${t("presence.workSite")}: ${g.siteName}` : ""}
            </div>
          </CardHeader>
          <CardContent>
            {g.members.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">{t("presence.noMembers")}</p>
            ) : (
              <div className="max-h-80 overflow-y-auto rounded-lg border border-border/60">
                <Table>
                  <TableHeader className="sticky top-0 bg-muted/95 backdrop-blur">
                    <TableRow>
                      <TableHead className="text-xs">{t("presence.member")}</TableHead>
                      <TableHead className="text-xs">{t("presence.jobTitle")}</TableHead>
                      <TableHead className="text-xs">{t("presence.state")}</TableHead>
                      <TableHead className="text-xs">{t("presence.lastPing")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {g.members.map((m) => (
                      <TableRow key={m.userId}>
                        <TableCell className="font-medium">{m.fullName}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {jobTitleLabel(m.jobTitleKey, locale) ?? t("presence.noJobTitle")}
                        </TableCell>
                        <TableCell>
                          {stateBadge(m.state)}
                          {m.distanceM != null && (
                            <span className="ms-1.5 text-[11px] text-muted-foreground" dir="ltr">
                              ~{m.distanceM} {t("notifications.presenceMeters")}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-xs text-muted-foreground tabular-nums">
                          {m.lastPingAt
                            ? new Date(m.lastPingAt).toLocaleString(locale, {
                                dateStyle: "short",
                                timeStyle: "short",
                                timeZone: "Africa/Casablanca",
                              })
                            : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
