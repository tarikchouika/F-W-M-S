// HRMP — تسجيل الدخول للحضور (SPEC §4.2 — المرحلة 4): تحقق خادمي بالنطاق + سياسة التحقق
import { NextRequest } from "next/server";
import { recordAttendance } from "@/lib/attendance-service";

export async function POST(req: NextRequest) {
  return recordAttendance(req, "check_in");
}
