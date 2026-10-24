// HRMP — تسجيل باحث عن عمل عام: تحقق شكلي + عزلة معرفات + حد معدل لكل IP
// يُصدر جلسة باحث فورًا بعد الإنشاء (حساب pending لا يمنع الدخول — يمنع التقديم
// فقط) — لأن خطوات التوثيق (OTP) ورفع الوثيقة تتطلب جلسة صاحب الحساب.
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requestMeta } from "@/lib/auth/session";
import { registerSeeker } from "@/lib/recruitment/service";
import { getUiLocale } from "@/i18n/ui-locale";
import { signSeekerSession, setSeekerCookie } from "@/lib/recruitment/seeker-auth";

const schema = z.object({
  fullName: z.string().min(3).max(80),
  email: z.string().email().max(190),
  phone: z.string().min(9).max(20),
  password: z.string().min(10).max(128),
  locale: z.enum(["ar", "fr", "en", "es"]).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const body = schema.safeParse(await req.json().catch(() => null));
    if (!body.success) {
      return NextResponse.json({ error: "invalid_input" }, { status: 400 });
    }
    const meta = await requestMeta();
    const uiLocale = await getUiLocale();
    const result = await registerSeeker(
      { ...body.data, locale: body.data.locale ?? uiLocale },
      meta
    );
    if (!result.ok) {
      // 400 للتحقق الشكلي · 409 للاشتباكات (مسجل مسبقًا/معرّف داخلي) · 429 للحدود
      const conflict = result.error === "email_taken" || result.error === "phone_taken" || result.error === "internal_email";
      const status = result.error === "rate_limited" ? 429 : conflict ? 409 : 400;
      return NextResponse.json({ error: result.error }, { status });
    }
    // جلسة فورية للحساب الجديد (pending) — لإكمال التوثيق والوثيقة
    const created = await db.jobSeeker.findUnique({
      where: { id: result.data.id },
      select: { email: true, fullName: true },
    });
    if (created) {
      const token = await signSeekerSession({
        sub: result.data.id,
        email: created.email,
        name: created.fullName,
        issuedAt: Math.floor(Date.now() / 1000),
      });
      await setSeekerCookie(token);
    }
    return NextResponse.json({ ok: true, seekerId: result.data.id }, { status: 201 });
  } catch (error) {
    console.error("[jobs/seeker/register]", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

