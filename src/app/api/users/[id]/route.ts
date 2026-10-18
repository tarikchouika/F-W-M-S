// FWMS — تعديل مستخدم (المرحلة 9): تعطيل/تفعيل + المسمى الوظيفي + الاسم/الهاتف.
// users.manage كما في المصفوفة (السوبر + الأدمن) — الحسابات تُنشأ في /api/users (users.create).
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { AccessError, roleHas } from "@/lib/rbac";
import { hasPermission } from "@/lib/delegations";
import { writeAudit } from "@/lib/audit";
import { isJobTitleKey } from "@/lib/job-titles";

const patchSchema = z.object({
  isActive: z.boolean().optional(),
  fullName: z.string().trim().min(2).max(120).optional(),
  phone: z.string().trim().max(32).nullable().optional(),
  jobTitleKey: z.string().max(64).nullable().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSession();
    if (!session) throw new AccessError(401, "unauthenticated");

    const allowed = roleHas(session.role, "users.manage") || (await hasPermission(session, "users.manage"));
    if (!allowed) throw new AccessError(403, "forbidden");

    const { id } = await params;
    const membership = await db.userMembership.findFirst({
      where: { userId: id, companyId: session.companyId, revokedAt: null },
      include: { user: { select: { id: true, isActive: true, fullName: true, phone: true } } },
    });
    if (!membership) return NextResponse.json({ error: "not_found" }, { status: 404 });

    const parsed = patchSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "invalid_input" }, { status: 400 });
    }
    if (parsed.data.jobTitleKey && !isJobTitleKey(parsed.data.jobTitleKey)) {
      return NextResponse.json({ error: "invalid_job_title" }, { status: 400 });
    }
    const data = parsed.data;

    // لا تعطيل النفس (قفل النفس خارج — نمط تعليق الشركة النشطة)
    if (data.isActive === false && membership.userId === session.sub) {
      return NextResponse.json({ error: "cannot_deactivate_self" }, { status: 409 });
    }

    if (data.isActive !== undefined) {
      await db.user.update({ where: { id }, data: { isActive: data.isActive } });
      // تعطيل الحساب يبطل جلساته فورًا (نمط sessionsInvalidatedAt)
      if (!data.isActive) {
        await db.user.update({ where: { id }, data: { sessionsInvalidatedAt: new Date() } });
      }
    }
    if (data.fullName || data.phone !== undefined) {
      await db.user.update({
        where: { id },
        data: {
          ...(data.fullName ? { fullName: data.fullName } : {}),
          ...(data.phone !== undefined ? { phone: data.phone ? data.phone : null } : {}),
        },
      });
    }

    // المسمى الوظيفي: upsert ملف العامل
    if (data.jobTitleKey !== undefined) {
      const profile = await db.employeeProfile.findFirst({
        where: { companyId: session.companyId, userId: id, status: "active" },
        select: { id: true },
      });
      if (profile) {
        await db.employeeProfile.update({
          where: { id: profile.id },
          data: { jobTitleKey: data.jobTitleKey || null },
        });
      } else if (data.jobTitleKey) {
        await db.employeeProfile.create({
          data: { companyId: session.companyId, userId: id, jobTitleKey: data.jobTitleKey },
        });
      }
    }

    await writeAudit({
      companyId: session.companyId,
      userId: session.sub,
      action: "user.update",
      entity: "user",
      entityId: id,
      before: {
        isActive: membership.user.isActive,
        fullName: membership.user.fullName,
      },
      after: {
        isActive: data.isActive ?? membership.user.isActive,
        fullName: data.fullName ?? membership.user.fullName,
        jobTitleKey: data.jobTitleKey ?? undefined,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof AccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[users/:id PATCH]", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
