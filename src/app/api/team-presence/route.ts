// FWMS — لقطة الحضور الحي (المرحلة 9): لكل فريق ظاهر للمتصل — أعضاؤه وآخر نبضة
// لكل عضو وحالته (داخل/خارج/منقطع/بلا نبضة) + منطقة الفريق.
// الوصول: location.view (سوبر/أدمن/كوأدمن) أو كون المتصل قائدًا لفريق (أي دوره).
// العامل غير القائد لا يرى مواقع أحد (خصوصية) — 403 مع سبب واضح.
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { AccessError, roleHas } from "@/lib/rbac";
import { hasPermission } from "@/lib/delegations";
import { presenceScopeGroups, presenceSnapshot } from "@/lib/team-presence";

export async function GET() {
  try {
    const session = await getSession();
    if (!session) throw new AccessError(401, "unauthenticated");

    const canView = roleHas(session.role, "location.view") || (await hasPermission(session, "location.view"));

    // قائد فريق؟ (أي دوره) — يرى فرقه وإن لم يملك location.view بالدور
    const ledCount = await countLedGroups(session);
    if (!canView && ledCount === 0) {
      throw new AccessError(403, "forbidden");
    }

    const scope = await presenceScopeGroups(session);
    const groups = await presenceSnapshot(session.companyId, scope.groups);

    return NextResponse.json({
      scope: scope.scope,
      serverTime: new Date().toISOString(),
      groups,
    });
  } catch (error) {
    if (error instanceof AccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[team-presence]", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

async function countLedGroups(session: { companyId: string; sub: string }): Promise<number> {
  const { db } = await import("@/lib/db");
  return db.workerGroup.count({
    where: { companyId: session.companyId, leaderUserId: session.sub, status: "active" },
  });
}
