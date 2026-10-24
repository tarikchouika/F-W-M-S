"use client";

// HRMP — مدير الحضور (المرحلة 4 — SPEC §4.2 و§4.4): أحداث اليوم/الفترة بفلاتر + إحصاءات لحظية + مراجعة المعلَّق
// الدخول/الخارج النطاق/التلاعب كلها مسجَّلة (append-only) — المراجعة قرار موثَّق في التدقيق
import { useCallback, useEffect, useState } from "react";
import {
  Clock,
  LoaderCircle,
  LogIn,
  LogOut,
  RefreshCcw,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
  Wifi,
  WifiOff,
} from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
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
import { addDaysToLocalDate } from "@/lib/scheduling";
import { ListState, PageHeader, apiRequest, apiErrorMessage, formatDate } from "@/components/hrmp/org-bits";

type EventRow = {
  id: string;
  type: string;
  occurredAt: string;
  worker: { id: string; fullName: string } | null;
  site: { id: string; name: string } | null;
  distanceM: number | null;
  accuracyM: number | null;
  insideFence: boolean;
  policy: string;
  verification: string;
  status: string;
  reason: string | null;
  networkMode: string;
  reviewNotes: string | null;
  reviewedAt: string | null;
};

type ListResponse = {
  count: number;
  today: string;
  stats: { checkIns: number; checkOuts: number; onSiteNow: number; pendingReview: number; rejected: number };
  events: EventRow[];
};

const REASON_KEYS: Record<string, string> = {
  outside_fence: "attendance.reasonOutsideFence",
  poor_accuracy: "attendance.reasonPoorAccuracy",
  mock_location: "attendance.reasonMockLocation",
  impossible_jump: "attendance.reasonImpossibleJump",
  qr_missing: "attendance.reasonQrMissing",
  qr_invalid: "attendance.reasonQrInvalid",
  qr_expired: "attendance.reasonQrExpired",
  face_missing: "attendance.reasonFaceMissing",
  face_failed: "attendance.reasonFaceFailed",
  review_rejected: "attendance.reasonReviewRejected",
};

function formatTime(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Africa/Casablanca",
  }).format(new Date(iso));
}

export function AttendanceManager({ today, canReview }: { today: string; canReview: boolean }) {
  const { t, locale } = useI18n();
  const { toast } = useToast();

  const [from, setFrom] = useState(addDaysToLocalDate(today, -7));
  const [to, setTo] = useState(today);
  const [status, setStatus] = useState("all");
  const [type, setType] = useState("all");
  const [rows, setRows] = useState<EventRow[]>([]);
  const [stats, setStats] = useState<ListResponse["stats"] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const [reviewRow, setReviewRow] = useState<EventRow | null>(null);
  const [reviewNotes, setReviewNotes] = useState("");
  const [reviewing, setReviewing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const data = await apiRequest<ListResponse>(
        `/api/attendance?from=${from}&to=${to}&status=${status}&type=${type}`
      );
      setRows(data.events);
      setStats(data.stats);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [from, to, status, type]);

  useEffect(() => {
    void load();
  }, [load]);

  async function submitReview(decision: "approve" | "reject") {
    if (!reviewRow || reviewing) return;
    setReviewing(true);
    try {
      await apiRequest(`/api/attendance/${reviewRow.id}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, notes: reviewNotes.trim() || null }),
      });
      toast({ description: decision === "approve" ? t("attendance.reviewApproved") : t("attendance.reviewRejected") });
      setReviewRow(null);
      setReviewNotes("");
      await load();
    } catch (err) {
      toast({ variant: "destructive", description: apiErrorMessage(t, err) });
    } finally {
      setReviewing(false);
    }
  }

  function statusBadge(e: EventRow) {
    if (e.status === "verified")
      return <Badge className="font-semibold">{t("attendance.statusVerified")}</Badge>;
    if (e.status === "pending_review")
      return <Badge variant="outline" className="border-amber-500/60 font-semibold text-amber-600 dark:text-amber-400">{t("attendance.statusPending")}</Badge>;
    return <Badge variant="destructive" className="font-semibold">{t("attendance.statusRejected")}</Badge>;
  }

  const statCards = [
    { key: "checkIns", icon: LogIn, label: t("attendance.statCheckIns"), tone: "text-primary" },
    { key: "onSiteNow", icon: UserCheck, label: t("attendance.statOnSite"), tone: "text-emerald-600 dark:text-emerald-400" },
    { key: "pendingReview", icon: ShieldAlert, label: t("attendance.statPending"), tone: "text-amber-600 dark:text-amber-400" },
    { key: "rejected", icon: ShieldCheck, label: t("attendance.statRejected"), tone: "text-destructive" },
  ] as const;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <PageHeader title={t("attendance.title")} subtitle={t("attendance.subtitle")} />

      {/* إحصاءات اليوم */}
      {stats && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {statCards.map((c) => (
            <Card key={c.key} className="border-border/70">
              <CardContent className="flex items-center gap-3 py-4">
                <c.icon className={`size-5 ${c.tone}`} aria-hidden />
                <div className="flex flex-col leading-tight">
                  <span className="text-2xl font-extrabold tabular-nums">{stats[c.key]}</span>
                  <span className="text-[11px] text-muted-foreground">{c.label}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* الفلاتر */}
      <Card>
        <CardContent className="flex flex-wrap items-end gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="att-from">{t("shifts.from")}</Label>
            <Input id="att-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="att-to">{t("shifts.to")}</Label>
            <Input id="att-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="att-status">{t("common.status")}</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger id="att-status" className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("common.all")}</SelectItem>
                <SelectItem value="verified">{t("attendance.statusVerified")}</SelectItem>
                <SelectItem value="pending_review">{t("attendance.statusPending")}</SelectItem>
                <SelectItem value="rejected">{t("attendance.statusRejected")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="att-type">{t("myAttendance.type")}</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger id="att-type" className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("common.all")}</SelectItem>
                <SelectItem value="check_in">{t("attendance.typeCheckIn")}</SelectItem>
                <SelectItem value="check_out">{t("attendance.typeCheckOut")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button variant="outline" onClick={() => void load()} disabled={loading} className="gap-1.5">
            {loading ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <RefreshCcw className="size-4" aria-hidden />}
            {t("common.retry")}
          </Button>
        </CardContent>
      </Card>

      {/* الجدول */}
      <Card className="border-border/70">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Clock className="size-4 text-primary" aria-hidden />
            {t("attendance.eventsTitle")}
            <Badge variant="secondary" className="ms-1 tabular-nums">{rows.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ListState loading={loading && rows.length === 0} error={error} empty={!error && rows.length === 0} onRetry={() => void load()} />
          {!loading && !error && rows.length > 0 && (
            <div className="max-h-[28rem] overflow-y-auto rounded-lg border border-border/60">
              <Table>
                <TableHeader className="sticky top-0 bg-muted/95 backdrop-blur">
                  <TableRow>
                    <TableHead className="text-xs">{t("attendance.worker")}</TableHead>
                    <TableHead className="text-xs">{t("myAttendance.time")}</TableHead>
                    <TableHead className="text-xs">{t("myAttendance.type")}</TableHead>
                    <TableHead className="text-xs">{t("shifts.site")}</TableHead>
                    <TableHead className="text-xs">{t("myAttendance.distance")}</TableHead>
                    <TableHead className="text-xs">{t("attendance.verification")}</TableHead>
                    <TableHead className="text-xs">{t("common.status")}</TableHead>
                    {canReview && <TableHead className="text-xs">{t("common.actions")}</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell>
                        <p className="font-semibold">{e.worker?.fullName ?? "—"}</p>
                        <p className="text-[11px] text-muted-foreground">{formatDate(e.occurredAt, locale)}</p>
                      </TableCell>
                      <TableCell className="whitespace-nowrap font-medium tabular-nums" dir="ltr">{formatTime(e.occurredAt)}</TableCell>
                      <TableCell className="whitespace-nowrap text-xs">
                        <span className="inline-flex items-center gap-1">
                          {e.type === "check_in" ? <LogIn className="size-3.5 text-primary" aria-hidden /> : <LogOut className="size-3.5 text-muted-foreground" aria-hidden />}
                          {e.type === "check_in" ? t("attendance.typeCheckIn") : t("attendance.typeCheckOut")}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm">{e.site?.name ?? "—"}</TableCell>
                      <TableCell className="whitespace-nowrap text-xs tabular-nums" dir="ltr">
                        {e.distanceM != null ? `${Math.round(e.distanceM)} ${t("notifications.presenceMeters")}` : "—"}
                        {e.insideFence
                          ? <span className="ms-1 text-emerald-600 dark:text-emerald-400">✓</span>
                          : <span className="ms-1 text-destructive">✗</span>}
                      </TableCell>
                      <TableCell className="space-y-0.5 text-xs">
                        <Badge variant="outline" className="font-mono text-[10px]">{e.policy}</Badge>
                        {e.verification !== "none" && e.verification !== e.policy && (
                          <Badge variant="secondary" className="font-mono text-[10px]">{e.verification}</Badge>
                        )}
                        <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                          {e.networkMode === "lan" ? <WifiOff className="size-3" aria-hidden /> : <Wifi className="size-3" aria-hidden />}
                          {e.networkMode === "lan" ? t("attendance.networkLan") : t("attendance.networkInternet")}
                        </span>
                      </TableCell>
                      <TableCell className="space-y-0.5">
                        {statusBadge(e)}
                        {e.reason && (
                          <span className="block text-[11px] text-muted-foreground">
                            {REASON_KEYS[e.reason] ? t(REASON_KEYS[e.reason]) : e.reason}
                          </span>
                        )}
                        {e.reviewNotes && (
                          <span className="block text-[11px] text-muted-foreground">“{e.reviewNotes}”</span>
                        )}
                      </TableCell>
                      {canReview && (
                        <TableCell>
                          {e.status === "pending_review" ? (
                            <Button variant="outline" size="sm" className="h-8 gap-1.5 px-2 text-xs" onClick={() => { setReviewRow(e); setReviewNotes(""); }}>
                              <ShieldCheck className="size-3.5" aria-hidden />
                              {t("attendance.review")}
                            </Button>
                          ) : (
                            <span className="text-[11px] text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* حوار المراجعة */}
      <Dialog open={reviewRow !== null} onOpenChange={(open) => { if (!open) { setReviewRow(null); setReviewNotes(""); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("attendance.reviewTitle")}</DialogTitle>
            <DialogDescription>
              {reviewRow
                ? `${reviewRow.worker?.fullName ?? "—"} — ${reviewRow.site?.name ?? "—"} — ${formatTime(reviewRow.occurredAt)}`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            {reviewRow?.reason && (
              <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
                {t("attendance.pendingBecause")}: {REASON_KEYS[reviewRow.reason] ? t(REASON_KEYS[reviewRow.reason]) : reviewRow.reason}
              </p>
            )}
            <div className="flex flex-col gap-2">
              <Label htmlFor="review-notes">{t("attendance.reviewNotes")}</Label>
              <Textarea
                id="review-notes"
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
                rows={3}
                maxLength={500}
                placeholder={t("attendance.reviewNotesPlaceholder")}
                disabled={reviewing}
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="destructive" onClick={() => void submitReview("reject")} disabled={reviewing} className="gap-1.5">
              {reviewing && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
              {t("attendance.reject")}
            </Button>
            <Button onClick={() => void submitReview("approve")} disabled={reviewing} className="gap-1.5 font-bold">
              {reviewing && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
              {t("attendance.approve")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
