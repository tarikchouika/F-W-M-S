// HRMP — نموذج الوصول الموحّد للمراسلة المباشرة بين المستخدمين (بلاغ المالك
// 2026-10-24): يشاركه مسار الرسائل الصوتية (api/voice-messages) ومسار الرسائل
// المرئية والموقعية (api/direct-messages) — عزل واحد في الخادم:
//  - العضو يخاطب فريقه المشترك فقط (أو قائد فريقه)
//  - الإشراف (voice.admin) يخاطب الجميع ويطّلع على كل الفرق
// الاستخراج من مسار الصوتيات دون أي تغيير سلوكي (اختبارات المرحلة 9 تعمل كما هي).
import { db } from "@/lib/db";
import { roleHas } from "@/lib/rbac";
import { hasPermission } from "@/lib/delegations";
import { localizedName } from "@/lib/localized-name";

export type MessagingSession = { companyId: string; sub: string; role: string };

export type MessagingAccess = { admin: boolean; groupIds: string[] };

/** وضع صلاحيات المراسلة للمتصل: admin (كل الفرق) أو قائمة فرقه السارية */
export async function messagingAccess(session: MessagingSession): Promise<MessagingAccess> {
  const admin = roleHas(session.role, "voice.admin") || (await hasPermission(session as never, "voice.admin"));
  if (admin) return { admin: true, groupIds: [] };
  const rows = await db.workerGroupMember.findMany({
    where: { companyId: session.companyId, userId: session.sub, status: "active" },
    select: { groupId: true },
  });
  const led = await db.workerGroup.findMany({
    where: { companyId: session.companyId, leaderUserId: session.sub, status: "active" },
    select: { id: true },
  });
  return { admin: false, groupIds: Array.from(new Set([...rows.map((r) => r.groupId), ...led.map((l) => l.id)])) };
}

/** هل يجوز للمتصل محادثة userId؟ (مشترك في فريق، أو وضع إشرافي) */
export async function canConverseWith(
  access: MessagingAccess,
  session: { companyId: string; sub: string },
  otherUserId: string,
): Promise<boolean> {
  if (otherUserId === session.sub) return false; // لا مراسلة للنفس
  const other = await db.userMembership.findFirst({
    where: { companyId: session.companyId, userId: otherUserId, revokedAt: null, user: { isActive: true } },
    select: { id: true },
  });
  if (!other) return false;
  if (access.admin) return true;
  if (access.groupIds.length === 0) return false;
  const share = await db.workerGroupMember.count({
    where: { userId: otherUserId, groupId: { in: access.groupIds }, status: "active" },
  });
  if (share > 0) return true;
  // الطرف الآخر قائد أحد فرقي؟ محادثة القائد مع أعضائه جائزة
  const leadsMyGroup = await db.workerGroup.count({
    where: { companyId: session.companyId, leaderUserId: otherUserId, id: { in: access.groupIds }, status: "active" },
  });
  return leadsMyGroup > 0;
}

/** فريق السياق لرسالة بين طرفين — نفس منطق الصوتيات: أول فريق مشترك، وإلا
 *  فريق المخاطَب للإشرافي، وإلا null (رسالة إشرافية مباشرة لمستخدم بلا فريق) */
export async function contextGroupId(
  access: MessagingAccess,
  session: MessagingSession,
  otherUserId: string,
): Promise<string | null> {
  if (access.admin) {
    const myGroups = await db.workerGroupMember.findFirst({
      where: { companyId: session.companyId, userId: session.sub, status: "active" },
      select: { groupId: true },
    });
    const led = await db.workerGroup.findFirst({
      where: { companyId: session.companyId, leaderUserId: session.sub, status: "active" },
      select: { id: true },
    });
    const theirGroups = await db.workerGroupMember.findFirst({
      where: { companyId: session.companyId, userId: otherUserId, status: "active" },
      select: { groupId: true },
    });
    const theyLead = await db.workerGroup.findFirst({
      where: { companyId: session.companyId, leaderUserId: otherUserId, status: "active" },
      select: { id: true },
    });
    return myGroups?.groupId ?? led?.id ?? theirGroups?.groupId ?? theyLead?.id ?? null;
  }
  const shared = await db.workerGroupMember.findFirst({
    where: { userId: otherUserId, groupId: { in: access.groupIds }, status: "active" },
    select: { groupId: true },
  });
  if (shared) return shared.groupId;
  const leadsMyGroup = await db.workerGroup.findFirst({
    where: { companyId: session.companyId, leaderUserId: otherUserId, id: { in: access.groupIds }, status: "active" },
    select: { id: true },
  });
  return leadsMyGroup?.id ?? null;
}

// ── الخيوط القائمة (بلاغ المالك 2026-10-24 — علاج فجوة العزل) ────────────────
// المشكلة المقيسة: جهة مخوّلة (إشراف) ترسل لعامل خارج فرقها؛ العامل يفتح
// «المراسلة» فلا يجد المرسِل بين جهات اتصاله، وقراءة الخيط معه تُرجع 403 —
// الرسالة غير مقروءة أبدًا. القاعدة الآن: **الخيط القائم يفتح قراءته والرد
// عليه إذا كان الطرف الآخر مخوّلًا إشرافيًا** (خيط بدأه بشكل مشروع لا يمكن
// أن يكون تسريبًا بين الفرق). خيط بين عضوين عاديين يظل مقيّدًا بالعضوية:
// إزالة العضو من الفريق تقطع مخاطبته (اختبار المرحلة 9) — لا استثناء له.

/** هل المستخدم مخوّلًا إشرافيًا (voice.admin أو تفويض) في هذه الشركة؟ */
export async function isSupervisor(companyId: string, userId: string): Promise<boolean> {
  const m = await db.userMembership.findFirst({
    where: { companyId, userId, revokedAt: null },
    select: { role: true },
  });
  if (!m) return false;
  if (roleHas(m.role, "voice.admin")) return true;
  try {
    return await hasPermission({ companyId, sub: userId, role: m.role } as never, "voice.admin");
  } catch {
    return false;
  }
}

/** هل توجد رسائل (صوت أو مرئيات/موقع) بين الطرفين في أي اتجاه؟ */
export async function hasExistingThread(me: string, other: string): Promise<boolean> {
  const [v, d] = await Promise.all([
    db.voiceMessage.count({
      where: { OR: [{ senderId: me, recipientId: other }, { senderId: other, recipientId: me }] },
    }),
    db.directMessage.count({
      where: { OR: [{ senderId: me, recipientId: other }, { senderId: other, recipientId: me }] },
    }),
  ]);
  return v + d > 0;
}

/** قراءة خيط/إرسال رد: فريق مشترك، أو إشراف، أو خيط قائم **مع طرف مخوّل** —
 *  خيط عضوين عاديين يظل مقيّدًا بالعضوية (الإزالة تقطعه) */
export async function canOpenThread(
  access: MessagingAccess,
  session: { companyId: string; sub: string },
  otherUserId: string,
): Promise<boolean> {
  if (await canConverseWith(access, session, otherUserId)) return true;
  if (!(await isSupervisor(session.companyId, otherUserId))) return false;
  return hasExistingThread(session.sub, otherUserId);
}

/** سياق (فريق) أحدث رسالة بين الطرفين — يورَّث للرد على خيط قائم بدأه إشراف:
 *  الرد يبقى في سياق الرسالة الأصلية ولا يفتح بابًا عابرًا للفرق جديدة */
export async function latestThreadGroupId(me: string, other: string): Promise<string | null> {
  const pair = { OR: [{ senderId: me, recipientId: other }, { senderId: other, recipientId: me }] };
  const [v, d] = await Promise.all([
    db.voiceMessage.findFirst({ where: pair, orderBy: { createdAt: "desc" }, select: { groupId: true, createdAt: true } }),
    db.directMessage.findFirst({ where: pair, orderBy: { createdAt: "desc" }, select: { groupId: true, createdAt: true } }),
  ]);
  // الأحدث بين الاثنين؛ وإن غاب أحدهما فالآخر
  if (v && d) return v.createdAt >= d.createdAt ? v.groupId : d.groupId;
  return v?.groupId ?? d?.groupId ?? null;
}

/** مستخدمو الخيوط القائمة معي من المخوّلين فقط (إشراف خاطبني) — لإظهارهم
 *  في جهات الاتصال حتى يقدر العامل على ردّ الإدارة التي خاطبته؛ شريك عادي
 *  يظل مقيّدًا بالعضوية (إزالته من الفريق تقطع خيطه — اختبار المرحلة 9) */
export async function existingThreadPartners(
  companyId: string,
  me: string,
  locale: string,
): Promise<{ userId: string; fullName: string; jobTitleKey: string | null }[]> {
  const [vSenders, vRecipients, dSenders, dRecipients] = await Promise.all([
    db.voiceMessage.findMany({ where: { recipientId: me }, select: { senderId: true } }),
    db.voiceMessage.findMany({ where: { senderId: me }, select: { recipientId: true } }),
    db.directMessage.findMany({ where: { recipientId: me }, select: { senderId: true } }),
    db.directMessage.findMany({ where: { senderId: me }, select: { recipientId: true } }),
  ]);
  const ids = new Set<string>();
  for (const m of vSenders) ids.add(m.senderId);
  for (const m of vRecipients) ids.add(m.recipientId);
  for (const m of dSenders) ids.add(m.senderId);
  for (const m of dRecipients) ids.add(m.recipientId);
  if (ids.size === 0) return [];
  // الترشيح بالمخوّلين: رسالة من مشرف/إدارة (أو ردّي عليه) تفتح الخيط،
  // وخيط الزمالة العادي يُقطع بإزالة العضوية — لا يظهر هنا
  const privileged: string[] = [];
  for (const id of ids) {
    if (await isSupervisor(companyId, id)) privileged.push(id);
  }
  if (privileged.length === 0) return [];
  const rows = await db.userMembership.findMany({
    where: { companyId, userId: { in: privileged }, revokedAt: null, user: { isActive: true } },
    include: {
      user: {
        select: {
          id: true, fullName: true, names: true,
          employeeProfiles: { where: { companyId, status: "active" }, select: { jobTitleKey: true }, take: 1 },
        },
      },
    },
  });
  return rows.map((r) => ({
    userId: r.user.id,
    fullName: localizedName(r.user, locale, "fullName"),
    jobTitleKey: r.user.employeeProfiles[0]?.jobTitleKey ?? null,
  }));
}
