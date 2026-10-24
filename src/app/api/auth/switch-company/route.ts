// HRMP — تبديل الشركة النشطة (SPEC §3.1): صريح، لعضوية سارية فقط، ويُسجَّل في التدقيق
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getRawSession, issueSession, setSessionCookie } from "@/lib/auth/session";
import { writeAudit } from "@/lib/audit";

const switchSchema = z.object({ companyId: z.string().min(1).max(64) });

export async function POST(req: NextRequest) {
  const raw = await getRawSession();
  if (!raw) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const parsed = switchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }

  const membership = await db.userMembership.findFirst({
    where: {
      userId: raw.sub,
      companyId: parsed.data.companyId,
      revokedAt: null,
      company: { status: "active" },
    },
  });
  if (!membership) {
    return NextResponse.json({ error: "no_membership" }, { status: 403 });
  }

  const token = await issueSession({
    sub: raw.sub,
    membershipId: membership.id,
    companyId: membership.companyId,
    role: membership.role,
  });
  await setSessionCookie(token);

  // التبديل يُسجَّل دائمًا (SPEC §3.1)
  await writeAudit({
    companyId: membership.companyId,
    userId: raw.sub,
    action: "company.switch",
    entity: "company",
    entityId: membership.companyId,
    before: { companyId: raw.companyId },
    after: { companyId: membership.companyId },
  });

  return NextResponse.json({ ok: true, companyId: membership.companyId, role: membership.role });
}
