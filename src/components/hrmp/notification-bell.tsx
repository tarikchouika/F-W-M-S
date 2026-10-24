"use client";

// HRMP — جرس الإشعارات (المرحلة 5 — SPEC §4.1 و§8): استطلاع 20ث/120ث + شارة غير المقروء
// «الفوري» عمليًا: push عبر Web Push عند الضبط (VAPID) + استطلاع خفيف داخل التطبيق قناة ثانية موثوقة
// الطلب حجمه ثابت صغير (فهرس userId,readAt) — لا يثقل SQLite على الهاتف
import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, BellRing, CheckCheck, LoaderCircle, Volume2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useI18n } from "@/i18n/provider";
import { formatDate } from "@/components/hrmp/org-bits";

type ReplacementPayload = {
  siteName: string;
  localDate: string;
  startLabel: string;
  endLabel: string;
  previousWorkerName?: string;
  shiftId: string;
};

type PayslipApprovedPayload = {
  periodLabel: string;
  refNumber: string;
};

type TeamPresencePayload = {
  memberName: string;
  groupName: string;
  zoneRadiusM: number;
  distanceM: number;
  at: string;
};

type NotificationRow = {
  id: string;
  type: string;
  payload: ReplacementPayload | PayslipApprovedPayload | TeamPresencePayload | null;
  readAt: string | null;
  createdAt: string;
};

const POLL_VISIBLE_MS = 20_000;
const POLL_HIDDEN_MS = 120_000;

export function NotificationBell() {
  const { t, locale } = useI18n();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<NotificationRow[]>([]);
  const [unread, setUnread] = useState(0);
  const [busy, setBusy] = useState(false);
  const [pushOn, setPushOn] = useState<boolean | null>(null); // null = غير مدعوم في هذا المتصفح/البيئة
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const poll = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { unreadCount: number; notifications: NotificationRow[] };
      setRows(data.notifications);
      setUnread(data.unreadCount);
    } catch {
      /* الشبكة مؤقتًا؟ الجولة القادمة تعيد المحاولة */
    }
  }, []);

  // استطلاع بمعدّلين: مرئي 20ث / مخفي 120ث — وبلا مؤقتات متزامنة متعددة
  useEffect(() => {
    let cancelled = false;
    const loop = () => {
      if (cancelled) return;
      void poll();
      const delay = document.visibilityState === "visible" ? POLL_VISIBLE_MS : POLL_HIDDEN_MS;
      timerRef.current = setTimeout(loop, delay);
    };
    loop();
    const onVisibility = () => {
      if (document.visibilityState === "visible") void poll();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      if (timerRef.current) clearTimeout(timerRef.current);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [poll]);

  // هل Web Push متاح؟ (خدمة + مفتاح VAPID مضبوطان)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
          if (!cancelled) setPushOn(false);
          return;
        }
        const res = await fetch("/api/devices");
        if (!res.ok) return;
        const data = (await res.json()) as { vapidPublicKey: string | null };
        if (!cancelled) setPushOn(data.vapidPublicKey !== null);
      } catch {
        /* يبقى null = غير معروف */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function markAllRead() {
    setBusy(true);
    try {
      await fetch("/api/notifications/read", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ all: true }),
      });
      await poll();
    } finally {
      setBusy(false);
    }
  }

  async function enablePush() {
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") return;
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const res = await fetch("/api/devices");
      const { vapidPublicKey } = (await res.json()) as { vapidPublicKey: string | null };
      if (!vapidPublicKey) return;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      });
      const json = sub.toJSON();
      await fetch("/api/devices", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          endpoint: json.endpoint,
          keys: { p256dh: json.keys?.p256dh ?? "", auth: json.keys?.auth ?? "" },
          userAgent: navigator.userAgent.slice(0, 400),
        }),
      });
    } catch {
      /* فشل الاشتراك لا يُفشل الواجهة — الاستطلاع قناة موثوقة */
    }
  }

  function renderBody(n: NotificationRow): string {
    if (n.type === "shift_replacement_assigned" && n.payload) {
      const p = n.payload as ReplacementPayload;
      const line = `${t("notifications.replaceLine1")} «${p.siteName}» ${t("notifications.replaceLine2")} ${p.localDate} ${t("notifications.replaceFrom")} ${p.startLabel} ${t("notifications.replaceTo")} ${p.endLabel}`;
      return p.previousWorkerName
        ? `${line} — ${t("notifications.replaceInsteadOf")} ${p.previousWorkerName}`
        : line;
    }
    if (n.type === "payslip_approved" && n.payload) {
      const p = n.payload as PayslipApprovedPayload;
      return `${t("notifications.payslipLine1")} ${p.periodLabel} — ${t("notifications.payslipLine2")} ${p.refNumber}`;
    }
    if (n.type === "team_member_left_zone" && n.payload) {
      const p = n.payload as TeamPresencePayload;
      return `${t("notifications.presenceLeftLine1")} «${p.memberName}» ${t("notifications.presenceLeftLine2")} «${p.groupName}» — ~${Math.round(p.distanceM)} ${t("notifications.presenceMeters")}`;
    }
    if (n.type === "team_member_entered_zone" && n.payload) {
      const p = n.payload as TeamPresencePayload;
      return `${t("notifications.presenceReturnedLine1")} «${p.memberName}» ${t("notifications.presenceReturnedLine2")} «${p.groupName}»`;
    }
    return t("notifications.unknownType");
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative size-9"
          aria-label={`${t("notifications.title")}${unread > 0 ? ` (${unread})` : ""}`}
        >
          {unread > 0 ? (
            <BellRing className="size-4.5 text-primary" aria-hidden />
          ) : (
            <Bell className="size-4.5" aria-hidden />
          )}
          {unread > 0 && (
            <Badge
              className="absolute -end-1 -top-1 h-4 min-w-4 px-1 text-[10px] font-bold"
              aria-hidden
            >
              {unread > 9 ? "9+" : unread}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0" dir="auto">
        <div className="flex items-center justify-between gap-2 px-3 py-2.5">
          <span className="text-sm font-semibold">{t("notifications.title")}</span>
          <div className="flex items-center gap-1">
            {pushOn && (
              <Button
                variant="ghost"
                size="icon"
                className="size-7"
                onClick={() => void enablePush()}
                title={t("notifications.enablePush")}
                aria-label={t("notifications.enablePush")}
              >
                <Volume2 className="size-3.5" aria-hidden />
              </Button>
            )}
            {unread > 0 && (
              <Button
                variant="ghost"
                size="icon"
                className="size-7"
                onClick={() => void markAllRead()}
                disabled={busy}
                title={t("notifications.markAllRead")}
                aria-label={t("notifications.markAllRead")}
              >
                {busy ? (
                  <LoaderCircle className="size-3.5 animate-spin" aria-hidden />
                ) : (
                  <CheckCheck className="size-3.5" aria-hidden />
                )}
              </Button>
            )}
          </div>
        </div>
        <Separator />
        {rows.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">
            {t("notifications.empty")}
          </p>
        ) : (
          <ScrollArea className="max-h-96">
            <ul className="divide-y divide-border/60">
              {rows.map((n) => (
                <li
                  key={n.id}
                  className={`flex flex-col gap-1 px-3 py-2.5 text-sm ${n.readAt ? "opacity-70" : ""}`}
                >
                  <span className="leading-relaxed">{renderBody(n)}</span>
                  <span className="text-[11px] text-muted-foreground" dir="auto">
                    {formatDate(n.createdAt.slice(0, 10), locale)}
                    {" · "}
                    {new Date(n.createdAt).toLocaleTimeString(locale, {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </li>
              ))}
            </ul>
          </ScrollArea>
        )}
      </PopoverContent>
    </Popover>
  );
}

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  // Uint8Array<ArrayBuffer>: توافق صارم مع BufferSource في TS 5.7+ (applicationServerKey)
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const output = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}
