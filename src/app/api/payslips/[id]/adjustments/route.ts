// HRMP — بنود يدوية على كشف (SPEC §4.3: مكافآت وبدلات وخصومات — كل بند بسببه ومنشئه)
// POST: إضافة بند (draft/reviewing فقط) | DELETE: حذف بند يدوي (lineId)
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { requirePermission, AccessError } from "@/lib/rbac";
import { addAdjustment, adjustmentSchema, removeAdjustment } from "@/lib/payroll/service";
import { entityIdSchema } from "@/lib/organization";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession();
    requirePermission(session, "payroll.approve");
    const { id } = await params;
    if (!entityIdSchema.safeParse(id).success) {
      return NextResponse.json({ error: "invalid_input" }, { status: 400 });
    }
    const body = await req.json().catch(() => null);
    const parsed = adjustmentSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "invalid_input" }, { status: 400 });
    }
    return NextResponse.json(await addAdjustment(session!, id, parsed.data));
  } catch (error) {
    if (error instanceof AccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const status = (error as { status?: number }).status;
    if (typeof status === "number") {
      return NextResponse.json({ error: (error as Error).message }, { status });
    }
    console.error("[payslips/[id]/adjustments:POST]", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await getSession();
    requirePermission(session, "payroll.approve");
    const lineId = new URL(req.url).searchParams.get("lineId")?.trim() ?? "";
    if (!entityIdSchema.safeParse(lineId).success) {
      return NextResponse.json({ error: "invalid_input" }, { status: 400 });
    }
    return NextResponse.json(await removeAdjustment(session!, lineId));
  } catch (error) {
    if (error instanceof AccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const status = (error as { status?: number }).status;
    if (typeof status === "number") {
      return NextResponse.json({ error: (error as Error).message }, { status });
    }
    console.error("[payslips/[id]/adjustments:DELETE]", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
