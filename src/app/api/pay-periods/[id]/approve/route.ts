// HRMP — اعتماد نهائي (SPEC §4.3 و§8): يمنع الاعتماد عند اختراق SMIG (§11.2) أو قواعد غير موثقة،
// ثم يجمد snapshot ويكتب قيود الدفتر append-only ويقفل الكشوف (لا تُعدَّل إلا بقيد تصحيح جديد)
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { requirePermission, AccessError } from "@/lib/rbac";
import { approvePeriod } from "@/lib/payroll/service";
import { entityIdSchema } from "@/lib/organization";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession();
    requirePermission(session, "payroll.approve");
    const { id } = await params;
    if (!entityIdSchema.safeParse(id).success) {
      return NextResponse.json({ error: "invalid_input" }, { status: 400 });
    }
    return NextResponse.json(await approvePeriod(session!, id));
  } catch (error) {
    if (error instanceof AccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const status = (error as { status?: number }).status;
    if (typeof status === "number") {
      const code = (error as Error).message;
      const extra = (error as { keys?: unknown }).keys
        ? { keys: (error as { keys: unknown }).keys }
        : (error as { workers?: unknown }).workers
          ? { workers: (error as { workers: unknown }).workers }
          : undefined;
      return NextResponse.json({ error: code, ...(extra ?? {}) }, { status });
    }
    console.error("[pay-periods/[id]/approve]", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
