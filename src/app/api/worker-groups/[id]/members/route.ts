// FWMS — إدارة أعضاء الفريق (المرحلة 9): إضافة/إزالة/عرض — teams.manage أو قيادة الفريق.
// الإزالة مؤرخة (removedAt — نمط UserMembership) والسجل التاريخي محفوظ.
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { AccessError, roleHas } from "@/lib/rbac";
import { hasPermission } from "@/lib/delegations";
import { writeAudit } from "@/lib/audit";
import { entityIdSchema, emptyToNull } from "@/lib/organization";
import { isJobTitleKey } from "@/lib/job-titles";

async function loadGroup(companyId: string, id: string) {
  return db.workerGroup.findFirst({ where: { id, companyId }, include: { leader: { select: { id: true, fullName: true } } } });
}

async function canManage(session: { companyId: string; sub: string; role: string }): Promise<boolean> {
  if (roleHas(session.role, "teams.manage")) return true;
  return hasPermission(session as never, "teams.manage");
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSession();
    if (!session) throw new AccessError(401, "unauthenticated");
    const { id } = await params;
    if (!entityIdSchema.safeParse(id).success) {
      return NextResponse.json({ error: "invalid_input" }, { status: 400 });
    }
    const group = await loadGroup(session.companyId, id);
    if (!group) return NextResponse.json({ error: "not_found" }, { status: 404 });

    // العرض: مسير الفرق، أو قائد هذا الفريق بعينه
    const manage = await canManage(session);
    const isLeader = group.leaderUserId === session.sub;
    if (!manage && !isLeader) throw new AccessError(403, "forbidden");

    const members = await db.workerGroupMember.findMany({
      where: { groupId: id, status: "active" },
      include: { user: { select: { id: true, fullName: true, email: true } } },
      orderBy: { addedAt: "asc" },
    });

    return NextResponse.json({
      group: {
        id: group.id,
        name: group.name,
        kind: group.kind,
        leaderUserId: group.leaderUserId,
        leaderName: group.leader?.fullName ?? null,
        siteId: group.siteId,
        zone: group.zoneLat != null && group.zoneLng != null
          ? { lat: group.zoneLat, lng: group.zoneLng, radiusM: group.zoneRadiusM ?? 150 }
          : null,
      },
      members: members.map((m) => ({
        userId: m.userId,
        fullName: m.user.fullName,
        email: m.user.email,
        jobTitleKey: m.jobTitleKey,
        addedAt: m.addedAt.toISOString(),
      })),
    });
  } catch (error) {
    if (error instanceof AccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[worker-groups/:id/members GET]", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

const addSchema = z.object({
  userId: z.string().min(1).max(64),
  jobTitleKey: z.string().max(64).nullable().optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSession();
    if (!session) throw new AccessError(401, "unauthenticated");
    if (!(await canManage(session))) throw new AccessError(403, "forbidden");

    const { id } = await params;
    if (!entityIdSchema.safeParse(id).success) {
      return NextResponse.json({ error: "invalid_input" }, { status: 400 });
    }
    const group = await loadGroup(session.companyId, id);
    if (!group) return NextResponse.json({ error: "not_found" }, { status: 404 });

    const parsed = addSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "invalid_input" }, { status: 400 });
    }
    if (parsed.data.jobTitleKey && !isJobTitleKey(parsed.data.jobTitleKey)) {
      return NextResponse.json({ error: "invalid_job_title" }, { status: 400 });
    }

    // العضو: مستخدم فعّال بعضوية سارية في هذه الشركة
    const membership = await db.userMembership.findFirst({
      where: { companyId: session.companyId, userId: parsed.data.userId, revokedAt: null, user: { isActive: true } },
      select: { id: true },
    });
    if (!membership) return NextResponse.json({ error: "user_not_in_company" }, { status: 404 });

    const existing = await db.workerGroupMember.findFirst({
      where: { groupId: id, userId: parsed.data.userId, status: "active" },
      select: { id: true },
    });
    if (existing) return NextResponse.json({ error: "already_member" }, { status: 409 });

    const member = await db.workerGroupMember.create({
      data: {
        companyId: session.companyId,
        groupId: id,
        userId: parsed.data.userId,
        jobTitleKey: emptyToNull(parsed.data.jobTitleKey ?? null) ?? null,
        addedBy: session.sub,
      },
    });

    await writeAudit({
      companyId: session.companyId,
      userId: session.sub,
      action: "worker_group.member_add",
      entity: "worker_group",
      entityId: id,
      after: { userId: parsed.data.userId, jobTitleKey: member.jobTitleKey },
    });

    return NextResponse.json({ ok: true, member: { userId: member.userId, addedAt: member.addedAt.toISOString() } });
  } catch (error) {
    if (error instanceof AccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[worker-groups/:id/members POST]", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSession();
    if (!session) throw new AccessError(401, "unauthenticated");
    if (!(await canManage(session))) throw new AccessError(403, "forbidden");

    const { id } = await params;
    const userId = new URL(req.url).searchParams.get("userId");
    if (!entityIdSchema.safeParse(id).success || !userId) {
      return NextResponse.json({ error: "invalid_input" }, { status: 400 });
    }
    const group = await loadGroup(session.companyId, id);
    if (!group) return NextResponse.json({ error: "not_found" }, { status: 404 });

    const member = await db.workerGroupMember.findFirst({
      where: { groupId: id, userId, status: "active" },
      select: { id: true, jobTitleKey: true },
    });
    if (!member) return NextResponse.json({ error: "not_member" }, { status: 404 });

    await db.workerGroupMember.update({
      where: { id: member.id },
      data: { status: "removed", removedAt: new Date() },
    });

    // إزالة القيادة إن كان هو القائد (لا فريق بلا قائد معيَّن مُزال)
    if (group.leaderUserId === userId) {
      await db.workerGroup.update({ where: { id }, data: { leaderUserId: null } });
    }

    await writeAudit({
      companyId: session.companyId,
      userId: session.sub,
      action: "worker_group.member_remove",
      entity: "worker_group",
      entityId: id,
      before: { userId, jobTitleKey: member.jobTitleKey },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof AccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[worker-groups/:id/members DELETE]", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
