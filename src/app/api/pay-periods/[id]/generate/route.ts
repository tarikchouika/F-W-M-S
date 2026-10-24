// HRMP — توليد كشوف فترة (SPEC §4.3): من الورديات والحضور الموثق وقواعد الأجور السارية
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { requirePermission, AccessError } from "@/lib/rbac";
import { generatePeriod } from "@/lib/payroll/service";
import { entityIdSchema } from "@/lib/organization";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession();
    requirePermission(session, "payroll.approve");
    const { id } = await params;
    if (!entityIdSchema.safeParse(id).success) {
      return NextResponse.json({ error: "invalid_input" }, { status: 400 });
    }
    const result = await generatePeriod(session!, id);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof AccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const status = (error as { status?: number }).status;
    if (typeof status === "number") {
      const code = (error as Error).message;
      const extra = (error as { keys?: unknown }).keys ? { keys: (error as { keys: unknown }).keys } : undefined;
      return NextResponse.json({ error: code, ...(extra ?? {}) }, { status });
    }
    console.error("[pay-periods/[id]/generate]", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
