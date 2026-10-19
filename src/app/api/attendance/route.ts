// FWMS — قائمة أحداث الحضور (SPEC §4.2 و§4.4): للمشرفين والمديرين بحسب النطاق + إحصاءات اليوم
// co_admin: مواقع scopeJson إن حُدد، وإلا كامل الشركة (افتراضي موثَّق) — العامل يستخدم /api/my-attendance
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { localizedName, localizeRow, localizeNested } from "@/lib/localized-name";
import { getUiLocale } from "@/i18n/ui-locale";
import { requirePermission, AccessError } from "@/lib/rbac";
import { coAdminSiteScope } from "@/lib/attendance-service";
import { addDaysToLocalDate, todayInZone, zonedToUtc } from "@/lib/scheduling";
import { ATTENDANCE_STATUSES, ATTENDANCE_TYPES } from "@/lib/geofence";

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    const locale = await getUiLocale();
    requirePermission(session, "attendance.manage");

    const url = new URL(req.url);
    const today = todayInZone(session!.companyTimezone);
    const from = url.searchParams.get("from")?.trim() || addDaysToLocalDate(today, -7);
    const to = url.searchParams.get("to")?.trim() || today;
    const status = url.searchParams.get("status")?.trim() ?? "all";
    const type = url.searchParams.get("type")?.trim() ?? "all";
    const siteId = url.searchParams.get("siteId")?.trim() ?? "";
    const workerUserId = url.searchParams.get("workerUserId")?.trim() ?? "";

    // حدود UTC لليوم المحلي (التخزين UTC دائماً)
    const rangeStart = zonedToUtc(from, 0, session!.companyTimezone);
    const rangeEnd = zonedToUtc(addDaysToLocalDate(to, 1), 0, session!.companyTimezone);
    const todayStart = zonedToUtc(today, 0, session!.companyTimezone);
    const todayEnd = zonedToUtc(addDaysToLocalDate(today, 1), 0, session!.companyTimezone);

    const where: Record<string, unknown> = {
      companyId: session!.companyId,
      occurredAt: { gte: rangeStart, lt: rangeEnd },
    };
    if ((ATTENDANCE_STATUSES as readonly string[]).includes(status)) where.status = status;
    if ((ATTENDANCE_TYPES as readonly string[]).includes(type)) where.type = type;
    if (siteId) where.siteId = siteId;
    if (workerUserId) where.workerUserId = workerUserId;

    // نطاق المشرف الميداني: مواقع مسندة فقط إن حُدد scopeJson
    const scope = await coAdminSiteScope(session!);
    if (scope !== null) {
      where.siteId = scope.includes(siteId) ? siteId : { in: scope };
    }

    const events = await db.attendanceEvent.findMany({
      where,
      orderBy: [{ occurredAt: "desc" }, { recordedAt: "desc" }],
      include: {
        worker: { select: { id: true, fullName: true } },
        site: { select: { id: true, name: true, names: true } },
      },
      take: 500,
    });

    // إحصاءات اليوم (كامل نطاق الطالب) — الحضور اللحظي للوحة (SPEC §4.4)
    const statsWhere: Record<string, unknown> = {
      companyId: session!.companyId,
      occurredAt: { gte: todayStart, lt: todayEnd },
    };
    if (scope !== null) statsWhere.siteId = { in: scope };
    const [checkIns, checkOuts, pending, rejected] = await Promise.all([
      db.attendanceEvent.count({ where: { ...statsWhere, type: "check_in", status: "verified" } }),
      db.attendanceEvent.count({ where: { ...statsWhere, type: "check_out", status: "verified" } }),
      db.attendanceEvent.count({ where: { ...statsWhere, status: "pending_review" } }),
      db.attendanceEvent.count({ where: { ...statsWhere, status: "rejected" } }),
    ]);
    const onSiteNow = Math.max(0, checkIns - checkOuts); // تقدير: دخول موثق بلا انصراف موثق

    return NextResponse.json({
      count: events.length,
      from,
      to,
      today,
      stats: { checkIns, checkOuts, onSiteNow, pendingReview: pending, rejected },
      events: events.map((e) => ({
        id: e.id,
        type: e.type,
        occurredAt: e.occurredAt,
        recordedAt: e.recordedAt,
        worker: e.worker ? { id: e.worker.id, fullName: e.worker.fullName } : null,
        site: e.site ? { id: e.site.id, name: localizedName(e.site, locale, "name") } : null,
        shiftId: e.shiftId,
        distanceM: e.distanceM,
        accuracyM: e.accuracyM,
        insideFence: e.insideFence,
        policy: e.policy,
        verification: e.verification,
        status: e.status,
        reason: e.reason,
        networkMode: e.networkMode,
        reviewNotes: e.reviewNotes,
        reviewedAt: e.reviewedAt,
      })),
    });
  } catch (error) {
    if (error instanceof AccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[attendance]", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
