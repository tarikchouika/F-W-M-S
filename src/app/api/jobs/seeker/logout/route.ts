// HRMP — خروج الباحث عن عمل (مسح الكوكي فقط — الجلسة قصيرة العمر أصلًا)
import { NextResponse } from "next/server";
import { clearSeekerCookie } from "@/lib/recruitment/seeker-auth";

export async function POST() {
  await clearSeekerCookie();
  return NextResponse.json({ ok: true });
}
