// HRMP — مراجعة تسجيل الحضور المعلَّق (SPEC §4.2): «تسجيل بمراجعة يراجعه المشرف»
// القرار موثَّق في التدقيق قبل/بعد — السجل نفسه append-only لا يُحذف (SPEC §11.7)
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { requirePermission, AccessError } from "@/lib/rbac";
import { writeAudit } from "@/lib/audit";
import { coAdminSiteScope } from "@/lib/attendance-service";

const reviewSchema = z.object({
  decision: z.enum(["approve", "reject"]),
  notes: z.string().max(500).nullish(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    requirePermission(session, "attendance.manage");

    const { id } = await params;
    if (!z.string().min(1).max(64).safeParse(id).success) {
      return NextResponse.json({ error: "invalid_input" }, { status: 400 });
    }

    const parsed = reviewSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "invalid_input" }, { status: 400 });
    }

    const event = await db.attendanceEvent.findFirst({
      where: { id, companyId: session!.companyId },
      include: { site: { select: { id: true, name: true } } },
    });
    if (!event) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    // نطاق المشرف الميداني
    const scope = await coAdminSiteScope(session!);
    if (scope !== null && !scope.includes(event.siteId)) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    if (event.status !== "pending_review") {
      return NextResponse.json({ error: "not_reviewable" }, { status: 400 });
    }

    const before = {
      status: event.status,
      reason: event.reason,
      reviewNotes: event.reviewNotes,
    };

    const updated = await db.attendanceEvent.update({
      where: { id },
      data: {
        status: parsed.data.decision === "approve" ? "verified" : "rejected",
        reason: parsed.data.decision === "approve" ? event.reason : "review_rejected",
        reviewNotes: parsed.data.notes ?? null,
        reviewedByUserId: session!.sub,
        reviewedAt: new Date(),
      },
    });

    await writeAudit({
      companyId: session!.companyId,
      userId: session!.sub,
      action: "attendance.review",
      entity: "attendance_event",
      entityId: event.id,
      before,
      after: {
        status: updated.status,
        decision: parsed.data.decision,
        reviewNotes: updated.reviewNotes,
      },
    });

    return NextResponse.json({ event: { id: updated.id, status: updated.status } });
  } catch (error) {
    if (error instanceof AccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[attendance-review]", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
