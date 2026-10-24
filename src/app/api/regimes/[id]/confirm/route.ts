// HRMP — تأكيد المحاسب لقاعدة أساس المسار الفلاحي (SPEC §12: مرة واحدة ثم تُحفَظ)
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { requirePermission, AccessError } from "@/lib/rbac";
import { confirmRegime } from "@/lib/regimes/service";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = await getSession();
    requirePermission(session, "payroll.verify"); // المحاسب حصرًا (declarations.review يكفي أيضًا — استخدمنا payroll.verify للمحاسب)
    const regime = await confirmRegime(session!, id);
    return NextResponse.json(regime);
  } catch (error) {
    if (error instanceof AccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const status = (error as { status?: number }).status;
    if (typeof status === "number") {
      return NextResponse.json({ error: (error as Error).message }, { status });
    }
    console.error("[regimes/[id]/confirm:POST]", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
