// FWMS — فهرس API (فحص أمني 2026-10-19)
// كان يردّ {"message":"Hello, world!"} — بقايا من قالب Next الأول (تسريب غير ضار
// لكنه مربك: يوحي بمسار حيّ). الآن: تعريف مختصر بلا أي مسار حسّاس.
import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json(
    {
      service: "fwms",
      api: true,
      health: "/api/health",
      docs: "/guide",
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
