// HRMP — إعدادات الشركة (CompanySettings): قراءتها وتعديلها لمن يملك company.manage
// (جولة 2026-10-19): كانت بلا واجهة إطلاقًا — هذه بوابة صفحة الإعدادات.
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { requirePermission, AccessError } from "@/lib/rbac";
import { writeAudit } from "@/lib/audit";

const settingsSchema = z.object({
  workWeekHours: z.number().int().min(20).max(60).optional(),
  restDay: z.number().int().min(0).max(6).optional(),
  monthlyHoursDivisor: z.number().int().min(150).max(240).optional(),
  overtimeCapAnnual: z.number().int().min(0).max(2000).nullable().optional(),
  showWagesToSupervisor: z.boolean().optional(),
  dualApprovalEnabled: z.boolean().optional(),
  showEmployerShareToEmployee: z.boolean().optional(),
});

export async function GET() {
  try {
    const session = await getSession();
    requirePermission(session, "company.manage");
    const settings = await db.companySettings.findUnique({ where: { companyId: session!.companyId } });
    if (!settings) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ settings });
  } catch (error) {
    if (error instanceof AccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[company-settings GET]", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await getSession();
    requirePermission(session, "company.manage");

    const parsed = settingsSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });
    const data = parsed.data;
    if (Object.keys(data).length === 0) return NextResponse.json({ error: "empty_body" }, { status: 400 });

    const existing = await db.companySettings.findUnique({ where: { companyId: session!.companyId } });
    if (!existing) return NextResponse.json({ error: "not_found" }, { status: 404 });

    // سقف إضافي: 0 = إلغاء السقف (null في القاعدة)
    const patch: Record<string, unknown> = { ...data };
    if (data.overtimeCapAnnual !== undefined) {
      patch.overtimeCapAnnual = data.overtimeCapAnnual === 0 ? null : data.overtimeCapAnnual;
    }

    const updated = await db.companySettings.update({
      where: { companyId: session!.companyId },
      data: patch,
    });

    await writeAudit({
      companyId: session!.companyId,
      userId: session!.sub,
      action: "company.settings_update",
      entity: "companySettings",
      entityId: updated.id,
      before: {
        workWeekHours: existing.workWeekHours,
        restDay: existing.restDay,
        monthlyHoursDivisor: existing.monthlyHoursDivisor,
        overtimeCapAnnual: existing.overtimeCapAnnual,
        showWagesToSupervisor: existing.showWagesToSupervisor,
        dualApprovalEnabled: existing.dualApprovalEnabled,
        showEmployerShareToEmployee: existing.showEmployerShareToEmployee,
      },
      after: data,
    });

    return NextResponse.json({ settings: updated });
  } catch (error) {
    if (error instanceof AccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[company-settings PATCH]", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
