// HRMP — فترات الأجور (SPEC §4.3 و§8 — المرحلة 6أ/6ب): قائمة + إنشاء فترة شهرية
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { requirePermission, AccessError } from "@/lib/rbac";
import { createPeriod, createPeriodSchema, listPeriods } from "@/lib/payroll/service";

export async function GET() {
  try {
    const session = await getSession();
    requirePermission(session, "payroll.view");
    return NextResponse.json({ periods: await listPeriods(session!) });
  } catch (error) {
    if (error instanceof AccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[pay-periods:GET]", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    requirePermission(session, "payroll.approve");
    const body = await req.json().catch(() => null);
    const parsed = createPeriodSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "invalid_input" }, { status: 400 });
    }
    const period = await createPeriod(session!, parsed.data);
    return NextResponse.json(period, { status: 201 });
  } catch (error) {
    if (error instanceof AccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const status = (error as { status?: number }).status;
    if (typeof status === "number") {
      const code = (error as Error).message;
      const extra = (error as { keys?: unknown }).keys
        ? { keys: (error as { keys: unknown }).keys }
        : (error as { workers?: unknown }).workers
          ? { workers: (error as { workers: unknown }).workers }
          : undefined;
      return NextResponse.json({ error: code, ...(extra ?? {}) }, { status });
    }
    console.error("[pay-periods:POST]", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
