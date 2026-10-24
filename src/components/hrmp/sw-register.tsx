"use client";

// HRMP — تسجيل عامل الخدمة عند الإقلاع (المرحلة 9): يفي معيار PWA القابل للتثبيت
// (TWA/أندرويد). العامل نفسه pass-through (لا تخزين مؤقت — لا نسخ قديمة أبدًا).
import { useEffect } from "react";

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* فشل التسجيل لا يُفشل التطبيق — الدفع والتنصيب تحسينيان */
      });
    };
    if (document.readyState === "complete") {
      register();
    } else {
      window.addEventListener("load", register, { once: true });
      return () => window.removeEventListener("load", register);
    }
  }, []);
  return null;
}
