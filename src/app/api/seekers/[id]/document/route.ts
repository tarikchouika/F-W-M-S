// HRMP — صورة وثيقة هوية الباحث: تُخدم لمصادقي الهوية حصرًا (seekers.verify) —
// لا رابط عام إطلاقًا، بلا كاش عام، وبمعرفة نوع المحتوى الصحيحة من القاعدة.
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { requirePermission, AccessError } from "@/lib/rbac";
import { getSeekerDocumentForReview } from "@/lib/recruitment/service";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession();
    requirePermission(session, "seekers.verify");
    const { id } = await ctx.params;

    const doc = await getSeekerDocumentForReview(id);
    if (!doc) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    return new NextResponse(new Uint8Array(doc.bytes), {
      status: 200,
      headers: {
        "content-type": doc.mime,
        "content-disposition": `inline; filename="${encodeURIComponent(doc.name)}"`,
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    if (error instanceof AccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[seekers/:id/document]", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
