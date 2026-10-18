// FWMS — تفويض الصلاحيات (المرحلة 9): السوبر أدمن وحده يفوّض (لا تفويض التفويض) —
// «يمكنه تفويض الصلاحيات» قاعدة المالك 2026-10-18. كل منح/سحب يُدوَّن في التدقيق.
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { AccessError } from "@/lib/rbac";
import { DELEGATABLE_PERMISSIONS, isDelegatable, listActiveDelegations } from "@/lib/delegations";
import { writeAudit } from "@/lib/audit";

function requireSuper(session: { role: string } | null): void {
  if (!session) throw new AccessError(401, "unauthenticated");
  if (session.role !== "super_admin") throw new AccessError(403, "forbidden");
}

export async function GET() {
  try {
    const session = await getSession();
    requireSuper(session);
    const delegations = await listActiveDelegations(session!.companyId);
    return NextResponse.json({
      delegablePermissions: DELEGATABLE_PERMISSIONS,
      delegations,
    });
  } catch (error) {
    if (error instanceof AccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[users/delegations GET]", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

const grantSchema = z.object({
  granteeId: z.string().min(1).max(64),
  permission: z.string().min(1).max(64),
  note: z.string().trim().max(240).optional().nullable(),
  expiresInDays: z.number().int().min(1).max(3650).optional().nullable(),
});

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    requireSuper(session);

    const parsed = grantSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "invalid_input" }, { status: 400 });
    }
    if (!isDelegatable(parsed.data.permission)) {
      return NextResponse.json({ error: "not_delegable" }, { status: 400 });
    }

    const grantee = await db.userMembership.findFirst({
      where: { companyId: session!.companyId, userId: parsed.data.granteeId, revokedAt: null, user: { isActive: true } },
      select: { id: true },
    });
    if (!grantee) return NextResponse.json({ error: "grantee_not_found" }, { status: 404 });

    // لا تكرار: منح سائر لنفس الصلاحية لنفس المستخدم
    const duplicate = await db.permissionDelegation.findFirst({
      where: {
        companyId: session!.companyId,
        granteeId: parsed.data.granteeId,
        permission: parsed.data.permission,
        revokedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      select: { id: true },
    });
    if (duplicate) return NextResponse.json({ error: "already_delegated" }, { status: 409 });

    const expiresAt = parsed.data.expiresInDays
      ? new Date(Date.now() + parsed.data.expiresInDays * 24 * 60 * 60 * 1000)
      : null;

    const created = await db.permissionDelegation.create({
      data: {
        companyId: session!.companyId,
        grantorId: session!.sub,
        granteeId: parsed.data.granteeId,
        permission: parsed.data.permission,
        note: parsed.data.note ? parsed.data.note : null,
        expiresAt,
      },
    });

    await writeAudit({
      companyId: session!.companyId,
      userId: session!.sub,
      action: "permission.delegation_grant",
      entity: "permission_delegation",
      entityId: created.id,
      after: {
        granteeId: parsed.data.granteeId,
        permission: parsed.data.permission,
        expiresAt: expiresAt ? expiresAt.toISOString() : null,
      },
    });

    return NextResponse.json({ ok: true, delegation: { id: created.id } });
  } catch (error) {
    if (error instanceof AccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[users/delegations POST]", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await getSession();
    requireSuper(session);

    const id = new URL(req.url).searchParams.get("id");
    if (!id) return NextResponse.json({ error: "invalid_input" }, { status: 400 });

    const delegation = await db.permissionDelegation.findFirst({
      where: { id, companyId: session!.companyId, revokedAt: null },
      select: { id: true, granteeId: true, permission: true },
    });
    if (!delegation) return NextResponse.json({ error: "not_found" }, { status: 404 });

    await db.permissionDelegation.update({
      where: { id: delegation.id },
      data: { revokedAt: new Date() },
    });

    await writeAudit({
      companyId: session!.companyId,
      userId: session!.sub,
      action: "permission.delegation_revoke",
      entity: "permission_delegation",
      entityId: delegation.id,
      before: { granteeId: delegation.granteeId, permission: delegation.permission },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof AccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[users/delegations DELETE]", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
