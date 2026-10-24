// HRMP — قوالب الورديات حسب القطاع (SPEC §4.1 و§8 — المرحلة 3): قائمة/إنشاء
// القطاعات: حراسة (ليل متصل)، بناء (نهار محدد)، نظافة (توزيع متعدد المواقع)...
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { requirePermission, AccessError } from "@/lib/rbac";
import { writeAudit } from "@/lib/audit";
import { emptyToNull } from "@/lib/organization";
import { templateCreateSchema, isShiftManager, SHIFT_SECTORS } from "@/lib/scheduling";

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    requirePermission(session, "scheduling.manage");

    const url = new URL(req.url);
    const status = url.searchParams.get("status") ?? "active";
    const sector = url.searchParams.get("sector")?.trim() ?? "";

    const where: Record<string, unknown> = { companyId: session!.companyId };
    if (status === "active" || status === "archived") where.status = status;
    if (sector && (SHIFT_SECTORS as readonly string[]).includes(sector)) where.sector = sector;

    const templates = await db.shiftTemplate.findMany({
      where,
      orderBy: [{ sector: "asc" }, { startTimeMin: "asc" }],
    });

    return NextResponse.json({
      count: templates.length,
      templates: templates.map((tpl) => ({
        id: tpl.id,
        name: tpl.name,
        sector: tpl.sector,
        startTimeMin: tpl.startTimeMin,
        endTimeMin: tpl.endTimeMin,
        breakMinutes: tpl.breakMinutes,
        notes: tpl.notes,
        status: tpl.status,
        createdAt: tpl.createdAt,
      })),
    });
  } catch (error) {
    if (error instanceof AccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[shift-templates]", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    requirePermission(session, "scheduling.manage");
    // إنشاء القوالب للمديرين فقط — co_admin: تعديلات طوارئ اليوم فقط (SPEC §3)
    if (!isShiftManager(session!.role)) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const parsed = templateCreateSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "invalid_input" }, { status: 400 });
    }

    const { name, sector, startTimeMin, endTimeMin, breakMinutes, notes } = parsed.data;

    const template = await db.shiftTemplate.create({
      data: {
        companyId: session!.companyId,
        name,
        sector,
        startTimeMin,
        endTimeMin,
        breakMinutes,
        notes: emptyToNull(notes),
      },
    });

    await writeAudit({
      companyId: session!.companyId,
      userId: session!.sub,
      action: "shift_template.create",
      entity: "shift_template",
      entityId: template.id,
      after: { name, sector, startTimeMin, endTimeMin, breakMinutes },
    });

    return NextResponse.json(
      { template: { id: template.id, name: template.name, status: template.status } },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof AccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[shift-templates]", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
