// FWMS — تعديل فرع/أرشفته/استعادته: عزل الشركة (404 عند التخمين) + تدقيق قبل/بعد
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { namesColumnValue, addressesColumnValue } from "@/lib/localized-name";
import { requirePermission, roleHas, AccessError } from "@/lib/rbac";
import { hasPermission } from "@/lib/delegations";
import { writeAudit } from "@/lib/audit";
import { branchUpdateSchema, emptyToNull, entityIdSchema } from "@/lib/organization";

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

    const parsed = branchUpdateSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "invalid_input" }, { status: 400 });
    }

    // عزل الشركات: البحث داخل الشركة النشطة فقط — 404 إن لم يكن لها
    const branch = await db.branch.findFirst({
      where: { id, companyId: session!.companyId },
    });
    if (!branch) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    const data = parsed.data;
    const updated = await db.branch.update({
      where: { id },
      data: {
        name: data.name ?? undefined,
        code: data.code !== undefined ? emptyToNull(data.code) : undefined,
        city: data.city !== undefined ? emptyToNull(data.city) : undefined,
        address: data.address !== undefined ? emptyToNull(data.address) : undefined,
        addresses: data.addresses !== undefined ? addressesColumnValue(data.addresses) : undefined,
        status: data.status ?? undefined,
        names: data.names !== undefined ? namesColumnValue(data.names) : undefined,
      },
    });

    const action =
      data.status === "archived"
        ? "branch.archive"
        : data.status === "active" && branch.status === "archived"
          ? "branch.restore"
          : "branch.update";

    await writeAudit({
      companyId: session!.companyId,
      userId: session!.sub,
      action,
      entity: "branch",
      entityId: branch.id,
      before: { name: branch.name, code: branch.code, city: branch.city, status: branch.status },
      after: { name: updated.name, code: updated.code, city: updated.city, status: updated.status },
    });

    return NextResponse.json({
      branch: { id: updated.id, name: updated.name, status: updated.status },
    });
  } catch (error) {
    if (error instanceof AccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[branches/:id]", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

// الحذف = أرشفة (SPEC §11.7: لا حذف سجلات — الأرشفة تحفظ سلامة المراجع)
// والحذف النهائي (?purge=1) للسوبر/المفوّض حين لا مشاريع/مواقع تربط الفرع (أمر المالك 2026-10-23)
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

    const branch = await db.branch.findFirst({
      where: { id, companyId: session!.companyId },
    });
    if (!branch) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    // ── الحذف النهائي: لا فرع عليه مشاريع أو مواقع (سلامة المراجع) ──
    if (purge) {
      const [projects, sites] = await Promise.all([
        db.project.count({ where: { branchId: id } }),
        db.site.count({ where: { branchId: id } }),
      ]);
      if (projects + sites > 0) {
        return NextResponse.json({ error: "branch_has_children" }, { status: 409 });
      }
      const reason = (await req.json().catch(() => null))?.reason?.toString?.().slice(0, 500) ?? null;
      await db.branch.delete({ where: { id } });
      await writeAudit({
        companyId: session!.companyId,
        userId: session!.sub,
        action: "branch.delete",
        entity: "branch",
        entityId: branch.id,
        before: { name: branch.name, code: branch.code, status: branch.status },
        reason,
      });
      return NextResponse.json({ ok: true, purged: true });
    }

    if (branch.status === "archived") {
      return NextResponse.json({ ok: true, already: true });
    }

    const updated = await db.branch.update({
      where: { id },
      data: { status: "archived" },
    });

    await writeAudit({
      companyId: session!.companyId,
      userId: session!.sub,
      action: "branch.archive",
      entity: "branch",
      entityId: branch.id,
      before: { name: branch.name, status: branch.status },
      after: { name: updated.name, status: updated.status },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof AccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[branches/:id]", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
