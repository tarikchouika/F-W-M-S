"use client";

// HRMP — خريطة الحضور الحي (المرحلة 9): مناطق الفرق (دوائر) + آخر مواقع الأعضاء
// (علامات ملوّنة بالحالة). يُستورد ديناميكيًا بلا SSR (درس Leaflet + Next — جلسة المرحلة 2)
// ويُغلَّف MapContainer بحاوية dir="ltr" وإلا اختلط تموضع البلاطات في RTL.
// ملاحظة: أنماط Leaflet تُحمّل ساكنًا من globals.css (لا استيراد هنا) — نفس درس
// بلاغ 2026-10-22: استيراد CSS داخل مكوّن dynamic يُحمّل وقت التشغيل فيسبق
// رسمُ الخريطة أنماطَها فتسبح الألواح فوق الصفحة.
import { useEffect } from "react";
import { MapContainer, TileLayer, CircleMarker, Circle, Popup, useMap } from "react-leaflet";
import { useI18n } from "@/i18n/provider";
import { jobTitleLabel } from "@/lib/job-titles";
import type { GroupPresence } from "@/lib/team-presence";

const INSIDE_COLOR = "#16a34a";
const OUTSIDE_COLOR = "#dc2626";
const STALE_COLOR = "#d97706";
const NO_PING_COLOR = "#9ca3af";
const ZONE_COLOR = "#14532d";

const DEFAULT_CENTER: [number, number] = [33.5731, -7.5898]; // الدار البيضاء
const DEFAULT_ZOOM = 11;

function stateColor(state: string): string {
  if (state === "inside") return INSIDE_COLOR;
  if (state === "outside") return OUTSIDE_COLOR;
  if (state === "stale") return STALE_COLOR;
  return NO_PING_COLOR;
}

/** ضبط الإطار على كل الظواهر (مناطق + أعضاء) */
function FitAll({ groups }: { groups: GroupPresence[] }) {
  const map = useMap();
  useEffect(() => {
    const points: [number, number][] = [];
    for (const g of groups) {
      if (g.zone) points.push([g.zone.lat, g.zone.lng]);
      for (const m of g.members) {
        if (m.lastLat != null && m.lastLng != null) points.push([m.lastLat, m.lastLng]);
      }
    }
    if (points.length === 0) return;
    const lats = points.map((p) => p[0]);
    const lngs = points.map((p) => p[1]);
    map.fitBounds(
      [
        [Math.min(...lats), Math.min(...lngs)],
        [Math.max(...lats), Math.max(...lngs)],
      ],
      { padding: [40, 40], maxZoom: 15 },
    );
  }, [groups, map]);
  return null;
}

export function PresenceMap({ groups }: { groups: GroupPresence[] }) {
  const { t, locale } = useI18n();

  const stateLabel = (state: string) =>
    state === "inside"
      ? t("presence.stateInside")
      : state === "outside"
        ? t("presence.stateOutside")
        : state === "stale"
          ? t("presence.stateStale")
          : t("presence.stateNoPing");

  return (
    // isolate: سياق تراكب مستقل يحبس ألواح الخريطة مهما حدث (تحصين بلاغ 2026-10-22)
    <div dir="ltr" className="relative isolate h-[320px] w-full overflow-hidden rounded-xl border border-border/60 sm:h-[420px]">
      <MapContainer center={DEFAULT_CENTER} zoom={DEFAULT_ZOOM} scrollWheelZoom className="size-full">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FitAll groups={groups} />
        {groups.map((g) =>
          g.zone ? (
            <Circle
              key={`zone-${g.id}`}
              center={[g.zone.lat, g.zone.lng]}
              radius={g.zone.radiusM}
              pathOptions={{ color: ZONE_COLOR, weight: 2, fillColor: ZONE_COLOR, fillOpacity: 0.06 }}
            >
              <Popup>
                <strong>{g.name}</strong>
                {g.kind === "reserve" ? ` · ${t("presence.reserveTeam")}` : ""}
                <br />
                {t("presence.zoneRadius")}: {g.zone.radiusM} {t("notifications.presenceMeters")}
                {g.zone.source === "site" ? ` · ${t("presence.zoneFromSite")}` : ""}
              </Popup>
            </Circle>
          ) : null,
        )}
        {groups.flatMap((g) =>
          g.members
            .filter((m) => m.lastLat != null && m.lastLng != null)
            .map((m) => (
              <CircleMarker
                key={`m-${g.id}-${m.userId}`}
                center={[m.lastLat as number, m.lastLng as number]}
                radius={7}
                pathOptions={{
                  color: "#ffffff",
                  weight: 2,
                  fillColor: stateColor(m.state),
                  fillOpacity: 1,
                }}
              >
                <Popup>
                  <strong>{m.fullName}</strong>
                  <br />
                  {jobTitleLabel(m.jobTitleKey, locale) ?? t("presence.noJobTitle")}
                  <br />
                  {stateLabel(m.state)}
                  {m.distanceM != null ? ` · ~${m.distanceM} ${t("notifications.presenceMeters")}` : ""}
                  <br />
                  {t("presence.team")}: {g.name}
                </Popup>
              </CircleMarker>
            )),
        )}
      </MapContainer>
    </div>
  );
}
