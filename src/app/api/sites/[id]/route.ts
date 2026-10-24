// HRMP — تعديل موقع/أرشفته/استعادته: عزل الشركة + تحقق الإحداثيات والمراجع + تدقيق
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { namesColumnValue, addressesColumnValue } from "@/lib/localized-name";
import { requirePermission, roleHas, AccessError } from "@/lib/rbac";
import { hasPermission } from "@/lib/delegations";
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
        addresses: data.addresses !== undefined ? addressesColumnValue(data.addresses) : undefined,
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

// الحذف = أرشفة (SPEC §11.7: مواقع الحضور وسجلاته لا تُحذف) — والحذف النهائي (?purge=1)
// للسوبر/المفوّض حين لا سجلات تشغيلية تربط الموقع (أمر المالك 2026-10-23)
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) throw new AccessError(401, "unauthenticated");
    const purge = new URL(req.url).searchParams.get("purge") === "1";
    if (purge) {
      const allowed = roleHas(session.role, "data.delete") || (await hasPermission(session, "data.delete"));
      if (!allowed) throw new AccessError(403, "no_delete_permission");
    } else {
      requirePermission(session, "company.manage");
    }

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

    // ── الحذف النهائي: لا موقع عليه ورديات أو حضور أو مجموعات (سلامة التاريخ) ──
    if (purge) {
      const [shifts, recurrences, attendance, groups] = await Promise.all([
        db.shift.count({ where: { siteId: id } }),
        db.shiftRecurrence.count({ where: { siteId: id } }),
        db.attendanceEvent.count({ where: { siteId: id } }),
        db.workerGroup.count({ where: { siteId: id } }),
      ]);
      if (shifts + recurrences + attendance + groups > 0) {
        return NextResponse.json({ error: "site_has_records" }, { status: 409 });
      }
      const reason = (await req.json().catch(() => null))?.reason?.toString?.().slice(0, 500) ?? null;
      await db.site.delete({ where: { id } });
      await writeAudit({
        companyId: session!.companyId,
        userId: session!.sub,
        action: "site.delete",
        entity: "site",
        entityId: site.id,
        before: { name: site.name, address: site.address, status: site.status },
        reason,
      });
      return NextResponse.json({ ok: true, purged: true });
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
