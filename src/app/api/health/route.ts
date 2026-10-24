// HRMP — فحص الصحة (SPEC §7): يُفحص بعد كل نشر (docs/DEPLOYMENT.md §5)
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { APP_VERSION } from "@/lib/version";

export async function GET() {
  const startedAt = Date.now();
  let database: "ok" | "error" = "error";
  try {
    await db.$queryRaw`SELECT 1`;
    database = "ok";
  } catch {
    database = "error";
  }
  const healthy = database === "ok";
  return NextResponse.json(
    {
      status: healthy ? "ok" : "degraded",
      service: "hrmp",
      version: APP_VERSION,
      database,
      timestamp: new Date().toISOString(),
      latencyMs: Date.now() - startedAt,
    },
    { status: healthy ? 200 : 503 }
  );
}
