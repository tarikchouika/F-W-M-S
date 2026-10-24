// HRMP — توليد تقرير (SPEC §4.4.1): التوليد في الخادم + تسجيل كل تصدير + الثبات
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { AccessError } from "@/lib/rbac";
import { generateReport, requireSession, ReportDataError } from "@/lib/reports/generate";
import { isReportFormat, isReportKind } from "@/lib/reports/types";
import { isLocale } from "@/i18n/config";
import { rateLimit } from "@/lib/rate-limit";

// تحديد معدل التوليد (فحص أمني 2026-10-19): توليد المستند يكلّف 11-17 ثانية من
// المعالجة (react-pdf + خطوط + sharp) على خادم الهاتف. بلا حدّ، 4 طلبات متزامنة
// كافية لإسقاط الخدمة: القياس أعاد /api/health من 141 req/s إلى 1.7 req/s
// (p95 = 26s). الحدّ مُوزَّع على المستخدم لا على العملية الواحدة.
const REPORT_RATE_LIMIT = 10;
const REPORT_RATE_WINDOW_MS = 60_000;

const generateSchema = z.object({
  kind: z.string().refine(isReportKind, "bad_kind"),
  targetId: z.string().min(1).max(64),
  format: z.string().refine(isReportFormat, "bad_format"),
  language: z.string().refine(isLocale, "bad_language"),
  includeEmployerShare: z.boolean().optional(),
  year: z.number().int().min(2020).max(2100).optional(),
  month: z.number().int().min(1).max(12).optional(),
  // ملاحظة إدارية تُطبع في المستند (تُخزَّن مع الخيارات ⇒ تُبطل البصمة عند تغيّرها)
  note: z.string().max(2000).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    const rl = rateLimit(`reports:${session.sub}`, REPORT_RATE_LIMIT, REPORT_RATE_WINDOW_MS);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "rate_limited", retryAfterMs: rl.retryAfterMs },
        { status: 429, headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) } },
      );
    }
    const body = await req.json().catch(() => null);
    const parsed = generateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "invalid_body" }, { status: 400 });
    }
    const origin = req.nextUrl.origin;
    const result = await generateReport(session, parsed.data, origin);
    return NextResponse.json(
      { ...result, downloadUrl: `/api/reports/${result.id}/download` },
      { status: result.reused ? 200 : 201 }
    );
  } catch (error) {
    if (error instanceof AccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof ReportDataError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const status = (error as { status?: number }).status;
    if (typeof status === "number") {
      return NextResponse.json({ error: (error as Error).message }, { status });
    }
    console.error("[reports/generate:POST]", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
