// HRMP — العمال المتاحون لسحب بديل (SPEC §4.1): حصريًا الأحرار داخل نافذة الوردية (بلا تعارض)
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { requirePermission, AccessError } from "@/lib/rbac";
import { getAvailableWorkers } from "@/lib/coverage";
import { getUiLocale } from "@/i18n/ui-locale";

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    requirePermission(session, "attendance.manage");

    const url = new URL(req.url);
    const shiftId = url.searchParams.get("shiftId")?.trim() ?? "";
    if (!shiftId) {
      return NextResponse.json({ error: "invalid_input" }, { status: 400 });
    }

    const result = await getAvailableWorkers(session!, shiftId, await getUiLocale());
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof AccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const status = (error as { status?: number })?.status;
    if (status === 404) return NextResponse.json({ error: "not_found" }, { status: 404 });
    if (status === 403) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    console.error("[coverage:available]", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
