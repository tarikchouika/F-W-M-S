// FWMS — خيارات المواقع النشطة للجدولة (المرحلة 3): أسماء فقط لمن يملك scheduling.manage
// co_admin لا يملك company.manage (قراءة /api/sites الكاملة) لكنه يحتاج أسماء المواقع في تعديلات اليوم
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { localizedName, localizeRow, localizeNested } from "@/lib/localized-name";
import { getUiLocale } from "@/i18n/ui-locale";
import { requirePermission, AccessError } from "@/lib/rbac";

export async function GET(_req: NextRequest) {
  try {
    const session = await getSession();
    const locale = await getUiLocale();
    requirePermission(session, "scheduling.manage");

    const sites = await db.site.findMany({
      where: { companyId: session!.companyId, status: "active" },
      select: { id: true, name: true, names: true },
      orderBy: { name: "asc" },
    });

    return NextResponse.json({
      count: sites.length,
      sites: sites.map((s) => ({ ...s, name: localizedName(s, locale, "name"), baseName: s.name })),
    });
  } catch (error) {
    if (error instanceof AccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[sites-options]", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
