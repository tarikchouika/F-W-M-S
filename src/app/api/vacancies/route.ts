// HRMP — وظائف الشركة الشاغرة: قائمة وإنشاء (recruitment.manage — عزل companyId من الجلسة)
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth/session";
import { requirePermission, AccessError } from "@/lib/rbac";
import { getUiLocale } from "@/i18n/ui-locale";
import { createVacancy, listCompanyVacancies } from "@/lib/recruitment/service";

export async function GET() {
  try {
    const session = await getSession();
    requirePermission(session, "recruitment.manage");
    const locale = await getUiLocale();
    const vacancies = await listCompanyVacancies(session!.companyId, locale);
    return NextResponse.json({ count: vacancies.length, vacancies });
  } catch (error) {
    if (error instanceof AccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[vacancies]", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

const createSchema = z.object({
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
  closesAt: z.string().datetime().optional().nullable(), // ISO
});

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    requirePermission(session, "recruitment.manage");

    const body = createSchema.safeParse(await req.json().catch(() => null));
    if (!body.success) {
      return NextResponse.json({ error: "invalid_input" }, { status: 400 });
    }
    const closesAt = body.data.closesAt ? new Date(body.data.closesAt) : null;
    const result = await createVacancy(session!, { ...body.data, closesAt });
    if (!result.ok) {
      const status = result.error === "project_not_found" ? 400 : 400;
      return NextResponse.json({ error: result.error }, { status });
    }
    return NextResponse.json({ ok: true, id: result.data.id }, { status: 201 });
  } catch (error) {
    if (error instanceof AccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[vacancies]", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
