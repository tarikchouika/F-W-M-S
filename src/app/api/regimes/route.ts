// HRMP — المسارات (SPEC §12 — المرحلة 6ج): قائمة القوالب ومسارات الشركة + منشئ المسارات
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { requirePermission, AccessError } from "@/lib/rbac";
import { createRegime, createRegimeSchema, listRegimes } from "@/lib/regimes/service";

export async function GET() {
  try {
    const session = await getSession();
    requirePermission(session, "payroll.view");
    return NextResponse.json({ regimes: await listRegimes(session!) });
  } catch (error) {
    if (error instanceof AccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[regimes:GET]", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    requirePermission(session, "payroll.view");
    const body = await req.json().catch(() => null);
    const parsed = createRegimeSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "invalid_input", issues: parsed.error.issues.slice(0, 5) }, { status: 400 });
    }
    const regime = await createRegime(session!, parsed.data);
    return NextResponse.json(regime, { status: 201 });
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
    console.error("[regimes:POST]", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
