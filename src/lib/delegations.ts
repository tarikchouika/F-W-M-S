// HRMP — تفويض الصلاحيات (المرحلة 9 — v0.10.0)
// ---------------------------------------------------------------------------
// قاعدة المالك 2026-10-18: «السوبر أدمن وحده له صلاحية تسجيل حسابات المستخدمين،
// وله جميع الصلاحيات، ويمكنه تفويض الصلاحيات».
// النموذج: منح فوق الدور (بدل تغيير الدور) بسجل مؤرخ قابل للسحب — مثل AccountantGrant.
// التحقق هنا دائمًا في الخادم؛ الطبقة التزامية (rbac.ts) تبقى سريعة كما هي للمسارات القائمة،
// والمسارات الحساسة الجديدة تمر عبر requireDelegatedPermission.

import { db } from "@/lib/db";
import { PERMISSIONS, roleHas, type Permission } from "@/lib/rbac";
import type { SessionPayload } from "@/lib/auth/jwt";

/** الصلاحيات القابلة للتفويض: كل شيء ما عدا إدارة ملكية المنصة (روح SPEC §3.2) */
export const DELEGATABLE_PERMISSIONS: Permission[] = PERMISSIONS.filter(
  (p) => p !== "platform.manage",
);

export function isDelegatable(permission: string): boolean {
  return DELEGATABLE_PERMISSIONS.some((p) => p === permission);
}

export type DelegationRecord = {
  id: string;
  granteeId: string;
  granteeName: string;
  permission: string;
  note: string | null;
  grantedAt: string;
  grantedByName: string;
  expiresAt: string | null;
};

/** صلاحيات المستخدم الفعلية: دورُه + التفويضات السارية (غير المسحوبة/غير المنتهية) */
export async function effectivePermissions(session: SessionPayload): Promise<Set<Permission>> {
  const set = new Set<Permission>(
    (Object.values(PERMISSIONS) as Permission[]).filter((p) => roleHas(session.role, p)),
  );
  const rows = await db.permissionDelegation.findMany({
    where: {
      companyId: session.companyId,
      granteeId: session.sub,
      revokedAt: null,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    select: { permission: true },
  });
  for (const r of rows) {
    if ((PERMISSIONS as readonly string[]).includes(r.permission)) {
      set.add(r.permission as Permission);
    }
  }
  return set;
}

/** هل يملك المستخدم صلاحية (دورًا أو تفويضًا)؟ — للمسارات الجديدة */
export async function hasPermission(session: SessionPayload, permission: Permission): Promise<boolean> {
  if (roleHas(session.role, permission)) return true;
  const count = await db.permissionDelegation.count({
    where: {
      companyId: session.companyId,
      granteeId: session.sub,
      permission,
      revokedAt: null,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
  });
  return count > 0;
}

/** التفويضات السارية لشركة — للعرض في واجهة السوبر أدمن */
export async function listActiveDelegations(companyId: string): Promise<DelegationRecord[]> {
  const rows = await db.permissionDelegation.findMany({
    where: {
      companyId,
      revokedAt: null,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    include: {
      grantee: { select: { id: true, fullName: true } },
      grantor: { select: { fullName: true } },
    },
    orderBy: { grantedAt: "desc" },
  });
  return rows.map((r) => ({
    id: r.id,
    granteeId: r.grantee.id,
    granteeName: r.grantee.fullName,
    permission: r.permission,
    note: r.note,
    grantedAt: r.grantedAt.toISOString(),
    grantedByName: r.grantor.fullName,
    expiresAt: r.expiresAt ? r.expiresAt.toISOString() : null,
  }));
}
