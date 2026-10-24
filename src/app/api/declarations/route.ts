// HRMP — التصاريح الرسمية (SPEC §4.6 — المرحلة 6ج): قائمة + إنشاء (يتطلب مواصفة مفعّلة)
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { requirePermission, AccessError } from "@/lib/rbac";
import { createDeclaration, createDeclarationSchema, listDeclarations } from "@/lib/declarations/service";

export async function GET() {
  try {
    const session = await getSession();
    requirePermission(session, "declarations.review");
    return NextResponse.json({ declarations: await listDeclarations(session!) });
  } catch (error) {
    if (error instanceof AccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[declarations:GET]", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    requirePermission(session, "declarations.review");
    const body = await req.json().catch(() => null);
    const parsed = createDeclarationSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "invalid_input", issues: parsed.error.issues.slice(0, 5) }, { status: 400 });
    }
    const declaration = await createDeclaration(session!, parsed.data);
    return NextResponse.json(declaration, { status: 201 });
  } catch (error) {
    if (error instanceof AccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const status = (error as { status?: number }).status;
    if (typeof status === "number") {
      return NextResponse.json({ error: (error as Error).message }, { status });
    }
    console.error("[declarations:POST]", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
