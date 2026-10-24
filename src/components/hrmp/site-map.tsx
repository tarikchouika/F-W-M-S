"use client";

// HRMP — خريطة المواقع (Leaflet + react-leaflet): علامة مركز + دائرة نطاق التحقق لكل موقع (SPEC §4.2)
// تُستورد ديناميكيًا بلا SSR من مدير المواقع (Leaflet يحتاج window)
// ملاحظة: أنماط Leaflet تُحمّل ساكنًا من globals.css (لا استيراد هنا) — درس بلاغ
// 2026-10-22: استيراد CSS داخل مكوّن dynamic يُحمّل وقت التشغيل <link> بعد
// الجافاسكربت، فتُرسم الخريطة أولا بلا أنماط وتسبح ألواحها فوق الشريط الجانبي.
import { useEffect } from "react";
import {
  MapContainer,
  TileLayer,
  CircleMarker,
  Circle,
  Popup,
  useMap,
  useMapEvents,
} from "react-leaflet";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";

export type MapSite = {
  id: string;
  name: string;
  address?: string | null;
  latitude: number;
  longitude: number;
  radiusM: number;
  status: string;
  branchName?: string | null;
  projectName?: string | null;
};

export type MapPicker = {
  latitude: number | null;
  longitude: number | null;
  radiusM: number;
  onPick: (lat: number, lng: number) => void;
};

// ألوان النطاق: أخضر HRMP للنشط، رمادي للمؤرشف، كهرماني لوضع الانتقاء
const ACTIVE_COLOR = "#16a34a";
const ARCHIVED_COLOR = "#9ca3af";
const PICK_COLOR = "#d97706";

const DEFAULT_CENTER: [number, number] = [33.5731, -7.5898]; // الدار البيضاء — الشركة التجريبية
const DEFAULT_ZOOM = 11;

/** التقاط نقرات الخريطة في وضع الانتقاء */
function ClickPicker({ picker }: { picker?: MapPicker }) {
  useMapEvents({
    click(e) {
      picker?.onPick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

/** ضبط الإطار على المواقع المعروضة عند تغيّرها */
function FitSites({ sites }: { sites: MapSite[] }) {
  const map = useMap();
  useEffect(() => {
    if (sites.length === 0) return;
    const lats = sites.map((s) => s.latitude);
    const lngs = sites.map((s) => s.longitude);
    map.fitBounds(
      [
        [Math.min(...lats), Math.min(...lngs)],
        [Math.max(...lats), Math.max(...lngs)],
      ],
      { padding: [36, 36], maxZoom: 15 }
    );
  }, [map, sites]);
  return null;
}

/** التمركز على الموقع المحدد من القائمة */
function FocusSelected({ sites, selectedId }: { sites: MapSite[]; selectedId?: string | null }) {
  const map = useMap();
  useEffect(() => {
    if (!selectedId) return;
    const site = sites.find((s) => s.id === selectedId);
    if (site) map.setView([site.latitude, site.longitude], Math.max(map.getZoom(), 15));
  }, [map, sites, selectedId]);
  return null;
}

/** متابعة موضع الانتقاء (حوار الإنشاء/التعديل) */
function FollowPicker({ picker }: { picker?: MapPicker }) {
  const map = useMap();
  const { latitude, longitude } = picker ?? {};
  useEffect(() => {
    // != null تغطي null وundefined معًا (لا متابعة بلا انتقاء)
    if (picker && latitude != null && longitude != null) {
      map.setView([latitude, longitude], Math.max(map.getZoom(), 15));
    }
  }, [map, picker, latitude, longitude]);
  return null;
}

export function SiteMap({
  sites,
  selectedId,
  onSelect,
  picker,
  className,
  center = DEFAULT_CENTER,
  zoom = DEFAULT_ZOOM,
}: {
  sites: MapSite[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  picker?: MapPicker;
  className?: string;
  center?: [number, number];
  zoom?: number;
}) {
  const { t, locale } = useI18n();

  return (
    // Leaflet يتوقع حاوية LTR — الغلاف يعزل الخريطة عن اتجاه الصفحة العربية.
    // isolate (سياق تراكب مستقل): حتى لو فشلت أنماط الخريطة كليًا يومًا ما، تبقى
    // ألواحها (z-index 400-800) حبيسة سياق هذا الغلاف ولا تعلو الشريط الجانبي
    // (الذي صار relative z-10) — تحصين دفاعي بطبقتين (بلاغ المالك 2026-10-22).
    <div
      dir="ltr"
      className={cn("relative isolate overflow-hidden rounded-xl border border-border bg-muted/30", className)}
      aria-label={t("map.title")}
    >
      <MapContainer center={center} zoom={zoom} scrollWheelZoom className="h-full w-full">
        {/* إسناد بلاطات OSM — إسناد قانوني ثابت غير قابل للترجمة */}
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {sites.map((site) => {
          const active = site.status === "active";
          const color = active ? ACTIVE_COLOR : ARCHIVED_COLOR;
          return (
            <CircleMarker
              key={site.id}
              center={[site.latitude, site.longitude]}
              radius={7}
              pathOptions={{
                color,
                fillColor: color,
                fillOpacity: 0.9,
                weight: 2,
                className: site.id === selectedId ? "hrmp-map-selected" : undefined,
              }}
              eventHandlers={{ click: () => onSelect?.(site.id) }}
            >
              <Popup>
                <div className="min-w-44 space-y-1 text-sm">
                  <p className="font-bold">{site.name}</p>
                  {site.address && <p className="text-muted-foreground">{site.address}</p>}
                  <p>
                    {t("map.radiusLabel")}: <span dir="ltr">{site.radiusM} m</span>
                  </p>
                  {(site.branchName || site.projectName) && (
                    <p className="text-muted-foreground">
                      {[site.branchName, site.projectName].filter(Boolean).join(" · ")}
                    </p>
                  )}
                  <p className="font-medium">
                    {active ? t("map.activeSite") : t("map.archivedSite")}
                  </p>
                </div>
              </Popup>
            </CircleMarker>
          );
        })}

        {/* دوائر نطاق التحقق الفعلية بالمتر */}
        {sites.map((site) => {
          const active = site.status === "active";
          const color = active ? ACTIVE_COLOR : ARCHIVED_COLOR;
          return (
            <Circle
              key={`${site.id}-zone`}
              center={[site.latitude, site.longitude]}
              radius={site.radiusM}
              pathOptions={{
                color,
                fillColor: color,
                fillOpacity: 0.12,
                weight: 1.5,
                dashArray: site.id === selectedId ? undefined : "4 4",
              }}
              eventHandlers={{ click: () => onSelect?.(site.id) }}
            />
          );
        })}

        {/* معاينة موضع الانتقاء ونطاقه (حوار الإنشاء/التعديل) */}
        {picker && picker.latitude !== null && picker.longitude !== null && (
          <>
            <CircleMarker
              center={[picker.latitude, picker.longitude]}
              radius={8}
              pathOptions={{ color: PICK_COLOR, fillColor: PICK_COLOR, fillOpacity: 0.95, weight: 2 }}
            />
            <Circle
              center={[picker.latitude, picker.longitude]}
              radius={picker.radiusM}
              pathOptions={{ color: PICK_COLOR, fillColor: PICK_COLOR, fillOpacity: 0.15, weight: 2 }}
            />
          </>
        )}

        <ClickPicker picker={picker} />
        <FitSites sites={sites} />
        <FocusSelected sites={sites} selectedId={selectedId} />
        <FollowPicker picker={picker} />
      </MapContainer>

      {/* وسيلة إيضاح صغيرة */}
      {sites.length > 0 && (
        <div className="pointer-events-none absolute bottom-2 start-2 z-[500] flex flex-col gap-1 rounded-lg border border-border bg-background/90 px-2.5 py-2 text-[11px] font-medium shadow-sm backdrop-blur">
          <span className="flex items-center gap-1.5">
            <span className="inline-block size-2.5 rounded-full" style={{ backgroundColor: ACTIVE_COLOR }} />
            {t("map.activeSite")}
          </span>
          {sites.some((s) => s.status !== "active") && (
            <span className="flex items-center gap-1.5">
              <span className="inline-block size-2.5 rounded-full" style={{ backgroundColor: ARCHIVED_COLOR }} />
              {t("map.archivedSite")}
            </span>
          )}
          <span className="sr-only">{locale}</span>
        </div>
      )}
    </div>
  );
}
