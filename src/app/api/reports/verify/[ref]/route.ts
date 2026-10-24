// HRMP — التحقق العام من مستند (SPEC §4.4.1: QR يتحقق منه الخادم من صحة الكشف)
// عام بلا مصادقة: طرف ثالث (بنك/إيجار) يمسح QR من القسيمة الورقية ويتحقق
// يعرض الحد الأدنى الآمن: الأصالة والمرجع والجهة المصدرة — بلا أي مبلغ
import { NextRequest, NextResponse } from "next/server";
import { verifyDocumentByRef } from "@/lib/reports/generate";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ ref: string }> }) {
  try {
    const { ref } = await params;
    const h = _req.nextUrl.searchParams.get("h");
    const result = await verifyDocumentByRef(decodeURIComponent(ref), h);
    if (!result.valid) {
      return NextResponse.json({ valid: false, reason: result.reason }, { status: result.reason === "not_found" ? 404 : 200 });
    }
    return NextResponse.json({
      valid: true,
      refNumber: result.refNumber,
      kind: result.kind,
      format: result.format,
      language: result.language,
      version: result.version,
      targetLabel: result.targetLabel,
      companyLegalName: result.companyLegalName,
      generatedAt: result.generatedAt,
      contentHash: result.contentHash,
      hashMatches: result.hashMatches,
    });
  } catch (error) {
    console.error("[reports/verify:GET]", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
