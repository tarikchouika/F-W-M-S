"use client";

// HRMP — عميل قناة الأحداث الآنية (SSE) — بلاغ المالك 2026-10-24
// «مزامنتها بشكل أني عبر المنصة بشكل مباشر» — نقطة اشتراك واحدة لكل صفحة:
// EventSource مع إعادة اتصال تلقائية و?since=<آخر حدث> فلا يضيع شيء،
// وسقوط آلٍ إلى الاستطلاع (تظل الصفحات تعمل لو رُفضت القناة كليًا).
export type RealtimeEvent =
  | { type: "hello"; since: string; presenceGroups: number }
  | { type: "voice"; items: { id: string; from: string | null; at: string | null; kind: string }[] }
  | { type: "dm"; items: { id: string; from: string | null; at: string | null; kind: string }[] }
  | { type: "notif"; items: { id: string; at: string }[] }
  | { type: "presence"; items: { id: string; from: string; groupId: string | null; at: string }[] }
  | { type: "call"; items: { id: string; callId: string; from: string; kind: string; payload: unknown; at: string }[] };

export type RealtimeHandle = {
  close: () => void;
};

/** فتح قناة الأحداث للمستخدم الحالي — يعيد مقبضًا للإغلاق عند تفكيك الصفحة */
export function openRealtime(onEvent: (e: RealtimeEvent) => void): RealtimeHandle {
  if (typeof window === "undefined" || typeof EventSource === "undefined") {
    return { close: () => undefined }; // بيئة بلا EventSource (اختبارات SSR) — لا شيء
  }
  let source: EventSource | null = null;
  let lastEventAt: string | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;

  function connect() {
    if (stopped) return;
    const url = lastEventAt ? `/api/realtime?since=${encodeURIComponent(lastEventAt)}` : "/api/realtime";
    source = new EventSource(url);

    for (const name of ["hello", "voice", "dm", "notif", "presence", "call"] as const) {
      source.addEventListener(name, (ev) => {
        try {
          const data = JSON.parse((ev as MessageEvent).data) as RealtimeEvent;
          if (name === "hello") lastEventAt = (data as { since: string }).since;
          // تحديث المؤشر بأحدث طابع في الدفعة (دفعات voice/dm/notif/presence)
          const items = (data as { items?: { at?: string | null; at2?: string }[] }).items;
          if (items?.length) {
            const last = items[items.length - 1];
            const stamp = (last as { at?: string | null }).at;
            if (stamp) lastEventAt = stamp;
          }
          onEvent(data);
        } catch {
          /* حدث مشوّه — يُتجاهل */
        }
      });
    }

    source.onerror = () => {
      // EventSource يعيد الاتصال تلقائيًا وفق retry؛ هنا نضمن المؤقت فقط
      source?.close();
      source = null;
      if (!stopped) {
        retryTimer = setTimeout(connect, 3000);
      }
    };
  }

  connect();
  return {
    close() {
      stopped = true;
      if (retryTimer) clearTimeout(retryTimer);
      source?.close();
      source = null;
    },
  };
}
