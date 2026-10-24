// HRMP — التقارير: الأنواع المتاحة للدور + سجل التصديرات (SPEC §4.4.1 — المرحلة 7)
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { AccessError } from "@/lib/rbac";
import { reportKindsForRole, requireSession, listRecentDocuments, ReportDataError } from "@/lib/reports/generate";
import { KIND_FORMATS } from "@/lib/reports/types";

export async function GET() {
  try {
    const session = await requireSession();
    const settings = await db.companySettings.findUnique({ where: { companyId: session.companyId } });
    const canSeeWages = settings?.showWagesToSupervisor === true;
    const kinds = reportKindsForRole(session.role, canSeeWages).map((kind) => ({
      kind,
      formats: KIND_FORMATS[kind],
    }));
    const recent = await listRecentDocuments(session, 20);
    return NextResponse.json({ kinds, recent });
  } catch (error) {
    if (error instanceof AccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof ReportDataError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[reports:GET]", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
