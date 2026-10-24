// HRMP — ملفات أجور العمال (SPEC §4.3 أنظمة الاحتساب الثلاثة + §11.6 الأعباء العائلية)
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { requirePermission, AccessError } from "@/lib/rbac";
import { listWorkerProfiles, upsertWorkerProfile, workerProfileSchema } from "@/lib/payroll/service";

export async function GET() {
  try {
    const session = await getSession();
    requirePermission(session, "payroll.approve");
    return NextResponse.json({ workers: await listWorkerProfiles(session!) });
  } catch (error) {
    if (error instanceof AccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[payroll/workers:GET]", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await getSession();
    requirePermission(session, "payroll.approve");
    const body = await req.json().catch(() => null);
    const parsed = workerProfileSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "invalid_input" }, { status: 400 });
    }
    return NextResponse.json(await upsertWorkerProfile(session!, parsed.data));
  } catch (error) {
    if (error instanceof AccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const status = (error as { status?: number }).status;
    if (typeof status === "number") {
      return NextResponse.json({ error: (error as Error).message }, { status });
    }
    console.error("[payroll/workers:PUT]", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
