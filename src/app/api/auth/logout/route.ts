// HRMP — تسجيل الخروج: إبطال حقيقي لكل جلسات المستخدم + تسجيل في التدقيق
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { clearSessionCookie, getRawSession } from "@/lib/auth/session";
import { writeAudit } from "@/lib/audit";

export async function POST() {
  const session = await getRawSession();
  await clearSessionCookie();
  if (session) {
    // علامة الإبطال: كل رمز صدر قبل الآن يُرفض عند التحقق القادم
    await db.user
      .update({
        where: { id: session.sub },
        data: { sessionsInvalidatedAt: new Date() },
      })
      .catch(() => null);
    await writeAudit({
      companyId: session.companyId,
      userId: session.sub,
      action: "auth.logout",
      entity: "user",
      entityId: session.sub,
    });
  }
  return NextResponse.json({ ok: true });
}
