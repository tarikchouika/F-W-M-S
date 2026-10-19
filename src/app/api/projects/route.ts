// FWMS — المشاريع (SPEC §5 و§8 — المرحلة 2): قائمة وإنشاء مع تحقق ملكية الفرع والعزل
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { localizedName, localizeRow, localizeNested } from "@/lib/localized-name";
import { getUiLocale } from "@/i18n/ui-locale";
import { requirePermission, AccessError } from "@/lib/rbac";
import { writeAudit } from "@/lib/audit";
import { projectCreateSchema, emptyToNull, parseOptionalDate } from "@/lib/organization";
import { namesColumnValue } from "@/lib/localized-name";

export async function GET() {
  try {
    const session = await getSession();
    const locale = await getUiLocale();
    requirePermission(session, "company.manage");

    const projects = await db.project.findMany({
      where: { companyId: session!.companyId },
      orderBy: { createdAt: "desc" },
      include: {
        branch: { select: { id: true, name: true, names: true } },
        _count: { select: { sites: { where: { status: "active" } } } },
      },
    });

    return NextResponse.json({
      count: projects.length,
      projects: projects.map((p) => ({
        id: p.id,
        name: localizedName(p, locale, "name"), baseName: p.name,
        names: p.names,
        code: p.code,
        status: p.status,
        startsAt: p.startsAt,
        endsAt: p.endsAt,
        createdAt: p.createdAt,
        branch: p.branch ? { id: p.branch.id, name: localizedName(p.branch, locale, "name") } : null,
        activeSites: p._count.sites,
      })),
    });
  } catch (error) {
    if (error instanceof AccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[projects]", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    requirePermission(session, "company.manage");

    const parsed = projectCreateSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "invalid_input" }, { status: 400 });
    }

    const { name, code, branchId, startsAt, endsAt } = parsed.data;

    // تحقق ملكية الفرع داخل الشركة (عزل 3.1): مرجع غريب يُرفض لا يُقبل
    const branchIdValue = emptyToNull(branchId);
    if (branchIdValue) {
      const branch = await db.branch.findFirst({
        where: { id: branchIdValue, companyId: session!.companyId },
        select: { id: true },
      });
      if (!branch) {
        return NextResponse.json({ error: "invalid_reference" }, { status: 400 });
      }
    }

    let startsAtDate: Date | null;
    let endsAtDate: Date | null;
    try {
      startsAtDate = parseOptionalDate(startsAt);
      endsAtDate = parseOptionalDate(endsAt);
    } catch {
      return NextResponse.json({ error: "invalid_input" }, { status: 400 });
    }

    const project = await db.project.create({
      data: {
        names: namesColumnValue(parsed.data.names),
        companyId: session!.companyId,
        name,
        code: emptyToNull(code),
        branchId: branchIdValue,
        startsAt: startsAtDate,
        endsAt: endsAtDate,
      },
    });

    await writeAudit({
      companyId: session!.companyId,
      userId: session!.sub,
      action: "project.create",
      entity: "project",
      entityId: project.id,
      after: {
        name: project.name,
        code: project.code,
        branchId: project.branchId,
        startsAt: project.startsAt,
        endsAt: project.endsAt,
      },
    });

    return NextResponse.json(
      { project: { id: project.id, name: project.name, status: project.status } },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof AccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[projects]", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
