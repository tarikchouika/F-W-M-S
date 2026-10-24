// HRMP — «أجوري» (SPEC §4.5): كشوف العامل المعتمدة فقط — عزل تام ببياناته حصرًا
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { requirePermission, AccessError } from "@/lib/rbac";
import { listMyPayslips } from "@/lib/payroll/service";

export async function GET() {
  try {
    const session = await getSession();
    requirePermission(session, "self.view");
    return NextResponse.json({ payslips: await listMyPayslips(session!) });
  } catch (error) {
    if (error instanceof AccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[my-payslips:GET]", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
