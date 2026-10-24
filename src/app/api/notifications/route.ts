// HRMP — إشعارات المستخدم نفسه (المرحلة 5): قائمة + عدد غير المقروء — أي دور مصادق عليه
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { requirePermission, AccessError } from "@/lib/rbac";
import { listNotifications } from "@/lib/notifications";

export async function GET() {
  try {
    const session = await getSession();
    requirePermission(session, "self.view");

    const result = await listNotifications(session!.sub);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof AccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[notifications]", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
