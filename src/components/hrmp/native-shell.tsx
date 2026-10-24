"use client";

// HRMP — جسر الغلاف الأصلي (تطبيق أندرويد) — بلاغ المالك 2026-10-23
// يُركَّب مرة واحدة في جذر المنصة: يعلّم <html> أننا داخل الغلاف (فيُفعَّل تخطيط
// الشاشة الكاملة الذي يحترم شرائط النظام) ويزامن نمط شريط الحالة مع الثيم الحالي
// (أيقونات داكنة على خلفية فاتحة والعكس). في المتصفح العادي isNativeApp=false
// فلا يعمل شيء — الويب بلا أي تغيير في السلوك.
import { useEffect } from "react";
import { isNativeApp, syncStatusBar } from "@/lib/native-bridge";

export function NativeShell() {
  useEffect(() => {
    if (!isNativeApp()) return;
    const root = document.documentElement;
    root.classList.add("hrmp-native");

    const applyTheme = () => void syncStatusBar(root.classList.contains("dark"));
    applyTheme();

    // تبديل الثيم (فاتح/داكن/النظام) يغيّر صنف <html> — نتابعه لتحديث الأيقونات
    const observer = new MutationObserver(applyTheme);
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  return null;
}
