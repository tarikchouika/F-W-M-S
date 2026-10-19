// FWMS — سجل التدقيق (SPEC §3): يقرؤه من يملك audit.view — مقيّد بالشركة النشطة
// (جولة 2026-10-19): فلاتر (إجراء/فاعل/مدى زمني) + ترقيم صفحات — صفحة كاملة بدل آخر 50
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { requirePermission, AccessError } from "@/lib/rbac";
import { localizedName } from "@/lib/localized-name";
import { getUiLocale } from "@/i18n/ui-locale";

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    requirePermission(session, "audit.view");
    const locale = await getUiLocale();

    const url = new URL(req.url);
    const q = (k: string) => (url.searchParams.get(k) ?? "").trim();
    const page = Math.min(Math.max(parseInt(q("page") || "1", 10) || 1, 1), 500);
    const pageSize = Math.min(Math.max(parseInt(q("pageSize") || "25", 10) || 25, 5), 100);

    const actionLike = q("action");
    const userLike = q("user");
    const from = q("from");
    const to = q("to");

    // super_admin يرى كل الشركات؛ غيره شركته النشطة فقط (عزل 3.1)
    const companyIdScope =
      session!.role === "super_admin" ? undefined : session!.companyId;

    const actorIds = userLike
      ? await db.user.findMany({
          where: { OR: [
            { fullName: { contains: userLike } },
            { email: { contains: userLike } },
          ] },
          select: { id: true },
          take: 50,
        }).then((rows) => rows.map((r) => r.id))
      : null; // null = بلا فلتر فاعل

    const where = {
      ...(companyIdScope ? { companyId: companyIdScope } : {}),
      ...(actionLike ? { action: { contains: actionLike } } : {}),
      ...(from || to
        ? { createdAt: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(`${to}T23:59:59`) } : {}) } }
        : {}),
      ...(Array.isArray(actorIds) ? { userId: { in: actorIds.length ? actorIds : ["__none__"] } } : {}),
    };

    const [total, logs] = await Promise.all([
      db.auditLog.count({ where }),
      db.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          user: { select: { fullName: true, email: true } },
          company: { select: { legalName: true, names: true } },
        },
      }),
    ]);

    return NextResponse.json({
      total,
      page,
      pageSize,
      pages: Math.max(1, Math.ceil(total / pageSize)),
      logs: logs.map((l) => ({
        id: l.id,
        at: l.createdAt,
        action: l.action,
        actor: l.user?.fullName ?? "system",
        actorEmail: l.user?.email ?? null,
        company: l.company ? localizedName(l.company, locale, "legalName") : null,
        entity: l.entity,
        entityId: l.entityId,
        reason: l.reason,
        ip: l.ip,
        beforeJson: l.beforeJson,
        afterJson: l.afterJson,
      })),
    });
  } catch (error) {
    if (error instanceof AccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[audit]", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
