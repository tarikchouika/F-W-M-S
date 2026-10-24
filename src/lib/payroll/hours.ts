// HRMP — محرك الساعات (SPEC §4.3 و§11.3/§11.4 — المرحلة 6أ): دوال نقية بلا قاعدة بيانات
// التصنيف بدقة الدقيقة (SPEC: «دقائق فعلية من الدخول للخروج»):
//   - كل دقيقة تحمل يومها المحلي الفعلي (وردية 22:00–06:00 تُنسب دقائق ما بعد منتصف الليل لليوم التالي)
//   - دقيقة على يوم راحة/عطلة = إضافي راحة كاملًا (المادة 201: نصف النهار +50% وليل +100%)
//   - قرار موثَّق (بانتظار تأكيد محاسب): دقائق الراحة/العطلة لا تستهلك عتبة 44 ساعة الأسبوعية،
//     ودقائق الأيام العادية فوق (44س − ما استهلكته العادية) هي الإضافي العادي — يمنع الدفع المزدوج.
//   - الأسبوع = إثنين→أحد (ISO) بتوقيت الشركة
import type { DayBreakdownRow, HoursContext, OvertimeBuckets, WorkSlice, WorkedTime } from "./types";

const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;
const OFFSET_BUCKET_MS = 15 * MINUTE_MS; // إزاحة المنطقة الزمنية تُخزَّن لكل ربع ساعة (كاش)

/** إزاحة المنطقة الزمنية (ms) عند لحظة UTC — بكاش ربع-ساعي يتعامل مع التوقيت الصيفي */
function tzOffsetMsAt(tMs: number, timeZone: string, cache: Map<number, number>): number {
  const bucket = Math.floor(tMs / OFFSET_BUCKET_MS);
  const hit = cache.get(bucket);
  if (hit !== undefined) return hit;
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = dtf.formatToParts(new Date(tMs));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? "0");
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour") % 24,
    get("minute"),
    get("second")
  );
  const offset = asUtc - Math.floor(tMs / 1000) * 1000;
  cache.set(bucket, offset);
  return offset;
}

/** الدقيقة المحلية (0..1439) والتاريخ المحلي "YYYY-MM-DD" لكل لحظة UTC */
function localParts(tMs: number, timeZone: string, cache: Map<number, number>): { date: string; tod: number } {
  const offset = tzOffsetMsAt(tMs, timeZone, cache);
  const localMs = tMs + offset;
  const date = new Date(localMs);
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  const tod = Math.floor((localMs % DAY_MS) / MINUTE_MS);
  return { date: `${y}-${m}-${d}`, tod };
}

/** مفتاح أسبوع ISO (إثنين الأسبوع) لتاريخ محلي */
function isoWeekKey(localDate: string): string {
  const [y, m, d] = localDate.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const wd = dt.getUTCDay(); // 0=الأحد
  const back = (wd === 0 ? 6 : wd - 1);
  dt.setUTCDate(dt.getUTCDate() - back);
  return dt.toISOString().slice(0, 10);
}

/** يوم الأسبوع (0=الأحد) لتاريخ محلي */
function weekdayOf(localDate: string): number {
  const [y, m, d] = localDate.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** دمج الشرائح المتداخلة (منع العدّ المزدوج لو تداخل حضوران) مع التقريب للدقيقة الكاملة */
export function mergeSlices(slices: WorkSlice[]): WorkSlice[] {
  const clean = slices
    .map((s) => ({ startMs: Math.ceil(s.startMs / MINUTE_MS) * MINUTE_MS, endMs: Math.floor(s.endMs / MINUTE_MS) * MINUTE_MS }))
    .filter((s) => s.endMs > s.startMs)
    .sort((a, b) => a.startMs - b.startMs);
  const merged: WorkSlice[] = [];
  for (const s of clean) {
    const last = merged[merged.length - 1];
    if (last && s.startMs <= last.endMs) {
      last.endMs = Math.max(last.endMs, s.endMs);
    } else {
      merged.push({ ...s });
    }
  }
  return merged;
}

function sumMinutes(slices: WorkSlice[]): number {
  return slices.reduce((acc, s) => acc + (s.endMs - s.startMs) / MINUTE_MS, 0);
}

function emptyOvertime(): OvertimeBuckets {
  return { dayNormal: 0, nightNormal: 0, dayRest: 0, nightRest: 0 };
}

/**
 * حساب وقت العمل: الشرائح الفعلية (worked) + المجدول (scheduled، صافي الاستراحة) + السياق.
 * worked = شرائح الحضور الموثق إن وُجدت، وإلا شرائح المجدول (شركة بلا نظام حضور لهذا العامل).
 */
export function computeWorkedTime(
  workedSlicesRaw: WorkSlice[],
  scheduledSlicesRaw: WorkSlice[],
  scheduledBreakMinutes: number,
  ctx: HoursContext
): WorkedTime {
  const workedSlices = mergeSlices(workedSlicesRaw);
  const scheduledSlices = mergeSlices(scheduledSlicesRaw);
  const offsetCache = new Map<number, number>();
  const holidays = new Set(ctx.holidays);

  const overtime = emptyOvertime();
  let baseMinutes = 0;
  const weeklyNormal = new Map<string, number>(); // أسبوع ISO → دقائق عادية مستهلكة للعتبة
  const perDay = new Map<string, DayBreakdownRow>();
  const workedDays = new Set<string>();

  const isNight = (tod: number): boolean =>
    ctx.nightStartMin > ctx.nightEndMin
      ? tod >= ctx.nightStartMin || tod < ctx.nightEndMin // 21:00→06:00 عبر منتصف الليل
      : tod >= ctx.nightStartMin && tod < ctx.nightEndMin;

  for (const slice of workedSlices) {
    for (let t = slice.startMs; t < slice.endMs; t += MINUTE_MS) {
      const { date, tod } = localParts(t, ctx.timezone, offsetCache);
      const wd = weekdayOf(date);
      const isRest = wd === ctx.restDay || holidays.has(date);
      const dayKind: DayBreakdownRow["dayKind"] = holidays.has(date) ? "holiday" : isRest ? "rest" : "normal";
      const night = isNight(tod);

      let isOt = false;
      if (isRest) {
        // عمل يوم الراحة/العطلة = إضافي كاملًا (المادة 201) — لا يستهلك عتبة الأسبوع
        if (night) overtime.nightRest += 1;
        else overtime.dayRest += 1;
        isOt = true;
      } else {
        const week = isoWeekKey(date);
        const used = (weeklyNormal.get(week) ?? 0) + 1;
        weeklyNormal.set(week, used);
        if (used > ctx.weeklyThresholdMin) {
          // فوق 44 ساعة أسبوعيًا (أو مدة المؤسسة الأقل) = إضافي عادي
          if (night) overtime.nightNormal += 1;
          else overtime.dayNormal += 1;
          isOt = true;
        } else {
          baseMinutes += 1;
        }
      }

      workedDays.add(date);
      const row = perDay.get(date) ?? { date, minutes: 0, dayKind, otMinutes: 0 };
      row.minutes += 1;
      if (isOt) row.otMinutes += 1;
      if (row.dayKind === "normal" && dayKind !== "normal") row.dayKind = dayKind;
      perDay.set(date, row);
    }
  }

  const otTotal = overtime.dayNormal + overtime.nightNormal + overtime.dayRest + overtime.nightRest;
  // صافي المجدول = مجموع الشرائح الخام − الاستراحات (الورديات لا تتعارض — منع التعارض من المرحلة 3)
  const scheduledMinutes = Math.max(0, Math.round(sumMinutes(scheduledSlicesRaw) - scheduledBreakMinutes));
  const attendedMinutes = Math.round(sumMinutes(workedSlices)); // الاتحاد المدمج (بلا تداخل مزدوج)

  return {
    baseMinutes,
    overtime,
    totalMinutes: baseMinutes + otTotal,
    workedDays: [...workedDays].sort(),
    breakMinutes: scheduledBreakMinutes,
    scheduledMinutes,
    attendedMinutes,
    attendanceBased: workedSlicesRaw.length > 0,
    daily: [...perDay.values()].sort((a, b) => a.date.localeCompare(b.date)),
  };
}
