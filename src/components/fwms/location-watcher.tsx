"use client";

// FWMS — مراقب الموقع الصامت (المرحلة 9): يرسل نبضات موقع العضو أثناء فتح اللوحة
// ليقيم الخادم وجوده داخل/خارج منطقة فريقه ويخطر القائد فورًا.
// مبادئ: بلا واجهة (لا فوضى)، بلا تتبع خلفي (النبضات تتوقف بإغلاق الصفحة — خصوصية)،
// إرسال مرة كل 60ث + فور أول تحديد. فشل الإذن/التحديد يوقف بصمت (سجل وحدة التحكم فقط).
import { useEffect, useRef } from "react";

const SEND_INTERVAL_MS = 60_000;

export function LocationWatcher() {
  const lastSentRef = useRef(0);

  useEffect(() => {
    if (!("geolocation" in navigator)) return;

    let stopped = false;

    async function send(lat: number, lng: number, accuracyM: number | null) {
      const now = Date.now();
      if (now - lastSentRef.current < SEND_INTERVAL_MS - 2500) return; // خنق مزدوج
      lastSentRef.current = now;
      try {
        await fetch("/api/location-pings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lat, lng, accuracyM, source: "watcher" }),
          cache: "no-store",
        });
      } catch {
        /* الشبكة مؤقتًا — جولة watchPosition القادمة تعيد المحاولة */
      }
    }

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        if (stopped) return;
        const accuracy = pos.coords.accuracy ?? null;
        // دقة أسوأ من 300م لا تُرسل (نبضة مضللة عن الوجود داخل/خارج المنطقة)
        if (accuracy != null && accuracy > 300) return;
        void send(pos.coords.latitude, pos.coords.longitude, accuracy);
      },
      () => {
        /* رفض الإذن أو فشل التحديد — يبقى صامتًا: العضو يفعّل المشاركة من متصفحه */
      },
      { enableHighAccuracy: true, maximumAge: 15_000, timeout: 20_000 },
    );

    return () => {
      stopped = true;
      navigator.geolocation.clearWatch(watchId);
    };
  }, []);

  return null;
}
