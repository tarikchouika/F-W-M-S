// FWMS — رسالة صوتية مفردة: تعليم «مستمع إليه» (المستقبِل فقط — استماع المشرف لا يعلّمها)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { AccessError } from "@/lib/rbac";

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
      select: { id: true, recipientId: true, listenedAt: true },
    });
    if (!message) return NextResponse.json({ error: "not_found" }, { status: 404 });

    // فقط المستقبِل يعلّم استماعه — أول تشغيل يثبّت الوقت ولا يُغيَّر بعدها
    if (message.recipientId !== session.sub) {
      throw new AccessError(403, "forbidden");
    }
    if (message.listenedAt) {
      return NextResponse.json({ ok: true, already: true });
    }

    await db.voiceMessage.update({
      where: { id: message.id },
      data: { listenedAt: new Date() },
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof AccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[voice-messages/:id]", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
