// HRMP — تسجيل الدخول (SPEC §6): تحقق خادمي، تحديد معدل، تسجيل في التدقيق، ثم جلسة بشركة نشطة
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { verifyPassword } from "@/lib/auth/password";
import { issueSession, requestMeta, setSessionCookie } from "@/lib/auth/session";
import { writeAudit } from "@/lib/audit";
import { rateLimit } from "@/lib/rate-limit";

const loginSchema = z.object({
  email: z.string().email().max(190),
  password: z.string().min(1).max(200),
});

// تحديد معدل تسجيل الدخول (SPEC §6 إلزامي — المرحلة 8 أغلقته): 10 محاولات/دقيقة
// لكل (بريد + IP) — يحمي من تخمين كلمات المرور عبر المنفذ العام للنفق
const LOGIN_RATE_LIMIT = 10;
const LOGIN_RATE_WINDOW_MS = 60_000;
// دلاء إضافية (فحص أمني 2026-10-19): البوابة العامة كانت تُسقط عنوان العميل
// الحقيقي (cloudflared يعيد كتابة X-Forwarded-For ⇒ 127.0.0.1) فكان الدلو
// القائم (بريد+IP) كليًا لكل بريد ⇒ (1) مهاجم من أي IP يُقفل حساب الضحية
// (lockout DoS) و(2) مهاجم موزّع يفلت من الحدّ. الدلاء الثلاثة تُغلق الطرفين:
//  - لكل بريد وحده: يبقى الحدّ حتى لو تدوّر عنوان المهاجم (distributed brute force)
//  - لكل IP وحده: يمنع رشّ محاولات على حسابات كثيرة من مصدر واحد
const LOGIN_EMAIL_LIMIT = 20;
const LOGIN_IP_LIMIT = 120;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "invalid_input" }, { status: 400 });
    }

    // تحديد المعدل قبل أي استعلام (بالمفتاح المركّب بريد+IP كي لا يُخنَق مستخدم
    // شرعي خلف NAT واحد بسبب مجرم واحد) — رسالة الخطأ نفسها للخارج
    const meta0 = await requestMeta();
    const emailKey = parsed.data.email.toLowerCase();
    const ipKey = meta0.ip ?? "unknown";
    const buckets = [
      { rl: rateLimit(`login:${emailKey}:${ipKey}`, LOGIN_RATE_LIMIT, LOGIN_RATE_WINDOW_MS), retryAfterMs: 0 },
      { rl: rateLimit(`login-email:${emailKey}`, LOGIN_EMAIL_LIMIT, LOGIN_RATE_WINDOW_MS), retryAfterMs: 0 },
      { rl: rateLimit(`login-ip:${ipKey}`, LOGIN_IP_LIMIT, LOGIN_RATE_WINDOW_MS), retryAfterMs: 0 },
    ];
    const blocked = buckets.find((b) => !b.rl.allowed);
    if (blocked) {
      const res = NextResponse.json({ error: "rate_limited", retryAfterMs: blocked.rl.retryAfterMs }, { status: 429 });
      res.headers.set("Retry-After", String(Math.ceil(blocked.rl.retryAfterMs / 1000)));
      return res;
    }

    const user = await db.user.findUnique({ where: { email: parsed.data.email.toLowerCase() } });
    // رسالة واحدة للخطأين كي لا يُكشف وجود الحساب (SPEC §6)
    if (!user || !(await verifyPassword(parsed.data.password, user.passwordHash))) {
      await writeAudit({
        action: "auth.login.failed",
        entity: "user",
        entityId: user?.id ?? parsed.data.email,
      });
      return NextResponse.json({ error: "invalid_credentials" }, { status: 401 });
    }
    if (!user.isActive) {
      await writeAudit({ userId: user.id, action: "auth.login.blocked", entity: "user", entityId: user.id });
      return NextResponse.json({ error: "account_inactive" }, { status: 403 });
    }

    // العضوية الافتراضية (أو الأولى السارية) — الجلسة بشركة نشطة واحدة (SPEC §3.1)
    const membership =
      (await db.userMembership.findFirst({
        where: { userId: user.id, revokedAt: null, isDefault: true, company: { status: "active" } },
      })) ??
      (await db.userMembership.findFirst({
        where: { userId: user.id, revokedAt: null, company: { status: "active" } },
      }));

    if (!membership) {
      return NextResponse.json({ error: "no_active_membership" }, { status: 403 });
    }

    const token = await issueSession({
      sub: user.id,
      membershipId: membership.id,
      companyId: membership.companyId,
      role: membership.role,
    });
    await setSessionCookie(token);
    await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

    const meta = await requestMeta();
    await writeAudit({
      companyId: membership.companyId,
      userId: user.id,
      action: "auth.login",
      entity: "user",
      entityId: user.id,
      reason: `ip=${meta.ip ?? "unknown"}`,
    });

    return NextResponse.json({
      ok: true,
      user: { id: user.id, name: user.fullName, email: user.email },
      company: { id: membership.companyId },
      role: membership.role,
    });
  } catch (error) {
    console.error("[auth/login]", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
