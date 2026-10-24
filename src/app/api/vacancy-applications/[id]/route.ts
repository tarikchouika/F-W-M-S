// HRMP — حالة طلب تقديم (عرض/اختيار/رفض/توظيف) — انتقالات محكومة لا اعتباط
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth/session";
import { requirePermission, AccessError } from "@/lib/rbac";
import { setApplicationStatus } from "@/lib/recruitment/service";

const schema = z.object({
  status: z.enum(["viewed", "shortlisted", "rejected", "hired"]),
});

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession();
    requirePermission(session, "recruitment.manage");
    const { id } = await ctx.params;

    const body = schema.safeParse(await req.json().catch(() => null));
    if (!body.success) {
      return NextResponse.json({ error: "invalid_input" }, { status: 400 });
    }
    const result = await setApplicationStatus(session!, id, body.data.status);
    if (!result.ok) {
      const status = result.error === "not_found" ? 404 : 409;
      return NextResponse.json({ error: result.error }, { status });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof AccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[vacancy-applications/:id]", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
