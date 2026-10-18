#!/usr/bin/env bash
# FWMS — إعادة بيئة الاختبار نظيفة (سابقة المراحل — درس 6ج: الاختبارات ذات الحالة على قاعدة نظيفة)
# يحل المسار الفعلي لقاعدة البيانات (متغير الصدفة يتفوق على .env — درس KNOWLEDGE_BASE §9)
# ⚠️ منفذ آمن 3100 حصرًا (ترقيع أمني 2026-10-18): المنفذ 3000 = منفذ الإنتاج على الهاتف —
# تشغيل dev عليه يعرّض بيانات اختبار عبر نفق الإنتاج أو يصارع الخادم الإنتاجي على المنفذ.
# بيئة التطوير السحابية: إن فشل الإقلاع بـ bun (خارجيات Turbopack) مرّر RUNTIME=node.
set -euo pipefail
cd "$(dirname "$0")/.."

PORT="${TEST_PORT:-3100}"
RUNTIME="${TEST_RUNTIME:-bun --bun}"  # node = بيئة سحابية (درس KNOWLEDGE_BASE §9 — 2026-10-18)

DB_PATH="${DATABASE_URL:-file:./db/custom.db}"
DB_PATH="${DB_PATH#file:}"
if [ ! -f "$DB_PATH" ] || [ -z "$DB_PATH" ]; then
  DB_PATH="$(pwd)/db/custom.db"
fi
echo "→ القاعدة الفعلية: $DB_PATH"

rm -f "$DB_PATH"
bunx prisma db push --skip-generate > /dev/null 2>&1
echo "✓ مخطط مطبَّق"
bun prisma/seeds/seed.ts > /tmp/fwms-seed.log 2>&1
echo "✓ بذور كاملة"

pkill -f "next dev" 2>/dev/null || true
sleep 2
# درس 2026-10-18 (جلسة 0.9.2): التركيب القديم `setsid -f $RUNTIME next dev` كان يكرر
# كلمة «next» مع قيم node («Invalid project directory …/next») — التركيب صريح لكل وسيلة:
case "$RUNTIME" in
  node*) setsid -f node node_modules/next/dist/bin/next dev -p "$PORT" > dev.log 2>&1 < /dev/null ;;
  *) setsid -f $RUNTIME next dev -p "$PORT" > dev.log 2>&1 < /dev/null ;;
esac

for i in 1 2 3; do
  sleep 13
  R=$(curl -s -m 10 "http://localhost:$PORT/api/health" 2>/dev/null || true)
  if echo "$R" | rg -q '"status":"ok"'; then
    echo "✓ الخادم جاهز على $PORT: $R"
    exit 0
  fi
  echo "  محاولة $i — إعادة تشغيل (درس بداية Prisma الباردة)"
  pkill -f "next dev" 2>/dev/null || true
  sleep 2
  case "$RUNTIME" in
    node*) setsid -f node node_modules/next/dist/bin/next dev -p "$PORT" > dev.log 2>&1 < /dev/null ;;
    *) setsid -f $RUNTIME next dev -p "$PORT" > dev.log 2>&1 < /dev/null ;;
  esac
done
echo "✗ الخادم لم يجهز"
exit 1
