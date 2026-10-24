// HRMP — مصادقة هوية باحث (approve/reject): بعد تحقق آلي مكتمل + وثيقة مرفوعة
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth/session";
import { requirePermission, AccessError } from "@/lib/rbac";
import { reviewSeeker } from "@/lib/recruitment/service";

const schema = z.object({
  action: z.enum(["approve", "reject"]),
  reason: z.string().max(500).optional(),
});

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession();
    requirePermission(session, "seekers.verify");
    const { id } = await ctx.params;

    const body = schema.safeParse(await req.json().catch(() => null));
    if (!body.success) {
      return NextResponse.json({ error: "invalid_input" }, { status: 400 });
    }
    const result = await reviewSeeker(session!, id, body.data.action, body.data.reason);
    if (!result.ok) {
      const status =
        result.error === "not_found" ? 404
        : result.error === "reason_required" ? 400
        : 409;
      return NextResponse.json({ error: result.error }, { status });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof AccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[seekers/:id]", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
