// HRMP — قواعد الورديات المتكررة (fixed) والمتناوبة (rotating) — SPEC §4.1 و§8 — المرحلة 3
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { requirePermission, AccessError } from "@/lib/rbac";
import { writeAudit } from "@/lib/audit";
import { emptyToNull } from "@/lib/organization";
import { recurrenceCreateSchema, isShiftManager, parseRotation } from "@/lib/scheduling";
import { localizedName } from "@/lib/localized-name";
import { getUiLocale } from "@/i18n/ui-locale";

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    requirePermission(session, "scheduling.manage");
    if (!isShiftManager(session!.role)) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    const locale = await getUiLocale();

    const url = new URL(req.url);
    const status = url.searchParams.get("status") ?? "active";

    const where: Record<string, unknown> = { companyId: session!.companyId };
    if (status === "active" || status === "archived") where.status = status;

    const recurrences = await db.shiftRecurrence.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        worker: { select: { id: true, fullName: true, names: true } },
        site: { select: { id: true, name: true, names: true } },
        template: { select: { id: true, name: true } },
      },
    });

    // أسماء قوالب الدورة (المتناوبة) بجمع واحدة
    const rotationIds = new Set<string>();
    for (const r of recurrences) {
      for (const tid of parseRotation(r.rotationJson)) rotationIds.add(tid);
    }
    const rotationTemplates = rotationIds.size
      ? await db.shiftTemplate.findMany({
          where: { companyId: session!.companyId, id: { in: [...rotationIds] } },
          select: { id: true, name: true, status: true },
        })
      : [];
    const templateNames = new Map(rotationTemplates.map((t) => [t.id, t]));

    return NextResponse.json({
      count: recurrences.length,
      recurrences: recurrences.map((r) => ({
        id: r.id,
        mode: r.mode,
        status: r.status,
        startsOn: r.startsOn,
        endsOn: r.endsOn,
        rotationStepDays: r.rotationStepDays,
        weekdays: r.mode === "fixed" ? parseWeekdaysLocal(r.weekdaysJson) : null,
        worker: r.worker ? { id: r.worker.id, fullName: localizedName(r.worker, locale, "fullName") } : null,
        site: r.site ? { id: r.site.id, name: r.site.name } : null,
        template: r.template ? { id: r.template.id, name: r.template.name } : null,
        rotation:
          r.mode === "rotating"
            ? parseRotation(r.rotationJson).map((tid) => ({
                id: tid,
                name: templateNames.get(tid)?.name ?? tid,
                archived: templateNames.get(tid)?.status === "archived",
              }))
            : null,
        createdAt: r.createdAt,
      })),
    });
  } catch (error) {
    if (error instanceof AccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[shift-recurrences]", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

// تحليل أيام الأسبوع محليًا (نسخة عرض)
function parseWeekdaysLocal(json: string | null): number[] {
  if (!json) return [];
  try {
    const arr: unknown = JSON.parse(json);
    return Array.isArray(arr)
      ? arr.filter((n): n is number => Number.isInteger(n) && n >= 0 && n <= 6)
      : [];
  } catch {
    return [];
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    requirePermission(session, "scheduling.manage");
    if (!isShiftManager(session!.role)) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const parsed = recurrenceCreateSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "invalid_input" }, { status: 400 });
    }
    const data = parsed.data;

    // تحقق المراجع داخل الشركة (عزل 3.1)
    const membership = await db.userMembership.findFirst({
      where: {
        userId: data.workerUserId,
        companyId: session!.companyId,
        revokedAt: null,
        user: { isActive: true },
      },
      select: { id: true },
    });
    if (!membership) return NextResponse.json({ error: "invalid_reference" }, { status: 400 });

    const site = await db.site.findFirst({
      where: { id: data.siteId, companyId: session!.companyId, status: "active" },
      select: { id: true, name: true },
    });
    if (!site) return NextResponse.json({ error: "invalid_reference" }, { status: 400 });

    // القوالب المعنية: قالب واحد (fixed) أو دورة كاملة (rotating) — كلها نشطة وغير مكررة
    const neededTemplateIds =
      data.mode === "fixed"
        ? [emptyToNull(data.templateId)].filter((v): v is string => Boolean(v))
        : [...new Set(data.rotationTemplateIds ?? [])];

    const templates = await db.shiftTemplate.findMany({
      where: { companyId: session!.companyId, id: { in: neededTemplateIds }, status: "active" },
      select: { id: true, name: true },
    });
    if (templates.length !== neededTemplateIds.length) {
      return NextResponse.json({ error: "invalid_reference" }, { status: 400 });
    }

    const recurrence = await db.shiftRecurrence.create({
      data: {
        companyId: session!.companyId,
        workerUserId: data.workerUserId,
        siteId: data.siteId,
        mode: data.mode,
        templateId: data.mode === "fixed" ? emptyToNull(data.templateId) : null,
        rotationJson:
          data.mode === "rotating" ? JSON.stringify(data.rotationTemplateIds ?? []) : null,
        rotationStepDays: data.rotationStepDays,
        weekdaysJson: data.mode === "fixed" ? JSON.stringify(data.weekdays ?? []) : null,
        startsOn: data.startsOn,
        endsOn: emptyToNull(data.endsOn),
      },
    });

    await writeAudit({
      companyId: session!.companyId,
      userId: session!.sub,
      action: "shift_recurrence.create",
      entity: "shift_recurrence",
      entityId: recurrence.id,
      after: {
        workerUserId: data.workerUserId,
        siteId: data.siteId,
        mode: data.mode,
        templateId: recurrence.templateId,
        rotationTemplateIds: data.rotationTemplateIds ?? null,
        rotationStepDays: data.rotationStepDays,
        weekdays: data.weekdays ?? null,
        startsOn: data.startsOn,
        endsOn: recurrence.endsOn,
      },
    });

    return NextResponse.json(
      { recurrence: { id: recurrence.id, mode: recurrence.mode, status: recurrence.status } },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof AccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[shift-recurrences]", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
