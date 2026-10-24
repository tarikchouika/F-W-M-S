// HRMP — تعديل مسار شركة (إصدار جديد لا تعديل للقديم — SPEC §12)
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { requirePermission, AccessError } from "@/lib/rbac";
import { updateRegime, updateRegimeSchema } from "@/lib/regimes/service";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = await getSession();
    requirePermission(session, "payroll.view");
    const body = await req.json().catch(() => null);
    const parsed = updateRegimeSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "invalid_input", issues: parsed.error.issues.slice(0, 5) }, { status: 400 });
    }
    const regime = await updateRegime(session!, id, parsed.data);
    return NextResponse.json(regime);
  } catch (error) {
    if (error instanceof AccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const status = (error as { status?: number }).status;
    if (typeof status === "number") {
      const code = (error as Error).message;
      const extra = (error as { fields?: unknown }).fields ? { fields: (error as { fields: unknown }).fields } : undefined;
      return NextResponse.json({ error: code, ...(extra ?? {}) }, { status });
    }
    console.error("[regimes/[id]:PATCH]", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
