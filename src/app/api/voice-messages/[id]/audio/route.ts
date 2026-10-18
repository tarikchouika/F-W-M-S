// FWMS — بث محتوى رسالة صوتية: المرسل أو المستقبِل أو وضع الإشراف (voice.admin).
// بلا تخزين مؤقت (private) — المحتوى شخصي ولا يجوز وسيطه.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { AccessError, roleHas } from "@/lib/rbac";
import { hasPermission } from "@/lib/delegations";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSession();
    if (!session) throw new AccessError(401, "unauthenticated");

    const { id } = await params;
    const message = await db.voiceMessage.findFirst({
      where: { id, companyId: session.companyId },
      select: { senderId: true, recipientId: true, mime: true, audio: true },
    });
    if (!message) return NextResponse.json({ error: "not_found" }, { status: 404 });

    const admin = roleHas(session.role, "voice.admin") || (await hasPermission(session as never, "voice.admin"));
    const isParty = message.senderId === session.sub || message.recipientId === session.sub;
    if (!isParty && !admin) {
      throw new AccessError(403, "forbidden");
    }

    const bytes = Buffer.from(message.audio as unknown as Uint8Array);
    return new NextResponse(new Uint8Array(bytes), {
      status: 200,
      headers: {
        "Content-Type": message.mime,
        "Content-Length": String(bytes.byteLength),
        "Cache-Control": "private, no-store",
        "Content-Disposition": "inline",
      },
    });
  } catch (error) {
    if (error instanceof AccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[voice-messages/:id/audio]", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
