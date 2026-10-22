// FWMS — «حضوري» (SPEC §4.2 و§4.5): سياق تسجيل الحضور للمستخدم نفسه
// المواقع النشطة بإحداثياتها + السياسة النافذة لكل موقع + آخر أحداثي اليوم + الزوج المفتوح + وردية اليوم
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { localizedName, localizeRow, localizeNested } from "@/lib/localized-name";
import { getUiLocale } from "@/i18n/ui-locale";
import { requirePermission, AccessError } from "@/lib/rbac";
import { addDaysToLocalDate, todayInZone, zonedToUtc } from "@/lib/scheduling";
import { findOpenCheckIn } from "@/lib/attendance-service";
import { resolvePolicyForSite } from "@/lib/verification";
import { QR_TTL_SECONDS } from "@/lib/verification";

export async function GET() {
  try {
    const session = await getSession();
    const locale = await getUiLocale();
    requirePermission(session, "self.view");

    const tz = session!.companyTimezone;
    const today = todayInZone(tz);
    const todayStart = zonedToUtc(today, 0, tz);
    const todayEnd = zonedToUtc(addDaysToLocalDate(today, 1), 0, tz);
    const now = new Date();

    // أحداثي اليوم (كل الحالات — أرى ماذا حدث بمحاولاتي)
    const myEvents = await db.attendanceEvent.findMany({
      where: {
        companyId: session!.companyId,
        workerUserId: session!.sub,
        occurredAt: { gte: todayStart, lt: todayEnd },
      },
      orderBy: { occurredAt: "desc" },
      include: { site: { select: { id: true, name: true, names: true } } },
      take: 50,
    });

    // الزوج المفتوح (دخول موثق بلا انصراف) — في أي موقع
    const lastCheckIn = await db.attendanceEvent.findFirst({
      where: { companyId: session!.companyId, workerUserId: session!.sub, type: "check_in", status: "verified" },
      orderBy: { occurredAt: "desc" },
    });
    let openPair: {
      checkInId: string;
      occurredAt: Date;
      site: { id: string; name: string; names: string | null; address: string | null } | null;
    } | null = null;
    if (lastCheckIn) {
      const laterCheckOut = await db.attendanceEvent.findFirst({
        where: {
          companyId: session!.companyId,
          workerUserId: session!.sub,
          type: "check_out",
          status: "verified",
          occurredAt: { gte: lastCheckIn.occurredAt },
        },
      });
      if (!laterCheckOut) {
        const site = await db.site.findUnique({
          where: { id: lastCheckIn.siteId },
          select: { id: true, name: true, names: true, address: true },
        });
        openPair = {
          checkInId: lastCheckIn.id,
          occurredAt: lastCheckIn.occurredAt,
          site,
        };
      }
    }

    // وردية اليوم: الجارية الآن ثم القادمة
    const todayShifts = await db.shift.findMany({
      where: {
        companyId: session!.companyId,
        workerUserId: session!.sub,
        status: "scheduled",
        startsAt: { lt: todayEnd },
        endsAt: { gt: todayStart },
      },
      orderBy: { startsAt: "asc" },
      include: { site: { select: { id: true, name: true, names: true, address: true } } },
    });
    const currentShift = todayShifts.find((s) => s.startsAt <= now && s.endsAt >= now) ?? null;
    const nextShift = todayShifts.find((s) => s.startsAt > now) ?? null;

    // المواقع النشطة للشركة بإحداثياتها + السياسة النافذة (يختار العامل موقعه)
    const sites = await db.site.findMany({
      where: { companyId: session!.companyId, status: "active" },
      select: { id: true, companyId: true, name: true, names: true, address: true, latitude: true, longitude: true, radiusM: true },
      orderBy: { name: "asc" },
      take: 50,
    });
    const sitesWithPolicy = await Promise.all(
      sites.map(async (s) => {
        const policy = await resolvePolicyForSite(s);
        return {
          ...s,
          name: localizedName(s, locale, "name"),
          baseName: s.name,
          policy: policy.mode,
          policyLevel: policy.level,
        };
      })
    );

    return NextResponse.json({
      today,
      qrTtlSeconds: QR_TTL_SECONDS,
      events: myEvents.map((e) => ({
        id: e.id,
        type: e.type,
        occurredAt: e.occurredAt,
        site: e.site ? { id: e.site.id, name: localizedName(e.site, locale, "name") } : null,
        distanceM: e.distanceM,
        accuracyM: e.accuracyM,
        insideFence: e.insideFence,
        status: e.status,
        reason: e.reason,
        policy: e.policy,
        verification: e.verification,
        networkMode: e.networkMode,
      })),
      openPair: openPair
        ? { ...openPair, site: openPair.site ? { ...openPair.site, name: localizedName(openPair.site, locale, "name") } : null }
        : null,
      currentShift: currentShift
        ? { id: currentShift.id, startsAt: currentShift.startsAt, endsAt: currentShift.endsAt, site: currentShift.site ? { ...currentShift.site, name: localizedName(currentShift.site, locale, "name") } : null }
        : null,
      nextShift: nextShift
        ? { id: nextShift.id, startsAt: nextShift.startsAt, endsAt: nextShift.endsAt, site: nextShift.site ? { ...nextShift.site, name: localizedName(nextShift.site, locale, "name") } : null }
        : null,
      sites: sitesWithPolicy,
    });
  } catch (error) {
    if (error instanceof AccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[my-attendance]", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
