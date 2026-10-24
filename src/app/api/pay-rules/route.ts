// HRMP — قواعد الأجور (SPEC §11: بيانات بتواريخ سريان): عرض للمحاسب/المدير مع حالة التوثيق
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { requirePermission, AccessError } from "@/lib/rbac";
import { listPayRules } from "@/lib/payroll/service";

export async function GET() {
  try {
    const session = await getSession();
    requirePermission(session, "payroll.view");
    const rules = await listPayRules(session!);
    return NextResponse.json({
      rules,
      unverifiedCount: rules.filter((r) => r.verifiedBy === null).length,
    });
  } catch (error) {
    if (error instanceof AccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[pay-rules:GET]", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
