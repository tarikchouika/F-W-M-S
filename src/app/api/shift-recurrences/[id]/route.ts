// HRMP — تعديل قاعدة تكرار/أرشفتها: تغيير النطاق والأيام والخطوة — تبديل العامل/الموقع بإنشاء قاعدة جديدة
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { requirePermission, AccessError } from "@/lib/rbac";
import { writeAudit } from "@/lib/audit";
import { emptyToNull, entityIdSchema } from "@/lib/organization";
import { recurrenceUpdateSchema, isShiftManager } from "@/lib/scheduling";

export async function PATCH(
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

    const parsed = recurrenceUpdateSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "invalid_input" }, { status: 400 });
    }
    const data = parsed.data;

    const recurrence = await db.shiftRecurrence.findFirst({
      where: { id, companyId: session!.companyId },
    });
    if (!recurrence) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    // النطاق الزمني بعد الدمج يجب أن يبقى سليمًا
    const startsOn = data.startsOn ?? recurrence.startsOn;
    const endsOnValue = data.endsOn !== undefined ? emptyToNull(data.endsOn) : recurrence.endsOn;
    if (endsOnValue && startsOn > endsOnValue) {
      return NextResponse.json({ error: "invalid_input" }, { status: 400 });
    }

    const updated = await db.shiftRecurrence.update({
      where: { id },
      data: {
        startsOn,
        endsOn: endsOnValue,
        rotationStepDays: data.rotationStepDays ?? undefined,
        weekdaysJson:
          data.weekdays !== undefined && recurrence.mode === "fixed"
            ? JSON.stringify(data.weekdays)
            : undefined,
        status: data.status ?? undefined,
      },
    });

    const action =
      data.status === "archived"
        ? "shift_recurrence.archive"
        : data.status === "active" && recurrence.status === "archived"
          ? "shift_recurrence.restore"
          : "shift_recurrence.update";

    await writeAudit({
      companyId: session!.companyId,
      userId: session!.sub,
      action,
      entity: "shift_recurrence",
      entityId: recurrence.id,
      before: {
        startsOn: recurrence.startsOn,
        endsOn: recurrence.endsOn,
        rotationStepDays: recurrence.rotationStepDays,
        weekdaysJson: recurrence.weekdaysJson,
        status: recurrence.status,
      },
      after: {
        startsOn: updated.startsOn,
        endsOn: updated.endsOn,
        rotationStepDays: updated.rotationStepDays,
        weekdaysJson: updated.weekdaysJson,
        status: updated.status,
      },
    });

    return NextResponse.json({
      recurrence: {
        id: updated.id,
        mode: updated.mode,
        startsOn: updated.startsOn,
        endsOn: updated.endsOn,
        status: updated.status,
      },
    });
  } catch (error) {
    if (error instanceof AccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[shift-recurrences/:id]", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

// الحذف = أرشفة (لا حذف — الورديات المولّدة منها تبقى مرتبطة بها)
export async function DELETE(
  _req: NextRequest,
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
    if (recurrence.status === "archived") {
      return NextResponse.json({ ok: true, already: true });
    }

    const updated = await db.shiftRecurrence.update({
      where: { id },
      data: { status: "archived" },
    });

    await writeAudit({
      companyId: session!.companyId,
      userId: session!.sub,
      action: "shift_recurrence.archive",
      entity: "shift_recurrence",
      entityId: recurrence.id,
      before: { startsOn: recurrence.startsOn, status: recurrence.status },
      after: { startsOn: updated.startsOn, status: updated.status },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof AccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[shift-recurrences/:id]", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
