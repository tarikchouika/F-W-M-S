// FWMS — تعديل شركة/تعليقها/تنشيطها (SPEC §3): super_admin فقط، بتدقيق قبل/بعد
// حماية قفل النفس: لا تعليق للشركة النشطة الحالية للطالب (يفقد الجلسة ولا يستطيع الدخول بعدها)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { namesColumnValue } from "@/lib/localized-name";
import { requirePermission, AccessError } from "@/lib/rbac";
import { writeAudit } from "@/lib/audit";
import { isPlatformFrozen } from "@/lib/branding";
import { companyUpdateSchema, emptyToNull, entityIdSchema } from "@/lib/organization";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    requirePermission(session, "platform.manage");

    // تجميد التغييرات الإدارية أثناء نقل ملكية جارٍ (SPEC §3.2 خطوة 1)
    if (await isPlatformFrozen()) {
      return NextResponse.json({ error: "platform_frozen" }, { status: 423 });
    }

    const { id } = await params;
    if (!entityIdSchema.safeParse(id).success) {
      return NextResponse.json({ error: "invalid_input" }, { status: 400 });
    }

    const parsed = companyUpdateSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "invalid_input" }, { status: 400 });
    }

    const company = await db.company.findUnique({ where: { id } });
    if (!company) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    // حارس قفل النفس: تعليق شركتك النشطة يقطع جلساتك بلا سبيل للدخول إن لم تملك غيرها
    if (
      parsed.data.status === "suspended" &&
      company.status !== "suspended" &&
      company.id === session!.companyId
    ) {
      return NextResponse.json({ error: "own_active_company" }, { status: 400 });
    }

    const data = parsed.data;
    const updated = await db.company.update({
      where: { id },
      data: {
        legalName: data.legalName ?? undefined,
        tradeName: data.tradeName !== undefined ? emptyToNull(data.tradeName) : undefined,
        taxId: data.taxId !== undefined ? emptyToNull(data.taxId) : undefined,
        cnssNumber: data.cnssNumber !== undefined ? emptyToNull(data.cnssNumber) : undefined,
        locale: data.locale ?? undefined,
        timezone: data.timezone ?? undefined,
        status: data.status ?? undefined,
        names: data.names !== undefined ? namesColumnValue(data.names) : undefined,
      },
    });

    await writeAudit({
      companyId: company.id,
      userId: session!.sub,
      action:
        data.status === "suspended"
          ? "company.suspend"
          : data.status === "active"
            ? "company.activate"
            : "company.update",
      entity: "company",
      entityId: company.id,
      before: {
        legalName: company.legalName,
        tradeName: company.tradeName,
        locale: company.locale,
        timezone: company.timezone,
        status: company.status,
      },
      after: {
        legalName: updated.legalName,
        tradeName: updated.tradeName,
        locale: updated.locale,
        timezone: updated.timezone,
        status: updated.status,
      },
    });

    return NextResponse.json({
      company: {
        id: updated.id,
        legalName: updated.legalName,
        status: updated.status,
      },
    });
  } catch (error) {
    if (error instanceof AccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[companies/:id]", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
