"use client";

// FWMS — واجهة الرسائل الصوتية (المرحلة 9 — v0.10.0)
// ---------------------------------------------------------------------------
// محادثات صوتية مباشرة: العامل/الحرفي/القائد داخل فريقه فقط (عزل الفرق في الخادم)،
// والوضع الإشرافي (سوبر/أدمن/كوأدمن) يصل إلى الجميع + تصفح رسائل أي فريق.
// التسجيل: MediaRecorder (webm/opus) ≤ 120ث؛ الإرسال multipart ≤ 2.5MB.
// الاستماع يعلّم «مستمع إليه» مرة واحدة (المستقبِل فقط) — استماع المشرف لا يعلّمها.
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Mic,
  Radio,
  Square,
  LoaderCircle,
  Play,
  Pause,
  CheckCheck,
  Clock,
  ShieldCheck,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useI18n } from "@/i18n/provider";
import { ListState, apiRequest } from "@/components/fwms/org-bits";
import { jobTitleLabel } from "@/lib/job-titles";

type Contact = { userId: string; fullName: string; role: string; jobTitleKey: string | null };
type VoiceMsg = {
  id: string;
  senderId: string;
  recipientId: string;
  durationSec: number;
  sizeBytes: number;
  listenedAt: string | null;
  createdAt: string;
};

const MAX_RECORD_SEC = 120;
const POLL_MS = 15_000;

// قيمة حارسة لأن SelectItem يرفض القيمة الفارغة (درس المرحلة 2)
const NONE = "none";

export function VoiceConsole({ myUserId }: { myUserId: string }) {
  const { t, dir, locale } = useI18n();
  const BackArrow = dir === "rtl" ? ArrowRight : ArrowLeft;

  const [mode, setMode] = useState<"team" | "admin" | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const [selected, setSelected] = useState<Contact | null>(null);
  const [messages, setMessages] = useState<VoiceMsg[]>([]);
  const [threadLoading, setThreadLoading] = useState(false);

  // وضع الإشراف: تصفح رسائل فريق
  const [adminGroups, setAdminGroups] = useState<{ id: string; name: string }[]>([]);
  const [browseGroup, setBrowseGroup] = useState<string>(NONE);
  const [browseMessages, setBrowseMessages] = useState<VoiceMsg[]>([]);
  const [browseInfo, setBrowseInfo] = useState<{ sender: string; recipient: string } | null>(null);

  // التسجيل
  const [recording, setRecording] = useState(false);
  const [recordSec, setRecordSec] = useState(0);
  const [sending, setSending] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoStopRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // التشغيل
  const [playingId, setPlayingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const loadContacts = useCallback(async () => {
    try {
      const data = await apiRequest<{ mode: "team" | "admin"; contacts: Contact[] }>(
        "/api/voice-messages?contacts=1",
      );
      setMode(data.mode);
      setContacts(data.contacts);
      if (data.mode === "admin") {
        try {
          const g = await apiRequest<{ groups: { id: string; name: string; status: string }[] }>(
            "/api/worker-groups",
          );
          setAdminGroups(g.groups.filter((x) => x.status === "active").map((x) => ({ id: x.id, name: x.name })));
        } catch {
          /* قائمة الفرق تحسينية — فشلها لا يوقف الصوتيات */
        }
      }
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadThread = useCallback(async (other: string) => {
    setThreadLoading(true);
    try {
      const data = await apiRequest<{ messages: VoiceMsg[] }>(`/api/voice-messages?with=${encodeURIComponent(other)}`);
      setMessages(data.messages);
    } catch {
      setMessages([]);
    } finally {
      setThreadLoading(false);
    }
  }, []);

  const loadBrowse = useCallback(async (groupId: string) => {
    if (groupId === NONE) {
      setBrowseMessages([]);
      setBrowseInfo(null);
      return;
    }
    try {
      const data = await apiRequest<{ group: { id: string; name: string }; messages: VoiceMsg[] }>(
        `/api/voice-messages?group=${encodeURIComponent(groupId)}`,
      );
      setBrowseMessages(data.messages);
      setBrowseInfo({ sender: "", recipient: "" });
    } catch {
      setBrowseMessages([]);
    }
  }, []);

  useEffect(() => {
    void loadContacts();
  }, [loadContacts]);

  // استطلاع المحادثة المفتوحة + تصفح الإشراف
  useEffect(() => {
    if (!selected) return;
    void loadThread(selected.userId);
    const id = setInterval(() => {
      if (document.visibilityState === "visible") void loadThread(selected.userId);
    }, POLL_MS);
    return () => clearInterval(id);
  }, [selected, loadThread]);

  useEffect(() => {
    if (browseGroup !== NONE) void loadBrowse(browseGroup);
  }, [browseGroup, loadBrowse]);

  // ── التسجيل ──
  function stopTimer() {
    if (timerRef.current) clearInterval(timerRef.current);
    if (autoStopRef.current) clearTimeout(autoStopRef.current);
    timerRef.current = null;
    autoStopRef.current = null;
  }

  function cleanupRecorder() {
    recorderRef.current?.stream.getTracks().forEach((tk) => tk.stop());
    recorderRef.current = null;
    chunksRef.current = [];
    setRecording(false);
    setRecordSec(0);
    stopTimer();
  }

  async function startRecording() {
    setMicError(null);
    if (!("MediaRecorder" in window) || !navigator.mediaDevices?.getUserMedia) {
      setMicError("unsupported");
      return;
    }
    if (!selected) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";
      const rec = new MediaRecorder(stream, { mimeType: mime });
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mime.split(";")[0] });
        void sendVoice(blob);
        // تنظيف بلا انتظار (الإرسال في الخلفية)
        recorderRef.current?.stream.getTracks().forEach((tk) => tk.stop());
        recorderRef.current = null;
        stopTimer();
      };
      rec.start(400);
      recorderRef.current = rec;
      setRecording(true);
      setRecordSec(0);
      timerRef.current = setInterval(() => setRecordSec((s) => s + 1), 1000);
      autoStopRef.current = setTimeout(() => {
        if (recorderRef.current?.state === "recording") recorderRef.current.stop();
      }, MAX_RECORD_SEC * 1000);
    } catch {
      setMicError("denied");
    }
  }

  function stopRecording(send: boolean) {
    const rec = recorderRef.current;
    if (!rec) return;
    if (!send) {
      rec.onstop = null; // إلغاء بلا إرسال
      rec.stop();
      cleanupRecorder();
      return;
    }
    if (rec.state === "recording") rec.stop();
    setRecording(false); // onstop يكمل
  }

  async function sendVoice(blob: Blob) {
    if (!selected || blob.size === 0) return;
    setSending(true);
    try {
      const durationSec = recordSec;
      const form = new FormData();
      form.set("to", selected.userId);
      form.set("durationSec", String(Math.min(durationSec || 1, MAX_RECORD_SEC)));
      form.set("audio", blob, "voice.webm");
      const res = await fetch("/api/voice-messages", { method: "POST", body: form });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        setMicError(data?.error === "audio_too_large" ? "too_large" : "send_failed");
      } else {
        await loadThread(selected.userId);
      }
    } catch {
      setMicError("send_failed");
    } finally {
      setSending(false);
      setRecordSec(0);
    }
  }

  // ── التشغيل ──
  function togglePlay(msg: VoiceMsg, names?: { sender: string; recipient: string }) {
    if (playingId === msg.id) {
      audioRef.current?.pause();
      setPlayingId(null);
      return;
    }
    audioRef.current?.pause();
    const url = `/api/voice-messages/${msg.id}/audio`;
    const audio = new Audio(url);
    audioRef.current = audio;
    setPlayingId(msg.id);
    // المستقبِل يعلّمها مستمعًا إليه عند أول تشغيل (استماع المشرف لا يعلّمها)
    if (msg.recipientId === myUserId && !msg.listenedAt) {
      void fetch(`/api/voice-messages/${msg.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listened: true }),
      })
        .then(() => {
          setMessages((prev) => prev.map((m) => (m.id === msg.id ? { ...m, listenedAt: new Date().toISOString() } : m)));
        })
        .catch(() => null);
    }
    audio.onended = () => setPlayingId(null);
    audio.onerror = () => setPlayingId(null);
    void audio.play().catch(() => setPlayingId(null));
    if (names) void names; // معلومات الإشراف للاستخدام المستقبلي في الواجهة
  }

  useEffect(() => {
    return () => {
      audioRef.current?.pause();
      if (recorderRef.current) cleanupRecorder();
    };
  }, []);

  const fmtDuration = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  };

  const fmtTime = (iso: string) =>
    new Date(iso).toLocaleString(locale, {
      dateStyle: "short",
      timeStyle: "short",
      timeZone: "Africa/Casablanca",
    });

  // ── العرض ──
  if (loading) return <ListState loading error={false} empty={false} />;
  if (error) return <ListState loading={false} error empty={false} onRetry={() => void loadContacts()} />;

  const contactById = new Map(contacts.map((c) => [c.userId, c]));

  return (
    <div className="flex flex-col gap-6">
      {/* شريط الوضع */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Radio className="size-4 text-primary" aria-hidden />
          {mode === "admin" ? t("voice.modeAdmin") : t("voice.modeTeam")}
        </div>
        {mode === "admin" && adminGroups.length > 0 && (
          <div className="flex items-center gap-2">
            <ShieldCheck className="size-4 text-primary" aria-hidden />
            <span className="text-xs text-muted-foreground">{t("voice.browseGroup")}</span>
            <Select value={browseGroup} onValueChange={setBrowseGroup}>
              <SelectTrigger className="h-8 w-52 text-xs" aria-label={t("voice.browseGroup")}>
                <SelectValue placeholder={t("voice.noGroupSelected")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>{t("voice.noGroupSelected")}</SelectItem>
                {adminGroups.map((g) => (
                  <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {/* تصفح الإشراف لفريق */}
      {mode === "admin" && browseGroup !== NONE && (
        <Card className="border-border/70">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold">
              {t("voice.groupFeedTitle")} — {adminGroups.find((g) => g.id === browseGroup)?.name}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {browseMessages.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">{t("voice.noMessages")}</p>
            ) : (
              <ScrollArea className="max-h-96">
                <ul className="divide-y divide-border/60">
                  {browseMessages.map((m) => {
                    const sender = contactById.get(m.senderId)?.fullName ?? m.senderId.slice(0, 8);
                    const recipient = contactById.get(m.recipientId)?.fullName ?? m.recipientId.slice(0, 8);
                    return (
                      <li key={m.id} className="flex items-center justify-between gap-3 px-2 py-2.5 text-sm">
                        <div className="flex min-w-0 flex-col">
                          <span className="truncate">
                            {sender} <span className="text-muted-foreground">→</span> {recipient}
                          </span>
                          <span className="text-[11px] text-muted-foreground tabular-nums" dir="auto">
                            {fmtTime(m.createdAt)} · {fmtDuration(m.durationSec)}
                          </span>
                        </div>
                        <Button variant="outline" size="sm" className="size-8 shrink-0" onClick={() => togglePlay(m, { sender, recipient })} aria-label={t("voice.play")}>
                          {playingId === m.id ? <Pause className="size-3.5" aria-hidden /> : <Play className="size-3.5" aria-hidden />}
                        </Button>
                      </li>
                    );
                  })}
                </ul>
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      )}

      {/* المحادثات: قائمة + مسار */}
      <div className="grid gap-4 lg:grid-cols-[300px,1fr]">
        {/* جهات الاتصال */}
        <Card className={`border-border/70 ${selected ? "hidden lg:block" : ""}`}>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-bold">
              <Users className="size-4 text-primary" aria-hidden />
              {mode === "admin" ? t("voice.contactsAll") : t("voice.contactsTeam")}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {contacts.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground">{t("voice.noContacts")}</p>
            ) : (
              <ScrollArea className="max-h-[520px]">
                <ul className="divide-y divide-border/60">
                  {contacts.map((c) => {
                    const unread = messages.filter((m) => m.recipientId === myUserId && m.senderId === c.userId && !m.listenedAt).length;
                    return (
                      <li key={c.userId}>
                        <button
                          type="button"
                          onClick={() => {
                            setSelected(c);
                            setBrowseGroup(NONE);
                          }}
                          className={`flex w-full items-center gap-3 px-4 py-3 text-start transition-colors hover:bg-muted/60 ${
                            selected?.userId === c.userId ? "bg-muted" : ""
                          }`}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="truncate text-sm font-semibold">{c.fullName}</span>
                              {unread > 0 && <Badge className="h-4 min-w-4 px-1 text-[10px]">{unread}</Badge>}
                            </div>
                            <span className="block truncate text-[11px] text-muted-foreground">
                              {jobTitleLabel(c.jobTitleKey, locale) ?? t("presence.noJobTitle")}
                            </span>
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </ScrollArea>
            )}
          </CardContent>
        </Card>

        {/* المحادثة المفتوحة */}
        <Card className={`border-border/70 ${selected ? "" : "hidden lg:flex"} flex flex-col`}>
          {selected ? (
            <>
              <CardHeader className="flex flex-row items-center justify-between gap-2 border-b border-border/60 pb-3">
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8 lg:hidden"
                    onClick={() => setSelected(null)}
                    aria-label={t("voice.back")}
                  >
                    <BackArrow className="size-4" aria-hidden />
                  </Button>
                  <div className="flex flex-col leading-tight">
                    <span className="text-sm font-bold">{selected.fullName}</span>
                    <span className="text-[11px] text-muted-foreground">
                      {jobTitleLabel(selected.jobTitleKey, locale) ?? t("presence.noJobTitle")}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <Clock className="size-3.5" aria-hidden />
                  {t("voice.pollHint")}
                </div>
              </CardHeader>
              <CardContent className="flex min-h-[320px] flex-col gap-3 p-4">
                <ScrollArea className="max-h-[380px] flex-1">
                  {threadLoading ? (
                    <div className="flex justify-center py-8">
                      <LoaderCircle className="size-5 animate-spin text-muted-foreground" aria-hidden />
                    </div>
                  ) : messages.length === 0 ? (
                    <p className="py-10 text-center text-sm text-muted-foreground">{t("voice.threadEmpty")}</p>
                  ) : (
                    <ul className="flex flex-col gap-2.5">
                      {messages.map((m) => {
                        const mine = m.senderId === myUserId;
                        return (
                          <li key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                            <div
                              className={`flex max-w-[85%] items-center gap-2.5 rounded-2xl px-3.5 py-2.5 ${
                                mine
                                  ? "bg-primary text-primary-foreground"
                                  : "bg-muted text-foreground"
                              }`}
                            >
                              <button
                                type="button"
                                onClick={() => togglePlay(m)}
                                className="flex size-8 shrink-0 items-center justify-center rounded-full bg-black/10"
                                aria-label={t("voice.play")}
                              >
                                {playingId === m.id ? (
                                  <Pause className="size-4" aria-hidden />
                                ) : (
                                  <Play className="size-4" aria-hidden />
                                )}
                              </button>
                              <div className="flex flex-col leading-tight">
                                <span className="text-xs font-semibold tabular-nums" dir="ltr">
                                  {fmtDuration(m.durationSec)}
                                </span>
                                <span className="text-[10px] opacity-80 tabular-nums" dir="auto">
                                  {fmtTime(m.createdAt)}
                                  {mine && m.listenedAt && (
                                    <span className="ms-1 inline-flex items-center gap-0.5">
                                      <CheckCheck className="size-3" aria-hidden />
                                    </span>
                                  )}
                                </span>
                              </div>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </ScrollArea>

                {/* شريط التسجيل */}
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/60 bg-muted/40 p-3">
                  {micError && (
                    <span className="w-full text-xs text-red-600 dark:text-red-400">
                      {micError === "denied"
                        ? t("voice.micDenied")
                        : micError === "unsupported"
                          ? t("voice.micUnsupported")
                          : micError === "too_large"
                            ? t("voice.tooLarge")
                            : t("voice.sendFailed")}
                    </span>
                  )}
                  {recording ? (
                    <div className="flex w-full items-center justify-between gap-3">
                      <div className="flex items-center gap-2 text-sm font-semibold text-red-600 dark:text-red-400">
                        <span className="relative flex size-2.5">
                          <span className="absolute inline-flex size-full animate-ping rounded-full bg-red-400 opacity-75" />
                          <span className="relative inline-flex size-2.5 rounded-full bg-red-500" />
                        </span>
                        {t("voice.recording")} · <span dir="ltr">{fmtDuration(recordSec)}</span> / {fmtDuration(MAX_RECORD_SEC)}
                      </div>
                      <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" onClick={() => stopRecording(false)} className="gap-2">
                          <Square className="size-3.5" aria-hidden />
                          {t("voice.cancel")}
                        </Button>
                        <Button size="sm" onClick={() => stopRecording(true)} className="gap-2">
                          <Radio className="size-3.5" aria-hidden />
                          {sending ? t("common.saving") : t("voice.send")}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void startRecording()}
                      disabled={sending}
                      className="gap-2"
                    >
                      {sending ? (
                        <>
                          <LoaderCircle className="size-4 animate-spin" aria-hidden />
                          {t("voice.sending")}
                        </>
                      ) : (
                        <>
                          <Mic className="size-4 text-primary" aria-hidden />
                          {t("voice.record")}
                        </>
                      )}
                    </Button>
                  )}
                  <span className="text-[11px] text-muted-foreground">{t("voice.recordHint")}</span>
                </div>
              </CardContent>
            </>
          ) : (
            <CardContent className="flex flex-1 items-center justify-center p-10">
              <p className="text-sm text-muted-foreground">{t("voice.pickContact")}</p>
            </CardContent>
          )}
        </Card>
      </div>
    </div>
  );
}
