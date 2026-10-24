// HRMP — تفاصيل كشف أجر واحد ببنوده (SPEC §4.3 «كيف حُسب كل مبلغ»): المدير/المحاسب، والعامل كشفه المعتمد فقط
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { requirePermission, AccessError } from "@/lib/rbac";
import { getPayslipDetail } from "@/lib/payroll/service";
import { entityIdSchema } from "@/lib/organization";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession();
    // العامل يدخل بصلاحية self.view (كشفه فقط) — الباقي payroll.view
    const permission = session && (session.role === "employee" ? "self.view" : "payroll.view");
    requirePermission(session, permission as "self.view" | "payroll.view");
    const { id } = await params;
    if (!entityIdSchema.safeParse(id).success) {
      return NextResponse.json({ error: "invalid_input" }, { status: 400 });
    }
    return NextResponse.json(await getPayslipDetail(session!, id));
  } catch (error) {
    if (error instanceof AccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const status = (error as { status?: number }).status;
    if (typeof status === "number") {
      return NextResponse.json({ error: (error as Error).message }, { status });
    }
    console.error("[payslips/[id]:GET]", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
