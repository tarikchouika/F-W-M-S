// HRMP — الجدولة (SPEC §4.1 و§8 — المرحلة 3): قوالب القطاعات، الورديات، التكرار/التناوب، منع التعارض
// zod في الخادم دائمًا (SPEC §6)؛ التخزين UTC والعرض بتوقيت الشركة (AGENTS §1.7)
import { z } from "zod";
import type { PrismaClient } from "@prisma/client";
import { entityIdSchema } from "@/lib/organization";

// ── الثوابت والقيم المسموحة (تُتحقق في طبقة التطبيق — SQLite بلا enums) ──

export const SHIFT_SECTORS = [
  "security",
  "construction",
  "cleaning",
  "gardening",
  "crafts",
  "other",
] as const;
export type ShiftSector = (typeof SHIFT_SECTORS)[number];

export const SHIFT_STATUS = ["scheduled", "cancelled"] as const;
export const RECURRENCE_MODES = ["fixed", "rotating"] as const;

export const MINUTES_PER_DAY = 1440;
export const MAX_WORK_MINUTES = 960; // سقف قبول: 16 ساعة صافية (حد منطقي) — القانوني 10 ساعات يظهر تنبيهًا (SPEC §11.3)
export const WARN_WORK_MINUTES = 600; // فوق 10 ساعات: تنبيه long_day
export const MAX_BREAK_MINUTES = 240;
export const GENERATE_MAX_DAYS = 62; // سقف نطاق توليد الورديات دفعة واحدة

/** الأدوار التي تدير الجدولة بالكامل — co_admin: تعديلات طوارئ اليوم فقط (SPEC §3) */
export function isShiftManager(role: string): boolean {
  return role === "admin" || role === "super_admin";
}

// ── أدوات الوقت: دقائق من منتصف الليل + منطقة زمنية للشركة ──

const nameField = z.string().trim().min(2).max(120);
const optionalText = (max: number) => z.string().trim().max(max).optional().or(z.literal(""));
const minuteField = z.number().int().min(0).max(1439);
const localDateField = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "invalid_date");

/** "22:05" من 1325 دقيقة */
export function minutesToLabel(m: number): string {
  const h = Math.floor(m / 60) % 24;
  const mm = m % 60;
  return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

/** إزاحة منطقة زمنية (بالملي ثانية) عند لحظة معينة — عبر Intl بلا مكتبات خارجية */
function tzOffsetMs(date: Date, timeZone: string): number {
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
  const parts = dtf.formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? "0");
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour") % 24,
    get("minute"),
    get("second")
  );
  return asUtc - date.getTime();
}

/** تحويل تاريخ محلي "YYYY-MM-DD" + دقائق من منتصف الليل في منطقة الشركة إلى لحظة UTC */
export function zonedToUtc(localDate: string, minutes: number, timeZone: string): Date {
  const [y, m, d] = localDate.split("-").map(Number);
  if (!y || !m || !d) throw new Error("invalid_date");
  const naive = new Date(Date.UTC(y, m - 1, d, Math.floor(minutes / 60), minutes % 60));
  // مرّتان لضبط حالات التوقيت الصيفي (المغرب ثابت UTC+1 لكن المنطق عام لكل شركة)
  const pass1 = new Date(naive.getTime() - tzOffsetMs(naive, timeZone));
  return new Date(naive.getTime() - tzOffsetMs(pass1, timeZone));
}

/** تاريخ اليوم "YYYY-MM-DD" في منطقة زمنية معينة */
export function todayInZone(timeZone: string, base = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(base);
}

export function addDaysToLocalDate(localDate: string, days: number): string {
  const [y, m, d] = localDate.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000);
}

/** يوم الأسبوع 0..6 (0 = الأحد) لتاريخ محلي */
export function weekdayOfLocalDate(localDate: string): number {
  const [y, m, d] = localDate.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** دقائق من منتصف الليل بتوقيت الشركة للحظة UTC معينة (عكس zonedToUtc للعرض والتعديل) */
export function minutesInZone(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(date);
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? "0") % 24;
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return h * 60 + m;
}

export type ShiftTimes = {
  startsAt: Date;
  endsAt: Date;
  crossesMidnight: boolean;
  grossMinutes: number;
  workMinutes: number; // صافي العمل بعد الاستراحة
};

/**
 * حساب لحظات UTC لوردية — endTime ≤ start يعني وردية تعبر منتصف الليل
 * (SPEC §11.4: وردية حراسة 22:00–06:00 يجب أن تُخزَّن فترة متصلة)
 */
export function computeShiftTimes(
  localDate: string,
  startTimeMin: number,
  endTimeMin: number,
  breakMinutes: number,
  timeZone: string
): ShiftTimes {
  const crossesMidnight = endTimeMin <= startTimeMin;
  const startsAt = zonedToUtc(localDate, startTimeMin, timeZone);
  const endsAt = crossesMidnight
    ? zonedToUtc(addDaysToLocalDate(localDate, 1), endTimeMin, timeZone)
    : zonedToUtc(localDate, endTimeMin, timeZone);
  const grossMinutes =
    endTimeMin > startTimeMin ? endTimeMin - startTimeMin : MINUTES_PER_DAY - startTimeMin + endTimeMin;
  return {
    startsAt,
    endsAt,
    crossesMidnight,
    grossMinutes,
    workMinutes: Math.max(0, grossMinutes - breakMinutes),
  };
}

/** إجمالي دقائق الوردية (مع عبور منتصف الليل) */
export function grossMinutesOf(startTimeMin: number, endTimeMin: number): number {
  return endTimeMin > startTimeMin ? endTimeMin - startTimeMin : MINUTES_PER_DAY - startTimeMin + endTimeMin;
}

/** مشكلة مدة الوردية إن وُجدت: صفر عمل أو تجاوز السقف المنطقي */
export function shiftDurationProblem(
  startTimeMin: number,
  endTimeMin: number,
  breakMinutes: number
): "invalid_duration" | "too_long" | null {
  const work = grossMinutesOf(startTimeMin, endTimeMin) - breakMinutes;
  if (work <= 0) return "invalid_duration";
  if (work > MAX_WORK_MINUTES) return "too_long";
  return null;
}

// ── تحقق المدخلات (zod) ──

export const templateCreateSchema = z
  .object({
    name: nameField,
    sector: z.enum(SHIFT_SECTORS).default("other"),
    startTimeMin: minuteField,
    endTimeMin: minuteField,
    breakMinutes: z.number().int().min(0).max(MAX_BREAK_MINUTES).default(0),
    notes: optionalText(240),
  })
  .superRefine((v, ctx) => {
    const problem = shiftDurationProblem(v.startTimeMin, v.endTimeMin, v.breakMinutes);
    if (problem) ctx.addIssue({ code: "custom", message: problem, path: ["endTimeMin"] });
  });

export const templateUpdateSchema = z
  .object({
    name: nameField,
    sector: z.enum(SHIFT_SECTORS),
    startTimeMin: minuteField,
    endTimeMin: minuteField,
    breakMinutes: z.number().int().min(0).max(MAX_BREAK_MINUTES),
    notes: optionalText(240),
    status: z.enum(["active", "archived"]),
  })
  .partial();

const shiftFields = z.object({
  workerUserId: entityIdSchema,
  siteId: entityIdSchema,
  templateId: optionalText(64), // "" = وردية بلا قالب
  localDate: localDateField,
  startTimeMin: minuteField,
  endTimeMin: minuteField,
  breakMinutes: z.number().int().min(0).max(MAX_BREAK_MINUTES).default(0),
  notes: optionalText(240),
});

export const shiftCreateSchema = shiftFields.superRefine((v, ctx) => {
  const problem = shiftDurationProblem(v.startTimeMin, v.endTimeMin, v.breakMinutes);
  if (problem) ctx.addIssue({ code: "custom", message: problem, path: ["endTimeMin"] });
});

export const shiftUpdateSchema = shiftFields
  .partial()
  .extend({ status: z.enum(SHIFT_STATUS).optional() });

export const recurrenceCreateSchema = z
  .object({
    workerUserId: entityIdSchema,
    siteId: entityIdSchema,
    mode: z.enum(RECURRENCE_MODES),
    templateId: optionalText(64), // مطلوب للنمط fixed
    rotationTemplateIds: z.array(entityIdSchema).min(2).max(6).optional(), // مطلوب للنمط rotating
    rotationStepDays: z.number().int().min(1).max(28).default(7),
    weekdays: z.array(z.number().int().min(0).max(6)).min(1).max(7).optional(), // مطلوب للنمط fixed
    startsOn: localDateField,
    endsOn: optionalText(10),
  })
  .superRefine((v, ctx) => {
    if (v.mode === "fixed") {
      if (!v.templateId || !v.templateId.trim())
        ctx.addIssue({ code: "custom", message: "template_required", path: ["templateId"] });
      if (!v.weekdays || v.weekdays.length === 0)
        ctx.addIssue({ code: "custom", message: "weekdays_required", path: ["weekdays"] });
    } else if (!v.rotationTemplateIds || v.rotationTemplateIds.length < 2) {
      ctx.addIssue({ code: "custom", message: "rotation_required", path: ["rotationTemplateIds"] });
    }
    if (v.endsOn && v.endsOn.trim() && v.startsOn > v.endsOn.trim())
      ctx.addIssue({ code: "custom", message: "invalid_range", path: ["endsOn"] });
  });

export const recurrenceUpdateSchema = z
  .object({
    startsOn: localDateField,
    endsOn: optionalText(10),
    rotationStepDays: z.number().int().min(1).max(28),
    weekdays: z.array(z.number().int().min(0).max(6)).min(1).max(7),
    status: z.enum(["active", "archived"]),
  })
  .partial();

export const generateSchema = z
  .object({
    from: localDateField,
    to: localDateField,
  })
  .superRefine((v, ctx) => {
    if (v.from > v.to) ctx.addIssue({ code: "custom", message: "invalid_range", path: ["to"] });
    if (daysBetween(v.from, v.to) + 1 > GENERATE_MAX_DAYS)
      ctx.addIssue({ code: "custom", message: "range_too_long", path: ["to"] });
  });

// ── تحليل حقول JSON المخزنة نصيًا ──

export function parseWeekdays(json: string | null): number[] {
  if (!json) return [];
  try {
    const arr: unknown = JSON.parse(json);
    return Array.isArray(arr)
      ? arr.filter((n): n is number => Number.isInteger(n) && n >= 0 && n <= 6)
      : [];
  } catch {
    return [];
  }
}

export function parseRotation(json: string | null): string[] {
  if (!json) return [];
  try {
    const arr: unknown = JSON.parse(json);
    return Array.isArray(arr) ? arr.filter((s): s is string => typeof s === "string") : [];
  } catch {
    return [];
  }
}

// ── منع التعارض (SPEC §4.1): عامل في موقعين بنفس الوقت ممنوع ──

export type ShiftConflictRow = {
  id: string;
  localDate: string;
  startsAt: Date;
  endsAt: Date;
  siteName: string | null;
  templateName: string | null;
};

/** تداخل فترتين مفتوحتين [start, end) — الورديات الملغاة لا تحجب */
export async function findShiftConflicts(
  db: PrismaClient,
  args: {
    companyId: string;
    workerUserId: string;
    startsAt: Date;
    endsAt: Date;
    excludeShiftId?: string;
  }
): Promise<ShiftConflictRow[]> {
  const shifts = await db.shift.findMany({
    where: {
      companyId: args.companyId,
      workerUserId: args.workerUserId,
      status: "scheduled",
      id: args.excludeShiftId ? { not: args.excludeShiftId } : undefined,
      startsAt: { lt: args.endsAt },
      endsAt: { gt: args.startsAt },
    },
    include: {
      site: { select: { name: true } },
      template: { select: { name: true } },
    },
    orderBy: { startsAt: "asc" },
    take: 5,
  });
  return shifts.map((s) => ({
    id: s.id,
    localDate: s.localDate,
    startsAt: s.startsAt,
    endsAt: s.endsAt,
    siteName: s.site?.name ?? null,
    templateName: s.template?.name ?? null,
  }));
}

// ── تنبيهات الجدولة (لا تحجب — SPEC §11.3 و§11.5) ──

export type ShiftWarningCode = "rest_day" | "long_day";

export function shiftWarnings(args: {
  localDate: string;
  workMinutes: number;
  restDay: number;
}): ShiftWarningCode[] {
  const out: ShiftWarningCode[] = [];
  if (weekdayOfLocalDate(args.localDate) === args.restDay) out.push("rest_day");
  if (args.workMinutes > WARN_WORK_MINUTES) out.push("long_day");
  return out;
}

/** يوم الراحة الأسبوعية للشركة (افتراضي 5 = الجمعة — SPEC §11.5) */
export async function companyRestDay(db: PrismaClient, companyId: string): Promise<number> {
  const settings = await db.companySettings.findUnique({
    where: { companyId },
    select: { restDay: true },
  });
  return settings?.restDay ?? 5;
}

// ── توليد مرشّحي الورديات من قاعدة تكرار/تناوب ──

export type TemplateTimes = {
  id: string;
  name: string;
  startTimeMin: number;
  endTimeMin: number;
  breakMinutes: number;
};

export type RecurrencePlan = {
  mode: string;
  templateId: string | null;
  weekdaysJson: string | null;
  rotationJson: string | null;
  rotationStepDays: number;
  startsOn: string;
  endsOn: string | null;
};

export type ShiftCandidate = { localDate: string; template: TemplateTimes };

/**
 * مرشّحو الورديات داخل نطاق التوليد:
 * - fixed: قالب ثابت في أيام الأسبوع المحددة (الورديات المتكررة)
 * - rotating: دورة قوالب مرتبة يتقدم كل rotationStepDays يومًا (الورديات المتناوبة)
 */
export function recurrenceCandidates(
  plan: RecurrencePlan,
  templates: TemplateTimes[],
  from: string,
  to: string
): ShiftCandidate[] {
  const byId = new Map(templates.map((t) => [t.id, t]));
  const effectiveStart = plan.startsOn > from ? plan.startsOn : from;
  const effectiveEnd = plan.endsOn && plan.endsOn < to ? plan.endsOn : to;
  const out: ShiftCandidate[] = [];
  if (effectiveStart > effectiveEnd) return out;

  const weekdays = plan.mode === "fixed" ? parseWeekdays(plan.weekdaysJson) : [];
  const rotation = plan.mode === "rotating" ? parseRotation(plan.rotationJson) : [];
  const stepDays = Math.max(1, plan.rotationStepDays);
  const fixedTemplate =
    plan.mode === "fixed" && plan.templateId ? byId.get(plan.templateId) : undefined;

  let cursor = effectiveStart;
  while (cursor <= effectiveEnd) {
    let template: TemplateTimes | undefined;
    if (plan.mode === "fixed") {
      if (fixedTemplate && weekdays.includes(weekdayOfLocalDate(cursor))) template = fixedTemplate;
    } else if (rotation.length > 0) {
      const idx = Math.floor(daysBetween(plan.startsOn, cursor) / stepDays) % rotation.length;
      const tid = rotation[idx];
      if (tid) template = byId.get(tid);
    }
    if (template) out.push({ localDate: cursor, template });
    cursor = addDaysToLocalDate(cursor, 1);
  }
  return out;
}

/** تداخل داخل دفعة واحدة (مرشّحان لنفس العامل في نفس النطاق) */
export function overlapsInterval(
  intervals: { startsAt: Date; endsAt: Date }[],
  candidate: { startsAt: Date; endsAt: Date }
): boolean {
  return intervals.some((i) => i.startsAt < candidate.endsAt && i.endsAt > candidate.startsAt);
}
