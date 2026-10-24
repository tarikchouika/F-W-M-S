// HRMP — طلبات التقديم على وظيفة (بيانات اتصال المتقدم تظهر لشركة الوظيفة حصرًا)
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { requirePermission, AccessError } from "@/lib/rbac";
import { listVacancyApplications } from "@/lib/recruitment/service";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession();
    requirePermission(session, "recruitment.manage");
    const { id } = await ctx.params;
    const result = await listVacancyApplications(session!, id);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 404 });
    }
    return NextResponse.json(result.data);
  } catch (error) {
    if (error instanceof AccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[vacancies/:id/applications]", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
