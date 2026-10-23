// FWMS — الرسائل الصوتية المباشرة (المرحلة 9 — v0.10.0)
// ---------------------------------------------------------------------------
// قاعدة المالك 2026-10-18: تواصل مباشر بالرسائل الصوتية بين العامل والحرفي
// ومسؤول الفريق عبر المنصة؛ لا يمكن للعامل الاطلاع أو الاستماع أو المراسلة
// الصوتية مع الفرق الأخرى (ربط الاتصال بين الفرق منفصل)، والسوبر أدمن والأدمن
// والكوأدمن يمكنهم الاستماع والمراسلة الصوتية مع جميع الفرق والمستخدمين.
//
// الوصول (يُطبَّق في الخادم حصرًا):
//  - voice.use: للجميع — محادثات داخل فريقه فقط (فريق مشترك بين الطرفين)
//  - voice.admin: سوبر/أدمن/كوأدمن — عبر كل الفرق (وضع إشرافي ?group=)
// حدود الإرسال: ≤ 2.5MB، ≤ 120ث، 30 رسالة/ساعة/مستخدم (rate-limit داخل الذاكرة).

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { AccessError, roleHas } from "@/lib/rbac";
import { hasPermission } from "@/lib/delegations";
import { rateLimit } from "@/lib/rate-limit";
import { writeAudit } from "@/lib/audit";
import { localizedName } from "@/lib/localized-name";
import { getUiLocale } from "@/i18n/ui-locale";
// (بلاغ المالك 2026-10-24): منطق الوصول المشترك بين الصوتيات والمرئيات —
// نفس الدوال كانت محلية هنا؛ استُخرجت دون أي تغيير سلوكي (اختبارات المرحلة 9 كما هي)
import { messagingAccess, canConverseWith, contextGroupId, canOpenThread, existingThreadPartners, hasExistingThread, isSupervisor, latestThreadGroupId } from "@/lib/direct-messaging";

export const VOICE_MAX_BYTES = 2_500_000;
export const VOICE_MAX_DURATION_SEC = 120;

const listMeta = (m: {
  id: string;
  senderId: string;
  recipientId: string;
  durationSec: number;
  sizeBytes: number;
  listenedAt: Date | null;
  createdAt: Date;
}) => ({
  id: m.id,
  senderId: m.senderId,
  recipientId: m.recipientId,
  durationSec: m.durationSec,
  sizeBytes: m.sizeBytes,
  listenedAt: m.listenedAt ? m.listenedAt.toISOString() : null,
  createdAt: m.createdAt.toISOString(),
});

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) throw new AccessError(401, "unauthenticated");

    const canUse = roleHas(session.role, "voice.use") || (await hasPermission(session as never, "voice.use"));
    if (!canUse) throw new AccessError(403, "forbidden");
    const access = await messagingAccess(session);
    const locale = await getUiLocale();
    const url = new URL(req.url);

    // 1) قائمة المحادثين: أعضاء فرقي (بمساهماتهم) أو كل مستخدمي الشركة للإشراف
    if (url.searchParams.get("contacts") === "1") {
      let rows: { userId: string; fullName: string; role: string; jobTitleKey: string | null }[] = [];
      if (access.admin) {
        const memberships = await db.userMembership.findMany({
          where: { companyId: session.companyId, revokedAt: null, user: { isActive: true } },
          include: {
            user: {
              select: {
                id: true,
                fullName: true, names: true,
                employeeProfiles: {
                  where: { companyId: session.companyId, status: "active" },
                  select: { jobTitleKey: true },
                  take: 1,
                },
              },
            },
          },
        });
        rows = memberships
          .filter((m) => m.userId !== session.sub)
          .map((m) => ({
            userId: m.user.id,
            fullName: localizedName(m.user, locale, "fullName"),
            role: m.role,
            jobTitleKey: m.user.employeeProfiles[0]?.jobTitleKey ?? null,
          }));
      } else {
        const members = await db.workerGroupMember.findMany({
          where: { groupId: { in: access.groupIds }, status: "active" },
          include: {
            user: {
              select: {
                id: true,
                fullName: true, names: true,
                employeeProfiles: {
                  where: { companyId: session.companyId, status: "active" },
                  select: { jobTitleKey: true },
                  take: 1,
                },
              },
            },
          },
        });
        const leaders = await db.workerGroup.findMany({
          where: { id: { in: access.groupIds }, status: "active", leader: { isNot: null } },
          include: {
            leader: {
              select: {
                id: true,
                fullName: true, names: true,
                employeeProfiles: {
                  where: { companyId: session.companyId, status: "active" },
                  select: { jobTitleKey: true },
                  take: 1,
                },
              },
            },
          },
        });
        const map = new Map<string, { userId: string; fullName: string; jobTitleKey: string | null }>();
        for (const m of members) {
          if (m.userId !== session.sub) {
            map.set(m.user.id, { userId: m.user.id, fullName: localizedName(m.user, locale, "fullName"), jobTitleKey: m.user.employeeProfiles[0]?.jobTitleKey ?? null });
          }
        }
        for (const g of leaders) {
          if (g.leader && g.leader.id !== session.sub) {
            map.set(g.leader.id, { userId: g.leader.id, fullName: localizedName(g.leader, locale, "fullName"), jobTitleKey: g.leader.employeeProfiles[0]?.jobTitleKey ?? null });
          }
        }
        // (بلاغ المالك 2026-10-24): مستخدمو الخيوط القائمة (مثل الإدارة التي
        // خاطبت العامل) — ليردّ عليها ويقرأها؛ بلا خيط ولا فريق مشترك يظل العزل
        const partners = await existingThreadPartners(session.companyId, session.sub, locale);
        for (const p of partners) {
          if (p.userId !== session.sub) map.set(p.userId, p);
        }
        rows = Array.from(map.values()).map((r) => ({ ...r, role: "member" }));
      }
      rows.sort((a, b) => a.fullName.localeCompare(b.fullName, "ar"));
      return NextResponse.json({ mode: access.admin ? "admin" : "team", contacts: rows });
    }

    // 2) وضع الإشراف: كل رسائل فريق بعينه
    const groupId = url.searchParams.get("group");
    if (groupId) {
      if (!access.admin) throw new AccessError(403, "forbidden");
      const group = await db.workerGroup.findFirst({
        where: { id: groupId, companyId: session.companyId },
        select: { id: true, name: true },
      });
      if (!group) return NextResponse.json({ error: "not_found" }, { status: 404 });
      const messages = await db.voiceMessage.findMany({
        where: { groupId },
        orderBy: { createdAt: "asc" },
        take: 300,
      });
      return NextResponse.json({ group: { id: group.id, name: group.name }, messages: messages.map(listMeta) });
    }

    // 3) محادثتي مع شخص بعينه
    const withParam = url.searchParams.get("with");
    if (!withParam) {
      return NextResponse.json({ error: "invalid_input" }, { status: 400 });
    }
    // الخيط القائم يفتح القراءة والرد (فجوة العزل المقيسة) — وإلا فحكم canConverse
    if (!(await canOpenThread(access, session, withParam))) {
      throw new AccessError(403, "forbidden");
    }
    const messages = await db.voiceMessage.findMany({
      where: {
        OR: [
          { senderId: session.sub, recipientId: withParam },
          { senderId: withParam, recipientId: session.sub },
        ],
      },
      orderBy: { createdAt: "asc" },
      take: 200,
    });
    return NextResponse.json({ messages: messages.map(listMeta) });
  } catch (error) {
    if (error instanceof AccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[voice-messages]", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

const sendMetaSchema = z.object({
  to: z.string().min(1).max(64),
  durationSec: z.coerce.number().int().min(0).max(VOICE_MAX_DURATION_SEC).default(0),
});

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) throw new AccessError(401, "unauthenticated");
    const canUse = roleHas(session.role, "voice.use") || (await hasPermission(session as never, "voice.use"));
    if (!canUse) throw new AccessError(403, "forbidden");

    const rl = rateLimit(`voice:${session.sub}`, 30, 60 * 60 * 1000);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "rate_limited", retryAfterMs: rl.retryAfterMs },
        { status: 429, headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) } },
      );
    }

    const form = await req.formData().catch(() => null);
    if (!form) return NextResponse.json({ error: "invalid_input" }, { status: 400 });
    const parsed = sendMetaSchema.safeParse({
      to: form.get("to"),
      durationSec: form.get("durationSec") ?? 0,
    });
    const file = form.get("audio");
    if (!parsed.success || !(file instanceof File)) {
      return NextResponse.json({ error: "invalid_input" }, { status: 400 });
    }
    if (file.size === 0 || file.size > VOICE_MAX_BYTES) {
      return NextResponse.json({ error: "audio_too_large" }, { status: 413 });
    }
    // webm حاوية تسجيل صوتي معروفة: بعض البيئات (Bun وبعض Android WebView) ترسلها
    // بوسم video/webm رغم أنها تسجيل MediaRecorder صوتي خالص — نقبلها ونطبّع الوسم
    // إلى audio/webm عند التخزين (درس اختبار المرحلة 9 على 2026-10-18).
    const rawMime = file.type || "audio/webm";
    const isVoiceMime = rawMime.startsWith("audio/") || rawMime === "video/webm";
    if (!isVoiceMime) {
      return NextResponse.json({ error: "not_audio" }, { status: 415 });
    }
    const mime = rawMime === "video/webm" ? "audio/webm" : rawMime;

    const access = await messagingAccess(session);
    const conversable = await canConverseWith(access, session, parsed.data.to);
    // استثناء الخيط القائم: للطرف المخوّل فقط (إشراف خاطب العامل) — خيط
    // عضوين عاديين يظل مقيّدًا بالعضوية: إزالة العضو تقطعه (اختبار المرحلة 9)
    const otherIsSupervisor = conversable ? false : await isSupervisor(session.companyId, parsed.data.to);
    const threadExists = otherIsSupervisor ? await hasExistingThread(session.sub, parsed.data.to) : false;
    if (!conversable && !threadExists) {
      throw new AccessError(403, "forbidden");
    }

    // فريق السياق: حسابه للخيط الجديد، وميراثه من الخيط القائم عند الرد —
    // الرد على من خاطبك (إشراف مثلًا) لا يُسقط بـ409 ولا يفتح بابًا عابرًا للفرق
    const groupId = conversable
      ? await contextGroupId(access, session, parsed.data.to)
      : await latestThreadGroupId(session.sub, parsed.data.to);
    if (!groupId && !access.admin && !threadExists) {
      // عضو بلا فريق مشترك مع المخاطَب: العزل يمنع الإرسال (الإشرافي يجتاز هذا الحد)
      return NextResponse.json({ error: "no_shared_team" }, { status: 409 });
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    const created = await db.voiceMessage.create({
      data: {
        companyId: session.companyId,
        groupId,
        senderId: session.sub,
        recipientId: parsed.data.to,
        durationSec: parsed.data.durationSec,
        mime,
        sizeBytes: bytes.byteLength,
        audio: bytes,
      },
      select: { id: true, createdAt: true },
    });

    await writeAudit({
      companyId: session.companyId,
      userId: session.sub,
      action: "voice_message.send",
      entity: "voice_message",
      entityId: created.id,
      after: { to: parsed.data.to, durationSec: parsed.data.durationSec, sizeBytes: bytes.byteLength, groupId },
    });

    return NextResponse.json({
      ok: true,
      message: { id: created.id, createdAt: created.createdAt.toISOString() },
    });
  } catch (error) {
    if (error instanceof AccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[voice-messages POST]", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
