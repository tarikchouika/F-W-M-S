// HRMP — تقديم الباحث على وظيفة شاغرة (مسار عام بجلسة الباحث — لا مساس بجلسات الشركات)
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSeekerSession } from "@/lib/recruitment/seeker-auth";
import { applyToVacancy } from "@/lib/recruitment/service";
import { COVER_NOTE_MAX } from "@/lib/recruitment/types";

const schema = z.object({
  vacancyId: z.string().min(10).max(40),
  coverNote: z.string().max(COVER_NOTE_MAX).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const session = await getSeekerSession();
    if (!session) {
      return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    }
    const body = schema.safeParse(await req.json().catch(() => null));
    if (!body.success) {
      return NextResponse.json({ error: "invalid_input" }, { status: 400 });
    }
    const result = await applyToVacancy(session.sub, body.data.vacancyId, body.data.coverNote);
    if (!result.ok) {
      const status =
        result.error === "rate_limited" ? 429
        : result.error === "vacancy_not_found" || result.error === "not_found" ? 404
        : result.error === "vacancy_closed" ? 410
        : result.error === "already_applied" ? 409
        : 403;
      return NextResponse.json({ error: result.error }, { status });
    }
    return NextResponse.json({ ok: true, applicationId: result.data.id }, { status: 201 });
  } catch (error) {
    console.error("[jobs/apply]", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
