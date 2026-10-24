// HRMP — تعديل وردية/إلغاؤها: عزل الشركة + منع التعارض عند التغيير + قاعدة «طوارئ اليوم» لـ co_admin
// SPEC §3: co_admin (مشرف ميداني) يعدّل طوارئ اليوم فقط — إعادة جدولة المستقبل للمديرين
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { requirePermission, AccessError } from "@/lib/rbac";
import { writeAudit } from "@/lib/audit";
import { emptyToNull, entityIdSchema } from "@/lib/organization";
import {
  shiftUpdateSchema,
  isShiftManager,
  computeShiftTimes,
  minutesInZone,
  minutesToLabel,
  findShiftConflicts,
  shiftDurationProblem,
  todayInZone,
} from "@/lib/scheduling";

function conflictResponse(conflicts: Awaited<ReturnType<typeof findShiftConflicts>>, tz: string) {
  return NextResponse.json(
    {
      error: "shift_conflict",
      conflicts: conflicts.map((c) => ({
        id: c.id,
        localDate: c.localDate,
        startsAt: c.startsAt,
        endsAt: c.endsAt,
        startLabel: minutesToLabel(minutesInZone(c.startsAt, tz)),
        endLabel: minutesToLabel(minutesInZone(c.endsAt, tz)),
        siteName: c.siteName,
        templateName: c.templateName,
      })),
    },
    { status: 409 }
  );
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    requirePermission(session, "scheduling.manage");

    const { id } = await params;
    if (!entityIdSchema.safeParse(id).success) {
      return NextResponse.json({ error: "invalid_input" }, { status: 400 });
    }

    const shift = await db.shift.findFirst({
      where: { id, companyId: session!.companyId },
      include: {
        worker: { select: { id: true, fullName: true, names: true } },
        site: { select: { id: true, name: true, names: true } },
        template: { select: { id: true, name: true } },
      },
    });
    if (!shift) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    // قاعدة «طوارئ اليوم» (SPEC §3): المشرف الميداني يعدّل وردية اليوم الحالي فقط
    const tz = session!.companyTimezone;
    const todayLocal = todayInZone(tz);
    const isCoAdmin = session!.role === "co_admin";
    if (isCoAdmin && shift.localDate !== todayLocal) {
      return NextResponse.json({ error: "same_day_only" }, { status: 403 });
    }

    const parsed = shiftUpdateSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "invalid_input" }, { status: 400 });
    }
    const data = parsed.data;

    // co_admin لا ينقل وردية اليوم إلى يوم آخر
    if (isCoAdmin && data.localDate !== undefined && data.localDate !== todayLocal) {
      return NextResponse.json({ error: "same_day_only" }, { status: 403 });
    }

    // تحقق المراجع عند تغييرها (عزل 3.1)
    if (data.workerUserId !== undefined) {
      const membership = await db.userMembership.findFirst({
        where: {
          userId: data.workerUserId,
          companyId: session!.companyId,
          revokedAt: null,
          user: { isActive: true },
        },
        select: { id: true },
      });
      if (!membership) return NextResponse.json({ error: "invalid_reference" }, { status: 400 });
    }
    if (data.siteId !== undefined) {
      const site = await db.site.findFirst({
        where: { id: data.siteId, companyId: session!.companyId, status: "active" },
        select: { id: true },
      });
      if (!site) return NextResponse.json({ error: "invalid_reference" }, { status: 400 });
    }
    if (data.templateId !== undefined && emptyToNull(data.templateId)) {
      const template = await db.shiftTemplate.findFirst({
        where: { id: emptyToNull(data.templateId)!, companyId: session!.companyId, status: "active" },
        select: { id: true },
      });
      if (!template) return NextResponse.json({ error: "invalid_reference" }, { status: 400 });
    }

    // دمج الأزمنة: الحقول الغائبة تُستخرج من الوردية القائمة بتوقيت الشركة
    const newLocalDate = data.localDate ?? shift.localDate;
    const newStart = data.startTimeMin ?? minutesInZone(shift.startsAt, tz);
    const newEnd = data.endTimeMin ?? minutesInZone(shift.endsAt, tz);
    const newBreak = data.breakMinutes ?? shift.breakMinutes;
    const newWorker = data.workerUserId ?? shift.workerUserId;

    const problem = shiftDurationProblem(newStart, newEnd, newBreak);
    if (problem) {
      return NextResponse.json({ error: problem }, { status: 400 });
    }

    const times = computeShiftTimes(newLocalDate, newStart, newEnd, newBreak, tz);
    const newStatus = data.status ?? shift.status;

    // منع التعارض عند أي تغيير مؤثر — أو عند إعادة تنشيط وردية ملغاة
    const intervalChanged =
      newWorker !== shift.workerUserId ||
      newLocalDate !== shift.localDate ||
      newStart !== minutesInZone(shift.startsAt, tz) ||
      newEnd !== minutesInZone(shift.endsAt, tz);
    if (intervalChanged || (newStatus === "scheduled" && shift.status !== "scheduled")) {
      const conflicts = await findShiftConflicts(db, {
        companyId: session!.companyId,
        workerUserId: newWorker,
        startsAt: times.startsAt,
        endsAt: times.endsAt,
        excludeShiftId: shift.id,
      });
      if (conflicts.length > 0) return conflictResponse(conflicts, tz);
    }

    const updated = await db.shift.update({
      where: { id },
      data: {
        workerUserId: data.workerUserId ?? undefined,
        siteId: data.siteId ?? undefined,
        templateId: data.templateId !== undefined ? emptyToNull(data.templateId) : undefined,
        localDate: newLocalDate,
        startsAt: times.startsAt,
        endsAt: times.endsAt,
        breakMinutes: newBreak,
        status: data.status ?? undefined,
        notes: data.notes !== undefined ? emptyToNull(data.notes) : undefined,
      },
    });

    const action =
      data.status === "cancelled"
        ? "shift.cancel"
        : data.status === "scheduled" && shift.status === "cancelled"
          ? "shift.restore"
          : "shift.update";

    await writeAudit({
      companyId: session!.companyId,
      userId: session!.sub,
      action,
      entity: "shift",
      entityId: shift.id,
      before: {
        worker: shift.worker?.fullName ?? shift.workerUserId,
        site: shift.site?.name ?? shift.siteId,
        localDate: shift.localDate,
        startsAt: shift.startsAt,
        endsAt: shift.endsAt,
        breakMinutes: shift.breakMinutes,
        status: shift.status,
      },
      after: {
        localDate: updated.localDate,
        startsAt: updated.startsAt,
        endsAt: updated.endsAt,
        breakMinutes: updated.breakMinutes,
        status: updated.status,
      },
    });

    return NextResponse.json({
      shift: {
        id: updated.id,
        localDate: updated.localDate,
        startsAt: updated.startsAt,
        endsAt: updated.endsAt,
        status: updated.status,
      },
    });
  } catch (error) {
    if (error instanceof AccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[shifts/:id]", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

// حذف وردية = إلغاء (SPEC §11.7: سجلات الجدولة تُغذي الحضور والأجور — لا حذف فعلي)
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    requirePermission(session, "scheduling.manage");

    const { id } = await params;
    if (!entityIdSchema.safeParse(id).success) {
      return NextResponse.json({ error: "invalid_input" }, { status: 400 });
    }

    const shift = await db.shift.findFirst({
      where: { id, companyId: session!.companyId },
      include: {
        worker: { select: { fullName: true, names: true } },
        site: { select: { name: true } },
      },
    });
    if (!shift) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    // قاعدة «طوارئ اليوم» تلزم إلغاء اليوم أيضًا بالنسبة للمشرف الميداني
    if (session!.role === "co_admin" && shift.localDate !== todayInZone(session!.companyTimezone)) {
      return NextResponse.json({ error: "same_day_only" }, { status: 403 });
    }
    if (shift.status === "cancelled") {
      return NextResponse.json({ ok: true, already: true });
    }

    const updated = await db.shift.update({
      where: { id },
      data: { status: "cancelled" },
    });

    await writeAudit({
      companyId: session!.companyId,
      userId: session!.sub,
      action: "shift.cancel",
      entity: "shift",
      entityId: shift.id,
      before: {
        worker: shift.worker?.fullName ?? shift.workerUserId,
        site: shift.site?.name ?? shift.siteId,
        localDate: shift.localDate,
        startsAt: shift.startsAt,
        status: shift.status,
      },
      after: { localDate: updated.localDate, startsAt: updated.startsAt, status: updated.status },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof AccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[shifts/:id]", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
