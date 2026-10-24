// HRMP — تعليم الإشعارات مقروءة (المرحلة 5): معرفات محددة أو الكل
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth/session";
import { requirePermission, AccessError } from "@/lib/rbac";
import { markNotificationsRead } from "@/lib/notifications";

const readSchema = z.object({
  ids: z.array(z.string().trim().min(1).max(64)).max(50).optional(),
  all: z.boolean().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    requirePermission(session, "self.view");

    const parsed = readSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success || (!parsed.data.all && !parsed.data.ids?.length)) {
      return NextResponse.json({ error: "invalid_input" }, { status: 400 });
    }

    const updated = await markNotificationsRead(
      session!.sub,
      parsed.data.all ? undefined : parsed.data.ids,
    );
    return NextResponse.json({ updated });
  } catch (error) {
    if (error instanceof AccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[notifications:read]", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
