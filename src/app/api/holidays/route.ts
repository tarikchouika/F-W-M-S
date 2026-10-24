// HRMP — العطل الرسمية (SPEC §11.5 و§11.4): يدخلها admin بتاريخ مؤكد — العطلة تُعامل كيوم راحة في الإضافي
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { requirePermission, AccessError } from "@/lib/rbac";
import { addHoliday, holidaySchema, listHolidays } from "@/lib/payroll/service";

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    requirePermission(session, "payroll.view");
    const yearParam = new URL(req.url).searchParams.get("year")?.trim() ?? "";
    const year = /^\d{4}$/.test(yearParam) ? Number(yearParam) : undefined;
    return NextResponse.json({ holidays: await listHolidays(session!, year) });
  } catch (error) {
    if (error instanceof AccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[holidays:GET]", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    requirePermission(session, "company.manage");
    const body = await req.json().catch(() => null);
    const parsed = holidaySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "invalid_input" }, { status: 400 });
    }
    const holiday = await addHoliday(session!, parsed.data);
    return NextResponse.json(holiday, { status: 201 });
  } catch (error) {
    if (error instanceof AccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const status = (error as { status?: number }).status;
    if (typeof status === "number") {
      return NextResponse.json({ error: (error as Error).message }, { status });
    }
    console.error("[holidays:POST]", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
