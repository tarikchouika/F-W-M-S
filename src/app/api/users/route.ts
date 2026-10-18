// FWMS — إدارة المستخدمين (المرحلة 9 — v0.10.0)
// ---------------------------------------------------------------------------
// قاعدة المالك 2026-10-18: «السوبر أدمين وحده له صلاحية تسجيل حسابات المستخدمين،
// وله جميع الصلاحيات، ويمكنه تفويض الصلاحيات».
// POST (إنشاء حساب): users.create — السوبر أدمن بطبعه، أو من فوَّضها إليه (تفويض قابل للسحب).
// PATCH (تعديل/تعطيل): users.manage كما في المصفوفة (بقاءً على المكتسبات).
// كلمة المرور الابتدائية: تُولَّد عشوائيًا إن لم تُرسل وتُعرض مرة واحدة في الاستجابة حصرًا
// (درس المرحلة 8: بيانات التسليم الأمنية تُعرض مرة واحدة ولا تُخزَّن صريحة أبدًا).
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { AccessError } from "@/lib/rbac";
import { hasPermission } from "@/lib/delegations";
import { hashPassword } from "@/lib/auth/password";
import { writeAudit } from "@/lib/audit";
import { isJobTitleKey } from "@/lib/job-titles";
import { ROLES } from "@/lib/rbac";

function randomInitialPassword(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < 12; i += 1) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return `Fw-${out}!`;
}

export async function GET() {
  try {
    const session = await getSession();
    if (!session) throw new AccessError(401, "unauthenticated");

    const memberships = await db.userMembership.findMany({
      where: { companyId: session.companyId, revokedAt: null },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            fullName: true,
            phone: true,
            isActive: true,
            lastLoginAt: true,
            employeeProfiles: {
              where: { companyId: session.companyId, status: "active" },
              select: { jobTitleKey: true, jobTitleCustom: true },
              take: 1,
            },
          },
        },
      },
      orderBy: { grantedAt: "asc" },
    });

    return NextResponse.json({
      count: memberships.length,
      users: memberships.map((m) => ({
        userId: m.user.id,
        email: m.user.email,
        fullName: m.user.fullName,
        phone: m.user.phone,
        role: m.role,
        isActive: m.user.isActive,
        lastLoginAt: m.user.lastLoginAt ? m.user.lastLoginAt.toISOString() : null,
        jobTitleKey: m.user.employeeProfiles[0]?.jobTitleKey ?? null,
        jobTitleCustom: m.user.employeeProfiles[0]?.jobTitleCustom ?? null,
      })),
    });
  } catch (error) {
    if (error instanceof AccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[users GET]", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

const createSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(190),
  fullName: z.string().trim().min(2).max(120),
  phone: z.string().trim().max(32).optional().nullable(),
  password: z.string().min(8).max(72).optional(),
  role: z.enum(ROLES),
  jobTitleKey: z.string().max(64).nullable().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) throw new AccessError(401, "unauthenticated");

    // إنشاء الحسابات: users.create — السوبر أدمن أو مفوَّض (قاعدة المالك)
    if (session.role !== "super_admin") {
      const delegated = await hasPermission(session, "users.create");
      if (!delegated) throw new AccessError(403, "forbidden");
    }

    const parsed = createSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "invalid_input" }, { status: 400 });
    }
    if (parsed.data.jobTitleKey && !isJobTitleKey(parsed.data.jobTitleKey)) {
      return NextResponse.json({ error: "invalid_job_title" }, { status: 400 });
    }

    const data = parsed.data;
    const existing = await db.user.findUnique({ where: { email: data.email }, select: { id: true } });
    if (existing) {
      return NextResponse.json({ error: "email_taken" }, { status: 409 });
    }

    const initialPassword = data.password ?? randomInitialPassword();
    const passwordHash = await hashPassword(initialPassword);

    const result = await db.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: data.email,
          fullName: data.fullName,
          phone: data.phone ? data.phone : null,
          passwordHash,
          locale: session.locale || "ar",
        },
      });
      // العضوية في الشركة النشطة للمُنشئ (isDefault واحدة لكل مستخدم — درس المرحلة 8)
      const priorMemberships = await tx.userMembership.count({ where: { userId: user.id } });
      await tx.userMembership.create({
        data: {
          userId: user.id,
          companyId: session.companyId,
          role: data.role,
          isDefault: priorMemberships === 0,
        },
      });
      if (data.jobTitleKey) {
        await tx.employeeProfile.create({
          data: {
            companyId: session.companyId,
            userId: user.id,
            jobTitleKey: data.jobTitleKey,
          },
        });
      }
      return user;
    });

    await writeAudit({
      companyId: session.companyId,
      userId: session.sub,
      action: "user.create",
      entity: "user",
      entityId: result.id,
      after: { email: result.email, role: data.role, jobTitleKey: data.jobTitleKey ?? null },
    });

    // كلمة المرور الابتدائية: تُعرض مرة واحدة هنا حصرًا — لا تُخزَّن صريحة
    const generated = !data.password;
    return NextResponse.json({
      ok: true,
      user: { id: result.id, email: result.email, role: data.role },
      initialPassword: initialPassword,
      passwordGenerated: generated,
    });
  } catch (error) {
    if (error instanceof AccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[users POST]", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
