// HRMP — قائمة الباحثين للمصادقة (seekers.verify — الأدمن/السوبر أدمن بأمر المالك)
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { requirePermission, AccessError } from "@/lib/rbac";
import { listSeekersForReview } from "@/lib/recruitment/service";

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    requirePermission(session, "seekers.verify");

    const params = req.nextUrl.searchParams;
    const result = await listSeekersForReview({
      status: params.get("status") ?? undefined,
      q: params.get("q") ?? undefined,
      page: Number(params.get("page") ?? "1") || 1,
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof AccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[seekers]", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
