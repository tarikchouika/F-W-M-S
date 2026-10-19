-- فحص السعة 2026-10-19 — فهرس نطاق الحضور
-- الاستعلام: WHERE companyId = ? AND occurredAt >= ? AND occurredAt < ?
--              ORDER BY occurredAt DESC, recordedAt DESC LIMIT 500
-- قبل: SEARCH AttendanceEvent USING INDEX AttendanceEvent_companyId_status_occurredAt_idx
--       (companyId=?) + USE TEMP B-TREE FOR ORDER BY  ← فرز كل صفوف الشركة
-- بعد: SEARCH AttendanceEvent USING INDEX AttendanceEvent_companyId_occurredAt_idx
--       (companyId=? AND occurredAt>? AND occurredAt<?)  ← مدى مفهرس مباشرة
-- قياس A/B على 100k صف: 10.3 ⇒ 24.8 req/s (p50 905ms ⇒ 400ms)
CREATE INDEX "AttendanceEvent_companyId_occurredAt_idx" ON "AttendanceEvent"("companyId", "occurredAt");
