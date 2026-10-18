// FWMS — تعديل مجموعة/أرشفتها/استعادتها: عزل الشركة + تدقيق قبل/بعد
// المرحلة 9 (v0.10.0): PATCH يشمل حقول الفريق — النوع (عادي/احتياطي)، القائد،
// الموقع المرجعي، والمنطقة الجغرافية الصريحة. الصلاحية: teams.manage (أو تفويض).
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { AccessError, roleHas } from "@/lib/rbac";
import { hasPermission } from "@/lib/delegations";
import { writeAudit } from "@/lib/audit";
import { groupUpdateSchema, emptyToNull, entityIdSchema } from "@/lib/organization";

/** حقول الفريق (المرحلة 9) — تُدمج مع groupUpdateSchema في PATCH */
const groupTeamFieldsSchema = z.object({
  kind: z.enum(["regular", "reserve"]).optional(),
  leaderUserId: z.string().trim().max(64).optional().nullable(), // "" = إزالة القائد
  siteId: z.string().trim().max(64).optional().nullable(), // "" = فك الربط بالموقع
  zoneLat: z.number().min(-90).max(90).optional().nullable(),
  zoneLng: z.number().min(-180).max(180).optional().nullable(),
  zoneRadiusM: z.number().int().min(20).max(5000).optional(),
});

const patchSchema = groupUpdateSchema.merge(groupTeamFieldsSchema);

async function canManageTeams(
  session: { companyId: string; sub: string; role: string } | null,
): Promise<boolean> {
  if (!session) return false;
  if (roleHas(session.role, "teams.manage")) return true;
  return hasPermission(session as never, "teams.manage");
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSession();
    if (!session) throw new AccessError(401, "unauthenticated");
    if (!(await canManageTeams(session))) throw new AccessError(403, "forbidden");

    const { id } = await params;
    if (!entityIdSchema.safeParse(id).success) {
      return NextResponse.json({ error: "invalid_input" }, { status: 400 });
    }

    const parsed = patchSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "invalid_input" }, { status: 400 });
    }

    const group = await db.workerGroup.findFirst({
      where: { id, companyId: session.companyId },
    });
    if (!group) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    const data = parsed.data;

    // القائد: مستخدم فعّال بعضوية سارية في الشركة (أي دوره — القيادة إسناد لا دور)
    let leaderUserId: string | null | undefined = undefined;
    if (data.leaderUserId !== undefined) {
      const wanted = emptyToNull(data.leaderUserId);
      if (wanted) {
        const leaderMembership = await db.userMembership.findFirst({
          where: { companyId: session.companyId, userId: wanted, revokedAt: null, user: { isActive: true } },
          select: { id: true },
        });
        if (!leaderMembership) {
          return NextResponse.json({ error: "leader_not_in_company" }, { status: 400 });
        }
        leaderUserId = wanted;
      } else {
        leaderUserId = null;
      }
    }

    // الموقع المرجعي: موقع فعّال ضمن الشركة
    let siteId: string | null | undefined = undefined;
    if (data.siteId !== undefined) {
      const wanted = emptyToNull(data.siteId);
      if (wanted) {
        const site = await db.site.findFirst({
          where: { id: wanted, companyId: session.companyId, status: "active" },
          select: { id: true },
        });
        if (!site) return NextResponse.json({ error: "site_not_found" }, { status: 400 });
        siteId = wanted;
      } else {
        siteId = null;
      }
    }

    const updated = await db.workerGroup.update({
      where: { id },
      data: {
        name: data.name ?? undefined,
        description: data.description !== undefined ? emptyToNull(data.description) : undefined,
        status: data.status ?? undefined,
        kind: data.kind ?? undefined,
        leaderUserId: leaderUserId === undefined ? undefined : leaderUserId,
        siteId: siteId === undefined ? undefined : siteId,
        zoneLat: data.zoneLat === undefined ? undefined : data.zoneLat,
        zoneLng: data.zoneLng === undefined ? undefined : data.zoneLng,
        zoneRadiusM: data.zoneRadiusM ?? undefined,
      },
    });

    const action =
      data.status === "archived"
        ? "worker_group.archive"
        : data.status === "active" && group.status === "archived"
          ? "worker_group.restore"
          : "worker_group.update";

    await writeAudit({
      companyId: session.companyId,
      userId: session.sub,
      action,
      entity: "worker_group",
      entityId: group.id,
      before: {
        name: group.name,
        status: group.status,
        kind: group.kind,
        leaderUserId: group.leaderUserId,
        siteId: group.siteId,
        zone: [group.zoneLat, group.zoneLng, group.zoneRadiusM],
      },
      after: {
        name: updated.name,
        status: updated.status,
        kind: updated.kind,
        leaderUserId: updated.leaderUserId,
        siteId: updated.siteId,
        zone: [updated.zoneLat, updated.zoneLng, updated.zoneRadiusM],
      },
    });

    return NextResponse.json({
      group: {
        id: updated.id,
        name: updated.name,
        status: updated.status,
        kind: updated.kind,
        leaderUserId: updated.leaderUserId,
        siteId: updated.siteId,
        zone:
          updated.zoneLat != null && updated.zoneLng != null
            ? { lat: updated.zoneLat, lng: updated.zoneLng, radiusM: updated.zoneRadiusM ?? 150 }
            : null,
      },
    });
  } catch (error) {
    if (error instanceof AccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[worker-groups/:id]", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

// الحذف = أرشفة (SPEC §11.7)
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSession();
    if (!session) throw new AccessError(401, "unauthenticated");
    if (!(await canManageTeams(session))) throw new AccessError(403, "forbidden");

    const { id } = await params;
    if (!entityIdSchema.safeParse(id).success) {
      return NextResponse.json({ error: "invalid_input" }, { status: 400 });
    }

    const group = await db.workerGroup.findFirst({
      where: { id, companyId: session.companyId },
    });
    if (!group) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    if (group.status === "archived") {
      return NextResponse.json({ ok: true, already: true });
    }

    const updated = await db.workerGroup.update({
      where: { id },
      data: { status: "archived" },
    });

    await writeAudit({
      companyId: session.companyId,
      userId: session.sub,
      action: "worker_group.archive",
      entity: "worker_group",
      entityId: group.id,
      before: { name: group.name, status: group.status },
      after: { name: updated.name, status: updated.status },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof AccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[worker-groups/:id]", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
