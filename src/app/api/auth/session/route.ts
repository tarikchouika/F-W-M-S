// HRMP — الجلسة الحالية (موثّقة من القاعدة): للواجهات والتحقق
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }
  return NextResponse.json({
    authenticated: true,
    user: { id: session.sub, name: session.name, email: session.email },
    company: {
      id: session.companyId,
      name: session.companyName,
      locale: session.companyLocale,
      timezone: session.companyTimezone,
    },
    role: session.role,
    locale: session.locale,
  });
}
