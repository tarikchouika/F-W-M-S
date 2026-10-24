// HRMP — أعضاء الشركة النشطون (المرحلة 3): خيارات إسناد العمال في الجدولة
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { requirePermission, AccessError } from "@/lib/rbac";
import { localizedName } from "@/lib/localized-name";
import { getUiLocale } from "@/i18n/ui-locale";

export async function GET(_req: NextRequest) {
  try {
    const session = await getSession();
    requirePermission(session, "scheduling.manage");
    const locale = await getUiLocale();

    const memberships = await db.userMembership.findMany({
      where: {
        companyId: session!.companyId,
        revokedAt: null,
        user: { isActive: true },
      },
      include: {
        user: { select: { id: true, fullName: true, names: true, email: true } },
      },
    });

    const members = memberships
      .map((m) => ({
        userId: m.user.id,
        fullName: localizedName(m.user, locale, "fullName"),
        email: m.user.email,
        role: m.role,
      }))
      .sort((a, b) => a.fullName.localeCompare(b.fullName, "ar"));

    return NextResponse.json({ count: members.length, members });
  } catch (error) {
    if (error instanceof AccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[members]", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
