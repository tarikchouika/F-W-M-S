// HRMP — كاتب سجل التدقيق (SPEC §3 و§6): كل فعل حساس يُسجَّل ولا يُحذف
import { db } from "@/lib/db";
import { requestMeta } from "@/lib/auth/session";

export type AuditInput = {
  companyId?: string | null;
  userId?: string | null;
  action: string; // صيغة شجرة نقاط: auth.login | company.switch | ...
  entity?: string;
  entityId?: string;
  before?: unknown;
  after?: unknown;
  reason?: string;
};

function toJsonText(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
}

/** كتابة قيد تدقيق — لا ترمي أبدًا كي لا تُفشل العملية الأصلية؛ الخطأ يُلوَّغ فقط */
export async function writeAudit(input: AuditInput): Promise<void> {
  try {
    const { ip, userAgent } = await requestMeta();
    await db.auditLog.create({
      data: {
        companyId: input.companyId ?? null,
        userId: input.userId ?? null,
        action: input.action,
        entity: input.entity ?? null,
        entityId: input.entityId ?? null,
        beforeJson: toJsonText(input.before),
        afterJson: toJsonText(input.after),
        reason: input.reason ?? null,
        ip,
        userAgent,
      },
    });
  } catch (error) {
    console.error("[audit] failed to write audit entry:", error);
  }
}
