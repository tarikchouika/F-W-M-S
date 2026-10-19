// FWMS — الملف الشخصي (جولة 2026-10-19): تعديل الاسم وتغيير كلمة السر من صفحة الإعدادات.
// القواعد: كلمة السر الحالية إلزامية لأي تغيير كلمة سر (bcrypt)؛ تغيير الاسم يعيد إصدار
// الجلسة (الاسم داخل JWT) فيستقيم العرض فورًا؛ كل شيء يُسجَّل في التدقيق.
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSession, issueSession, setSessionCookie, getRawSession } from "@/lib/auth/session";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { writeAudit } from "@/lib/audit";

const profileSchema = z.object({
  fullName: z.string().trim().min(2).max(120).optional(),
  currentPassword: z.string().min(1).max(72).optional(),
  newPassword: z.string().min(8).max(72).optional(),
});

export async function PATCH(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const parsed = profileSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });
    const { fullName, currentPassword, newPassword } = parsed.data;

    const user = await db.user.findUnique({ where: { id: session.sub } });
    if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    // تغيير كلمة السر: يقتضي التحقق من الحالية أولًا
    if (newPassword) {
      if (!currentPassword || !(await verifyPassword(currentPassword, user.passwordHash))) {
        return NextResponse.json({ error: "wrong_password" }, { status: 403 });
      }
      await db.user.update({
        where: { id: user.id },
        data: { passwordHash: await hashPassword(newPassword) },
      });
      await writeAudit({
        companyId: session.companyId,
        userId: session.sub,
        action: "auth.password_change",
        entity: "user",
        entityId: user.id,
      });
    }

    // تعديل الاسم: إعادة إصدار الجلسة كي يُعرض فورًا (الاسم داخل توكن JWT)
    let reSigned = false;
    if (fullName && fullName !== user.fullName) {
      await db.user.update({ where: { id: user.id }, data: { fullName } });
      await writeAudit({
        companyId: session.companyId,
        userId: session.sub,
        action: "auth.profile_update",
        entity: "user",
        entityId: user.id,
        before: { fullName: user.fullName },
        after: { fullName },
      });
      const raw = await getRawSession();
      if (raw) {
        const token = await issueSession({
          sub: raw.sub,
          membershipId: raw.membershipId,
          companyId: raw.companyId,
          role: raw.role,
          issuedAt: Math.floor(Date.now() / 1000),
        });
        await setSessionCookie(token);
        reSigned = true;
      }
    }

    return NextResponse.json({ ok: true, passwordChanged: Boolean(newPassword), nameChanged: Boolean(fullName), reSigned });
  } catch (error) {
    console.error("[auth/profile PATCH]", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
