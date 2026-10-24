// HRMP — رمز QR الدوّار للموقع (SPEC §4.2): «رمز بصلاحية قصيرة يتجدد من لوحة الموقع أو شاشة عند الباب،
// موقَّع في الخادم، لا رمز ثابت مطبوع» — يُعرض على شاشة الباب للمشرفين؛ TTL 90 ثانية + nonce يمنع إعادة الاستخدام
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { requirePermission, AccessError } from "@/lib/rbac";
import { rateLimit } from "@/lib/rate-limit";
import { issueQrToken, QR_TTL_SECONDS } from "@/lib/verification";
import QRCode from "qrcode";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    requirePermission(session, "attendance.manage"); // شاشة الباب: مشرف/مدير

    // حدّ خفيف كي لا تُستنزف الواجهة المتجددة كل 90 ثانية
    const rl = rateLimit(`qr:${session!.sub}`, 30, 60_000);
    if (!rl.allowed) {
      return NextResponse.json({ error: "rate_limited" }, { status: 429 });
    }

    const { id } = await params;
    const site = await db.site.findFirst({
      where: { id, companyId: session!.companyId, status: "active" },
      select: { id: true, name: true, companyId: true },
    });
    if (!site) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    const { token, expiresAt } = issueQrToken(site);

    // SVG يُولَّد في الخادم (لا اعتماد خارجي — SPEC §4.2: مسار الحضور بلا خدمات خارجية)
    const qrSvg = await QRCode.toString(token, {
      type: "svg",
      margin: 1,
      width: 320,
      errorCorrectionLevel: "M",
    });

    return NextResponse.json({
      site: { id: site.id, name: site.name },
      token,
      expiresAt,
      ttlSeconds: QR_TTL_SECONDS,
      qrSvg,
    });
  } catch (error) {
    if (error instanceof AccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[qr-token]", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
