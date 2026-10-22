// FWMS — مجموعات العمال (SPEC §5 و§8 — المرحلة 2): قائمة وإنشاء — تُستخدم في الجدولة لاحقًا
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { requirePermission, AccessError } from "@/lib/rbac";
import { writeAudit } from "@/lib/audit";
import { groupCreateSchema, emptyToNull } from "@/lib/organization";
import { localizedName } from "@/lib/localized-name";
import { getUiLocale } from "@/i18n/ui-locale";

export async function GET() {
  try {
    const session = await getSession();
    requirePermission(session, "company.manage");
    const locale = await getUiLocale();

    const groups = await db.workerGroup.findMany({
      where: { companyId: session!.companyId },
      include: {
        leader: { select: { id: true, fullName: true, names: true } },
        site: { select: { id: true, name: true, latitude: true, longitude: true } },
        members: { where: { status: "active" }, select: { userId: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({
      count: groups.length,
      groups: groups.map((g) => ({
        id: g.id,
        name: g.name,
        description: g.description,
        status: g.status,
        kind: g.kind,
        leaderUserId: g.leaderUserId,
        leaderName: g.leader ? localizedName(g.leader, locale, "fullName") : null,
        siteId: g.siteId,
        siteName: g.site?.name ?? null,
        memberCount: g.members.length,
        zone: g.zoneLat != null && g.zoneLng != null
          ? { lat: g.zoneLat, lng: g.zoneLng, radiusM: g.zoneRadiusM ?? 150 }
          : null,
        createdAt: g.createdAt,
      })),
    });
  } catch (error) {
    if (error instanceof AccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[worker-groups]", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    requirePermission(session, "company.manage");

    const parsed = groupCreateSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "invalid_input" }, { status: 400 });
    }

    const group = await db.workerGroup.create({
      data: {
        companyId: session!.companyId,
        name: parsed.data.name,
        description: emptyToNull(parsed.data.description),
      },
    });

    await writeAudit({
      companyId: session!.companyId,
      userId: session!.sub,
      action: "worker_group.create",
      entity: "worker_group",
      entityId: group.id,
      after: { name: group.name, description: group.description },
    });

    return NextResponse.json(
      { group: { id: group.id, name: group.name, status: group.status } },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof AccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[worker-groups]", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
