// FWMS — تعديل موقع/أرشفته/استعادته: عزل الشركة + تحقق الإحداثيات والمراجع + تدقيق
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { namesColumnValue } from "@/lib/localized-name";
import { requirePermission, AccessError } from "@/lib/rbac";
import { writeAudit } from "@/lib/audit";
import { siteUpdateSchema, emptyToNull, entityIdSchema } from "@/lib/organization";

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

    const parsed = siteUpdateSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "invalid_input" }, { status: 400 });
    }

    const site = await db.site.findFirst({
      where: { id, companyId: session!.companyId },
      include: {
        branch: { select: { id: true, name: true } },
        project: { select: { id: true, name: true } },
      },
    });
    if (!site) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    const data = parsed.data;

    // تحقق ملكية المراجع عند تغييرها (عزل 3.1)
    if (data.branchId !== undefined && emptyToNull(data.branchId)) {
      const branch = await db.branch.findFirst({
        where: { id: emptyToNull(data.branchId)!, companyId: session!.companyId },
        select: { id: true },
      });
      if (!branch) return NextResponse.json({ error: "invalid_reference" }, { status: 400 });
    }
    if (data.projectId !== undefined && emptyToNull(data.projectId)) {
      const project = await db.project.findFirst({
        where: { id: emptyToNull(data.projectId)!, companyId: session!.companyId },
        select: { id: true },
      });
      if (!project) return NextResponse.json({ error: "invalid_reference" }, { status: 400 });
    }

    const updated = await db.site.update({
      where: { id },
      data: {
        name: data.name ?? undefined,
        address: data.address !== undefined ? emptyToNull(data.address) : undefined,
        latitude: data.latitude ?? undefined,
        longitude: data.longitude ?? undefined,
        radiusM: data.radiusM ?? undefined,
        branchId: data.branchId !== undefined ? emptyToNull(data.branchId) : undefined,
        projectId: data.projectId !== undefined ? emptyToNull(data.projectId) : undefined,
        status: data.status ?? undefined,
        names: data.names !== undefined ? namesColumnValue(data.names) : undefined,
      },
    });

    const action =
      data.status === "archived"
        ? "site.archive"
        : data.status === "active" && site.status === "archived"
          ? "site.restore"
          : "site.update";

    await writeAudit({
      companyId: session!.companyId,
      userId: session!.sub,
      action,
      entity: "site",
      entityId: site.id,
      before: {
        name: site.name,
        latitude: site.latitude,
        longitude: site.longitude,
        radiusM: site.radiusM,
        branchId: site.branchId,
        projectId: site.projectId,
        status: site.status,
      },
      after: {
        name: updated.name,
        latitude: updated.latitude,
        longitude: updated.longitude,
        radiusM: updated.radiusM,
        branchId: updated.branchId,
        projectId: updated.projectId,
        status: updated.status,
      },
    });

    return NextResponse.json({
      site: {
        id: updated.id,
        name: updated.name,
        latitude: updated.latitude,
        longitude: updated.longitude,
        radiusM: updated.radiusM,
        status: updated.status,
      },
    });
  } catch (error) {
    if (error instanceof AccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[sites/:id]", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

// الحذف = أرشفة (SPEC §11.7: مواقع الحضور وسجلاته لا تُحذف)
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

    const site = await db.site.findFirst({
      where: { id, companyId: session!.companyId },
    });
    if (!site) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    if (site.status === "archived") {
      return NextResponse.json({ ok: true, already: true });
    }

    const updated = await db.site.update({
      where: { id },
      data: { status: "archived" },
    });

    await writeAudit({
      companyId: session!.companyId,
      userId: session!.sub,
      action: "site.archive",
      entity: "site",
      entityId: site.id,
      before: { name: site.name, status: site.status },
      after: { name: updated.name, status: updated.status },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof AccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[sites/:id]", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
