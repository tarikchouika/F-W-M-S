// HRMP — محرك نقل ملكية المنصة (SPEC §3.2 — المرحلة 8)
// الإجراء كله بأداة إدارية موثّقة (docs/OWNERSHIP_TRANSFER.md) لا بتعديل يدوي في القاعدة:
//   1) موافقة صريحة من المالك الحالي والجديد (خطوتان منفصلتان + إعادة مصادقة بكلمة المرور)
//      مع تجميد مؤقت للتغييرات الإدارية (isPlatformFrozen في branding.ts)
//   2) نسخة احتياطية كاملة + تصدير للبيانات بصيغة مفتوحة (JSON) + فحص تطابق
//   3) نقل الكيان platform_owner وبيانات الدخول الإدارية + إبطال كل الجلسات
//      + إلغاء عضويات super_admin السابقة (المالك السابق يفقد الوصول — لا باب خلفي)
//   4) سجل التدقيق كاملًا + حدث النقل فيه (من، إلى، متى، من وافق)
// كل انتقال حالة يُسجَّل في التدقيق، وكل كلمة مرور/رمز موافقة يُعرض مرة واحدة ولا يُخزَّن نصًا.
import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { db } from "@/lib/db";
import { verifyPassword } from "@/lib/auth/password";
import { writeAudit } from "@/lib/audit";
import type { PlatformBranding } from "@/lib/branding";

// ─── الأخطاء ─────────────────────────────────────────────────

export class OwnershipError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "OwnershipError";
    this.status = status;
  }
}

// ─── الأداة العامة للحالة ────────────────────────────────────

export type OwnershipStatus = {
  owner: PlatformBranding;
  freeze: boolean;
  activeTransfer: {
    id: string;
    state: string;
    reason: string | null;
    newOwnerLegalName: string;
    newOwnerDisplayName: string;
    newOwnerInitialAdminEmail: string;
    initiatedAt: string;
    currentOwnerApprovedAt: string | null;
    newOwnerApprovedAt: string | null;
    executedAt: string | null;
    secretsRotatedAt: string | null;
  } | null;
  lastCompleted: {
    id: string;
    executedAt: string;
    newOwnerLegalName: string;
    secretsRotatedAt: string | null;
  } | null;
};

export async function getOwnershipStatus(owner: PlatformBranding): Promise<OwnershipStatus> {
  const [active, lastCompleted] = await Promise.all([
    db.ownershipTransfer.findFirst({
      where: { state: { in: ["awaiting_current_owner", "awaiting_new_owner", "approved"] } },
      orderBy: { createdAt: "desc" },
    }),
    db.ownershipTransfer.findFirst({
      where: { state: "completed" },
      orderBy: { executedAt: "desc" },
    }),
  ]);

  return {
    owner,
    freeze: owner.transferFreeze,
    activeTransfer: active
      ? {
          id: active.id,
          state: active.state,
          reason: active.reason,
          newOwnerLegalName: active.newOwnerLegalName,
          newOwnerDisplayName: active.newOwnerDisplayName,
          newOwnerInitialAdminEmail: active.newOwnerInitialAdminEmail,
          initiatedAt: active.createdAt.toISOString(),
          currentOwnerApprovedAt: active.currentOwnerApprovedAt?.toISOString() ?? null,
          newOwnerApprovedAt: active.newOwnerApprovedAt?.toISOString() ?? null,
          executedAt: active.executedAt?.toISOString() ?? null,
          secretsRotatedAt: active.secretsRotatedAt?.toISOString() ?? null,
        }
      : null,
    lastCompleted: lastCompleted
      ? {
          id: lastCompleted.id,
          executedAt: (lastCompleted.executedAt ?? lastCompleted.updatedAt).toISOString(),
          newOwnerLegalName: lastCompleted.newOwnerLegalName,
          secretsRotatedAt: lastCompleted.secretsRotatedAt?.toISOString() ?? null,
        }
      : null,
  };
}

// ─── أدوات داخلية ────────────────────────────────────────────

/** إعادة مصادقة بكلمة المرور لكل خطوة حساسة (SPEC §3.2: موافقة بمصادقة) */
async function requirePasswordReauth(userId: string, password: unknown): Promise<void> {
  if (typeof password !== "string" || password.length === 0) {
    throw new OwnershipError(400, "password_required");
  }
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    throw new OwnershipError(401, "reauth_failed");
  }
}

function sha256Hex(data: string | Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

/** مسار ملف قاعدة البيانات الفعلي من DATABASE_URL (متغير الصدفة يتفوق — درس §9) */
function resolveDatabaseFile(): string {
  const raw = process.env.DATABASE_URL ?? "";
  const p = raw.replace(/^file:/, "");
  if (!p) throw new OwnershipError(500, "database_url_missing");
  return resolve(p);
}

/** مجلد مخرجات النقل (نسخة احتياطية + تصدير) بجوار القاعدة — لا يُرفع إلى git */
async function transferArtifactsDir(): Promise<string> {
  const dbFile = resolveDatabaseFile();
  const dir = join(dirname(dbFile), "ownership-transfers");
  await mkdir(dir, { recursive: true });
  return dir;
}

// ─── 1) بدء النقل + التجميد ──────────────────────────────────

export type InitiateInput = {
  newOwnerLegalName: string;
  newOwnerDisplayName: string;
  newOwnerContactEmail?: string | null;
  newOwnerContactPhone?: string | null;
  newOwnerInitialAdminEmail: string;
  reason?: string | null;
};

export async function initiateTransfer(
  sessionUserId: string,
  input: InitiateInput,
  password: unknown
): Promise<{ transferId: string }> {
  await requirePasswordReauth(sessionUserId, password);

  // لا نقل جارٍ آخر
  const active = await db.ownershipTransfer.findFirst({
    where: { state: { in: ["awaiting_current_owner", "awaiting_new_owner", "approved"] } },
  });
  if (active) throw new OwnershipError(409, "transfer_in_progress");

  // بيانات المالك الجديد صريحة ومكتملة (كيان قانوني + حساب ابتدائي جديد غير موجود)
  const email = input.newOwnerInitialAdminEmail.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new OwnershipError(422, "bad_admin_email");
  const clash = await db.user.findUnique({ where: { email } });
  if (clash) throw new OwnershipError(409, "admin_email_exists");

  const owner = await db.platformOwner.findFirst({ orderBy: { createdAt: "asc" } });
  if (!owner) throw new OwnershipError(500, "platform_owner_missing");

  const row = await db.ownershipTransfer.create({
    data: {
      state: "awaiting_current_owner",
      reason: input.reason ?? null,
      newOwnerLegalName: input.newOwnerLegalName.trim(),
      newOwnerDisplayName: input.newOwnerDisplayName.trim(),
      newOwnerContactEmail: input.newOwnerContactEmail?.trim() || null,
      newOwnerContactPhone: input.newOwnerContactPhone?.trim() || null,
      newOwnerInitialAdminEmail: email,
      initiatedByUserId: sessionUserId,
      // هوية المالك الحالي تُحفظ كاملة قبل أي تغيير (لا يُفقد شيء للتدقيق)
      oldOwnerJson: JSON.stringify({
        id: owner.id,
        legalName: owner.legalName,
        displayName: owner.displayName,
        contactEmail: owner.contactEmail,
        contactPhone: owner.contactPhone,
        logoUrl: owner.logoUrl,
        defaultLocale: owner.defaultLocale,
        defaultCurrency: owner.defaultCurrency,
      }),
    },
  });

  // التجميد المؤقت للتغييرات الإدارية (SPEC §3.2 خطوة 1) — يُرفع عند الإتمام/الإلغاء
  await db.platformOwner.update({ where: { id: owner.id }, data: { transferFreeze: true } });

  await writeAudit({
    userId: sessionUserId,
    action: "ownership.transfer.initiated",
    entity: "ownership_transfer",
    entityId: row.id,
    after: { state: row.state, newOwnerLegalName: row.newOwnerLegalName, newOwnerInitialAdminEmail: email },
    reason: input.reason ?? undefined,
  });

  return { transferId: row.id };
}

// ─── 2أ) موافقة المالك الحالي ────────────────────────────────

export async function approveByCurrentOwner(
  sessionUserId: string,
  password: unknown
): Promise<{ transferId: string }> {
  await requirePasswordReauth(sessionUserId, password);

  const row = await db.ownershipTransfer.findFirst({
    where: { state: "awaiting_current_owner" },
    orderBy: { createdAt: "desc" },
  });
  if (!row) throw new OwnershipError(409, "no_awaiting_transfer");

  await db.ownershipTransfer.update({
    where: { id: row.id },
    data: {
      state: "awaiting_new_owner",
      currentOwnerApprovedAt: new Date(),
      currentOwnerApprovedBy: sessionUserId,
    },
  });

  await writeAudit({
    userId: sessionUserId,
    action: "ownership.transfer.current_owner_approved",
    entity: "ownership_transfer",
    entityId: row.id,
    after: { state: "awaiting_new_owner" },
  });

  return { transferId: row.id };
}

// ─── 2ب) موافقة المالك الجديد (برمز يُسلَّم خارج النظام) ───────

/** توليد رمز موافقة المالك الجديد — يُعرض للمشغّل مرة واحدة ليسلّمه خارج النظام،
 *  ويُخزَّن hash فقط. الخطوة الثانية المنفصلة (SPEC §3.2: موافقة المالكين خطوتان) */
export async function issueNewOwnerApprovalCode(
  sessionUserId: string,
  password: unknown
): Promise<{ transferId: string; approvalCode: string }> {
  await requirePasswordReauth(sessionUserId, password);

  const row = await db.ownershipTransfer.findFirst({
    where: { state: "awaiting_new_owner" },
    orderBy: { createdAt: "desc" },
  });
  if (!row) throw new OwnershipError(409, "no_awaiting_new_owner");

  const code = randomBytes(5).toString("hex").toUpperCase(); // 10 محارف سداسية
  await db.ownershipTransfer.update({
    where: { id: row.id },
    data: { approvalCodeHash: sha256Hex(code) },
  });

  await writeAudit({
    userId: sessionUserId,
    action: "ownership.transfer.approval_code_issued",
    entity: "ownership_transfer",
    entityId: row.id,
  });

  return { transferId: row.id, approvalCode: code };
}

/** إدخال رمز موافقة المالك الجديد (أدخله مشغّل مأذون بعد استلامه من المالك الجديد) */
export async function approveByNewOwner(
  sessionUserId: string,
  password: unknown,
  approvalCode: unknown
): Promise<{ transferId: string }> {
  await requirePasswordReauth(sessionUserId, password);
  if (typeof approvalCode !== "string" || approvalCode.length === 0) {
    throw new OwnershipError(400, "approval_code_required");
  }

  const row = await db.ownershipTransfer.findFirst({
    where: { state: "awaiting_new_owner" },
    orderBy: { createdAt: "desc" },
  });
  if (!row) throw new OwnershipError(409, "no_awaiting_new_owner");
  if (!row.approvalCodeHash) throw new OwnershipError(409, "approval_code_not_issued");

  if (sha256Hex(approvalCode.trim().toUpperCase()) !== row.approvalCodeHash) {
    await writeAudit({
      userId: sessionUserId,
      action: "ownership.transfer.new_owner_approval_failed",
      entity: "ownership_transfer",
      entityId: row.id,
    });
    throw new OwnershipError(401, "approval_code_mismatch");
  }

  await db.ownershipTransfer.update({
    where: { id: row.id },
    data: {
      state: "approved",
      newOwnerApprovedAt: new Date(),
      newOwnerApprovedByUserId: sessionUserId,
      approvalCodeHash: null, // الرمز أحادي الاستخدام — يُستهلك
    },
  });

  await writeAudit({
    userId: sessionUserId,
    action: "ownership.transfer.new_owner_approved",
    entity: "ownership_transfer",
    entityId: row.id,
    after: { state: "approved" },
  });

  return { transferId: row.id };
}

// ─── 3) التنفيذ: نسخ احتياطي + تصدير + فحص + نقل ─────────────

/** جداول تشغيلية لملف التصدير المفتوح — بلا جداول SQLite الداخلية ولا سجل migrations */
function exportableTables(tables: string[]): string[] {
  return tables.filter((t) => !t.startsWith("sqlite_") && t !== "_prisma_migrations");
}

type ExecuteResult = {
  transferId: string;
  backupPath: string;
  backupSha256: string;
  backupTableCount: number;
  exportPath: string;
  exportSha256: string;
  integrityCheckStatus: "ok" | "failed";
  integrityCheckDetail: string | null;
  revokedSuperAdminCount: number;
  sessionsInvalidatedUsers: number;
  newAdminUserId: string;
  newAdminEmail: string;
  /** كلمة مرور ابتدائية عشوائية — تُعرض مرة واحدة هنا فقط ولا تُخزَّن نصًا أبدًا */
  newAdminTempPassword: string;
  /** قيمة مقترحة لسر JWT الجديد (AUTH_SECRET) — يطبّقها المشغّل في .env ثم يؤكدها */
  suggestedAuthSecret: string;
};

export async function executeTransfer(
  sessionUserId: string,
  password: unknown
): Promise<ExecuteResult> {
  await requirePasswordReauth(sessionUserId, password);

  const row = await db.ownershipTransfer.findFirst({
    where: { state: "approved" },
    orderBy: { createdAt: "desc" },
  });
  if (!row) throw new OwnershipError(409, "no_approved_transfer");
  const owner = await db.platformOwner.findFirst({ orderBy: { createdAt: "asc" } });
  if (!owner) throw new OwnershipError(500, "platform_owner_missing");

  // ── خطوة أ: نسخة احتياطية كاملة (VACUUM INTO — نسخة سليمة أثناء التشغيل) ──
  const artifactsDir = await transferArtifactsDir();
  const backupPath = join(artifactsDir, `ownership-${row.id}.db`);
  const dbFile = resolveDatabaseFile();
  await db.$executeRawUnsafe(`VACUUM INTO '${backupPath.replace(/'/g, "''")}'`);
  const backupBuf = await readFile(backupPath);
  const backupSha256 = sha256Hex(backupBuf);

  // ── خطوة ب: فحص تطابق النسخة الاحتياطية (quick_check + عدد الجداول) ──
  const { PrismaClient } = await import("@prisma/client");
  const backupClient = new PrismaClient({
    datasources: { db: { url: `file:${backupPath}` } },
    log: ["error"],
  });
  let integrityCheckStatus: "ok" | "failed" = "ok";
  let integrityCheckDetail: string | null = null;
  let backupTableCount = 0;
  try {
    const quick = await backupClient.$queryRawUnsafe("PRAGMA quick_check;");
    const quickText = JSON.stringify(quick);
    if (!quickText.includes("ok")) {
      integrityCheckStatus = "failed";
      integrityCheckDetail = `quick_check:${quickText.slice(0, 200)}`;
    }
    const tables = await backupClient.$queryRawUnsafe(
      `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';`
    ) as { name: string }[];
    backupTableCount = tables.length;
    const sourceTables = await db.$queryRawUnsafe(
      `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';`
    ) as { name: string }[];
    if (backupTableCount !== sourceTables.length) {
      integrityCheckStatus = "failed";
      integrityCheckDetail = `table_count:${backupTableCount}!=${sourceTables.length}`;
    }
  } catch (e) {
    integrityCheckStatus = "failed";
    integrityCheckDetail = `check_error:${(e as Error).message.slice(0, 200)}`;
  } finally {
    await backupClient.$disconnect().catch(() => undefined);
  }
  if (integrityCheckStatus !== "ok") {
    await db.ownershipTransfer.update({
      where: { id: row.id },
      data: { backupPath, backupSha256, backupTableCount, integrityCheckStatus, integrityCheckDetail },
    });
    await writeAudit({
      userId: sessionUserId,
      action: "ownership.transfer.integrity_failed",
      entity: "ownership_transfer",
      entityId: row.id,
      after: { integrityCheckDetail },
    });
    throw new OwnershipError(500, "integrity_check_failed");
  }

  // ── خطوة ج: تصدير بصيغة مفتوحة (JSON لكل جدول — BLOBs بترميز base64 موسوم) ──
  const allTables = await db.$queryRawUnsafe(
    `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';`
  ) as { name: string }[];
  const tables = exportableTables(allTables.map((t) => t.name));
  const exportData: Record<string, unknown[]> = {};
  for (const table of tables) {
    const rows = await db.$queryRawUnsafe(`SELECT * FROM "${table}"`) as Record<string, unknown>[];
    exportData[table] = rows.map((r) => {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(r)) {
        if (v instanceof Uint8Array || Buffer.isBuffer(v)) {
          out[k] = { __blob_b64: Buffer.from(v as Uint8Array).toString("base64") };
        } else {
          out[k] = v;
        }
      }
      return out;
    });
  }
  const exportPayload = JSON.stringify(
    { format: "hrmp-open-export", version: 1, transferId: row.id, generatedAt: new Date().toISOString(), tables: exportData },
    null,
    1
  );
  const exportPath = join(artifactsDir, `ownership-${row.id}.json`);
  await writeFile(exportPath, exportPayload, "utf8");
  const exportSha256 = sha256Hex(exportPayload);

  // ── خطوة د: النقل نفسه (معاملة واحدة ذرّية) ──
  // كلمة مرور ابتدائية عشوائية للمالك الجديد (تُعرض مرة واحدة — bcrypt تخزينًا)
  const { hashPassword } = await import("@/lib/auth/password");
  const newAdminTempPassword = `Fw-${randomBytes(9).toString("base64url")}`;
  const tempHash = await hashPassword(newAdminTempPassword);
  const suggestedAuthSecret = randomBytes(32).toString("hex");
  const now = new Date();

  const executed = await db.$transaction(async (tx) => {
    // د1) تبديل كيان المالك (id ثابت — علاقات الشركات تبقى سليمة)
    await tx.platformOwner.update({
      where: { id: owner.id },
      data: {
        legalName: row.newOwnerLegalName,
        displayName: row.newOwnerDisplayName,
        contactEmail: row.newOwnerContactEmail,
        contactPhone: row.newOwnerContactPhone,
        transferFreeze: true, // يبقى مجمّدًا حتى انتهاء المعاملة — يُرفع بعدها مباشرة
      },
    });

    // د2) إلغاء كل عضويات super_admin القائمة (المالك السابق يفقد الوصول — لا باب خلفي)
    const revoked = await tx.userMembership.updateMany({
      where: { role: "super_admin", revokedAt: null },
      data: { revokedAt: now },
    });

    // د3) حساب super_admin الابتدائي للمالك الجديد + عضويته في كل شركة نشطة
    // (بلاغ «خلل الترجمة» 2026-10-19): كان الاسم المولّد «مالك المنصة — س» عربيًّا
    // مثبتًا لكل اللغات — صار اسم العرض كما أدخله المالك الجديد (الدور يظهر مترجمًا
    // في الواجهة من مصفوفة الأدوار — لا حاجة لبادئة لغوية داخل بيانات المستخدم).
    const newAdmin = await tx.user.create({
      data: {
        email: row.newOwnerInitialAdminEmail,
        fullName: row.newOwnerDisplayName,
        passwordHash: tempHash,
        locale: owner.defaultLocale,
        isActive: true,
        sessionsInvalidatedAt: now, // لا جلسات سابقة أصلًا — صريح لا ضمني
      },
    });
    const activeCompanies = await tx.company.findMany({
      where: { status: "active" },
      select: { id: true },
      orderBy: { createdAt: "asc" }, // الأولى تاريخيًا = الافتراضية (حتمية الدخول)
    });
    if (activeCompanies.length > 0) {
      await tx.userMembership.createMany({
        // الشركة الافتراضية واحدة فقط (أول شركة نشطة) — تسجيل الدخول حتمي الشركة النشطة
        data: activeCompanies.map((c, i) => ({
          userId: newAdmin.id,
          companyId: c.id,
          role: "super_admin",
          isDefault: i === 0,
        })),
      });
    }

    // د4) إبطال جلسات كل المستخدمين (تدوير أمان شامل — SPEC §3.2 خطوة 3)
    const invalidated = await tx.user.updateMany({
      where: { sessionsInvalidatedAt: null },
      data: { sessionsInvalidatedAt: now },
    });
    // ومن لديه علامة سابقة: تُحدَّث أيضًا (لا ينجو أحد من الإبطال)
    const invalidatedOld = await tx.user.updateMany({
      where: { sessionsInvalidatedAt: { not: null } },
      data: { sessionsInvalidatedAt: now },
    });

    // د5) ختم السجل
    return tx.ownershipTransfer.update({
      where: { id: row.id },
      data: {
        state: "completed",
        executedAt: now,
        executedByUserId: sessionUserId,
        newAdminUserId: newAdmin.id,
        revokedSuperAdminCount: revoked.count,
        sessionsInvalidatedUsers: invalidated.count + invalidatedOld.count,
        backupPath,
        backupSha256,
        backupTableCount,
        exportPath,
        exportSha256,
        integrityCheckStatus,
      },
    });
  });

  // رفع التجميد بعد نجاح المعاملة (خارجها كي لا يُرجَع لو فشلت الخطوة)
  await db.platformOwner.update({ where: { id: owner.id }, data: { transferFreeze: false } });

  // د6) حدث النقل في سجل التدقيق (من، إلى، متى، من وافق) — القديم كامل لا يُمسّ
  await writeAudit({
    userId: sessionUserId,
    action: "ownership.transfer.completed",
    entity: "ownership_transfer",
    entityId: row.id,
    before: { legalName: owner.legalName, displayName: owner.displayName },
    after: {
      legalName: row.newOwnerLegalName,
      displayName: row.newOwnerDisplayName,
      newAdminEmail: row.newOwnerInitialAdminEmail,
      revokedSuperAdminCount: executed.revokedSuperAdminCount,
      sessionsInvalidatedUsers: executed.sessionsInvalidatedUsers,
      backupSha256,
      exportSha256,
    },
    reason: row.reason ?? undefined,
  });

  return {
    transferId: row.id,
    backupPath,
    backupSha256,
    backupTableCount,
    exportPath,
    exportSha256,
    integrityCheckStatus,
    integrityCheckDetail,
    revokedSuperAdminCount: executed.revokedSuperAdminCount ?? 0,
    sessionsInvalidatedUsers: executed.sessionsInvalidatedUsers ?? 0,
    newAdminUserId: executed.newAdminUserId ?? "",
    newAdminEmail: row.newOwnerInitialAdminEmail,
    newAdminTempPassword,
    suggestedAuthSecret,
  };
}

async function readFileBuffer(path: string): Promise<Buffer> {
  return readFile(path);
}

// ─── 4) تأكيد تدوير الأسرار (بعد التنفيذ — خطوة المشغّل) ──────

export async function confirmSecretsRotated(
  sessionUserId: string,
  password: unknown
): Promise<{ transferId: string }> {
  await requirePasswordReauth(sessionUserId, password);

  const row = await db.ownershipTransfer.findFirst({
    where: { state: "completed", secretsRotatedAt: null },
    orderBy: { executedAt: "desc" },
  });
  if (!row) throw new OwnershipError(409, "no_pending_rotation");

  await db.ownershipTransfer.update({
    where: { id: row.id },
    data: { secretsRotatedAt: new Date(), secretsRotatedByUserId: sessionUserId },
  });

  await writeAudit({
    userId: sessionUserId,
    action: "ownership.transfer.secrets_rotated",
    entity: "ownership_transfer",
    entityId: row.id,
  });

  return { transferId: row.id };
}

// ─── الإلغاء (قبل التنفيذ فقط) ───────────────────────────────

export async function cancelTransfer(
  sessionUserId: string,
  password: unknown,
  reason: unknown
): Promise<{ transferId: string }> {
  await requirePasswordReauth(sessionUserId, password);

  const row = await db.ownershipTransfer.findFirst({
    where: { state: { in: ["awaiting_current_owner", "awaiting_new_owner", "approved"] } },
    orderBy: { createdAt: "desc" },
  });
  if (!row) throw new OwnershipError(409, "no_active_transfer");

  await db.ownershipTransfer.update({
    where: { id: row.id },
    data: {
      state: "cancelled",
      cancelledAt: new Date(),
      cancelledByUserId: sessionUserId,
      cancelReason: typeof reason === "string" && reason.trim() ? reason.trim() : null,
      approvalCodeHash: null,
    },
  });

  // رفع التجميد — لا نقل جارٍ بعد الآن
  const owner = await db.platformOwner.findFirst({ orderBy: { createdAt: "asc" } });
  if (owner) {
    await db.platformOwner.update({ where: { id: owner.id }, data: { transferFreeze: false } });
  }

  await writeAudit({
    userId: sessionUserId,
    action: "ownership.transfer.cancelled",
    entity: "ownership_transfer",
    entityId: row.id,
    reason: typeof reason === "string" ? reason : undefined,
  });

  return { transferId: row.id };
}

// ─── سجل النقلات (للعرض) ─────────────────────────────────────

export async function listTransfers(limit = 20) {
  const rows = await db.ownershipTransfer.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return rows.map((r) => ({
    id: r.id,
    state: r.state,
    reason: r.reason,
    newOwnerLegalName: r.newOwnerLegalName,
    newOwnerDisplayName: r.newOwnerDisplayName,
    newOwnerInitialAdminEmail: r.newOwnerInitialAdminEmail,
    initiatedAt: r.createdAt.toISOString(),
    currentOwnerApprovedAt: r.currentOwnerApprovedAt?.toISOString() ?? null,
    newOwnerApprovedAt: r.newOwnerApprovedAt?.toISOString() ?? null,
    executedAt: r.executedAt?.toISOString() ?? null,
    secretsRotatedAt: r.secretsRotatedAt?.toISOString() ?? null,
    cancelledAt: r.cancelledAt?.toISOString() ?? null,
    backupSha256: r.backupSha256,
    exportSha256: r.exportSha256,
    integrityCheckStatus: r.integrityCheckStatus,
    revokedSuperAdminCount: r.revokedSuperAdminCount,
    sessionsInvalidatedUsers: r.sessionsInvalidatedUsers,
  }));
}

// ─── تحديث هوية المالك (white-label — بدون نقل) ───────────────

export type OwnerIdentityInput = {
  legalName?: string;
  displayName?: string;
  contactEmail?: string | null;
  contactPhone?: string | null;
  logoUrl?: string | null;
  websiteUrl?: string | null;
  termsUrl?: string | null;
  footerText?: string | null;
  defaultLocale?: string;
  defaultCurrency?: string;
  modulesJson?: string | null;
};

export async function updateOwnerIdentity(
  sessionUserId: string,
  input: OwnerIdentityInput,
  password: unknown
): Promise<void> {
  await requirePasswordReauth(sessionUserId, password);

  const owner = await db.platformOwner.findFirst({ orderBy: { createdAt: "asc" } });
  if (!owner) throw new OwnershipError(500, "platform_owner_missing");

  // لا تعديل هوية أثناء نقل جارٍ (التجميد يشمل إعدادات الملكية نفسها)
  if (owner.transferFreeze) throw new OwnershipError(409, "platform_frozen");

  const data: Record<string, string | null> = {};
  if (typeof input.legalName === "string" && input.legalName.trim()) data.legalName = input.legalName.trim();
  if (typeof input.displayName === "string" && input.displayName.trim()) data.displayName = input.displayName.trim();
  if (input.contactEmail !== undefined) data.contactEmail = input.contactEmail?.trim() || null;
  if (input.contactPhone !== undefined) data.contactPhone = input.contactPhone?.trim() || null;
  if (input.logoUrl !== undefined) data.logoUrl = input.logoUrl?.trim() || null;
  if (input.websiteUrl !== undefined) data.websiteUrl = input.websiteUrl?.trim() || null;
  if (input.termsUrl !== undefined) data.termsUrl = input.termsUrl?.trim() || null;
  if (input.footerText !== undefined) data.footerText = input.footerText?.trim() || null;
  if (input.defaultLocale === "ar" || input.defaultLocale === "fr" || input.defaultLocale === "en" || input.defaultLocale === "es") {
    data.defaultLocale = input.defaultLocale;
  }
  if (typeof input.defaultCurrency === "string" && /^[A-Z]{3}$/.test(input.defaultCurrency)) {
    data.defaultCurrency = input.defaultCurrency;
  }
  if (input.modulesJson !== undefined) {
    // لا يقبل إلا JSON سليم الكائن — وإلا رفض (إعداد وحدات تالف لا يمر)
    if (input.modulesJson === null || input.modulesJson === "") {
      data.modulesJson = null;
    } else {
      try {
        const parsed = JSON.parse(input.modulesJson);
        if (typeof parsed !== "object" || Array.isArray(parsed) || parsed === null) throw new Error("not object");
      } catch {
        throw new OwnershipError(422, "bad_modules_json");
      }
      data.modulesJson = input.modulesJson;
    }
  }

  if (Object.keys(data).length === 0) return;

  await db.platformOwner.update({ where: { id: owner.id }, data });

  await writeAudit({
    userId: sessionUserId,
    action: "platform.owner.updated",
    entity: "platform_owner",
    entityId: owner.id,
    before: {
      legalName: owner.legalName,
      displayName: owner.displayName,
      footerText: owner.footerText,
      modulesJson: owner.modulesJson ? "(set)" : null,
    },
    after: data,
  });
}
