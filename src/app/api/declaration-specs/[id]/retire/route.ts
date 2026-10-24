// HRMP — سحب مواصفة مفعّلة (SPEC §4.6: حالتها مسودة←اختبار←مفعّلة←مسحوبة)
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { requirePermission, AccessError } from "@/lib/rbac";
import { retireSpec } from "@/lib/declarations/service";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = await getSession();
    requirePermission(session, "declarations.review");
    const spec = await retireSpec(session!, id);
    return NextResponse.json(spec);
  } catch (error) {
    if (error instanceof AccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const status = (error as { status?: number }).status;
    if (typeof status === "number") {
      return NextResponse.json({ error: (error as Error).message }, { status });
    }
    console.error("[declaration-specs/[id]/retire:POST]", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
