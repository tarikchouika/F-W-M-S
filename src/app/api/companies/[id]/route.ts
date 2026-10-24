// HRMP — حذف شركة نهائيًا (أمر المالك 2026-10-23 «لا أستطيع مسح أو إزالة مستخدم أو
// مشروع أو شركة أو موقع جغرافي… هذه الصلاحية للسوبر أدمن وحده ويمكنه تفويضها للأدمن»).
// ---------------------------------------------------------------------------
// الصلاحية: data.delete — السوبر أدمن بطبعه أو من فوّضها إليه (نظام التفويض القائم).
// الحذف متتالٍ داخل معاملة واحدة: كل بيانات الشركة (فروع/مشاريع/مواقع/ورديات/حضور/
// أجور/وثائق/تصاريح) — **وسجل التدقيق يبقى** (مبدأ «كل فعل حساس يُسجَّل ولا يُحذف»):
// عمود companyId يُصفَّر تلقائيًا (SetNull) فتبقى القيود دليلًا تاريخيًا للمنصة.
// حارسان: لا حذف الشركة النشطة في جلسة الحاذف (بدّل أولًا) + السبب يُسجَّل في التدقيق.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { AccessError, roleHas } from "@/lib/rbac";
import { hasPermission } from "@/lib/delegations";
import { writeAudit } from "@/lib/audit";

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
    // لا حذف الشركة النشطة في جلستك — بدّل إلى شركة أخرى أولًا (وإلا انهارت جلستك)
    if (session.companyId === id) {
      return NextResponse.json({ error: "company_is_active_session" }, { status: 409 });
    }

    const company = await db.company.findUnique({ where: { id } });
    if (!company) return NextResponse.json({ error: "not_found" }, { status: 404 });

    const body = await req.json().catch(() => null);
    const reason = body?.reason?.toString?.().slice(0, 500) ?? null;

    await db.$transaction(async (tx) => {
      // (1) أبناء الارتباطات العميقة أولًا — قبل آبائهم
      await tx.payslipLine.deleteMany({ where: { payslip: { companyId: id } } });
      await tx.declarationFile.deleteMany({ where: { declaration: { companyId: id } } });
      await tx.declarationReceipt.deleteMany({ where: { declaration: { companyId: id } } });
      await tx.workerGroupMember.deleteMany({ where: { group: { companyId: id } } });
      await tx.regimeContributionItem.deleteMany({ where: { regime: { companyId: id } } });
      await tx.regimeCalcStep.deleteMany({ where: { regime: { companyId: id } } });
      // (2) التشغيلي: ورديات وحضور قبل المواقع، أجور قبل الدورات، تصاريح قبل المواصفات
      await tx.shift.deleteMany({ where: { companyId: id } });
      await tx.shiftRecurrence.deleteMany({ where: { companyId: id } });
      await tx.attendanceEvent.deleteMany({ where: { companyId: id } });
      await tx.payslip.deleteMany({ where: { companyId: id } });
      await tx.payPeriod.deleteMany({ where: { companyId: id } });
      await tx.regimeAssignment.deleteMany({ where: { companyId: id } });
      await tx.payRegime.deleteMany({ where: { companyId: id } });
      await tx.declaration.deleteMany({ where: { companyId: id } });
      await tx.declarationSpec.deleteMany({ where: { companyId: id } });
      await tx.generatedDocument.deleteMany({ where: { companyId: id } });
      await tx.ledgerEntry.deleteMany({ where: { companyId: id } });
      await tx.holiday.deleteMany({ where: { companyId: id } });
      await tx.notification.deleteMany({ where: { companyId: id } });
      await tx.employeeProfile.deleteMany({ where: { companyId: id } });
      await tx.verificationPolicy.deleteMany({ where: { companyId: id } });
      await tx.payRule.deleteMany({ where: { companyId: id } });
      await tx.companySettings.deleteMany({ where: { companyId: id } });
      await tx.voiceMessage.deleteMany({ where: { companyId: id } });
      await tx.memberLocationPing.deleteMany({ where: { companyId: id } });
      // (3) الهيكل: مجموعات ثم مواقع ثم مشاريع ثم فروع
      await tx.workerGroup.deleteMany({ where: { companyId: id } });
      await tx.site.deleteMany({ where: { companyId: id } });
      await tx.project.deleteMany({ where: { companyId: id } });
      await tx.branch.deleteMany({ where: { companyId: id } });
      // (4) العضويات والتفويضات — الهويات تبقى (المستخدم كيان مستقل عن الشركات)
      await tx.userMembership.deleteMany({ where: { companyId: id } });
      await tx.accountantGrant.deleteMany({ where: { companyId: id } });
      await tx.permissionDelegation.deleteMany({ where: { companyId: id } });
      // (5) الشركة نفسها — سجل التدقيق يبقى (companyId يُصفَّر تلقائيًا: دليل تاريخي)
      await tx.company.delete({ where: { id } });
    });

    await writeAudit({
      companyId: session.companyId,
      userId: session.sub,
      action: "company.delete",
      entity: "company",
      entityId: id,
      before: { legalName: company.legalName, status: company.status },
      reason,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof AccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[companies/:id DELETE]", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
