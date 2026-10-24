// HRMP — توليد الورديات من قاعدة تكرار/تناوب (SPEC §4.1 و§8 — المرحلة 3)
// يولّد الورديات داخل نطاق زمني، يتخطى المتعارض منها ويعيد تقريرًا صريحًا (لا ادعاء بلا تقرير)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { requirePermission, AccessError } from "@/lib/rbac";
import { writeAudit } from "@/lib/audit";
import { entityIdSchema } from "@/lib/organization";
import {
  generateSchema,
  isShiftManager,
  recurrenceCandidates,
  computeShiftTimes,
  findShiftConflicts,
  overlapsInterval,
  parseRotation,
  type TemplateTimes,
} from "@/lib/scheduling";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    requirePermission(session, "scheduling.manage");
    if (!isShiftManager(session!.role)) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const { id } = await params;
    if (!entityIdSchema.safeParse(id).success) {
      return NextResponse.json({ error: "invalid_input" }, { status: 400 });
    }

    const recurrence = await db.shiftRecurrence.findFirst({
      where: { id, companyId: session!.companyId },
    });
    if (!recurrence) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    if (recurrence.status !== "active") {
      return NextResponse.json({ error: "not_active" }, { status: 400 });
    }

    const parsed = generateSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "invalid_input" }, { status: 400 });
    }
    const { from, to } = parsed.data;

    // القوالب المعنية بالقاعدة — يجب أن تبقى نشطة
    const neededIds =
      recurrence.mode === "fixed"
        ? recurrence.templateId
          ? [recurrence.templateId]
          : []
        : parseRotation(recurrence.rotationJson);

    const templateRows = neededIds.length
      ? await db.shiftTemplate.findMany({
          where: { companyId: session!.companyId, id: { in: neededIds } },
        })
      : [];
    const templates: TemplateTimes[] = templateRows
      .filter((t) => t.status === "active")
      .map((t) => ({
        id: t.id,
        name: t.name,
        startTimeMin: t.startTimeMin,
        endTimeMin: t.endTimeMin,
        breakMinutes: t.breakMinutes,
      }));
    if (templates.length === 0) {
      return NextResponse.json({ error: "invalid_reference" }, { status: 400 });
    }

    const tz = session!.companyTimezone;
    const candidates = recurrenceCandidates(
      {
        mode: recurrence.mode,
        templateId: recurrence.templateId,
        weekdaysJson: recurrence.weekdaysJson,
        rotationJson: recurrence.rotationJson,
        rotationStepDays: recurrence.rotationStepDays,
        startsOn: recurrence.startsOn,
        endsOn: recurrence.endsOn,
      },
      templates,
      from,
      to
    );

    let created = 0;
    const skipped: { localDate: string; templateName: string; reason: "conflict" }[] = [];
    const batchIntervals: { startsAt: Date; endsAt: Date }[] = [];

    for (const candidate of candidates) {
      const times = computeShiftTimes(
        candidate.localDate,
        candidate.template.startTimeMin,
        candidate.template.endTimeMin,
        candidate.template.breakMinutes,
        tz
      );

      // تعارض داخل الدفعة نفسها (مرشّحان لنفس العامل بنفس النطاق)
      if (overlapsInterval(batchIntervals, times)) {
        skipped.push({
          localDate: candidate.localDate,
          templateName: candidate.template.name,
          reason: "conflict",
        });
        continue;
      }

      // تعارض مع ورديات قائمة (تداخل فترات مفتوح [start, end))
      const conflicts = await findShiftConflicts(db, {
        companyId: session!.companyId,
        workerUserId: recurrence.workerUserId,
        startsAt: times.startsAt,
        endsAt: times.endsAt,
      });
      if (conflicts.length > 0) {
        skipped.push({
          localDate: candidate.localDate,
          templateName: candidate.template.name,
          reason: "conflict",
        });
        continue;
      }

      await db.shift.create({
        data: {
          companyId: session!.companyId,
          workerUserId: recurrence.workerUserId,
          siteId: recurrence.siteId,
          templateId: candidate.template.id,
          recurrenceId: recurrence.id,
          localDate: candidate.localDate,
          startsAt: times.startsAt,
          endsAt: times.endsAt,
          breakMinutes: candidate.template.breakMinutes,
          status: "scheduled",
          source: recurrence.mode === "fixed" ? "recurrence" : "rotation",
          createdByUserId: session!.sub,
        },
      });

      batchIntervals.push(times);
      created++;
    }

    await writeAudit({
      companyId: session!.companyId,
      userId: session!.sub,
      action: "shift_recurrence.generate",
      entity: "shift_recurrence",
      entityId: recurrence.id,
      after: { from, to, created, skipped: skipped.length },
    });

    return NextResponse.json({
      created,
      skippedCount: skipped.length,
      skipped: skipped.slice(0, 50), // تفاصيل أول 50 تخطيًا كافية للتقرير
    });
  } catch (error) {
    if (error instanceof AccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[shift-recurrences/:id/generate]", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
