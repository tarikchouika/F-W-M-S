// HRMP — تسليم حمولة رسالة مرئية (صورة/فيديو): المرسل أو المستقبِل فقط
// (عزل مباشر — لا روابط عمومية). ذاكرة تخزين للمتصفح لأن الحمولة غير متغيرة.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { AccessError } from "@/lib/rbac";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession();
    if (!session) throw new AccessError(401, "unauthenticated");
    const { id } = await params;

    const msg = await db.directMessage.findFirst({
      where: { id, companyId: session.companyId },
      select: { id: true, senderId: true, recipientId: true, mime: true, media: true, kind: true },
    });
    if (!msg) return NextResponse.json({ error: "not_found" }, { status: 404 });
    if (msg.senderId !== session.sub && msg.recipientId !== session.sub) {
      throw new AccessError(403, "forbidden");
    }
    if (!msg.media) return NextResponse.json({ error: "no_media" }, { status: 404 });
    const body = new Uint8Array(msg.media);
    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": msg.mime || "application/octet-stream",
        "Content-Length": String(body.byteLength),
        "Cache-Control": "private, max-age=86400, immutable",
        "Content-Disposition": `inline; filename="dm-${id}.${msg.kind === "photo" ? "jpg" : "webm"}"`,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if (error instanceof AccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[direct-messages/[id]/media GET]", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
