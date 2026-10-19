// FWMS — لوحة التغطية السريعة (SPEC §4.1 و§8 — المرحلة 5): ورديات يوم + حالة حضور المعيَّنين
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { requirePermission, AccessError } from "@/lib/rbac";
import { getCoverageBoard } from "@/lib/coverage";
import { getUiLocale } from "@/i18n/ui-locale";
import { todayInZone } from "@/lib/scheduling";

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    requirePermission(session, "attendance.manage");

    const url = new URL(req.url);
    const dateParam = url.searchParams.get("date")?.trim() ?? "";
    const date = /^\d{4}-\d{2}-\d{2}$/.test(dateParam)
      ? dateParam
      : todayInZone(session!.companyTimezone); // الافتراضي: اليوم بتوقيت الشركة

    const board = await getCoverageBoard(session!, date, await getUiLocale());
    return NextResponse.json(board);
  } catch (error) {
    if (error instanceof AccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[coverage]", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
