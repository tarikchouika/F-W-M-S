// HRMP — سحب طلب تقديم (الباحث صاحبه وحده — سحب ذاتي لا حذف)
import { NextRequest, NextResponse } from "next/server";
import { getSeekerSession } from "@/lib/recruitment/seeker-auth";
import { withdrawApplication } from "@/lib/recruitment/service";

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSeekerSession();
    if (!session) {
      return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    }
    const { id } = await ctx.params;
    const result = await withdrawApplication(session.sub, id);
    if (!result.ok) {
      const status = result.error === "not_found" ? 404 : 409;
      return NextResponse.json({ error: result.error }, { status });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[jobs/applications/withdraw]", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
