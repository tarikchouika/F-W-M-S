// HRMP — تنزيل مستند مُولَّد (SPEC §4.4.1): يُخدَم من النسخة الثابتة المخزنة — لا إعادة توليد
import { NextRequest, NextResponse } from "next/server";
import { AccessError } from "@/lib/rbac";
import { writeAudit } from "@/lib/audit";
import { getDocumentForDownload, requireSession, ReportDataError } from "@/lib/reports/generate";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession();
    const { id } = await params;
    const doc = await getDocumentForDownload(session, id);

    // التنزيل يُسجَّل أيضًا — بيانات شخصية ومالية (من، ماذا، متى)
    await writeAudit({
      companyId: session.companyId,
      userId: session.sub,
      action: "report.downloaded",
      entity: "generated_document",
      entityId: doc.row.id,
      after: { kind: doc.row.kind, format: doc.row.format, refNumber: doc.row.refNumber },
    });

    const bytes = new Uint8Array(doc.row.fileBytes);
    return new NextResponse(bytes, {
      status: 200,
      headers: {
        "Content-Type": doc.contentType,
        "Content-Length": String(bytes.byteLength),
        "Content-Disposition": `attachment; filename="${doc.fileName}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if (error instanceof AccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof ReportDataError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[reports/download:GET]", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
