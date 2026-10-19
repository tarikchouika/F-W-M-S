// FWMS — تعديل مشروع/أرشفته/استعادته: عزل الشركة + تحقق ملكية الفرع + تدقيق
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { namesColumnValue } from "@/lib/localized-name";
import { requirePermission, AccessError } from "@/lib/rbac";
import { writeAudit } from "@/lib/audit";
import { projectUpdateSchema, emptyToNull, parseOptionalDate, entityIdSchema } from "@/lib/organization";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    requirePermission(session, "company.manage");

    const { id } = await params;
    if (!entityIdSchema.safeParse(id).success) {
      return NextResponse.json({ error: "invalid_input" }, { status: 400 });
    }

    const parsed = projectUpdateSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "invalid_input" }, { status: 400 });
    }

    const project = await db.project.findFirst({
      where: { id, companyId: session!.companyId },
    });
    if (!project) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    const data = parsed.data;

    // تحقق ملكية الفرع عند تغييره (عزل 3.1)
    if (data.branchId !== undefined && emptyToNull(data.branchId)) {
      const branch = await db.branch.findFirst({
        where: { id: emptyToNull(data.branchId)!, companyId: session!.companyId },
        select: { id: true },
      });
      if (!branch) {
        return NextResponse.json({ error: "invalid_reference" }, { status: 400 });
      }
    }

    let startsAtDate: Date | null | undefined;
    let endsAtDate: Date | null | undefined;
    try {
      startsAtDate = data.startsAt !== undefined ? parseOptionalDate(data.startsAt) : undefined;
      endsAtDate = data.endsAt !== undefined ? parseOptionalDate(data.endsAt) : undefined;
    } catch {
      return NextResponse.json({ error: "invalid_input" }, { status: 400 });
    }

    const updated = await db.project.update({
      where: { id },
      data: {
        name: data.name ?? undefined,
        code: data.code !== undefined ? emptyToNull(data.code) : undefined,
        branchId: data.branchId !== undefined ? emptyToNull(data.branchId) : undefined,
        startsAt: startsAtDate,
        endsAt: endsAtDate,
        status: data.status ?? undefined,
        names: data.names !== undefined ? namesColumnValue(data.names) : undefined,
      },
    });

    const action =
      data.status === "archived"
        ? "project.archive"
        : data.status === "active" && project.status === "archived"
          ? "project.restore"
          : "project.update";

    await writeAudit({
      companyId: session!.companyId,
      userId: session!.sub,
      action,
      entity: "project",
      entityId: project.id,
      before: {
        name: project.name,
        code: project.code,
        branchId: project.branchId,
        status: project.status,
      },
      after: {
        name: updated.name,
        code: updated.code,
        branchId: updated.branchId,
        status: updated.status,
      },
    });

    return NextResponse.json({
      project: { id: updated.id, name: updated.name, status: updated.status },
    });
  } catch (error) {
    if (error instanceof AccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[projects/:id]", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

// الحذف = أرشفة (SPEC §11.7)
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    requirePermission(session, "company.manage");

    const { id } = await params;
    if (!entityIdSchema.safeParse(id).success) {
      return NextResponse.json({ error: "invalid_input" }, { status: 400 });
    }

    const project = await db.project.findFirst({
      where: { id, companyId: session!.companyId },
    });
    if (!project) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    if (project.status === "archived") {
      return NextResponse.json({ ok: true, already: true });
    }

    const updated = await db.project.update({
      where: { id },
      data: { status: "archived" },
    });

    await writeAudit({
      companyId: session!.companyId,
      userId: session!.sub,
      action: "project.archive",
      entity: "project",
      entityId: project.id,
      before: { name: project.name, status: project.status },
      after: { name: updated.name, status: updated.status },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof AccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[projects/:id]", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
