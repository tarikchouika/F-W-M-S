// HRMP — خدمة الحضور المشتركة بين check-in وcheck-out (SPEC §4.2 — المرحلة 4)
// المسار الإلزامي: تحقق الخادم بالنطاق ← مكافحة التلاعب ← سياسة التحقق ← التسجيل (append-only)
// companyId من الجلسة حصراً (عزل SPEC §3.1) — الرفض يُسجَّل كمحاولة دائماً
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, type SessionPayload } from "@/lib/auth/session";
import { requirePermission, AccessError } from "@/lib/rbac";
import { writeAudit } from "@/lib/audit";
import { rateLimit } from "@/lib/rate-limit";
import {
  attendanceCheckSchema,
  evaluateAntiSpoofing,
  isInsideFence,
  SHIFT_LINK_WINDOW_MIN,
  JUMP_LOOKBACK_HOURS,
} from "@/lib/geofence";
import { evaluateVerification, resolvePolicyForSite } from "@/lib/verification";

const ATTENDANCE_RATE_LIMIT = 12; // محاولة/دقيقة لكل مستخدم (SPEC §6)
const TIME_SKEW_WARN_MS = 5 * 60 * 1000; // انحراف ساعة العميل > 5 دقائق → مؤشر خطر

type EventType = "check_in" | "check_out";

export async function recordAttendance(
  req: NextRequest,
  type: EventType
): Promise<NextResponse> {
  try {
    const session = await getSession();
    requirePermission(session, "self.view"); // حضوره هو — كل الأدوار

    // محدد المعدل (SPEC §6) — قبل أي عمل ثقيل
    const rl = rateLimit(`attendance:${session!.companyId}:${session!.sub}`, ATTENDANCE_RATE_LIMIT, 60_000);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "rate_limited", retryAfterMs: rl.retryAfterMs },
        { status: 429 }
      );
    }

    const parsed = attendanceCheckSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "invalid_input" }, { status: 400 });
    }
    const body = parsed.data;

    // الموقع: ملكية الشركة + نشط (عزل 3.1 — التخمين لا يكشف شيئاً)
    const site = await db.site.findFirst({
      where: { id: body.siteId, companyId: session!.companyId, status: "active" },
      select: { id: true, companyId: true, name: true, latitude: true, longitude: true, radiusM: true },
    });
    if (!site) {
      return NextResponse.json({ error: "invalid_reference" }, { status: 400 });
    }

    // الأوقات: recordedAt (الخادم) هو الفاصل؛ occurredAt وقت العميل المُبلَّغ
    const recordedAt = new Date();
    const occurredAt = body.clientTimestamp ? new Date(body.clientTimestamp) : recordedAt;
    if (Number.isNaN(occurredAt.getTime())) {
      return NextResponse.json({ error: "invalid_input" }, { status: 400 });
    }

    // 1) النطاق الجغرافي — القرار في الخادم حصراً (SPEC §4.2)
    const fence = isInsideFence(site, body.coordinates);

    // 2) مكافحة التلاعب: دقة + إشارات الجهاز + قفزة مستحيلة من آخر قراءة
    const previous = await db.attendanceEvent.findFirst({
      where: {
        companyId: session!.companyId,
        workerUserId: session!.sub,
        occurredAt: { gte: new Date(recordedAt.getTime() - JUMP_LOOKBACK_HOURS * 3600_000) },
      },
      orderBy: { occurredAt: "desc" },
      select: { occurredAt: true, latitude: true, longitude: true },
    });
    const spoof = evaluateAntiSpoofing({
      point: body.coordinates,
      occurredAt,
      accuracyM: body.coordinates.accuracyM ?? null,
      radiusM: site.radiusM,
      device: body.device ?? null,
      previous,
    });
    // انحراف ساعة العميل — مؤشر خطر يُسجَّل لا يرفض
    const timeSkewMs = recordedAt.getTime() - occurredAt.getTime();
    spoof.checks.timeSkewMs = Math.abs(timeSkewMs) > TIME_SKEW_WARN_MS ? timeSkewMs : null;

    // 3) أزواج الدخول/الانصراف: الدخول يُمنع مع زوج مفتوح (أي موقع)؛ الانصراف يتطلب زوجاً مفتوحاً في نفس الموقع
    if (type === "check_in") {
      const openAnywhere = await findOpenCheckInAnySite(session!.companyId, session!.sub);
      if (openAnywhere) {
        return NextResponse.json({ error: "already_checked_in" }, { status: 400 });
      }
    } else {
      const openPair = await findOpenCheckIn(session!.companyId, session!.sub, site.id);
      if (!openPair) {
        return NextResponse.json({ error: "no_open_checkin" }, { status: 400 });
      }
    }

    // 4) سياسة التحقق النافذة للموقع — تُطبق عند الدخول (SPEC §4.2: «عند الحضور»)؛ الانصراف جغرافي فقط
    const policy = await resolvePolicyForSite(site);
    const verification =
      type === "check_in"
        ? evaluateVerification(
            policy.mode,
            {
              qrToken: body.verification?.qrToken ?? null,
              face: body.verification?.face ?? null,
            },
            { siteId: site.id, companyId: session!.companyId },
            recordedAt
          )
        : { satisfied: "none" as const, failed: null, qrNonce: null };

    // 5) ربط الوردية إن وُجدت مطابقة زمنية (± ساعتين) — إسناد معلوماتي
    const shift = await db.shift.findFirst({
      where: {
        companyId: session!.companyId,
        workerUserId: session!.sub,
        siteId: site.id,
        status: "scheduled",
        startsAt: { lte: new Date(recordedAt.getTime() + SHIFT_LINK_WINDOW_MIN * 60_000) },
        endsAt: { gte: new Date(recordedAt.getTime() - SHIFT_LINK_WINDOW_MIN * 60_000) },
      },
      orderBy: { startsAt: "desc" },
      select: { id: true },
    });

    // 6) القرار النهائي: تلاعب ← خارج النطاق ← فشل تحقق (مراجعة) ← موثَّق
    let status: "verified" | "pending_review" | "rejected";
    let reason: string | null = null;
    let satisfied = verification.satisfied;

    if (spoof.rejected) {
      status = "rejected";
      reason = spoof.reason;
      satisfied = "none";
    } else if (!fence.inside) {
      status = "rejected";
      reason = "outside_fence";
      satisfied = "none";
    } else if (type === "check_in" && verification.failed) {
      status = "pending_review"; // لا قفل للعامل — تسجيل بمراجعة (SPEC §4.2)
      reason = verification.failed;
    } else {
      status = "verified";
    }

    // 7) التسجيل append-only — كل محاولة تُسجَّل (SPEC §4.2 و§11.7)
    const event = await createEventSafely({
      companyId: session!.companyId,
      workerUserId: session!.sub,
      siteId: site.id,
      shiftId: shift?.id ?? null,
      type,
      occurredAt,
      latitude: body.coordinates.latitude,
      longitude: body.coordinates.longitude,
      accuracyM: body.coordinates.accuracyM ?? null,
      distanceM: fence.distanceM,
      insideFence: fence.inside,
      policy: policy.mode,
      verification: satisfied,
      qrNonce: status === "verified" || status === "pending_review" ? verification.qrNonce : null,
      status,
      reason,
      deviceJson: JSON.stringify(body.device ?? {}),
      spoofJson: JSON.stringify(spoof.checks),
      networkMode: body.networkMode,
    }).catch(async (error: unknown) => {
      // إعادة استخدام نفس رمز QR (nonce مكرر) → منع replay: تحويل إلى مراجعة بسبب رمز غير صالح
      if (typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === "P2002") {
        status = "pending_review"; // حدّث الحالة والسبب كي تعكسهما الاستجابة والتدقيق
        reason = "qr_invalid";
        satisfied = "none";
        return createEventSafely({
          companyId: session!.companyId,
          workerUserId: session!.sub,
          siteId: site.id,
          shiftId: shift?.id ?? null,
          type,
          occurredAt,
          latitude: body.coordinates.latitude,
          longitude: body.coordinates.longitude,
          accuracyM: body.coordinates.accuracyM ?? null,
          distanceM: fence.distanceM,
          insideFence: fence.inside,
          policy: policy.mode,
          verification: "none",
          qrNonce: null,
          status,
          reason,
          deviceJson: JSON.stringify(body.device ?? {}),
          spoofJson: JSON.stringify({ ...spoof.checks, qrReplay: true }),
          networkMode: body.networkMode,
        });
      }
      throw error;
    });

    // 8) التدقيق — الفعل حساس دائماً (نجاحاً أو رفضاً)
    await writeAudit({
      companyId: session!.companyId,
      userId: session!.sub,
      action: type === "check_in" ? "attendance.check_in" : "attendance.check_out",
      entity: "attendance_event",
      entityId: event.id,
      after: {
        site: site.name,
        status,
        reason,
        distanceM: fence.distanceM,
        radiusM: site.radiusM,
        policy: policy.mode,
        verification: satisfied,
        networkMode: body.networkMode,
      },
    });

    if (status === "rejected") {
      // رفض برسالة واضحة + المحاولة مسجَّلة (SPEC §4.2)
      return NextResponse.json(
        {
          error: reason,
          distanceM: fence.distanceM,
          radiusM: site.radiusM,
          event: mapEvent(event, site.name),
        },
        { status: 422 }
      );
    }

    return NextResponse.json(
      {
        event: mapEvent(event, site.name),
        status,
        reason,
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof AccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error(`[attendance:${type}]`, error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

/// ─── مساعدات ────────────────────────────────────────────────────

/** آخر دخول موثَّق مفتوح للعامل في الشركة (أي موقع) — يمنع الدخول المزدوج */
export async function findOpenCheckInAnySite(companyId: string, workerUserId: string) {
  const lastCheckIn = await db.attendanceEvent.findFirst({
    where: { companyId, workerUserId, type: "check_in", status: "verified" },
    orderBy: { occurredAt: "desc" },
  });
  if (!lastCheckIn) return null;
  const laterCheckOut = await db.attendanceEvent.findFirst({
    where: {
      companyId,
      workerUserId,
      type: "check_out",
      status: "verified",
      occurredAt: { gte: lastCheckIn.occurredAt },
    },
  });
  return laterCheckOut ? null : lastCheckIn;
}

/** آخر دخول موثَّق مفتوح للعامل في موقع (بلا انصراف موثَّق لاحق) */
export async function findOpenCheckIn(
  companyId: string,
  workerUserId: string,
  siteId: string
) {
  const lastCheckIn = await db.attendanceEvent.findFirst({
    where: { companyId, workerUserId, siteId, type: "check_in", status: "verified" },
    orderBy: { occurredAt: "desc" },
  });
  if (!lastCheckIn) return null;
  const laterCheckOut = await db.attendanceEvent.findFirst({
    where: {
      companyId,
      workerUserId,
      siteId,
      type: "check_out",
      status: "verified",
      occurredAt: { gte: lastCheckIn.occurredAt },
    },
    orderBy: { occurredAt: "desc" },
  });
  return laterCheckOut ? null : lastCheckIn;
}

/** إنشاء الحدث — منفصل كي يُلتقط خطأ nonce المكرر */
async function createEventSafely(data: {
  companyId: string;
  workerUserId: string;
  siteId: string;
  shiftId: string | null;
  type: EventType;
  occurredAt: Date;
  latitude: number;
  longitude: number;
  accuracyM: number | null;
  distanceM: number;
  insideFence: boolean;
  policy: string;
  verification: string;
  qrNonce: string | null;
  status: string;
  reason: string | null;
  deviceJson: string;
  spoofJson: string;
  networkMode: string;
}) {
  return db.attendanceEvent.create({ data });
}

export function mapEvent(
  event: {
    id: string;
    type: string;
    occurredAt: Date;
    recordedAt: Date;
    distanceM: number | null;
    accuracyM: number | null;
    insideFence: boolean;
    policy: string;
    verification: string;
    status: string;
    reason: string | null;
    networkMode: string;
    reviewNotes: string | null;
    shiftId: string | null;
  },
  siteName?: string
) {
  return {
    id: event.id,
    type: event.type,
    occurredAt: event.occurredAt,
    recordedAt: event.recordedAt,
    siteName: siteName ?? null,
    distanceM: event.distanceM,
    accuracyM: event.accuracyM,
    insideFence: event.insideFence,
    policy: event.policy,
    verification: event.verification,
    status: event.status,
    reason: event.reason,
    networkMode: event.networkMode,
    reviewNotes: event.reviewNotes,
    shiftId: event.shiftId,
  };
}

/** نطاق مواقع co_admin من scopeJson — null/غير صالح = كامل الشركة (افتراضي موثَّق) */
export async function coAdminSiteScope(session: SessionPayload): Promise<string[] | null> {
  if (session.role !== "co_admin") return null; // غير المشرف: بلا نطاق sites
  const membership = await db.userMembership.findFirst({
    where: { userId: session.sub, companyId: session.companyId, revokedAt: null },
    select: { scopeJson: true },
  });
  if (!membership?.scopeJson) return null;
  try {
    const scope = JSON.parse(membership.scopeJson) as { siteIds?: unknown };
    if (Array.isArray(scope.siteIds) && scope.siteIds.every((v) => typeof v === "string")) {
      return scope.siteIds.length > 0 ? scope.siteIds : [];
    }
  } catch {
    /* JSON غير صالح → نطاق كامل */
  }
  return null;
}
