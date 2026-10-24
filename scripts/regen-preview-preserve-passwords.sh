#!/usr/bin/env bash
# HRMP — إعادة توليد لقطة قاعدة معاينة Vercel (infra/vercel/preview.db) مع
# الحفاظ على بصمات كلمات المرور الحالية (كلمة المالك المعروفة تبقى تعمل كما هي).
#
# السبب (بلاغ المالك 2026-10-22 «تحرير و تحميل الوثائق لا يعمل»):
# اللقطة كانت متأخرة عن المخطط (بلا هجرة report_document_note) ⇒ كل توليد وثيقة
# على نشر Vercel يفشل P2022 «column GeneratedDocument.note does not exist».
#
# يستخدم: node_modules/.bin/prisma + bun (بذور TypeScript) — كما في regen-preview-db.sh
set -euo pipefail
cd "$(dirname "$0")/.."   # جذر المستودع (السكربت داخل <repo>/scripts/)

SNAPSHOT="infra/vercel/preview.db"
BACKUP="/tmp/hrmp-preview-db-backup-$(date +%Y%m%dT%H%M%SZ).db"
TMP_DB="$(mktemp -u /tmp/hrmp-preview-regen-XXXXXX).db"

echo "→ نسخة احتياطية من اللقطة الحالية إلى $BACKUP (لأخذ بصمات الكلمات)..."
cp "$SNAPSHOT" "$BACKUP"

echo "→ تطبيق كل الهجرات على قاعدة مؤقتة..."
node_modules/.bin/prisma generate >/dev/null
DATABASE_URL="file:$TMP_DB" node_modules/.bin/prisma migrate deploy

echo "→ تشغيل بذور العرض الكاملة (بكلمة البذور الافتراضية مؤقتًا)..."
SEED_DEMO_PASSWORD='Fwms#2026' DATABASE_URL="file:$TMP_DB" bun prisma/seeds/seed.ts

echo "→ استعادة بصمات كلمات المرور الأصلية من اللقطة السابقة (كلمة المالك محفوظة)..."
node - "$BACKUP" "$TMP_DB" <<'EOF'
const { PrismaClient } = require('@prisma/client');
const oldDb = new PrismaClient({ datasources: { db: { url: `file:${process.argv[2]}` } } });
const newDb = new PrismaClient({ datasources: { db: { url: `file:${process.argv[3]}` } } });
(async () => {
  const oldUsers = await oldDb.user.findMany({ select: { email: true, passwordHash: true, isActive: true } });
  let restored = 0;
  for (const u of oldUsers) {
    const r = await newDb.user.updateMany({ where: { email: u.email }, data: { passwordHash: u.passwordHash, isActive: u.isActive } });
    restored += r.count;
  }
  console.log(`  استعادة ${restored} بصمة كلمة مرور (من ${oldUsers.length} مستخدمًا قديمًا)`);
  await oldDb.$disconnect(); await newDb.$disconnect();
})().catch(e => { console.error(e); process.exit(1); });
EOF

echo "→ فحص اكتمال المخطط مقابل الهجرات (يجب أن يكون الفرق صفرًا)..."
DIFF=$(node_modules/.bin/prisma migrate diff \
  --from-url "file:$TMP_DB" \
  --to-migrations prisma/migrations \
  --shadow-database-url "file:$TMP_DB-shadow" 2>/dev/null | grep -c "ALTER\|CREATE\|DROP" || true)
node_modules/.bin/prisma migrate diff --from-url "file:$TMP_DB" --to-migrations prisma/migrations --shadow-database-url "file:$TMP_DB-shadow" > /tmp/hrmp-snapshot-diff.sql 2>/dev/null || true
if [ -s /tmp/hrmp-snapshot-diff.sql ]; then
  echo "✗ اللقطة الجديدة ما تزال تخالف المخطط:"; head -20 /tmp/hrmp-snapshot-diff.sql; exit 1
fi
echo "  ✓ المخطط مطابق للهجرات تمامًا"

# لا تُشحن بقايا journal/wal
if [ -e "$TMP_DB-wal" ] && [ -s "$TMP_DB-wal" ]; then
  echo "✗ ملف -wal غير فارغ — أعد التشغيل" >&2; exit 1
fi
rm -f "$TMP_DB-journal" "$TMP_DB-shm"

echo "→ استبدال اللقطة..."
cp "$TMP_DB" "$SNAPSHOT"
rm -f "$TMP_DB" "$TMP_DB-shadow"*
echo "✓ اللقطة الجديدة في $SNAPSHOT ($(stat -c%s "$SNAPSHOT") بايت)"
echo "  (النسخة الاحتياطية للبصمات في $BACKUP — تُحذف يدويًا عند الرضا)"
