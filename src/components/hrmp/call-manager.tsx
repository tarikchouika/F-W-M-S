"use client";

// HRMP — مدير الاتصال المباشر (بلاغ المالك 2026-10-24)
// «يجب أنشاء أزرار للتواصل المباشر بشكل إحترافي ، الإتصال المباشر صوت و صورة
//  يجب إستهلاكه بشكل أني بين المرسل و المتلقي و لايتم تخزينه في المنصة»
// ---------------------------------------------------------------------------
// يعيش في تخطيط اللوحة فيصلك الرن في أي صفحة. WebRTC نظير-إلى-نظير:
// الوسائط تتدفق مباشرة بين المتصفحَين مشفّرة (DTLS-SRTP) — لا تمرّ بالخادم
// ولا تُخزَّن في المنصة إطلاقًا؛ الخادم يدير التأشير وحده (ring/offer/answer/
// ice/end/decline) عبر SSE + جدول قصير العمر يُحذف خلال دقائق.
//
// توقيت التأشير: المرسل يرسل offer فور إنشاء الجلسة — وقد يصل المتلقّي قبل
// قبوله الاتصال ⇒ يُخزَّن pendingOffer ويُعالج لحظة القبول. ومرشحو ICE الذين
// يسبقون وصف الطرف البعيد يُكدَّسون ويُصاغون بعده (نمط trickle ICE القياسي).
import { useCallback, useEffect, useRef, useState } from "react";
import {
  AudioLines,
  Camera,
  CameraOff,
  Check,
  LoaderCircle,
  Mic,
  MicOff,
  Phone,
  PhoneOff,
  ShieldCheck,
  Video,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useI18n } from "@/i18n/provider";
import { openRealtime, type RealtimeHandle } from "@/lib/realtime-client";
import { setCallRequestHandler, type StartCallRequest } from "@/lib/call-events";

type CallPhase =
  | "requesting" // إنشاء الجلسة + طلب الوسائط
  | "ringing" // رن عند الطرف الآخر
  | "incoming" // اتصال وارد لديّ
  | "connecting" // قَبِلَ الطرف — تأسيس ICE
  | "active" // متصل (مؤقت المدة)
  | "ended" // انتهى (لحظة ختامية ثم إغلاق)
  | "failed"; // فشل التأسيس

type SignalItem = {
  id: string;
  callId: string;
  from: string;
  kind: string;
  payload: unknown;
  at: string;
};

const RING_TIMEOUT_MS = 45_000; // لا مجيب؟ فائت
const ENDED_LINGER_MS = 2_200; // إظهار حالة النهاية قبل الإغلاق
const ICE_SERVERS: RTCIceServer[] = [
  { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
];

function fmtDur(sec: number): string {
  return `${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")}`;
}

export function CallManager({ myUserId }: { myUserId: string }) {
  const { t } = useI18n();

  const [phase, setPhase] = useState<CallPhase | null>(null);
  const [isCaller, setIsCaller] = useState(false);
  const [media, setMedia] = useState<"audio" | "video">("audio");
  const [peer, setPeer] = useState<{ id: string; name: string } | null>(null);
  const [duration, setDuration] = useState(0);
  const [muted, setMuted] = useState(false);
  const [camOff, setCamOff] = useState(false);
  const [errorKind, setErrorKind] = useState<string | null>(null);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const realtimeRef = useRef<RealtimeHandle | null>(null);
  const ringTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callIdRef = useRef<string | null>(null);
  const pendingIceRef = useRef<RTCIceCandidateInit[]>([]);
  const pendingOfferRef = useRef<{ sdp: string } | null>(null);
  const remoteDescSetRef = useRef(false);
  const phaseRef = useRef<CallPhase | null>(null);
  const isCallerRef = useRef(false);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);
  useEffect(() => {
    isCallerRef.current = isCaller;
  }, [isCaller]);

  // ── تنظيف شامل ──
  const teardown = useCallback(() => {
    if (ringTimerRef.current) clearTimeout(ringTimerRef.current);
    ringTimerRef.current = null;
    try {
      pcRef.current?.close();
    } catch {
      /* مغلقة فعلًا */
    }
    pcRef.current = null;
    localStreamRef.current?.getTracks().forEach((tk) => tk.stop());
    localStreamRef.current = null;
    remoteStreamRef.current = null;
    remoteDescSetRef.current = false;
    pendingIceRef.current = [];
    pendingOfferRef.current = null;
    callIdRef.current = null;
    setDuration(0);
    setMuted(false);
    setCamOff(false);
  }, []);

  const showEndedThenClose = useCallback(
    (finalPhase: CallPhase, err?: string) => {
      setErrorKind(err ?? null);
      setPhase(finalPhase);
      teardown();
      setTimeout(() => {
        setPhase(null);
        setPeer(null);
      }, ENDED_LINGER_MS);
    },
    [teardown],
  );

  // ── إرسال إشارة إلى الطرف الآخر عبر الخادم ──
  const sendSignal = useCallback(async (kind: string, payload?: unknown) => {
    const id = callIdRef.current;
    if (!id) return;
    await fetch(`/api/calls/${id}/signal`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, payload: payload ?? {} }),
    }).catch(() => null);
  }, []);

  const hangupRef = useRef<(finalPhase?: CallPhase) => Promise<void>>(async () => {});
  const declineRef = useRef<() => Promise<void>>(async () => {});

  const hangup = useCallback(
    async (finalPhase: CallPhase = "ended") => {
      await sendSignal("end", {});
      showEndedThenClose(finalPhase);
    },
    [sendSignal, showEndedThenClose],
  );
  useEffect(() => {
    hangupRef.current = hangup;
  }, [hangup]);

  // ── معالجة وصف المتلقّي: عرض المرسل + الإجابة ──
  const processOffer = useCallback(
    async (sdp: string) => {
      const pc = pcRef.current;
      if (!pc || isCallerRef.current || remoteDescSetRef.current) return;
      try {
        await pc.setRemoteDescription({ type: "offer", sdp });
        remoteDescSetRef.current = true;
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        await sendSignal("answer", { sdp: pc.localDescription?.sdp, type: pc.localDescription?.type });
        for (const cand of pendingIceRef.current) {
          await pc.addIceCandidate(cand).catch(() => null);
        }
        pendingIceRef.current = [];
      } catch {
        showEndedThenClose("failed", "signaling_error");
      }
    },
    [sendSignal, showEndedThenClose],
  );

  // ── إنشاء اتصال نظير جديد ──
  const createPeer = useCallback(() => {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    pcRef.current = pc;

    const remote = new MediaStream();
    remoteStreamRef.current = remote;

    pc.ontrack = (ev) => {
      remote.addTrack(ev.track);
      if (remoteVideoRef.current) remoteVideoRef.current.srcObject = remote;
      if (remoteAudioRef.current) remoteAudioRef.current.srcObject = remote;
    };

    pc.onicecandidate = (ev) => {
      if (ev.candidate) void sendSignal("ice", ev.candidate.toJSON());
    };

    pc.onconnectionstatechange = () => {
      const st = pc.connectionState;
      if (st === "connected") {
        if (ringTimerRef.current) clearTimeout(ringTimerRef.current);
        ringTimerRef.current = null;
        setPhase("active");
      } else if (st === "failed") {
        void hangupRef.current("failed");
      } else if (st === "disconnected") {
        // مهلة قصيرة — قد يعود تلقائيًا (تبديل شبكة)
        setTimeout(() => {
          if (pcRef.current?.connectionState === "disconnected") void hangupRef.current("ended");
        }, 4000);
      }
    };

    return pc;
  }, [sendSignal]);

  // ── طلب وسائط محلية ──
  const getLocalMedia = useCallback(async (kind: "audio" | "video") => {
    const constraints: MediaStreamConstraints =
      kind === "video"
        ? { audio: true, video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } } }
        : { audio: true, video: false };
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    localStreamRef.current = stream;
    if (localVideoRef.current && kind === "video") localVideoRef.current.srcObject = stream;
    return stream;
  }, []);

  // ── بدء اتصال (زر اتصال في أي مكان) ──
  const startCall = useCallback(
    async (req: StartCallRequest) => {
      if (phaseRef.current) return; // اتصال جارٍ — تجاهل
      setErrorKind(null);
      setPhase("requesting");
      setIsCaller(true);
      setMedia(req.media);
      setPeer({ id: req.userId, name: req.name });
      try {
        const stream = await getLocalMedia(req.media);
        const res = await fetch("/api/calls", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ to: req.userId, media: req.media }),
        });
        if (!res.ok) {
          const data = (await res.json().catch(() => null)) as { error?: string } | null;
          const code = data?.error ?? "call_failed";
          stream.getTracks().forEach((tk) => tk.stop());
          localStreamRef.current = null;
          showEndedThenClose("failed", code);
          return;
        }
        const created = (await res.json()) as { callId: string };
        callIdRef.current = created.callId;

        const pc = createPeer();
        stream.getTracks().forEach((tk) => pc.addTrack(tk, stream));

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        await sendSignal("offer", { sdp: pc.localDescription?.sdp, type: pc.localDescription?.type });
        setPhase("ringing");

        // مهلة الرن: لا مجيب ⇒ فائت
        ringTimerRef.current = setTimeout(() => {
          void hangupRef.current("ended");
        }, RING_TIMEOUT_MS);
      } catch {
        showEndedThenClose("failed", "media_denied");
      }
    },
    [createPeer, getLocalMedia, sendSignal, showEndedThenClose],
  );

  // ── قبول الاتصال الوارد ──
  const accept = useCallback(async () => {
    if (!callIdRef.current || phaseRef.current !== "incoming") return;
    setErrorKind(null);
    try {
      const stream = await getLocalMedia(media);
      const pc = createPeer();
      stream.getTracks().forEach((tk) => pc.addTrack(tk, stream));
      setPhase("connecting");
      // عرض المرسل إن وصل قبل القبول (أُخزّن) — وإلا سيصل الآن عبر SSE
      const pending = pendingOfferRef.current;
      if (pending) {
        pendingOfferRef.current = null;
        await processOffer(pending.sdp);
      }
    } catch {
      showEndedThenClose("failed", "media_denied");
    }
  }, [createPeer, getLocalMedia, media, processOffer, showEndedThenClose]);

  // ── رفض الاتصال الوارد ──
  const decline = useCallback(async () => {
    await sendSignal("decline");
    showEndedThenClose("ended", "declined_by_me");
  }, [sendSignal, showEndedThenClose]);
  useEffect(() => {
    declineRef.current = decline;
  }, [decline]);

  // ── استقبال إشارات SSE (تأسيس الاتصال وإنهاؤه) ──
  useEffect(() => {
    const handleSignal = (sig: SignalItem) => {
      void (async () => {
        // رن اتصال جديد وأنا حرّ؟
        if (sig.kind === "ring" && !phaseRef.current) {
          const payload = sig.payload as { media?: "audio" | "video"; callerName?: string };
          setPhase("incoming");
          setIsCaller(false);
          setMedia(payload.media === "video" ? "video" : "audio");
          setPeer({ id: sig.from, name: payload.callerName ?? "" });
          callIdRef.current = sig.callId;
          ringTimerRef.current = setTimeout(() => {
            void declineRef.current();
          }, RING_TIMEOUT_MS);
          return;
        }
        // بقية الإشارات تخص اتصالي الجاري حصرًا
        if (!callIdRef.current || sig.callId !== callIdRef.current) return;

        if (sig.kind === "offer") {
          const payload = sig.payload as { sdp?: string };
          if (!payload.sdp) return;
          if (isCallerRef.current) return; // المرسل لا يستقبل عرضًا
          if (phaseRef.current === "incoming") {
            // وصل قبل قبولي — يُخزَّن ويعالجه القبول
            pendingOfferRef.current = { sdp: payload.sdp };
            return;
          }
          await processOffer(payload.sdp);
          return;
        }

        if (sig.kind === "answer") {
          const pc = pcRef.current;
          const payload = sig.payload as { sdp?: string };
          if (pc && payload.sdp && pc.signalingState !== "stable") {
            await pc.setRemoteDescription({ type: "answer", sdp: payload.sdp }).catch(() => null);
            remoteDescSetRef.current = true;
            setPhase("connecting");
            for (const cand of pendingIceRef.current) {
              await pc.addIceCandidate(cand).catch(() => null);
            }
            pendingIceRef.current = [];
          }
          return;
        }

        if (sig.kind === "ice") {
          const pc = pcRef.current;
          const cand = sig.payload as RTCIceCandidateInit;
          if (!pc) return;
          if (remoteDescSetRef.current) {
            await pc.addIceCandidate(cand).catch(() => null);
          } else {
            pendingIceRef.current.push(cand);
          }
          return;
        }

        if (sig.kind === "decline") {
          if (ringTimerRef.current) clearTimeout(ringTimerRef.current);
          showEndedThenClose("ended", "declined_by_peer");
          return;
        }

        if (sig.kind === "end") {
          if (ringTimerRef.current) clearTimeout(ringTimerRef.current);
          showEndedThenClose("ended", "ended_by_peer");
        }
      })();
    };

    realtimeRef.current = openRealtime((ev) => {
      if (ev.type === "call") {
        for (const item of ev.items) handleSignal(item as SignalItem);
      }
    });
    return () => {
      realtimeRef.current?.close();
      realtimeRef.current = null;
    };
  }, []);

  // ── تسجيل الجسر: أزرار الاتصال من أي مكوّن ──
  useEffect(() => {
    setCallRequestHandler((req) => void startCall(req));
    return () => setCallRequestHandler(null);
  }, [startCall]);

  // ── تفكيك شامل عند الخروج ──
  useEffect(() => {
    return () => {
      teardown();
    };
  }, [teardown]);

  // ── مؤقت مدة الاتصال ──
  useEffect(() => {
    if (phase !== "active") return;
    const id = setInterval(() => setDuration((d) => d + 1), 1000);
    return () => clearInterval(id);
  }, [phase]);

  // ── عناصر التحكم: كتم/كاميرا ──
  function toggleMute() {
    const tracks = localStreamRef.current?.getAudioTracks() ?? [];
    const next = !muted;
    tracks.forEach((tk) => (tk.enabled = !next));
    setMuted(next);
  }
  function toggleCam() {
    if (media !== "video") return;
    const tracks = localStreamRef.current?.getVideoTracks() ?? [];
    const next = !camOff;
    tracks.forEach((tk) => (tk.enabled = !next));
    setCamOff(next);
  }

  if (!phase) return null;
  void myUserId; // محجوز للاستعمال المستقبلي (عرض جهاتي في سجل الاتصال)

  const statusText = () => {
    if (phase === "requesting") return t("voice.callRequesting");
    if (phase === "incoming") return t("voice.callIncoming");
    if (phase === "ringing") return t("voice.callRinging");
    if (phase === "connecting") return t("voice.callConnecting");
    if (phase === "active") return fmtDur(duration);
    if (phase === "ended") {
      if (errorKind === "declined_by_peer") return t("voice.callDeclined");
      if (errorKind === "ended_by_peer") return t("voice.callEnded");
      if (errorKind === "declined_by_me") return t("voice.callDeclined");
      return t("voice.callEnded");
    }
    // failed
    if (errorKind === "callee_busy") return t("voice.callBusy");
    if (errorKind === "media_denied") return t("voice.callMediaDenied");
    if (errorKind === "forbidden") return t("voice.callForbidden");
    if (errorKind === "rate_limited") return t("voice.callRateLimited");
    return t("voice.callFailed");
  };

  const inVideo = media === "video" && (phase === "active" || phase === "connecting");
  const showControls = phase === "active" || phase === "connecting" || phase === "ringing" || phase === "requesting";
  const showIncomingActions = phase === "incoming";

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && showControls) void hangupRef.current("ended");
        if (!open && showIncomingActions) void declineRef.current();
      }}
    >
      <DialogContent className="max-w-lg gap-0 overflow-hidden p-0 [&>button]:z-20">
        {/* منطقة العرض: فيديو أو دائرة الصوت */}
        <div className="relative aspect-[3/4] w-full bg-gradient-to-b from-primary/90 to-primary sm:aspect-video">
          {inVideo ? (
            <>
              <video ref={remoteVideoRef} autoPlay playsInline className="absolute inset-0 size-full object-cover" />
              {/* المحلي عائم — معكوس كمرآة (عرف شاشات الاتصال) */}
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                className="absolute bottom-3 end-3 h-1/4 w-1/4 scale-x-[-1] rounded-xl border-2 border-white/70 object-cover shadow-lg"
              />
              {/* اسم الطرف أعلى الفيديو */}
              <div className="absolute inset-x-0 top-0 flex items-center justify-between bg-gradient-to-b from-black/60 to-transparent p-3 text-white">
                <span className="truncate text-sm font-semibold" dir="auto">{peer?.name}</span>
                <span className="flex items-center gap-1.5 text-xs tabular-nums">
                  {phase === "active" && <span className="size-2 rounded-full bg-emerald-400" aria-hidden />}
                  {statusText()}
                </span>
              </div>
            </>
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-white">
              <div className="relative">
                <span
                  className={`absolute -inset-4 rounded-full ${phase === "ringing" || phase === "incoming" ? "animate-ping bg-white/20" : ""}`}
                  aria-hidden
                />
                <span className="flex size-24 items-center justify-center rounded-full bg-white/15 backdrop-blur">
                  {media === "video" ? <Video className="size-11" aria-hidden /> : <Phone className="size-11" aria-hidden />}
                </span>
              </div>
              <span className="max-w-[85%] truncate text-center text-xl font-bold" dir="auto">{peer?.name}</span>
              <span className="flex items-center gap-1.5 text-sm text-white/85" dir="auto">
                {phase === "requesting" || phase === "ringing" ? (
                  <LoaderCircle className="size-3.5 animate-spin" aria-hidden />
                ) : phase === "active" ? (
                  <span className="size-2 rounded-full bg-emerald-400" aria-hidden />
                ) : null}
                {statusText()}
              </span>
              <span className="flex items-center gap-1 rounded-full bg-black/25 px-3 py-1 text-[11px] text-white/90" dir="auto">
                <ShieldCheck className="size-3.5" aria-hidden />
                {t("voice.callP2pNote")}
              </span>
            </div>
          )}
        </div>

        {/* عناصر التحكم */}
        <div className="flex items-center justify-center gap-3 bg-background p-4">
          {showIncomingActions ? (
            <>
              <Button
                size="icon"
                onClick={() => void declineRef.current()}
                className="size-14 rounded-full bg-red-600 text-white hover:bg-red-700"
                aria-label={t("voice.callDecline")}
                title={t("voice.callDecline")}
              >
                <PhoneOff className="size-6" aria-hidden />
              </Button>
              <Button
                size="icon"
                onClick={() => void accept()}
                className="size-14 rounded-full bg-emerald-600 text-white hover:bg-emerald-700"
                aria-label={t("voice.callAccept")}
                title={t("voice.callAccept")}
              >
                <Phone className="size-6" aria-hidden />
              </Button>
            </>
          ) : showControls ? (
            <>
              <Button
                size="icon"
                variant="outline"
                onClick={toggleMute}
                className={`size-12 rounded-full ${muted ? "border-red-500 text-red-600" : ""}`}
                aria-label={muted ? t("voice.callUnmute") : t("voice.callMute")}
                title={muted ? t("voice.callUnmute") : t("voice.callMute")}
              >
                {muted ? <MicOff className="size-5" aria-hidden /> : <Mic className="size-5" aria-hidden />}
              </Button>
              {media === "video" && (
                <Button
                  size="icon"
                  variant="outline"
                  onClick={toggleCam}
                  className={`size-12 rounded-full ${camOff ? "border-red-500 text-red-600" : ""}`}
                  aria-label={camOff ? t("voice.callCamOn") : t("voice.callCamOff")}
                  title={camOff ? t("voice.callCamOn") : t("voice.callCamOff")}
                >
                  {camOff ? <CameraOff className="size-5" aria-hidden /> : <Camera className="size-5" aria-hidden />}
                </Button>
              )}
              <Button
                size="icon"
                onClick={() => void hangupRef.current("ended")}
                className="size-14 rounded-full bg-red-600 text-white hover:bg-red-700"
                aria-label={t("voice.callHangup")}
                title={t("voice.callHangup")}
              >
                <PhoneOff className="size-6" aria-hidden />
              </Button>
            </>
          ) : (
            /* انتهى/فشل: إشارة ختامية واضحة */
            <div className="flex flex-col items-center gap-2 py-1">
              <span className="flex size-12 items-center justify-center rounded-full bg-muted">
                {phase === "ended" ? (
                  <Check className="size-6 text-emerald-600" aria-hidden />
                ) : (
                  <X className="size-6 text-red-600" aria-hidden />
                )}
              </span>
              <span className="text-sm font-semibold" dir="auto">{statusText()}</span>
              {media === "audio" && <AudioLines className="size-4 text-muted-foreground" aria-hidden />}
            </div>
          )}
        </div>

        {/* الصوت البعيد (اتصال صوتي) — عنصر مخفي دائمًا */}
        <audio ref={remoteAudioRef} autoPlay className="hidden" />
      </DialogContent>
    </Dialog>
  );
}
