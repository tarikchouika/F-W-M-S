// HRMP — إدارة الشركات (SPEC §3 و§8): super_admin فقط — إنشاء الشركات وتعليقها
// العزل (§3.1): companyId من الجلسة لا من العميل أبدًا
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { localizedName, localizeRow, localizeNested } from "@/lib/localized-name";
import { getUiLocale } from "@/i18n/ui-locale";
import { requirePermission, AccessError } from "@/lib/rbac";
import { writeAudit } from "@/lib/audit";
import { isPlatformFrozen } from "@/lib/branding";
import { companyCreateSchema, emptyToNull } from "@/lib/organization";
import { namesColumnValue } from "@/lib/localized-name";

function fail(error: unknown) {
  if (error instanceof AccessError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  console.error("[companies]", error);
  return NextResponse.json({ error: "internal_error" }, { status: 500 });
}

export async function GET() {
  try {
    const session = await getSession();
    const locale = await getUiLocale();
    requirePermission(session, "platform.manage");

    const companies = await db.company.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        _count: {
          select: {
            memberships: { where: { revokedAt: null } },
            sites: { where: { status: "active" } },
          },
        },
      },
    });

    return NextResponse.json({
      count: companies.length,
      companies: companies.map((c) => ({
        id: c.id,
        legalName: localizedName(c, locale, "legalName"), baseName: c.legalName,
        names: c.names,
        tradeName: c.tradeName,
        taxId: c.taxId,
        cnssNumber: c.cnssNumber,
        locale: c.locale,
        timezone: c.timezone,
        status: c.status,
        createdAt: c.createdAt,
        membersCount: c._count.memberships,
        sitesCount: c._count.sites,
      })),
    });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    requirePermission(session, "platform.manage");

    // تجميد التغييرات الإدارية أثناء نقل ملكية جارٍ (SPEC §3.2 خطوة 1)
    if (await isPlatformFrozen()) {
      return NextResponse.json({ error: "platform_frozen" }, { status: 423 });
    }

    const parsed = companyCreateSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "invalid_input" }, { status: 400 });
    }

    const { legalName, tradeName, taxId, cnssNumber, locale, timezone, names } = parsed.data;

    // إنشاء الشركة + إعداداتها الافتراضية (SPEC §11) + سياسة تحقق GPS (SPEC §4.2)
    // + عضوية super_admin للمنشئ كي يستطيع التبديل إليها صراحة (SPEC §3.1)
    const company = await db.$transaction(async (tx) => {
      const created = await tx.company.create({
        data: {
          legalName,
          names: namesColumnValue(names),
          tradeName: emptyToNull(tradeName),
          taxId: emptyToNull(taxId),
          cnssNumber: emptyToNull(cnssNumber),
          locale,
          timezone,
          status: "active",
        },
      });
      await tx.companySettings.create({
        data: { companyId: created.id }, // القيم الافتراضية المغربية في المخطط
      });
      await tx.verificationPolicy.create({
        data: { companyId: created.id, policy: "none" },
      });
      await tx.userMembership.create({
        data: {
          userId: session!.sub,
          companyId: created.id,
          role: "super_admin",
          isDefault: false,
        },
      });
      return created;
    });

    await writeAudit({
      companyId: company.id,
      userId: session!.sub,
      action: "company.create",
      entity: "company",
      entityId: company.id,
      after: {
        legalName: company.legalName,
        locale: company.locale,
        timezone: company.timezone,
        membershipGranted: "super_admin",
      },
    });

    return NextResponse.json(
      { company: { id: company.id, legalName: company.legalName, status: company.status } },
      { status: 201 }
    );
  } catch (error) {
    return fail(error);
  }
}
