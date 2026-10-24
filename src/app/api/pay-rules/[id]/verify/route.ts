// HRMP — توثيق قاعدة أجر من المحاسب (SPEC §11.6 verifiedBy/verifiedAt) — يفتح باب الاعتماد
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { requirePermission, AccessError } from "@/lib/rbac";
import { verifyPayRule } from "@/lib/payroll/service";
import { entityIdSchema } from "@/lib/organization";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession();
    requirePermission(session, "payroll.verify");
    const { id } = await params;
    if (!entityIdSchema.safeParse(id).success) {
      return NextResponse.json({ error: "invalid_input" }, { status: 400 });
    }
    return NextResponse.json(await verifyPayRule(session!, id));
  } catch (error) {
    if (error instanceof AccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const status = (error as { status?: number }).status;
    if (typeof status === "number") {
      return NextResponse.json({ error: (error as Error).message }, { status });
    }
    console.error("[pay-rules/[id]/verify]", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
