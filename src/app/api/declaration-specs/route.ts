// HRMP — سجل المواصفات الرسمية (SPEC §4.6 — المرحلة 6ج): قائمة + رفع إصدار جديد
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { requirePermission, AccessError } from "@/lib/rbac";
import { createSpec, createSpecSchema, listSpecs } from "@/lib/declarations/service";

export async function GET() {
  try {
    const session = await getSession();
    requirePermission(session, "declarations.review");
    return NextResponse.json({ specs: await listSpecs(session!) });
  } catch (error) {
    if (error instanceof AccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[declaration-specs:GET]", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    requirePermission(session, "declarations.review");
    const body = await req.json().catch(() => null);
    const parsed = createSpecSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "invalid_input", issues: parsed.error.issues.slice(0, 5) }, { status: 400 });
    }
    const spec = await createSpec(session!, parsed.data);
    return NextResponse.json(spec, { status: 201 });
  } catch (error) {
    if (error instanceof AccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const status = (error as { status?: number }).status;
    if (typeof status === "number") {
      const code = (error as Error).message;
      const extra =
        (error as { issues?: unknown }).issues
          ? { issues: (error as { issues: unknown }).issues }
          : (error as { detail?: unknown }).detail
            ? { detail: (error as { detail: unknown }).detail }
            : undefined;
      return NextResponse.json({ error: code, ...(extra ?? {}) }, { status });
    }
    console.error("[declaration-specs:POST]", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
