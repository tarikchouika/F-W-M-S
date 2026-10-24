// HRMP — تفاصيل تصريح (SPEC §4.6): الملخص + أخطاء التحقق + الملفات + الإشعارات
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { requirePermission, AccessError } from "@/lib/rbac";
import { getDeclarationDetail } from "@/lib/declarations/service";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = await getSession();
    requirePermission(session, "declarations.review");
    return NextResponse.json(await getDeclarationDetail(session!, id));
  } catch (error) {
    if (error instanceof AccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const status = (error as { status?: number }).status;
    if (typeof status === "number") {
      return NextResponse.json({ error: (error as Error).message }, { status });
    }
    console.error("[declarations/[id]:GET]", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
