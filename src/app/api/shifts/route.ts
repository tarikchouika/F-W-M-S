// FWMS — الورديات المجدولة (SPEC §4.1 و§8 — المرحلة 3): قائمة/إنشاء مع منع التعارض
// معيار قبول المرحلة: «النظام يرفض تعارضاً» — عامل في موقعين بنفس الوقت ممنوع
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { localizedName, localizeRow, localizeNested } from "@/lib/localized-name";
import { getUiLocale } from "@/i18n/ui-locale";
import { requirePermission, AccessError } from "@/lib/rbac";
import { writeAudit } from "@/lib/audit";
import { emptyToNull } from "@/lib/organization";
import {
  shiftCreateSchema,
  isShiftManager,
  computeShiftTimes,
  findShiftConflicts,
  shiftWarnings,
  companyRestDay,
  addDaysToLocalDate,
  todayInZone,
  minutesInZone,
  minutesToLabel,
} from "@/lib/scheduling";

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    const locale = await getUiLocale();
    requirePermission(session, "scheduling.manage");

    const url = new URL(req.url);
    const today = todayInZone(session!.companyTimezone);
    const from = url.searchParams.get("from")?.trim() || addDaysToLocalDate(today, -7);
    const to = url.searchParams.get("to")?.trim() || addDaysToLocalDate(today, 30);
    const status = url.searchParams.get("status") ?? "scheduled"; // scheduled | cancelled | all
    const workerUserId = url.searchParams.get("workerUserId")?.trim() ?? "";
    const siteId = url.searchParams.get("siteId")?.trim() ?? "";

    // localDate = يوم بداية الوردية بتوقيت الشركة (اصطلاح موثَّق في المخطط)
    const where: Record<string, unknown> = {
      companyId: session!.companyId,
      localDate: { gte: from, lte: to },
    };
    if (status === "scheduled" || status === "cancelled") where.status = status;
    if (workerUserId) where.workerUserId = workerUserId;
    if (siteId) where.siteId = siteId;

    const shifts = await db.shift.findMany({
      where,
      orderBy: { startsAt: "asc" },
      include: {
        worker: { select: { id: true, fullName: true, names: true } },
        site: { select: { id: true, name: true, names: true } },
        template: { select: { id: true, name: true } },
      },
      take: 500,
    });

    return NextResponse.json({
      count: shifts.length,
      shifts: shifts.map((s) => ({
        id: s.id,
        localDate: s.localDate,
        startsAt: s.startsAt,
        endsAt: s.endsAt,
        startTimeMin: minutesInZone(s.startsAt, session!.companyTimezone),
        endTimeMin: minutesInZone(s.endsAt, session!.companyTimezone),
        breakMinutes: s.breakMinutes,
        status: s.status,
        source: s.source,
        notes: s.notes,
        worker: s.worker ? { id: s.worker.id, fullName: localizedName(s.worker, locale, "fullName") } : null,
        site: { id: s.site.id, name: localizedName(s.site, locale, "name") },
        template: s.template ? { id: s.template.id, name: s.template.name } : null,
      })),
    });
  } catch (error) {
    if (error instanceof AccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[shifts]", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    requirePermission(session, "scheduling.manage");
    if (!isShiftManager(session!.role)) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const parsed = shiftCreateSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "invalid_input" }, { status: 400 });
    }

    const { workerUserId, siteId, templateId, localDate, startTimeMin, endTimeMin, breakMinutes, notes } =
      parsed.data;

    // تحقق ملكية المراجع داخل الشركة (عزل 3.1) — العامل عضوية سارية، الموقع نشط
    const membership = await db.userMembership.findFirst({
      where: {
        userId: workerUserId,
        companyId: session!.companyId,
        revokedAt: null,
        user: { isActive: true },
      },
      select: { id: true },
    });
    if (!membership) {
      return NextResponse.json({ error: "invalid_reference" }, { status: 400 });
    }

    const site = await db.site.findFirst({
      where: { id: siteId, companyId: session!.companyId, status: "active" },
      select: { id: true, name: true },
    });
    if (!site) {
      return NextResponse.json({ error: "invalid_reference" }, { status: 400 });
    }

    const templateIdValue = emptyToNull(templateId);
    if (templateIdValue) {
      const template = await db.shiftTemplate.findFirst({
        where: { id: templateIdValue, companyId: session!.companyId, status: "active" },
        select: { id: true },
      });
      if (!template) {
        return NextResponse.json({ error: "invalid_reference" }, { status: 400 });
      }
    }

    // الحساب الزمني بتوقيت الشركة ثم التخزين UTC (SPEC §11.4: ورديات تعبر منتصف الليل)
    const times = computeShiftTimes(
      localDate,
      startTimeMin,
      endTimeMin,
      breakMinutes,
      session!.companyTimezone
    );

    // منع التعارض (SPEC §4.1): تداخل فترتين مفتوحتين [start, end) لنفس العامل
    const conflicts = await findShiftConflicts(db, {
      companyId: session!.companyId,
      workerUserId,
      startsAt: times.startsAt,
      endsAt: times.endsAt,
    });
    if (conflicts.length > 0) {
      const tz = session!.companyTimezone;
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

    // تنبيهات لا تحجب: يوم الراحة الأسبوعية أو تجاوز 10 ساعات (SPEC §11.3 و§11.5)
    const restDay = await companyRestDay(db, session!.companyId);
    const warnings = shiftWarnings({ localDate, workMinutes: times.workMinutes, restDay });

    const shift = await db.shift.create({
      data: {
        companyId: session!.companyId,
        workerUserId,
        siteId,
        templateId: templateIdValue,
        localDate,
        startsAt: times.startsAt,
        endsAt: times.endsAt,
        breakMinutes,
        status: "scheduled",
        source: "manual",
        notes: emptyToNull(notes),
        createdByUserId: session!.sub,
      },
    });

    await writeAudit({
      companyId: session!.companyId,
      userId: session!.sub,
      action: "shift.create",
      entity: "shift",
      entityId: shift.id,
      after: {
        workerUserId,
        siteId,
        localDate,
        startsAt: times.startsAt,
        endsAt: times.endsAt,
        templateId: templateIdValue,
        breakMinutes,
      },
    });

    return NextResponse.json(
      {
        shift: {
          id: shift.id,
          localDate: shift.localDate,
          startsAt: shift.startsAt,
          endsAt: shift.endsAt,
          status: shift.status,
        },
        warnings,
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof AccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[shifts]", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
