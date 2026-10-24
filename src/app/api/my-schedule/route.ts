// HRMP — «برنامجي» (SPEC §4.1 و§8 — المرحلة 3): برنامجه للعامل نفسه فقط
// معيار قبول المرحلة: «العامل يرى برنامجه» — أي دور مصادق يرى وردياته هو حصرًا (self.view)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { localizedName, localizeRow, localizeNested } from "@/lib/localized-name";
import { getUiLocale } from "@/i18n/ui-locale";
import { requirePermission, AccessError } from "@/lib/rbac";
import { addDaysToLocalDate, todayInZone, minutesInZone } from "@/lib/scheduling";

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    const locale = await getUiLocale();
    requirePermission(session, "self.view");

    const url = new URL(req.url);
    const today = todayInZone(session!.companyTimezone);
    const from = url.searchParams.get("from")?.trim() || today;
    const to = url.searchParams.get("to")?.trim() || addDaysToLocalDate(today, 13); // أسبوعان افتراضيًا

    const where: Record<string, unknown> = {
      companyId: session!.companyId,
      workerUserId: session!.sub, // بيانات المستخدم نفسه فقط — العزل هنا شخصي
      localDate: { gte: from, lte: to },
      status: "scheduled",
    };

    const shifts = await db.shift.findMany({
      where,
      orderBy: { startsAt: "asc" },
      include: {
        site: { select: { id: true, name: true, names: true, address: true } },
        template: { select: { id: true, name: true } },
      },
      take: 200,
    });

    return NextResponse.json({
      count: shifts.length,
      from,
      to,
      today,
      shifts: shifts.map((s) => ({
        id: s.id,
        localDate: s.localDate,
        startsAt: s.startsAt,
        endsAt: s.endsAt,
        startTimeMin: minutesInZone(s.startsAt, session!.companyTimezone),
        endTimeMin: minutesInZone(s.endsAt, session!.companyTimezone),
        breakMinutes: s.breakMinutes,
        status: s.status,
        source: s.source,
        notes: s.notes,
        site: s.site
          ? { id: s.site.id, name: localizedName(s.site, locale, "name"), address: s.site.address }
          : null,
        template: s.template ? { id: s.template.id, name: s.template.name } : null,
      })),
    });
  } catch (error) {
    if (error instanceof AccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[my-schedule]", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
