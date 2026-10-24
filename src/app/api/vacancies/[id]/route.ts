// HRMP — وظيفة واحدة: تعديل (draft) أو تغيير الحالة (نشر/إغلاق) — عزل الشركة نافذ
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth/session";
import { requirePermission, AccessError } from "@/lib/rbac";
import { setVacancyStatus, updateVacancy } from "@/lib/recruitment/service";

const updateSchema = z.object({
  projectId: z.string().min(10).max(40),
  title: z.string().min(3).max(120),
  description: z.string().min(20).max(6000),
  requirements: z.string().max(6000).optional().nullable(),
  employmentType: z.enum(["full_time", "part_time", "temporary", "seasonal", "internship"]),
  salaryMin: z.number().int().min(0).max(100_000_000).optional().nullable(),
  salaryMax: z.number().int().min(0).max(100_000_000).optional().nullable(),
  openings: z.number().int().min(1).max(999),
  contactEmail: z.string().email().max(190).optional().nullable(),
  contactPhone: z.string().min(9).max(20).optional().nullable(),
  closesAt: z.string().datetime().optional().nullable(),
});

const statusSchema = z.object({ status: z.enum(["draft", "published", "closed"]) });

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession();
    requirePermission(session, "recruitment.manage");
    const { id } = await ctx.params;

    const raw = await req.json().catch(() => null);
    // شكلان مقبولان: تعديل كامل (حقول) أو تغيير حالة فقط {status}
    const statusParsed = statusSchema.safeParse(raw);
    if (statusParsed.success && typeof raw === "object" && raw !== null && Object.keys(raw).length === 1) {
      const result = await setVacancyStatus(session!, id, statusParsed.data.status);
      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: 404 });
      }
      return NextResponse.json({ ok: true });
    }

    const body = updateSchema.safeParse(raw);
    if (!body.success) {
      return NextResponse.json({ error: "invalid_input" }, { status: 400 });
    }
    const closesAt = body.data.closesAt ? new Date(body.data.closesAt) : null;
    const result = await updateVacancy(session!, id, { ...body.data, closesAt });
    if (!result.ok) {
      const status = result.error === "vacancy_not_found" ? 404 : 400;
      return NextResponse.json({ error: result.error }, { status });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof AccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[vacancies/:id]", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
