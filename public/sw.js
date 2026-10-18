// FWMS — عامل خدمة إشعارات Web Push (المرحلة 5 — SPEC §4.1 و§8)
// معيار مفتوح (RFC 8030 + VAPID) بلا خدمة سحابية مغلقة (SPEC §7) — يعمل عبر HTTPS العام فقط
// التسجيل من notification-bell.tsx؛ الإرسال من src/lib/notifications.ts (dispatchWebPush)

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// معالج fetch عابر (pass-through) — مطلوب لمعيار PWA القابل للتثبيت (TWA/أندرويد،
// المرحلة 9) بلا أي تخزين مؤقت: الصفحات دائمًا من الشبكة (لا نسخ قديمة أبدًا —
// علاج جذر لبلاغ «نسخة قديمة غير مكتملة» 2026-10-18).
self.addEventListener("fetch", (event) => {
  event.respondWith(fetch(event.request));
});

self.addEventListener("push", (event) => {
  let payload = null;
  try {
    payload = event.data ? event.data.json() : null;
  } catch {
    payload = null;
  }

  const data = payload ?? {};
  const p = data.payload ?? {};
  // نص عربي احتياطي — المتصفح لا يملك قواميس i18n؛ النص الأساسي يُبنى في التطبيق نفسه
  let title = "FWMS";
  let body = "لديك إشعار جديد في FWMS";
  if (data.type === "shift_replacement_assigned") {
    title = "FWMS — وردية تغطية";
    body = p.siteName
      ? `أُسندت إليك وردية تغطية في «${p.siteName}» ${p.localDate ?? ""} ${p.startLabel ?? ""}–${p.endLabel ?? ""}`
      : body;
  } else if (data.type === "team_member_left_zone") {
    title = "FWMS — مغادرة منطقة الفريق";
    body = p.memberName
      ? `غادر «${p.memberName}» منطقة الفريق «${p.groupName ?? ""}» (على بعد ~${Math.round(p.distanceM ?? 0)} م من مركزها)`
      : body;
  } else if (data.type === "team_member_entered_zone") {
    title = "FWMS — عودة إلى منطقة الفريق";
    body = p.memberName ? `عاد «${p.memberName}» إلى منطقة الفريق «${p.groupName ?? ""}»` : body;
  }

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      tag: data.type ?? "fwms", // دمج المتكرر من نفس النوع
      data: { url: data.type === "team_member_left_zone" || data.type === "team_member_entered_zone" ? "/dashboard/team-presence" : "/dashboard/my-schedule" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/dashboard";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) {
          client.focus();
          if ("navigate" in client) return client.navigate(url);
          return undefined;
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
