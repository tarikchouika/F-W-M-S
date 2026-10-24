// HRMP — انتقالات دورة التصريح (SPEC §4.6): مسودة ← مولَّد ← مراجعة ← معتمد ← مُصدَّر ← مُودَع
// نقطة واحدة لكل الانتقالات (أدوار وإطارات مزدوجة في الخدمة) — التدقيق لكل انتقال
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth/session";
import { requirePermission, AccessError } from "@/lib/rbac";
import {
  exportDeclarationFile,
  fileDeclaration,
  generateDeclaration,
  reviewDeclaration,
  submitForReview,
} from "@/lib/declarations/service";

const transitionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("generate") }),
  z.object({ action: z.literal("submit_review") }),
  z.object({ action: z.literal("approve"), note: z.string().max(2000).optional() }),
  z.object({ action: z.literal("reject"), note: z.string().min(1).max(2000) }),
  z.object({ action: z.literal("export") }),
  z.object({
    action: z.literal("file"),
    filedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    filedRef: z.string().max(120).optional(),
    receiptB64: z.string().optional(),
  }),
]);

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = await getSession();
    requirePermission(session, "declarations.review");
    const body = await req.json().catch(() => null);
    const parsed = transitionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "invalid_input", issues: parsed.error.issues.slice(0, 5) }, { status: 400 });
    }
    const input = parsed.data;

    switch (input.action) {
      case "generate": {
        const result = await generateDeclaration(session!, id);
        return NextResponse.json(result);
      }
      case "submit_review": {
        const updated = await submitForReview(session!, id);
        return NextResponse.json(updated);
      }
      case "approve": {
        const updated = await reviewDeclaration(session!, id, "approved", input.note);
        return NextResponse.json(updated);
      }
      case "reject": {
        const updated = await reviewDeclaration(session!, id, "rejected", input.note);
        return NextResponse.json(updated);
      }
      case "export": {
        const result = await exportDeclarationFile(session!, id);
        return NextResponse.json({
          fileId: result.file.id,
          sha256: result.file.sha256,
          specVersion: result.file.specVersion,
          format: result.file.format,
          sizeBytes: result.file.sizeBytes,
          content: result.content,
        });
      }
      case "file": {
        const result = await fileDeclaration(session!, id, {
          filedAt: input.filedAt,
          filedRef: input.filedRef,
          receiptB64: input.receiptB64,
        });
        return NextResponse.json(result);
      }
    }
  } catch (error) {
    if (error instanceof AccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const status = (error as { status?: number }).status;
    if (typeof status === "number") {
      const code = (error as Error).message;
      const extra =
        (error as { issues?: unknown }).issues
          ? { issues: (error as { issues: unknown }).issues }
          : (error as { missing?: unknown }).missing
            ? { missing: (error as { missing: unknown }).missing }
            : undefined;
      return NextResponse.json({ error: code, ...(extra ?? {}) }, { status });
    }
    console.error("[declarations/[id]/transition:POST]", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
