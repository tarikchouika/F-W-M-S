// HRMP — توثيق كل قواعد الأجور دفعة واحدة (للمحاسب — يسبق أول اعتماد لفترة)
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { requirePermission, AccessError } from "@/lib/rbac";
import { verifyAllPayRules } from "@/lib/payroll/service";

export async function POST() {
  try {
    const session = await getSession();
    requirePermission(session, "payroll.verify");
    return NextResponse.json(await verifyAllPayRules(session!));
  } catch (error) {
    if (error instanceof AccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[pay-rules/verify-all]", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
