// HRMP — تسجيل الانصراف (SPEC §4.2 — المرحلة 4): نفس قواعد الدخول + زوج دخول مفتوح مطلوب
import { NextRequest } from "next/server";
import { recordAttendance } from "@/lib/attendance-service";

export async function POST(req: NextRequest) {
  return recordAttendance(req, "check_out");
}
