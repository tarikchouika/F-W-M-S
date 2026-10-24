// HRMP — إسناد العمال لمسارات (SPEC §12): قائمة + إسناد بتاريخ سريان
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { requirePermission, AccessError } from "@/lib/rbac";
import { createAssignment, createAssignmentSchema, listAssignments } from "@/lib/regimes/service";

export async function GET() {
  try {
    const session = await getSession();
    requirePermission(session, "payroll.view");
    return NextResponse.json({ assignments: await listAssignments(session!) });
  } catch (error) {
    if (error instanceof AccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[regime-assignments:GET]", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    requirePermission(session, "payroll.approve"); // admin
    const body = await req.json().catch(() => null);
    const parsed = createAssignmentSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "invalid_input", issues: parsed.error.issues.slice(0, 5) }, { status: 400 });
    }
    const assignment = await createAssignment(session!, parsed.data);
    return NextResponse.json(assignment, { status: 201 });
  } catch (error) {
    if (error instanceof AccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const status = (error as { status?: number }).status;
    if (typeof status === "number") {
      return NextResponse.json({ error: (error as Error).message }, { status });
    }
    console.error("[regime-assignments:POST]", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
