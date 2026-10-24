// HRMP — دخول الباحث عن عمل: جلسة JWT مستقلة (كيان عام لا عضوية شركة)
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { seekerLogin } from "@/lib/recruitment/service";
import { signSeekerSession, setSeekerCookie } from "@/lib/recruitment/seeker-auth";

const schema = z.object({
  email: z.string().email().max(190),
  password: z.string().min(1).max(128),
});

export async function POST(req: NextRequest) {
  try {
    const body = schema.safeParse(await req.json().catch(() => null));
    if (!body.success) {
      return NextResponse.json({ error: "invalid_input" }, { status: 400 });
    }
    const result = await seekerLogin(body.data.email, body.data.password);
    if (!result.ok) {
      const status = result.error === "rate_limited" ? 429 : result.error === "not_active" ? 403 : 401;
      return NextResponse.json({ error: result.error }, { status });
    }
    const token = await signSeekerSession({
      sub: result.data.id,
      email: result.data.email,
      name: result.data.fullName,
      issuedAt: Math.floor(Date.now() / 1000),
    });
    await setSeekerCookie(token);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[jobs/seeker/login]", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
