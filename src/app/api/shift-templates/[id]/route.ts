// HRMP — تعديل قالب وردية/أرشفته: عزل الشركة + تحقق المدة بعد الدمج + تدقيق
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { requirePermission, AccessError } from "@/lib/rbac";
import { writeAudit } from "@/lib/audit";
import { emptyToNull, entityIdSchema } from "@/lib/organization";
import { templateUpdateSchema, isShiftManager, shiftDurationProblem } from "@/lib/scheduling";

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

    const parsed = templateUpdateSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "invalid_input" }, { status: 400 });
    }
    const data = parsed.data;

    const template = await db.shiftTemplate.findFirst({
      where: { id, companyId: session!.companyId },
    });
    if (!template) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    // دمج القيم ثم التحقق من صحة المدة (وردية تعبر منتصف الليل أو تجاوز السقف)
    const startTimeMin = data.startTimeMin ?? template.startTimeMin;
    const endTimeMin = data.endTimeMin ?? template.endTimeMin;
    const breakMinutes = data.breakMinutes ?? template.breakMinutes;
    const problem = shiftDurationProblem(startTimeMin, endTimeMin, breakMinutes);
    if (problem) {
      return NextResponse.json({ error: problem }, { status: 400 });
    }

    const updated = await db.shiftTemplate.update({
      where: { id },
      data: {
        name: data.name ?? undefined,
        sector: data.sector ?? undefined,
        startTimeMin: data.startTimeMin ?? undefined,
        endTimeMin: data.endTimeMin ?? undefined,
        breakMinutes: data.breakMinutes ?? undefined,
        notes: data.notes !== undefined ? emptyToNull(data.notes) : undefined,
        status: data.status ?? undefined,
      },
    });

    const action =
      data.status === "archived"
        ? "shift_template.archive"
        : data.status === "active" && template.status === "archived"
          ? "shift_template.restore"
          : "shift_template.update";

    await writeAudit({
      companyId: session!.companyId,
      userId: session!.sub,
      action,
      entity: "shift_template",
      entityId: template.id,
      before: {
        name: template.name,
        sector: template.sector,
        startTimeMin: template.startTimeMin,
        endTimeMin: template.endTimeMin,
        breakMinutes: template.breakMinutes,
        status: template.status,
      },
      after: {
        name: updated.name,
        sector: updated.sector,
        startTimeMin: updated.startTimeMin,
        endTimeMin: updated.endTimeMin,
        breakMinutes: updated.breakMinutes,
        status: updated.status,
      },
    });

    return NextResponse.json({
      template: {
        id: updated.id,
        name: updated.name,
        sector: updated.sector,
        status: updated.status,
      },
    });
  } catch (error) {
    if (error instanceof AccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[shift-templates/:id]", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

// الحذف = أرشفة (SPEC §11.7: لا حذف سجلات — القوالب مرتبطة بورديات وحضور سابق)
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

    const template = await db.shiftTemplate.findFirst({
      where: { id, companyId: session!.companyId },
    });
    if (!template) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    if (template.status === "archived") {
      return NextResponse.json({ ok: true, already: true });
    }

    const updated = await db.shiftTemplate.update({
      where: { id },
      data: { status: "archived" },
    });

    await writeAudit({
      companyId: session!.companyId,
      userId: session!.sub,
      action: "shift_template.archive",
      entity: "shift_template",
      entityId: template.id,
      before: { name: template.name, status: template.status },
      after: { name: updated.name, status: updated.status },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof AccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[shift-templates/:id]", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
