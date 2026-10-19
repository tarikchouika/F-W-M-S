// FWMS — سحب البديل (SPEC §4.1 و§8 — المرحلة 5): تحديث الوردية + إشعار فوري + تدقيق
// معيار القبول: «البديل يصله الإشعار ويظهر الموقع في برنامجه»
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { requirePermission, AccessError } from "@/lib/rbac";
import { replaceSchema, replaceShiftWorker } from "@/lib/coverage";
import { getUiLocale } from "@/i18n/ui-locale";

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    requirePermission(session, "attendance.manage");

    const parsed = replaceSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "invalid_input" }, { status: 400 });
    }

    const result = await replaceShiftWorker(session!, parsed.data, await getUiLocale());
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof AccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const status = (error as { status?: number })?.status;
    const conflicts = (error as { conflicts?: unknown })?.conflicts;
    if (status === 404) return NextResponse.json({ error: "not_found" }, { status: 404 });
    if (status === 403) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    if (status === 400) return NextResponse.json({ error: "invalid_reference" }, { status: 400 });
    if (status === 409) {
      return NextResponse.json({ error: "shift_conflict", conflicts }, { status: 409 });
    }
    if (status === 422) {
      return NextResponse.json({ error: (error as Error).message }, { status: 422 });
    }
    console.error("[coverage:replace]", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
