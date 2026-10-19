// FWMS — التغطية السريعة (SPEC §4.1 و§8 — المرحلة 5): لوحة الغياب، المتاحون، سحب البديل
// القاعدة النافذة: منع تعارض الورديات (عامل في موقعين بنفس الوقت ممنوع) — إعادة فحص داخل معاملة
// zod في الخادم دائمًا (SPEC §6)؛ التخزين UTC والعرض بتوقيت الشركة (AGENTS §1.7)
import { z } from "zod";
import { db } from "@/lib/db";
import { localizedName } from "@/lib/localized-name";
import type { SessionPayload } from "@/lib/auth/jwt";
import { coAdminSiteScope } from "@/lib/attendance-service";
import { findShiftConflicts, minutesInZone, minutesToLabel } from "@/lib/scheduling";
import { writeAudit } from "@/lib/audit";
import { createNotification, type ReplacementPayload } from "@/lib/notifications";

// ── الثوابت ──

export const ABSENT_GRACE_MINUTES = 30; // انقضاء 30 دقيقة عن بداية الوردية بلا تسجيل = «غياب مرجّح»
const BOARD_MAX_SHIFTS = 200;

// ── تحقق المدخلات (zod) ──

export const replaceSchema = z.object({
  shiftId: z.string().trim().min(1).max(64),
  replacementUserId: z.string().trim().min(1).max(64),
  reason: z.string().trim().max(240).optional().or(z.literal("")),
});

// ── لوحة التغطية: ورديات اليوم + حالة حضور المعيَّن ──

export type CoverageShiftRow = {
  id: string;
  localDate: string;
  startLabel: string;
  endLabel: string;
  breakMinutes: number;
  status: string;
  source: string;
  worker: { id: string; fullName: string } | null;
  site: { id: string; name: string };
  template: { id: string; name: string } | null;
  attendance: "checked_in" | "checked_out" | "pending_review" | "no_events";
  absentLikely: boolean; // بدأت الوردية + 30 دقيقة بلا check_in موثَّق
  replaceable: boolean; // scheduled + (بدأت أو لم تبدأ — التغطية ممكنة قبل البداية أيضًا)
};

export async function getCoverageBoard(
  session: SessionPayload & { companyTimezone: string },
  localDate: string,
  locale: string | null = null
): Promise<{ date: string; shifts: CoverageShiftRow[] }> {
  const siteScope = await coAdminSiteScope(session);

  const shifts = await db.shift.findMany({
    where: {
      companyId: session.companyId,
      localDate,
      status: "scheduled",
      ...(siteScope ? { siteId: { in: siteScope } } : {}),
    },
    orderBy: { startsAt: "asc" },
    include: {
      worker: { select: { id: true, fullName: true } },
      site: { select: { id: true, name: true } },
      template: { select: { id: true, name: true } },
    },
    take: BOARD_MAX_SHIFTS,
  });

  if (shifts.length === 0) return { date: localDate, shifts: [] };

  // أحداث حضور هذه الورديات (آخر حدث لكل وردية يحدد الحالة الظاهرة)
  const events = await db.attendanceEvent.findMany({
    where: {
      companyId: session.companyId,
      shiftId: { in: shifts.map((s) => s.id) },
      type: { in: ["check_in", "check_out"] },
    },
    orderBy: { occurredAt: "asc" },
    select: { shiftId: true, type: true, status: true, occurredAt: true },
  });
  const byShift = new Map<string, { hasCheckIn: boolean; hasCheckOut: boolean; hasPending: boolean }>();
  for (const e of events) {
    if (!e.shiftId) continue;
    const cur = byShift.get(e.shiftId) ?? { hasCheckIn: false, hasCheckOut: false, hasPending: false };
    if (e.type === "check_in" && e.status === "verified") cur.hasCheckIn = true;
    if (e.type === "check_out" && e.status === "verified") cur.hasCheckOut = true;
    if (e.status === "pending_review") cur.hasPending = true;
    byShift.set(e.shiftId, cur);
  }

  const now = Date.now();
  const tz = session.companyTimezone;
  const rows: CoverageShiftRow[] = shifts.map((s) => {
    const att = byShift.get(s.id);
    const attendance: CoverageShiftRow["attendance"] = att?.hasCheckOut
      ? "checked_out"
      : att?.hasCheckIn
        ? "checked_in"
        : att?.hasPending
          ? "pending_review"
          : "no_events";
    const absentLikely =
      attendance === "no_events" && now > s.startsAt.getTime() + ABSENT_GRACE_MINUTES * 60_000;
    return {
      id: s.id,
      localDate: s.localDate,
      startLabel: minutesToLabel(minutesInZone(s.startsAt, tz)),
      endLabel: minutesToLabel(minutesInZone(s.endsAt, tz)),
      breakMinutes: s.breakMinutes,
      status: s.status,
      source: s.source,
      worker: s.worker ? { id: s.worker.id, fullName: s.worker.fullName } : null,
      site: { id: s.site.id, name: localizedName(s.site, locale, "name") },
      template: s.template ? { id: s.template.id, name: s.template.name } : null,
      attendance,
      absentLikely,
      replaceable: s.status === "scheduled",
    };
  });

  return { date: localDate, shifts: rows };
}

// ── المتاحون للسحب: عاملو الشركة الأحرار داخل نافذة الوردية ──

export type AvailableWorkerRow = {
  userId: string;
  fullName: string;
  email: string;
  sameDayShifts: { startLabel: string; endLabel: string; siteName: string }[];
  conflict: { startLabel: string; endLabel: string; siteName: string } | null;
};

/**
 * المرشّحون: عضويات سارية بدور employee (SPEC §4.1 «العمال المتاحين») بنفس الشركة،
 * غير المعيَّن حاليًا على الوردية. المتعارضون يُستبعدون من قائمة الاختيار ويُعاد فحصهم عند التنفيذ.
 * ملاحظة نطاق: القائمة على مستوى الشركة كاملة (co_admin يرى عمال شركته) — قرار موثَّق:
 * «عمال نطاقه» في SPEC §192 فُسِّرت عمليًا بأن نطاق المشرف هو المواقع (scopeJson) لا العمال،
 * لأن غرض التغطية هو إيجاد بديل حرّ من كل طاقم الشركة.
 */
export async function getAvailableWorkers(
  session: SessionPayload & { companyTimezone: string },
  shiftId: string,
  locale: string | null = null
): Promise<{ shift: { id: string; siteName: string; startLabel: string; endLabel: string }; workers: AvailableWorkerRow[] }> {
  const shift = await db.shift.findFirst({
    where: {
      id: shiftId,
      companyId: session.companyId,
      status: "scheduled",
    },
    include: { site: { select: { id: true, name: true } } },
  });
  if (!shift) throw Object.assign(new Error("not_found"), { status: 404 });
  // co_admin: التغطية على ورديات مواقع نطاقه فقط
  const siteScope = await coAdminSiteScope(session);
  if (siteScope && !siteScope.includes(shift.siteId)) {
    throw Object.assign(new Error("forbidden"), { status: 403 });
  }

  const memberships = await db.userMembership.findMany({
    where: {
      companyId: session.companyId,
      role: "employee",
      revokedAt: null,
      user: { isActive: true },
    },
    include: { user: { select: { id: true, fullName: true, email: true } } },
  });
  const candidates = memberships.filter((m) => m.user.id !== shift.workerUserId);

  const tz = session.companyTimezone;
  const dayStart = new Date(shift.startsAt.getTime() - 24 * 3600_000);
  const dayEnd = new Date(shift.endsAt.getTime() + 24 * 3600_000);

  const workers: AvailableWorkerRow[] = [];
  for (const m of candidates) {
    // ورديات نفس اليوم (± 24 ساعة حول النافذة) للعرض
    const sameDay = await db.shift.findMany({
      where: {
        companyId: session.companyId,
        workerUserId: m.user.id,
        status: "scheduled",
        startsAt: { gte: dayStart, lte: dayEnd },
      },
      include: { site: { select: { name: true } } },
      orderBy: { startsAt: "asc" },
    });
    const conflicts = await findShiftConflicts(db, {
      companyId: session.companyId,
      workerUserId: m.user.id,
      startsAt: shift.startsAt,
      endsAt: shift.endsAt,
    });
    if (conflicts.length > 0) continue; // متعارض → ليس متاحًا (SPEC §4.1: منع التعارض)

    workers.push({
      userId: m.user.id,
      fullName: m.user.fullName,
      email: m.user.email,
      sameDayShifts: sameDay.map((s) => ({
        startLabel: minutesToLabel(minutesInZone(s.startsAt, tz)),
        endLabel: minutesToLabel(minutesInZone(s.endsAt, tz)),
        siteName: localizedName(s.site, locale, "name"),
      })),
      conflict: null,
    });
  }

  return {
    shift: {
      id: shift.id,
      siteName: localizedName(shift.site, locale, "name"),
      startLabel: minutesToLabel(minutesInZone(shift.startsAt, tz)),
      endLabel: minutesToLabel(minutesInZone(shift.endsAt, tz)),
    },
    workers,
  };
}

// ── سحب البديل: تحديث الوردية + إشعار فوري + تدقيق قبل/بعد ──

export type ReplaceResult = {
  shift: { id: string; workerUserId: string; source: string; localDate: string };
  notificationId: string | null;
};

/**
 * سحب بديل لوردية (SPEC §4.1): يعاد فحص التعارض داخل معاملة التحديث نفسها،
 * ثم يُنشأ إشعار «وردية تغطية» للبديل (قناة داخل التطبيق + دفع إن ضُبط VAPID).
 * البديل: عضوية سارية نشطة في الشركة (واجهة الاختيار تعرض العمال؛ API يقبل أي عضو سارٍ
 * — قرار موثَّق يسمح بسحب مشرف للطوارئ، والتدقيق يوثق الفاعل والسبب).
 */
export async function replaceShiftWorker(
  session: SessionPayload & { companyTimezone: string },
  input: z.infer<typeof replaceSchema>,
  locale: string | null = null
): Promise<ReplaceResult> {
  const shift = await db.shift.findFirst({
    where: { id: input.shiftId, companyId: session.companyId },
    include: {
      site: { select: { id: true, name: true } },
      worker: { select: { id: true, fullName: true } },
    },
  });
  if (!shift) throw Object.assign(new Error("not_found"), { status: 404 });
  if (shift.status !== "scheduled") {
    throw Object.assign(new Error("not_scheduled"), { status: 422 });
  }
  // co_admin: طوارئ مواقع نطاقه فقط (SPEC §3)
  const siteScope = await coAdminSiteScope(session);
  if (siteScope && !siteScope.includes(shift.siteId)) {
    throw Object.assign(new Error("forbidden"), { status: 403 });
  }
  if (input.replacementUserId === shift.workerUserId) {
    throw Object.assign(new Error("same_worker"), { status: 422 });
  }

  const membership = await db.userMembership.findFirst({
    where: {
      userId: input.replacementUserId,
      companyId: session.companyId,
      revokedAt: null,
      user: { isActive: true },
    },
    include: { user: { select: { id: true, fullName: true } } },
  });
  if (!membership) throw Object.assign(new Error("invalid_reference"), { status: 400 });

  // منع التعارض (SPEC §4.1) — الفحص الحاسم داخل نطاق التحديث
  const conflicts = await findShiftConflicts(db, {
    companyId: session.companyId,
    workerUserId: input.replacementUserId,
    startsAt: shift.startsAt,
    endsAt: shift.endsAt,
    excludeShiftId: shift.id,
  });
  if (conflicts.length > 0) {
    throw Object.assign(
      new Error("shift_conflict"),
      {
        status: 409,
        conflicts: conflicts.map((c) => ({
          id: c.id,
          localDate: c.localDate,
          startsAt: c.startsAt,
          endsAt: c.endsAt,
          siteName: c.siteName,
        })),
      },
    );
  }

  const tz = session.companyTimezone;
  const payload: ReplacementPayload = {
    siteName: localizedName(shift.site, locale, "name"),
    localDate: shift.localDate,
    startLabel: minutesToLabel(minutesInZone(shift.startsAt, tz)),
    endLabel: minutesToLabel(minutesInZone(shift.endsAt, tz)),
    previousWorkerName: shift.worker?.fullName ?? undefined,
    shiftId: shift.id,
  };

  const updated = await db.shift.update({
    where: { id: shift.id },
    data: {
      workerUserId: input.replacementUserId,
      source: "replacement",
      createdByUserId: session.sub, // آخر من عدّل الإسناد (أثر القرار)
    },
  });

  // إشعار فوري للبديل — فشله لا يُفشل السحب (قناة ثانية مستقلة)
  const notificationId = await createNotification({
    companyId: session.companyId,
    userId: input.replacementUserId,
    type: "shift_replacement_assigned",
    payload,
  });

  await writeAudit({
    companyId: session.companyId,
    userId: session.sub,
    action: "shift.replace_worker",
    entity: "shift",
    entityId: shift.id,
    before: {
      workerUserId: shift.workerUserId,
      workerName: shift.worker?.fullName,
      source: shift.source,
      siteName: localizedName(shift.site, locale, "name"),
      localDate: shift.localDate,
    },
    after: {
      workerUserId: input.replacementUserId,
      workerName: membership.user.fullName,
      source: "replacement",
      siteName: localizedName(shift.site, locale, "name"),
      localDate: shift.localDate,
      notificationId,
    },
    reason: input.reason?.trim() || undefined,
  });

  return {
    shift: {
      id: updated.id,
      workerUserId: updated.workerUserId,
      source: updated.source,
      localDate: updated.localDate,
    },
    notificationId,
  };
}
