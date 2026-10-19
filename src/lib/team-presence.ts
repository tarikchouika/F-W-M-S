// FWMS — التتبع الحضوري الجغرافي للفرق (المرحلة 9 — v0.10.0)
// ---------------------------------------------------------------------------
// طلب المالك 2026-10-18: «يجب أن يستطيع مسؤول الفريق معرفة هل العمال والحرفيون
// موجودون في موقع العمل (حسب حدود المساحة الجغرافية المحددة للفريق) أم قاموا
// بمغادرته، ويجب إشعاره بشكل آني وآلي». والكوأدمن يطلع على الموقع الجغرافي للعمل
// والموقع الأني للعمال والحرفيين والمسؤولين عن الفرق التابعة له.
//
// المبادئ:
// 1) منطق نقي قابل للاختبار (قاعدة SPEC §4.3) — المنطقة تُشتق من الفريق (zone*)
//    أو من موقعه المرجعي، والقرار في الخادم حصرًا (Haversine كجوار الحضور).
// 2) الانتقالات فقط تُخطر (دخول→مغادرة ومغادرة→دخول) — لا إزعاج بكل نبضة.
// 3) لا تتبع خلفي: النبضات تردها أجهزة الأعضاء أثناء فتح اللوحة (watcher) —
//    نافذة النظر للانتقال ساعتان (جلسة ميدانية واحدة)، والقِدم 10 دقائق (أني).
// 4) الخصوصية: العامل لا يرى مواقع أحد؛ يراها قائد فريقه (فريقه فقط)،
//    والكوأدمن (فرق نطاقه)، والأدمن/السوبر (الشركة).

import { db } from "@/lib/db";
import { haversineDistanceM } from "@/lib/geofence";
import { createNotification } from "@/lib/notifications";
import { coAdminSiteScope } from "@/lib/attendance-service";
import type { SessionPayload } from "@/lib/auth/jwt";

export const PRESENCE_FRESH_MS = 10 * 60 * 1000; // أحدث من 10 دقائق = «أني»
export const PRESENCE_TRANSITION_LOOKBACK_MS = 2 * 60 * 60 * 1000; // نافذة انتقال = جلسة ساعتين
export const DEFAULT_ZONE_RADIUS_M = 150; // مطابق لافتراض المخطط

export type ZoneInfo = {
  lat: number;
  lng: number;
  radiusM: number;
  source: "group" | "site";
};

export type PresenceState = "inside" | "outside" | "stale" | "no_ping";

export type MemberPresence = {
  userId: string;
  fullName: string;
  jobTitle: string | null; // تسمية جاهزة بلغة العرض تُبنى في الواجهة — هنا المفتاح فقط
  jobTitleKey: string | null;
  state: PresenceState;
  distanceM: number | null;
  lastPingAt: string | null;
  lastLat: number | null;
  lastLng: number | null;
  accuracyM: number | null;
};

export type GroupPresence = {
  id: string;
  name: string;
  kind: string;
  status: string;
  leaderUserId: string | null;
  leaderName: string | null;
  siteId: string | null;
  siteName: string | null;
  zone: ZoneInfo | null;
  members: MemberPresence[];
  counts: { inside: number; outside: number; stale: number; no_ping: number; total: number };
};

/** منطقة الفريق: حقول الفريق الصريحة، وإلا مركز موقعه المرجعي — وإلا لا منطقة (لا متابعة) */
export function resolveGroupZone(
  group: { zoneLat: number | null; zoneLng: number | null; zoneRadiusM: number | null; siteId: string | null },
  site: { latitude: number; longitude: number } | null,
): ZoneInfo | null {
  const radius = group.zoneRadiusM ?? DEFAULT_ZONE_RADIUS_M;
  if (group.zoneLat != null && group.zoneLng != null) {
    return { lat: group.zoneLat, lng: group.zoneLng, radiusM: radius, source: "group" };
  }
  if (site) {
    return { lat: site.latitude, lng: site.longitude, radiusM: radius, source: "site" };
  }
  return null;
}

/** حالة عضو واحد من آخر نبضة */
export function stateFromPings(
  latest: { lat: number; lng: number; reportedAt: Date; accuracyM: number | null } | null,
  zone: ZoneInfo | null,
  now: Date,
): { state: PresenceState; distanceM: number | null } {
  if (!latest) return { state: "no_ping", distanceM: null };
  if (!zone) return { state: "stale", distanceM: null }; // لا منطقة: نُبقي آخر موقع بلا حكم داخل/خارج
  const distanceM = Math.round(
    haversineDistanceM({ latitude: zone.lat, longitude: zone.lng }, { latitude: latest.lat, longitude: latest.lng }),
  );
  const inside = distanceM <= zone.radiusM;
  const fresh = now.getTime() - latest.reportedAt.getTime() <= PRESENCE_FRESH_MS;
  if (!fresh) return { state: "stale", distanceM };
  return { state: inside ? "inside" : "outside", distanceM };
}

/** انتقال بين نبضتين لنفس الفريق — null = لا انتقال ذا بال (بلا سابق أو خارج النافذة) */
export function zoneTransition(
  prev: { lat: number; lng: number; reportedAt: Date } | null,
  next: { lat: number; lng: number; reportedAt: Date },
  zone: ZoneInfo | null,
): "left" | "returned" | null {
  if (!zone || !prev) return null;
  if (next.reportedAt.getTime() - prev.reportedAt.getTime() > PRESENCE_TRANSITION_LOOKBACK_MS) return null;
  const distPrev = haversineDistanceM({ latitude: zone.lat, longitude: zone.lng }, { latitude: prev.lat, longitude: prev.lng });
  const distNext = haversineDistanceM({ latitude: zone.lat, longitude: zone.lng }, { latitude: next.lat, longitude: next.lng });
  const wasInside = distPrev <= zone.radiusM;
  const isInside = distNext <= zone.radiusM;
  if (wasInside && !isInside) return "left";
  if (!wasInside && isInside) return "returned";
  return null;
}

export type PingEvaluation = {
  groupId: string;
  groupName: string;
  state: PresenceState;
  distanceM: number | null;
  transition: "left" | "returned" | null;
  leaderNotified: boolean;
};

/**
 * تسجيل نبضة موقع عضو وتقييمها على كل فرقه السارية — القلب الآلي للإشعار الأني.
 * تُنشئ النبضة مرة، ويُقيَّم الموضع نفسه على كل فريق (قد يكون داخل منطقة فريق
 * وخارج أخرى). الانتقال يخطر قائد الفريق المعني فقط.
 */
export async function recordPingAndEvaluate(input: {
  companyId: string;
  userId: string;
  lat: number;
  lng: number;
  accuracyM: number | null;
  source: "watcher" | "manual";
}): Promise<{ pingId: string; evaluations: PingEvaluation[] }> {
  // فرق المستخدم السارية (عضوية أو قيادة — القائد يشترك في المراقبة أيضًا)
  const memberships = await db.workerGroupMember.findMany({
    where: { companyId: input.companyId, userId: input.userId, status: "active" },
    include: { group: { include: { site: { select: { latitude: true, longitude: true } } } } },
  });
  const led = await db.workerGroup.findMany({
    where: { companyId: input.companyId, leaderUserId: input.userId, status: "active" },
    include: { site: { select: { latitude: true, longitude: true } } },
  });

  // النبضة السابقة (قبل إدراج الجديدة) — مشتركة بين الفرق ك stream واحد
  const prevPing = await db.memberLocationPing.findFirst({
    where: { userId: input.userId, companyId: input.companyId },
    orderBy: { reportedAt: "desc" },
  });

  const ping = await db.memberLocationPing.create({
    data: {
      companyId: input.companyId,
      userId: input.userId,
      groupId: memberships[0]?.groupId ?? led[0]?.id ?? null,
      lat: input.lat,
      lng: input.lng,
      accuracyM: input.accuracyM,
      source: input.source,
    },
  });

  const next = { lat: input.lat, lng: input.lng, reportedAt: new Date() };
  // (بلاغ «خلل الترجمة» 2026-10-19): كان البديل «عضو» عربيًّا مثبتًا في إشعارات
  // القادة لكل اللغات — صار البريد محايدًا لغويًا (fullName إلزامي في المخطط فالبديل
  // نظري لا يكاد يقع، لكن بقاؤه عربيًّا كان خرقًا للقاعدة 1).
  const memberName =
    (await db.user.findUnique({ where: { id: input.userId }, select: { fullName: true, email: true } }))
      ?.fullName ?? "member";

  const evaluations: PingEvaluation[] = [];
  const seen = new Set<string>();
  for (const m of [...memberships.map((x) => x.group), ...led]) {
    if (seen.has(m.id)) continue;
    seen.add(m.id);
    const zone = resolveGroupZone(m, m.site ? { latitude: m.site.latitude, longitude: m.site.longitude } : null);
    if (!zone) continue; // فريق بلا منطقة: لا متابعة جغرافية (يُذكر في الواجهة)
    const transition = zoneTransition(
      prevPing ? { lat: prevPing.lat, lng: prevPing.lng, reportedAt: prevPing.reportedAt } : null,
      next,
      zone,
    );
    const { state, distanceM } = stateFromPings(
      { ...next, reportedAt: new Date(), accuracyM: input.accuracyM },
      zone,
      new Date(),
    );

    let leaderNotified = false;
    if (transition && m.leaderUserId && m.leaderUserId !== input.userId) {
      const payload = {
        memberName,
        groupName: m.name,
        zoneRadiusM: zone.radiusM,
        distanceM: distanceM ?? 0,
        at: new Date().toISOString(),
      };
      const created = await createNotification({
        companyId: input.companyId,
        userId: m.leaderUserId,
        type: transition === "left" ? "team_member_left_zone" : "team_member_entered_zone",
        payload,
      });
      leaderNotified = created != null;
    }

    evaluations.push({
      groupId: m.id,
      groupName: m.name,
      state,
      distanceM,
      transition,
      leaderNotified,
    });
  }

  return { pingId: ping.id, evaluations };
}

/** فرق المتابعة الظاهرة لمستعرض بعينه — قادة الفرق / نطاق الكوأدمن / الشركة للإدارة */
export async function presenceScopeGroups(session: SessionPayload): Promise<{
  groups: { id: string; name: string; kind: string; status: string; siteId: string | null }[];
  scope: "company" | "sites" | "led";
}> {
  const companyId = session.companyId;

  // 1) فرق يقودها المستخدم (أي دوره)
  const led = await db.workerGroup.findMany({
    where: { companyId, leaderUserId: session.sub, status: "active" },
    select: { id: true, name: true, kind: true, status: true, siteId: true },
  });
  const ledIds = new Set(led.map((g) => g.id));

  // 2) نطاق الكوأدمن (مواقع scopeJson) — فريق بلا موقع لا يُنسب لنطاق مواقع (خصوصية)
  if (session.role === "co_admin") {
    const siteScope = await coAdminSiteScope(session);
    if (siteScope) {
      const inScope = await db.workerGroup.findMany({
        where: { companyId, status: "active", siteId: { in: siteScope } },
        select: { id: true, name: true, kind: true, status: true, siteId: true },
      });
      const map = new Map<string, { id: string; name: string; kind: string; status: string; siteId: string | null }>();
      for (const g of [...inScope, ...led]) map.set(g.id, g);
      return { groups: Array.from(map.values()), scope: "sites" };
    }
    const all = await db.workerGroup.findMany({
      where: { companyId, status: "active" },
      select: { id: true, name: true, kind: true, status: true, siteId: true },
    });
    const map = new Map<string, { id: string; name: string; kind: string; status: string; siteId: string | null }>();
    for (const g of [...all, ...led]) map.set(g.id, g);
    return { groups: Array.from(map.values()), scope: "sites" };
  }

  // 3) الأدمن/السوبر: كل فرق الشركة + ما يقودونه
  const all = await db.workerGroup.findMany({
    where: { companyId, status: "active" },
    select: { id: true, name: true, kind: true, status: true, siteId: true },
  });
  const map = new Map<string, { id: string; name: string; kind: string; status: string; siteId: string | null }>();
  for (const g of [...all, ...led]) map.set(g.id, g);
  return {
    groups: Array.from(map.values()),
    scope: ledIds.size > 0 && session.role === "employee" ? "led" : "company",
  };
}

/** لقطة حضور كاملة: لكل فريق أعضاؤه وآخر نبضة لكل عضو وحالته */
export async function presenceSnapshot(
  companyId: string,
  groups: { id: string }[],
): Promise<GroupPresence[]> {
  if (groups.length === 0) return [];
  const ids = groups.map((g) => g.id);

  const rows = await db.workerGroup.findMany({
    where: { id: { in: ids }, status: "active" },
    include: {
      leader: { select: { id: true, fullName: true } },
      site: { select: { id: true, name: true, latitude: true, longitude: true } },
      members: {
        where: { status: "active" },
        include: {
          user: {
            select: {
              id: true,
              fullName: true,
              employeeProfiles: {
                where: { companyId, status: "active" },
                select: { jobTitleKey: true },
                take: 1,
              },
            },
          },
        },
      },
    },
  });

  // آخر نبضة لكل عضو ظهر في أي فريق من الفرق المطلوبة
  const memberUserIds = Array.from(new Set(rows.flatMap((g) => g.members.map((m) => m.userId))));
  const latestPings = new Map<string, { lat: number; lng: number; reportedAt: Date; accuracyM: number | null }>();
  if (memberUserIds.length > 0) {
    // استعلام واحد ثم أخذ الأول لكل مستخدم (مرتبة تنازليًا)
    const pings = await db.memberLocationPing.findMany({
      where: { userId: { in: memberUserIds } },
      orderBy: { reportedAt: "desc" },
      take: memberUserIds.length * 3, // هامش لأخذ الأولى لكل مستخدم
    });
    for (const p of pings) {
      if (!latestPings.has(p.userId)) {
        latestPings.set(p.userId, { lat: p.lat, lng: p.lng, reportedAt: p.reportedAt, accuracyM: p.accuracyM });
      }
    }
  }

  const now = new Date();
  const out: GroupPresence[] = [];
  for (const g of rows) {
    const zone = resolveGroupZone(g, g.site ? { latitude: g.site.latitude, longitude: g.site.longitude } : null);
    const members: MemberPresence[] = g.members.map((m) => {
      const latest = latestPings.get(m.userId) ?? null;
      const { state, distanceM } = stateFromPings(latest, zone, now);
      // مسمى العضو: مسمى العضوية إن حُدد، وإلا مهنته من ملفه (EmployeeProfile)
      const profileTitle = m.user.employeeProfiles[0]?.jobTitleKey ?? null;
      return {
        userId: m.userId,
        fullName: m.user.fullName,
        jobTitleKey: m.jobTitleKey ?? profileTitle,
        jobTitle: null,
        state,
        distanceM,
        lastPingAt: latest ? latest.reportedAt.toISOString() : null,
        lastLat: latest ? latest.lat : null,
        lastLng: latest ? latest.lng : null,
        accuracyM: latest ? latest.accuracyM : null,
      };
    });
    out.push({
      id: g.id,
      name: g.name,
      kind: g.kind,
      status: g.status,
      leaderUserId: g.leaderUserId,
      leaderName: g.leader?.fullName ?? null,
      siteId: g.siteId,
      siteName: g.site?.name ?? null,
      zone,
      members,
      counts: {
        inside: members.filter((x) => x.state === "inside").length,
        outside: members.filter((x) => x.state === "outside").length,
        stale: members.filter((x) => x.state === "stale").length,
        no_ping: members.filter((x) => x.state === "no_ping").length,
        total: members.length,
      },
    });
  }
  return out;
}
