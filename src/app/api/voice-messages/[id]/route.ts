// HRMP — رسالة صوتية مفردة: تعليم «مستمع إليه» (المستقبِل فقط — استماع المشرف لا يعلّمها)
// (بلاغ المالك 2026-10-24): الصوتيات مؤقتة — الاستهلاك من المتلقي أو المعني
// بالأمر (إشراف voice.admin) يمسح محتوى الصوت فورًا (بقاء السجل الوصفي للتدقيق)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { AccessError, roleHas } from "@/lib/rbac";
import { hasPermission } from "@/lib/delegations";
import { purgeVoiceMessage } from "@/lib/voice-ephemeral";

export async function PATCH(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSession();
    if (!session) throw new AccessError(401, "unauthenticated");

    const { id } = await params;
    const message = await db.voiceMessage.findFirst({
      where: { id, companyId: session.companyId },
      select: { id: true, recipientId: true, listenedAt: true, purgedAt: true },
    });
    if (!message) return NextResponse.json({ error: "not_found" }, { status: 404 });

    const body = await _req.json().catch(() => ({})) as { listened?: boolean; consumed?: boolean };

    // 1) الاستماع (المستقبِل فقط): أول تشغيل يثبّت الوقت — والاستهلاك يمسح الصوت
    if (body.listened === true) {
      if (message.recipientId !== session.sub) {
        throw new AccessError(403, "forbidden");
      }
      if (!message.listenedAt) {
        await db.voiceMessage.update({
          where: { id: message.id },
          data: { listenedAt: new Date() },
        });
      }
      // المتلقي استهلكها ⇒ المحتوى يُمسح فورًا (إن لم يُمسح سابقًا)
      await purgeVoiceMessage(message.id, session.sub);
      return NextResponse.json({ ok: true, already: !!message.listenedAt, purged: true });
    }

    // 2) استهلاك المعني بالأمر (إشراف voice.admin): مسح المحتوى دون تعليم listenedAt
    if (body.consumed === true) {
      const admin = roleHas(session.role, "voice.admin") || (await hasPermission(session as never, "voice.admin"));
      const isParty = message.recipientId === session.sub || (await db.voiceMessage.findFirst({
        where: { id: message.id, companyId: session.companyId, senderId: session.sub },
        select: { id: true },
      }));
      if (!admin && !isParty) {
        throw new AccessError(403, "forbidden");
      }
      const purged = await purgeVoiceMessage(message.id, session.sub);
      return NextResponse.json({ ok: true, purged });
    }

    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  } catch (error) {
    if (error instanceof AccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[voice-messages/:id]", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
