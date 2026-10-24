// HRMP — قراءة الملف المُصدَّر (المحاسب — وثيقة قانونية ثابتة + hash للتحقق)
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { requirePermission, AccessError } from "@/lib/rbac";
import { getDeclarationFileContent } from "@/lib/declarations/service";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = await getSession();
    requirePermission(session, "declarations.export");
    const file = await getDeclarationFileContent(session!, id);
    const body = file.content;
    const filename = `hrmp-${file.format}-${file.sha256.slice(0, 12)}.${file.format === "xml" ? "xml" : "txt"}`;
    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": file.format === "xml" ? "application/xml; charset=utf-8" : "text/plain; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "X-Hrmp-Spec-Version": String(file.specVersion),
        "X-Hrmp-Sha256": file.sha256,
      },
    });
  } catch (error) {
    if (error instanceof AccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const status = (error as { status?: number }).status;
    if (typeof status === "number") {
      return NextResponse.json({ error: (error as Error).message }, { status });
    }
    console.error("[declarations/[id]/file:GET]", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
