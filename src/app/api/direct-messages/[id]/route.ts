// FWMS — رسالة مرئية/موقعية مفردة: تعليم «شوهدت» من المستقبِل (مرة واحدة)
// — مقابل listenedAt في الصوتيات؛ استماع/مشاهدة الإشراف لا تعلّمها.
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { AccessError } from "@/lib/rbac";

const bodySchema = z.object({ viewed: z.literal(true) });

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession();
    if (!session) throw new AccessError(401, "unauthenticated");
    const { id } = await params;

    const body = await req.json().catch(() => null);
    if (!bodySchema.safeParse(body).success) {
      return NextResponse.json({ error: "invalid_input" }, { status: 400 });
    }

    const msg = await db.directMessage.findFirst({
      where: { id, companyId: session.companyId },
      select: { id: true, recipientId: true, viewedAt: true },
    });
    if (!msg) return NextResponse.json({ error: "not_found" }, { status: 404 });
    if (msg.recipientId !== session.sub) {
      // المستقبِل وحده يعلّمها — استعراض الإشراف لا يعلّمها (نفس مبدأ الصوتيات)
      throw new AccessError(403, "forbidden");
    }
    if (!msg.viewedAt) {
      await db.directMessage.update({
        where: { id: msg.id },
        data: { viewedAt: new Date() },
      });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof AccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[direct-messages/[id] PATCH]", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
