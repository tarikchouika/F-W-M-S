// HRMP — الفروع (SPEC §5 و§8 — المرحلة 2): قائمة وإنشاء مع عزل الشركة وتدقيق
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { localizedName, localizeRow, localizeNested } from "@/lib/localized-name";
import { getUiLocale } from "@/i18n/ui-locale";
import { requirePermission, AccessError } from "@/lib/rbac";
import { writeAudit } from "@/lib/audit";
import { branchCreateSchema, emptyToNull } from "@/lib/organization";
import { namesColumnValue, addressesColumnValue, localizedAddress } from "@/lib/localized-name";

export async function GET() {
  try {
    const session = await getSession();
    const locale = await getUiLocale();
    requirePermission(session, "company.manage");

    const branches = await db.branch.findMany({
      where: { companyId: session!.companyId },
      orderBy: { createdAt: "desc" },
      include: {
        _count: { select: { sites: { where: { status: "active" } } } },
      },
    });

    return NextResponse.json({
      count: branches.length,
      branches: branches.map((b) => ({
        id: b.id,
        name: localizedName(b, locale, "name"), baseName: b.name,
        names: b.names,
        code: b.code,
        city: b.city,
        // العنوان يتبع لغة الواجهة (بلاغ المالك 2026-10-23)؛ الأساسي في baseAddress
        address: localizedAddress(b, locale, "address"), baseAddress: b.address,
        addresses: b.addresses,
        status: b.status,
        createdAt: b.createdAt,
        activeSites: b._count.sites,
      })),
    });
  } catch (error) {
    if (error instanceof AccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[branches]", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    requirePermission(session, "company.manage");

    const parsed = branchCreateSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "invalid_input" }, { status: 400 });
    }

    const branch = await db.branch.create({
      data: {
        companyId: session!.companyId, // من الجلسة لا من العميل (SPEC §3.1)
        name: parsed.data.name,
        names: namesColumnValue(parsed.data.names),
        code: emptyToNull(parsed.data.code),
        city: emptyToNull(parsed.data.city),
        address: emptyToNull(parsed.data.address),
        addresses: addressesColumnValue(parsed.data.addresses),
      },
    });

    await writeAudit({
      companyId: session!.companyId,
      userId: session!.sub,
      action: "branch.create",
      entity: "branch",
      entityId: branch.id,
      after: { name: branch.name, code: branch.code, city: branch.city },
    });

    return NextResponse.json(
      {
        branch: {
          id: branch.id,
          name: branch.name,
          code: branch.code,
          city: branch.city,
          status: branch.status,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof AccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[branches]", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
