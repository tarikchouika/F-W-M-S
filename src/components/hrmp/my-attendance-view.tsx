"use client";

// HRMP — «حضوري» (المرحلة 4 — SPEC §4.2 و§4.5): تسجيل العامل دخوله/انصرافه بنفسه
// الإحداثيات من GPS المتصفح (لاحقاً تطبيق الهاتف) — القرار في الخادم حصراً
// سياسة الموقع تحدد ظهور حقل QR؛ الفشل لا يقفل بل «تسجيل بمراجعة» (SPEC §4.2)
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarCheck,
  Clock,
  LogIn,
  LogOut,
  LoaderCircle,
  MapPin,
  QrCode,
  RefreshCcw,
  ScanFace,
  ShieldCheck,
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useI18n } from "@/i18n/provider";
import { ListState, PageHeader, apiRequest, formatDate } from "@/components/hrmp/org-bits";

type EventRow = {
  id: string;
  type: string;
  occurredAt: string;
  site: { id: string; name: string } | null;
  distanceM: number | null;
  accuracyM: number | null;
  insideFence: boolean;
  status: string;
  reason: string | null;
  policy: string;
  verification: string;
  networkMode: string;
};

type SiteRow = {
  id: string;
  name: string;
  address: string | null;
  latitude: number;
  longitude: number;
  radiusM: number;
  policy: string;
  policyLevel: string;
};

type MyAttendanceData = {
  today: string;
  events: EventRow[];
  openPair: { checkInId: string; occurredAt: string; site: { id: string; name: string; address: string | null } | null } | null;
  currentShift: { id: string; startsAt: string; endsAt: string; site: { id: string; name: string } | null } | null;
  nextShift: { id: string; startsAt: string; endsAt: string; site: { id: string; name: string } | null } | null;
  sites: SiteRow[];
};

const POLICY_KEYS: Record<string, string> = {
  none: "myAttendance.policyNone",
  qr: "myAttendance.policyQr",
  face: "myAttendance.policyFace",
  qr_and_face: "myAttendance.policyQrAndFace",
  qr_or_face: "myAttendance.policyQrOrFace",
};

const REASON_KEYS: Record<string, string> = {
  outside_fence: "myAttendance.reasonOutsideFence",
  poor_accuracy: "myAttendance.reasonPoorAccuracy",
  mock_location: "myAttendance.reasonMockLocation",
  impossible_jump: "myAttendance.reasonImpossibleJump",
  qr_missing: "myAttendance.reasonQrMissing",
  qr_invalid: "myAttendance.reasonQrInvalid",
  qr_expired: "myAttendance.reasonQrExpired",
  face_missing: "myAttendance.reasonFaceMissing",
  face_failed: "myAttendance.reasonFaceFailed",
  review_rejected: "myAttendance.reasonReviewRejected",
};

function policyNeedsQr(policy: string): boolean {
  return policy === "qr" || policy === "qr_and_face" || policy === "qr_or_face";
}
function policyNeedsFace(policy: string): boolean {
  return policy === "face" || policy === "qr_and_face" || policy === "qr_or_face";
}

function formatTime(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Africa/Casablanca", // توقيت الشركة الافتراضي (كما في org-bits)
  }).format(new Date(iso));
}

function statusBadge(t: (key: string) => string, status: string) {
  if (status === "verified")
    return <Badge className="font-semibold">{t("myAttendance.statusVerified")}</Badge>;
  if (status === "pending_review")
    return <Badge variant="outline" className="border-amber-500/60 font-semibold text-amber-600 dark:text-amber-400">{t("myAttendance.statusPending")}</Badge>;
  return <Badge variant="destructive" className="font-semibold">{t("myAttendance.statusRejected")}</Badge>;
}

export function MyAttendanceView({ today }: { today: string }) {
  const { t, locale } = useI18n();
  const { toast } = useToast();

  const [data, setData] = useState<MyAttendanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [selectedSiteId, setSelectedSiteId] = useState<string>("");
  const [qrToken, setQrToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [lastResult, setLastResult] = useState<{ ok: boolean; title: string; detail?: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await apiRequest<MyAttendanceData>("/api/my-attendance");
      setData(res);
      setSelectedSiteId((prev) => {
        if (prev && res.sites.some((s) => s.id === prev)) return prev;
        const target = res.currentShift?.site?.id ?? res.nextShift?.site?.id ?? res.sites[0]?.id ?? "";
        return target;
      });
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const selectedSite = useMemo(
    () => data?.sites.find((s) => s.id === selectedSiteId) ?? null,
    [data, selectedSiteId]
  );
  const openPair = data?.openPair ?? null;

  function getPosition(): Promise<GeolocationCoordinates> {
    return new Promise((resolve, reject) => {
      if (typeof navigator === "undefined" || !navigator.geolocation) {
        reject(new Error("geolocation_unsupported"));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve(pos.coords),
        (err) => reject(new Error(err.code === 1 ? "geolocation_denied" : "geolocation_error")),
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 30_000 }
      );
    });
  }

  async function submitAttendance() {
    if (busy || !data) return;
    const siteId = openPair ? openPair.site?.id ?? selectedSiteId : selectedSiteId;
    if (!siteId) {
      toast({ variant: "destructive", description: t("myAttendance.selectSiteFirst") });
      return;
    }
    setBusy(true);
    setLastResult(null);
    try {
      const coords = await getPosition();
      const endpoint = openPair ? "/api/attendance/check-out" : "/api/attendance/check-in";
      const res = await apiRequest<{ event: EventRow; status: string; reason: string | null }>(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          siteId,
          coordinates: {
            latitude: coords.latitude,
            longitude: coords.longitude,
            accuracyM: coords.accuracy ?? null,
          },
          clientTimestamp: new Date().toISOString(),
          networkMode: "internet",
          device: { platform: typeof navigator !== "undefined" ? navigator.platform ?? null : null },
          verification: {
            qrToken: qrToken.trim() || null,
            face: null, // الوجه عبر تطبيق الهاتف لاحقاً (SPEC §4.2) — الويب يرسل نتيجة فارغة
          },
        }),
      });
      const ok = res.status === "verified";
      setLastResult({
        ok,
        title: openPair
          ? ok ? t("myAttendance.successCheckOut") : t("myAttendance.pendingCheckOut")
          : ok ? t("myAttendance.successCheckIn") : t("myAttendance.pendingCheckIn"),
        detail: ok ? undefined : t("myAttendance.pendingDetail"),
      });
      toast({ description: ok ? t("myAttendance.successToast") : t("myAttendance.pendingToast") });
      setQrToken("");
      await load();
    } catch (err) {
      const code = err instanceof Error && "code" in err ? (err as { code?: string }).code ?? "" : "";
      if (code === "geolocation_denied" || code === "geolocation_unsupported" || code === "geolocation_error") {
        setLastResult({ ok: false, title: t("myAttendance.geoDenied"), detail: t("myAttendance.geoDeniedDetail") });
        return;
      }
      // رفض الخادم: outside_fence / poor_accuracy / mock_location / impossible_jump / no_open_checkin / rate_limited
      const payload = (err as { data?: { distanceM?: number; radiusM?: number; error?: string } }).data;
      const reasonKey = REASON_KEYS[code] ?? "common.operationFailed";
      let detail = t(reasonKey);
      if (payload?.distanceM != null && payload?.radiusM != null) {
        detail = `${detail} — ${t("myAttendance.distanceDetail")} ${Math.round(payload.distanceM)} ${t("notifications.presenceMeters")} / ${t("myAttendance.radiusLabel")} ${payload.radiusM} ${t("notifications.presenceMeters")}`;
      }
      setLastResult({ ok: false, title: t("myAttendance.rejectedTitle"), detail });
      toast({ variant: "destructive", description: t(reasonKey) });
      await load();
    } finally {
      setBusy(false);
    }
  }

  const events = data?.events ?? [];

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <PageHeader title={t("myAttendance.title")} subtitle={t("myAttendance.subtitle")} />

      {/* حالة اليوم */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="border-border/70">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarCheck className="size-4 text-primary" aria-hidden />
              {t("myAttendance.todayTitle")}
              <span className="text-xs font-normal text-muted-foreground">{formatDate(today, locale)}</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {data?.currentShift ? (
              <p className="flex items-center gap-2">
                <Clock className="size-4 text-muted-foreground" aria-hidden />
                {t("myAttendance.currentShift")}:
                <span className="font-semibold" dir="ltr">
                  {formatTime(data.currentShift.startsAt)} – {formatTime(data.currentShift.endsAt)}
                </span>
                <span className="text-muted-foreground">— {data.currentShift.site?.name}</span>
              </p>
            ) : data?.nextShift ? (
              <p className="flex items-center gap-2">
                <Clock className="size-4 text-muted-foreground" aria-hidden />
                {t("myAttendance.nextShift")}: <span className="font-semibold">{data.nextShift.site?.name}</span>
                <span className="font-semibold" dir="ltr">{formatTime(data.nextShift.startsAt)} – {formatTime(data.nextShift.endsAt)}</span>
              </p>
            ) : (
              <p className="text-muted-foreground">{t("myAttendance.noShiftToday")}</p>
            )}
            {openPair ? (
              <p className="flex items-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 font-semibold text-emerald-700 dark:text-emerald-400">
                <ShieldCheck className="size-4" aria-hidden />
                {t("myAttendance.onSiteSince")} <span dir="ltr">{formatTime(openPair.occurredAt)}</span> — {openPair.site?.name}
              </p>
            ) : (
              <p className="text-muted-foreground">{t("myAttendance.notCheckedIn")}</p>
            )}
          </CardContent>
        </Card>

        {/* لوحة التسجيل */}
        <Card className="border-primary/30">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <MapPin className="size-4 text-primary" aria-hidden />
              {openPair ? t("myAttendance.checkOutTitle") : t("myAttendance.checkInTitle")}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {openPair ? (
              <div className="rounded-lg border bg-muted/30 px-4 py-3">
                <p className="text-sm font-semibold">{openPair.site?.name}</p>
                <p className="text-xs text-muted-foreground">
                  {t("myAttendance.openPairNote")} — <span dir="ltr">{formatTime(openPair.occurredAt)}</span>
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <Label htmlFor="at-site">{t("myAttendance.site")}</Label>
                <Select value={selectedSiteId} onValueChange={setSelectedSiteId}>
                  <SelectTrigger id="at-site" className="w-full">
                    <SelectValue placeholder={t("myAttendance.selectSite")} />
                  </SelectTrigger>
                  <SelectContent>
                    {(data?.sites ?? []).map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {selectedSite && (
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <Badge variant="secondary" className="gap-1">
                  <MapPin className="size-3" aria-hidden />
                  {t("myAttendance.radiusLabel")}: {selectedSite.radiusM} {t("notifications.presenceMeters")}
                </Badge>
                <Badge variant="outline" className="gap-1">
                  {POLICY_KEYS[selectedSite.policy] ? t(POLICY_KEYS[selectedSite.policy]) : selectedSite.policy}
                </Badge>
                {policyNeedsQr(selectedSite.policy) && (
                  <Badge variant="outline" className="gap-1 border-sky-500/50 text-sky-600 dark:text-sky-400">
                    <QrCode className="size-3" aria-hidden />
                    {t("myAttendance.policyQr")}
                  </Badge>
                )}
                {policyNeedsFace(selectedSite.policy) && (
                  <Badge variant="outline" className="gap-1 border-violet-500/50 text-violet-600 dark:text-violet-400">
                    <ScanFace className="size-3" aria-hidden />
                    {t("myAttendance.policyFace")}
                  </Badge>
                )}
              </div>
            )}

            {selectedSite && policyNeedsQr(selectedSite.policy) && !openPair && (
              <div className="flex flex-col gap-2">
                <Label htmlFor="at-qr-token">{t("myAttendance.qrTokenLabel")}</Label>
                <Input
                  id="at-qr-token"
                  value={qrToken}
                  onChange={(e) => setQrToken(e.target.value)}
                  placeholder={t("myAttendance.qrTokenPlaceholder")}
                  dir="ltr"
                  className="font-mono text-xs"
                  disabled={busy}
                />
                <p className="text-[11px] text-muted-foreground">{t("myAttendance.qrNote")}</p>
              </div>
            )}

            {selectedSite && policyNeedsFace(selectedSite.policy) && !openPair && (
              <p className="rounded-lg border border-violet-500/40 bg-violet-500/10 px-3 py-2 text-xs text-violet-700 dark:text-violet-300">
                {t("myAttendance.faceWebNote")}
              </p>
            )}

            <Button
              size="lg"
              onClick={() => void submitAttendance()}
              disabled={busy || loading || (!openPair && !selectedSiteId)}
              className="gap-2 font-bold"
              variant={openPair ? "outline" : "default"}
            >
              {busy ? (
                <LoaderCircle className="size-4 animate-spin" aria-hidden />
              ) : openPair ? (
                <LogOut className="size-4" aria-hidden />
              ) : (
                <LogIn className="size-4" aria-hidden />
              )}
              {busy
                ? t("myAttendance.locating")
                : openPair
                  ? t("myAttendance.checkOut")
                  : t("myAttendance.checkIn")}
            </Button>

            {lastResult && (
              <Alert variant={lastResult.ok ? "default" : "destructive"} role="status">
                <AlertDescription>
                  <p className="font-semibold">{lastResult.title}</p>
                  {lastResult.detail && <p className="text-xs">{lastResult.detail}</p>}
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      </div>

      {/* أحداثي اليوم */}
      <Card className="border-border/70">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Clock className="size-4 text-primary" aria-hidden />
            {t("myAttendance.eventsToday")}
            <Badge variant="secondary" className="ms-1 tabular-nums">{events.length}</Badge>
            <Button variant="ghost" size="sm" onClick={() => void load()} disabled={loading} className="ms-auto gap-1.5">
              {loading ? <LoaderCircle className="size-3.5 animate-spin" aria-hidden /> : <RefreshCcw className="size-3.5" aria-hidden />}
              {t("common.retry")}
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ListState loading={loading && events.length === 0} error={error} empty={!error && events.length === 0} onRetry={() => void load()} />
          {!loading && !error && events.length > 0 && (
            <div className="max-h-96 overflow-y-auto rounded-lg border border-border/60">
              <Table>
                <TableHeader className="sticky top-0 bg-muted/95 backdrop-blur">
                  <TableRow>
                    <TableHead className="text-xs">{t("myAttendance.time")}</TableHead>
                    <TableHead className="text-xs">{t("myAttendance.type")}</TableHead>
                    <TableHead className="text-xs">{t("myAttendance.site")}</TableHead>
                    <TableHead className="text-xs">{t("myAttendance.distance")}</TableHead>
                    <TableHead className="text-xs">{t("common.status")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {events.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell className="whitespace-nowrap font-medium tabular-nums" dir="ltr">{formatTime(e.occurredAt)}</TableCell>
                      <TableCell className="whitespace-nowrap text-xs">
                        {e.type === "check_in" ? t("myAttendance.typeCheckIn") : t("myAttendance.typeCheckOut")}
                      </TableCell>
                      <TableCell className="text-sm">{e.site?.name ?? "—"}</TableCell>
                      <TableCell className="whitespace-nowrap text-xs tabular-nums" dir="ltr">
                        {e.distanceM != null ? `${Math.round(e.distanceM)} ${t("notifications.presenceMeters")}` : "—"}
                        {e.insideFence && <span className="ms-1 text-emerald-600 dark:text-emerald-400">✓</span>}
                      </TableCell>
                      <TableCell className="space-x-1 whitespace-nowrap">
                        {statusBadge(t, e.status)}
                        {e.reason && (
                          <span className="block text-[11px] text-muted-foreground">
                            {REASON_KEYS[e.reason] ? t(REASON_KEYS[e.reason]) : e.reason}
                          </span>
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
    </div>
  );
}
