// FWMS — المواقع (SPEC §4.2 و§5 و§8 — المرحلة 2): قائمة/إنشاء مع تحقق الإحداثيات ونصف القطر
// معيار قبول المرحلة: إنشاء موقع بنصف قطر وعرضه على الخريطة
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { namesColumnValue } from "@/lib/localized-name";
import { localizedName, localizeRow, localizeNested } from "@/lib/localized-name";
import { getUiLocale } from "@/i18n/ui-locale";
import { requirePermission, AccessError } from "@/lib/rbac";
import { writeAudit } from "@/lib/audit";
import { siteCreateSchema, emptyToNull } from "@/lib/organization";

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    const locale = await getUiLocale();
    requirePermission(session, "company.manage");

    const url = new URL(req.url);
    const status = url.searchParams.get("status") ?? "active"; // active | archived | all
    const q = url.searchParams.get("q")?.trim() ?? "";

    const where: Record<string, unknown> = { companyId: session!.companyId };
    if (status === "active" || status === "archived") where.status = status;
    if (q) {
      where.OR = [
        { name: { contains: q } },
        { address: { contains: q } },
      ];
    }

    const sites = await db.site.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        branch: { select: { id: true, name: true, names: true } },
        project: { select: { id: true, name: true, names: true } },
      },
    });

    return NextResponse.json({
      count: sites.length,
      sites: sites.map((s) => ({
        id: s.id,
        name: localizedName(s, locale, "name"), baseName: s.name,
        names: s.names,
        address: s.address,
        latitude: s.latitude,
        longitude: s.longitude,
        radiusM: s.radiusM,
        status: s.status,
        createdAt: s.createdAt,
        branch: s.branch ? { id: s.branch.id, name: localizedName(s.branch, locale, "name") } : null,
        project: s.project ? { id: s.project.id, name: localizedName(s.project, locale, "name") } : null,
      })),
    });
  } catch (error) {
    if (error instanceof AccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[sites]", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    requirePermission(session, "company.manage");

    const parsed = siteCreateSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "invalid_input" }, { status: 400 });
    }

    const { name, address, latitude, longitude, radiusM, branchId, projectId, names } = parsed.data;

    // تحقق ملكية المراجع داخل الشركة (عزل 3.1)
    const branchIdValue = emptyToNull(branchId);
    if (branchIdValue) {
      const branch = await db.branch.findFirst({
        where: { id: branchIdValue, companyId: session!.companyId },
        select: { id: true },
      });
      if (!branch) return NextResponse.json({ error: "invalid_reference" }, { status: 400 });
    }
    const projectIdValue = emptyToNull(projectId);
    if (projectIdValue) {
      const project = await db.project.findFirst({
        where: { id: projectIdValue, companyId: session!.companyId },
        select: { id: true },
      });
      if (!project) return NextResponse.json({ error: "invalid_reference" }, { status: 400 });
    }

    const site = await db.site.create({
      data: {
        companyId: session!.companyId,
        name,
        names: namesColumnValue(names),
        address: emptyToNull(address),
        latitude,
        longitude,
        radiusM,
        branchId: branchIdValue,
        projectId: projectIdValue,
      },
    });

    await writeAudit({
      companyId: session!.companyId,
      userId: session!.sub,
      action: "site.create",
      entity: "site",
      entityId: site.id,
      after: {
        name: site.name,
        latitude: site.latitude,
        longitude: site.longitude,
        radiusM: site.radiusM,
        branchId: site.branchId,
        projectId: site.projectId,
      },
    });

    return NextResponse.json(
      {
        site: {
          id: site.id,
          name: site.name,
          latitude: site.latitude,
          longitude: site.longitude,
          radiusM: site.radiusM,
          status: site.status,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof AccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[sites]", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
