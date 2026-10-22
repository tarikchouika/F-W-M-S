// FWMS — تعديل مستخدم (المرحلة 9): تعطيل/تفعيل + المسمى الوظيفي + الاسم/الهاتف.
// users.manage كما في المصفوفة (السوبر + الأدمن) — الحسابات تُنشأ في /api/users (users.create).
// (علاج بلاغ المالك 2026-10-23 «خلل ترجمة اسم العامل/المستخدم»): PATCH يقبل أسماء محلية names.
// (أمر المالك 2026-10-23 «لا أستطيع مسح أو إزالة مستخدم…»): DELETE حذف نهائي —
// صلاحية data.delete (السوبر أدمن بطبعه ويُفوّض) مع حرّاس سلامة السجلات التشغيلية.
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { AccessError, roleHas } from "@/lib/rbac";
import { hasPermission } from "@/lib/delegations";
import { writeAudit } from "@/lib/audit";
import { isJobTitleKey } from "@/lib/job-titles";
import { localeNamesSchema, namesColumnValue } from "@/lib/localized-name";

const patchSchema = z.object({
  isActive: z.boolean().optional(),
  fullName: z.string().trim().min(2).max(120).optional(),
  names: localeNamesSchema.optional(),
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

    // 🔒 فحص أمني 2026-10-21: غير السوبر أدمن لا يعطّل حساب مالك المنصة
    // (مُثبت حيًّا: أدمن لديه users.manage عطّل super_admin ⇒ المالك 403 account_inactive
    // وجلساته تموت ولا يستطيع إعادة تفعيل نفسه — حجب خدمة على مالك المنصة من موظف).
    // سوبر أدمن يعطّل سوبر أدمن آخر يبقى مسموحًا (إدارة المنصة بطبعها).
    if (data.isActive === false && membership.role === "super_admin" && session.role !== "super_admin") {
      return NextResponse.json({ error: "cannot_deactivate_super_admin" }, { status: 403 });
    }

    if (data.isActive !== undefined) {
      await db.user.update({ where: { id }, data: { isActive: data.isActive } });
      // تعطيل الحساب يبطل جلساته فورًا (نمط sessionsInvalidatedAt)
      if (!data.isActive) {
        await db.user.update({ where: { id }, data: { sessionsInvalidatedAt: new Date() } });
      }
    }
    if (data.fullName || data.phone !== undefined || data.names !== undefined) {
      await db.user.update({
        where: { id },
        data: {
          ...(data.fullName ? { fullName: data.fullName } : {}),
          ...(data.names !== undefined ? { names: namesColumnValue(data.names) } : {}),
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

// ─────────────────────────────────────────────────────────────────────────────
// الحذف النهائي (أمر المالك 2026-10-23): data.delete — السوبر أدمن بطبعه أو مفوَّض.
// حرّاس السلامة: لا حذف النفس · لا حذف مالك منصة آخر · لا حذف حساب له سجلات
// تشغيلية (ورديات/حضور/أجور) حفاظًا على سلامة التاريخ المالي والتدقيق — التعطيل هو
// البديل الموثق. الحذف يسقط كل الارتباطات (عضويات/تفويضات/ملفات/أجهزة/إشعارات).
// ─────────────────────────────────────────────────────────────────────────────
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) throw new AccessError(401, "unauthenticated");

    const allowed = roleHas(session.role, "data.delete") || (await hasPermission(session, "data.delete"));
    if (!allowed) throw new AccessError(403, "no_delete_permission");

    const { id } = await params;
    if (id === session.sub) {
      return NextResponse.json({ error: "cannot_delete_self" }, { status: 409 });
    }

    const user = await db.user.findUnique({
      where: { id },
      include: { memberships: { where: { revokedAt: null } } },
    });
    if (!user) return NextResponse.json({ error: "not_found" }, { status: 404 });

    // 🔒 مالك منصة لا يُحذف إلا من مالك (توازن قاعدة cannot_deactivate_super_admin)
    const isSuper = user.memberships.some((m) => m.role === "super_admin");
    if (isSuper && session.role !== "super_admin") {
      return NextResponse.json({ error: "cannot_delete_super_admin" }, { status: 403 });
    }

    // حرّاس السلامة التشغيلية: أي سجل وورديات/حضور/أجور/رسائل يمنع الحذف النهائي
    const [shifts, attendance, payslips, recurrences] = await Promise.all([
      db.shift.count({ where: { workerUserId: id } }),
      db.attendanceEvent.count({ where: { workerUserId: id } }),
      db.payslip.count({ where: { workerUserId: id } }),
      db.shiftRecurrence.count({ where: { workerUserId: id } }),
    ]);
    if (shifts + attendance + payslips + recurrences > 0) {
      return NextResponse.json({ error: "user_has_records" }, { status: 409 });
    }

    const reason = (await req.json().catch(() => null))?.reason?.toString?.().slice(0, 500) ?? null;

    await db.$transaction(async (tx) => {
      // إسقاط كل الارتباطات قبل الصف نفسه (الجلسات عديمة حالة — إبطالها عبر الحذف المباشر)
      await tx.permissionDelegation.deleteMany({
        where: { OR: [{ granteeId: id }, { grantorId: id }] },
      });
      await tx.accountantGrant.deleteMany({ where: { OR: [{ userId: id }, { grantedBy: id }] } });
      await tx.employeeProfile.deleteMany({ where: { userId: id } });
      await tx.workerGroupMember.deleteMany({ where: { userId: id } });
      await tx.memberLocationPing.deleteMany({ where: { userId: id } });
      await tx.device.deleteMany({ where: { userId: id } });
      await tx.notification.deleteMany({ where: { userId: id } });
      await tx.voiceMessage.deleteMany({ where: { OR: [{ senderId: id }, { recipientId: id }] } });
      await tx.userMembership.deleteMany({ where: { userId: id } });
      await tx.user.delete({ where: { id } });
    });

    await writeAudit({
      companyId: session.companyId,
      userId: session.sub,
      action: "user.delete",
      entity: "user",
      entityId: id,
      before: { email: user.email, fullName: user.fullName },
      reason,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof AccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[users/:id DELETE]", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
