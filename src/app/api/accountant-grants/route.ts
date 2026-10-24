// HRMP — منح المحاسب الخارجي (SPEC §3.3): صريحة، مؤقتة، قابلة للسحب
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { requirePermission, AccessError } from "@/lib/rbac";
import { isPlatformFrozen } from "@/lib/branding";
import { createGrant, createGrantSchema, listGrants } from "@/lib/declarations/service";

export async function GET() {
  try {
    const session = await getSession();
    requirePermission(session, "users.manage");
    return NextResponse.json({ grants: await listGrants(session!) });
  } catch (error) {
    if (error instanceof AccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[accountant-grants:GET]", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    requirePermission(session, "users.manage");

    // تجميد التغييرات الإدارية أثناء نقل ملكية جارٍ (SPEC §3.2 خطوة 1)
    if (await isPlatformFrozen()) {
      return NextResponse.json({ error: "platform_frozen" }, { status: 423 });
    }

    const body = await req.json().catch(() => null);
    const parsed = createGrantSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "invalid_input", issues: parsed.error.issues.slice(0, 5) }, { status: 400 });
    }
    const grant = await createGrant(session!, parsed.data);
    return NextResponse.json(grant, { status: 201 });
  } catch (error) {
    if (error instanceof AccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const status = (error as { status?: number }).status;
    if (typeof status === "number") {
      return NextResponse.json({ error: (error as Error).message }, { status });
    }
    console.error("[accountant-grants:POST]", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
