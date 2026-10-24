// HRMP — مواعيد التصاريح (SPEC §4.6): تذكير قبل 10 الشهر الموالي و28 فبراير + غرامات كمعلومة
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { requirePermission, AccessError } from "@/lib/rbac";
import { getDeadlineStatus } from "@/lib/declarations/service";

export async function GET() {
  try {
    const session = await getSession();
    requirePermission(session, "declarations.review");
    return NextResponse.json(await getDeadlineStatus(session!));
  } catch (error) {
    if (error instanceof AccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[declarations/deadlines:GET]", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
