// HRMP — إنشاء نسخة محدَّثة من مستند مُولَّد (SPEC §4.4.1)
// «المستندات المعتمدة لا تتغير بعد توليدها: تُحفظ نسخة ثابتة، وأي تصحيح يولّد
//  نسخة جديدة مرقّمة» ⇒ المسار **لا يعدّل** المستند القديم: يولّد نسخة جديدة
//  برقم أحدث (version+1) ورقم مرجعي جديد، والقديم يبقى للتدقيق.
// مُدخل واحد: الملاحظة الإدارية الجديدة (تُطبع في المستند).
import { NextRequest, NextResponse } from "next/server";
import { AccessError } from "@/lib/rbac";
import { reviseDocument, requireSession, ReportDataError } from "@/lib/reports/generate";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession();
    const { id } = await params;
    let note: string | null = null;
    try {
      const body = (await req.json()) as { note?: unknown };
      note = typeof body.note === "string" ? body.note : null;
    } catch {
      note = null;
    }
    const result = await reviseDocument(session, id, note, req.nextUrl.origin);
    return NextResponse.json({ ...result, downloadUrl: `/api/reports/${result.id}/download` });
  } catch (error) {
    if (error instanceof AccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof ReportDataError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[reports/revise:POST]", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
