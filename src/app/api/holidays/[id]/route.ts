// HRMP — حذف عطلة رسمية (إدخال خاطئ مثلاً) — company.manage + تدقيق
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { requirePermission, AccessError } from "@/lib/rbac";
import { removeHoliday } from "@/lib/payroll/service";
import { entityIdSchema } from "@/lib/organization";

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession();
    requirePermission(session, "company.manage");
    const { id } = await params;
    if (!entityIdSchema.safeParse(id).success) {
      return NextResponse.json({ error: "invalid_input" }, { status: 400 });
    }
    return NextResponse.json(await removeHoliday(session!, id));
  } catch (error) {
    if (error instanceof AccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const status = (error as { status?: number }).status;
    if (typeof status === "number") {
      return NextResponse.json({ error: (error as Error).message }, { status });
    }
    console.error("[holidays/[id]:DELETE]", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
