// HRMP — التحقق الجغرافي ومكافحة التلاعب (SPEC §4.2 — المرحلة 4)
// التحقق في الخادم حصرًا (لا يُكتفى بقرار التطبيق) — SQLite بلا PostGIS فالمسافة Haversine كروية
// دوال نقية قابلة للاختبار (SPEC §4.3 قاعدة: منطق الحساب في وحدات نقية)
import { z } from "zod";

export const ATTENDANCE_TYPES = ["check_in", "check_out"] as const;
export const ATTENDANCE_STATUSES = ["verified", "pending_review", "rejected"] as const;

export const MAX_ACCURACY_M = 100; // رفض القراءات بدقة أسوأ من 100 م (SPEC §4.2: «رفض القراءات ذات الدقة السيئة»)
export const MAX_SPEED_KMH = 200; // قفزة مستحيلة بين قراءتين (SPEC §4.2: «سرعة غير منطقية»)
export const JUMP_LOOKBACK_HOURS = 12; // نافذة النظر للقراءة السابقة
export const SHIFT_LINK_WINDOW_MIN = 120; // ربط الحدث بوردية إن كان «الآن» ضمن ± ساعتين منها

export type GeoPoint = { latitude: number; longitude: number };

/** مسافة Haversine بالمتر بين نقطتين — بديل ST_DWithin في SQLite (دقة كافية لأنصاف أقطار 10–5000 م) */
export function haversineDistanceM(a: GeoPoint, b: GeoPoint): number {
  const R = 6371000; // نصف قطر الأرض بالمتر
  const rad = Math.PI / 180;
  const dLat = (b.latitude - a.latitude) * rad;
  const dLon = (b.longitude - a.longitude) * rad;
  const lat1 = a.latitude * rad;
  const lat2 = b.latitude * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** قرار النطاق الجغرافي — يُتخذ في الخادم فقط (SPEC §4.2) */
export function isInsideFence(
  site: { latitude: number; longitude: number; radiusM: number },
  point: GeoPoint
): { inside: boolean; distanceM: number } {
  const distanceM = haversineDistanceM(site, point);
  return { inside: distanceM <= site.radiusM, distanceM: Math.round(distanceM * 10) / 10 };
}

/** سقف الدقة المقبول لموقع: 100 م أو ضعف نصف القطر أيهما أكبر */
export function accuracyLimitFor(radiusM: number): number {
  return Math.max(MAX_ACCURACY_M, radiusM * 2);
}

/// ─── مكافحة التلاعب (SPEC §4.2) ───────────────────────────────

export type DeviceReport = {
  platform?: string | null;
  mockLocation?: boolean | null;
  rooted?: boolean | null;
  emulator?: boolean | null;
};

export type SpoofReason = "poor_accuracy" | "mock_location" | "impossible_jump";

export type SpoofEvaluation = {
  rejected: boolean;
  reason: SpoofReason | null;
  checks: Record<string, unknown>; // يُخزَّن spoofJson للشفافية والمراجعة
};

/** تقييم فحوص مكافحة التلاعب في الخادم — الرفض يُسجَّل كمحاولة (SPEC §4.2) */
export function evaluateAntiSpoofing(input: {
  point: GeoPoint;
  occurredAt: Date;
  accuracyM?: number | null;
  radiusM: number;
  device?: DeviceReport | null;
  previous?: { occurredAt: Date; latitude: number; longitude: number } | null;
}): SpoofEvaluation {
  const checks: Record<string, unknown> = {};

  // 1) دقة سيئة — القراءة غير موثوقة أصلًا
  const limit = accuracyLimitFor(input.radiusM);
  checks.accuracy = {
    reported: input.accuracyM ?? null,
    limit,
    passed: input.accuracyM == null ? null : input.accuracyM <= limit,
  };

  // 2) إشارات الجهاز — mockLocation رفض قاطع؛ rooted/emulator تُسجَّل كمؤشرات خطر فقط
  checks.device = {
    mockLocation: input.device?.mockLocation ?? null,
    rooted: input.device?.rooted ?? null,
    emulator: input.device?.emulator ?? null,
  };

  // 3) قفزة مستحيلة بين قراءتين (سرعة غير منطقية)
  let jump: { speedKmh: number | null; passed: boolean | null } = { speedKmh: null, passed: null };
  if (input.previous) {
    const dtMs = input.occurredAt.getTime() - input.previous.occurredAt.getTime();
    if (dtMs > 0) {
      const distM = haversineDistanceM(
        { latitude: input.previous.latitude, longitude: input.previous.longitude },
        input.point
      );
      const speedKmh = (distM / (dtMs / 1000)) * 3.6;
      const passed = speedKmh <= MAX_SPEED_KMH;
      jump = { speedKmh: Math.round(speedKmh * 10) / 10, passed };
    }
  }
  checks.impossibleJump = jump;

  // القرار بالأولوية: تلاعب صريح ثم دقة ثم قفزة
  if (input.device?.mockLocation === true) {
    return { rejected: true, reason: "mock_location", checks };
  }
  if (input.accuracyM != null && input.accuracyM > limit) {
    return { rejected: true, reason: "poor_accuracy", checks };
  }
  if (jump.passed === false) {
    return { rejected: true, reason: "impossible_jump", checks };
  }
  return { rejected: false, reason: null, checks };
}

/// ─── مخططات zod لمدخلات الحضور (كل مدخل يُتحقق في الخادم — SPEC §6) ──

export const attendanceDeviceSchema = z.object({
  platform: z.string().max(120).nullish(),
  mockLocation: z.boolean().nullish(),
  rooted: z.boolean().nullish(),
  emulator: z.boolean().nullish(),
});

export const attendanceVerificationSchema = z.object({
  qrToken: z.string().min(10).max(600).nullish(),
  face: z
    .object({
      matched: z.boolean(),
      liveness: z.boolean(),
    })
    .nullish(),
});

export const attendanceCheckSchema = z.object({
  siteId: z.string().min(1).max(64),
  shiftId: z.string().min(1).max(64).nullish(),
  coordinates: z.object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    accuracyM: z.number().min(0).max(100000).nullish(),
  }),
  clientTimestamp: z
    .string()
    .refine((v) => !Number.isNaN(Date.parse(v)), "invalid_timestamp")
    .nullish(),
  networkMode: z.enum(["lan", "internet"]).default("internet"),
  device: attendanceDeviceSchema.nullish(),
  verification: attendanceVerificationSchema.nullish(),
});
