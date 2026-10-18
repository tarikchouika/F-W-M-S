#!/usr/bin/env bash
# FWMS — توليد لقطة قاعدة المعاينة (infra/vercel/preview.db) — docs/DEPLOYMENT.md §2
# ---------------------------------------------------------------------------
# اللقطة = مخطط كامل (migrations) + بذور العرض الكاملة (نفس بيانات الهاتف/التطوير)
# تُرفع مع المستودع وتُضمَّن في تتبع البناء (next.config.ts) وتُنسخ إلى /tmp عند
# إقلاع نشر Vercel (src/lib/db.ts) — لأن نظام ملفات Vercel للقراءة غالبًا ولا
# يوجد ملف قاعدة أصلًا هناك (جذر خلل الدخول 500 في بلاغ المالك 2026-10-18).
#
# متى تُعاد؟ عند أي تغيير في prisma/schema.prisma أو prisma/seeds/** أو migrations.
# (التزامات git الثنائية نادرة لأن اللقطة لا تتغير إلا بتغير البذور/المخطط.)
#
# يتطلب: node_modules سليمًا (bun install) + bun في PATH (البذور TypeScript).
set -euo pipefail
cd "$(dirname "$0")/.."

node_modules/.bin/prisma generate >/dev/null

TMP_DB="$(mktemp -u /tmp/fwms-preview-regen-XXXXXX).db"
trap 'rm -f "$TMP_DB" "$TMP_DB-journal" "$TMP_DB-wal" "$TMP_DB-shm"' EXIT

echo "→ تطبيق migrations على قاعدة مؤقتة..."
DATABASE_URL="file:$TMP_DB" node_modules/.bin/prisma migrate deploy

echo "→ تشغيل بذور العرض الكاملة..."
DATABASE_URL="file:$TMP_DB" bun prisma/seeds/seed.ts

# لا تُشحن بقايا journal/wal: أي اتصال مفتوح يتركها فارغة عادة، وحذفها هنا
# آمن فقط بعد إغلاق الاتصال (bun خرج أعلاه) — تحقق سلامة أخير ثم انسخ.
if [ -e "$TMP_DB-wal" ] && [ -s "$TMP_DB-wal" ]; then
  echo "✗ ملف -wal غير فارغ بعد إغلاق البذور — أعد التشغيل (فشل إغلاق نظيف)" >&2
  exit 1
fi
mkdir -p infra/vercel
cp "$TMP_DB" infra/vercel/preview.db

# تحقق سلامة أخير (بدون sqlite3 CLI — غير متوفر دائمًا): عبر Prisma نفسه
VERIFY=$(DATABASE_URL="file:$(pwd)/infra/vercel/preview.db" bun -e "
const { PrismaClient } = await import('@prisma/client');
const db = new PrismaClient();
const users = await db.user.count();
const companies = await db.company.count();
const rules = await db.payRule.count();
const owner = await db.platformOwner.findFirst();
const hash = (await db.user.findUnique({ where: { email: 'owner@fwms.local' } }))?.passwordHash?.length ?? 0;
console.log(users + ' ' + companies + ' ' + rules + ' ' + (owner ? 'owner' : 'no-owner') + ' ' + hash);
await db.\$disconnect();
")
read -r V_USERS V_COMPANIES V_RULES V_OWNER V_HASH <<<"$VERIFY"
if [ "$V_USERS" -lt 7 ] || [ "$V_OWNER" != "owner" ] || [ "$V_HASH" -lt 59 ]; then
  echo "✗ فشل تحقق اللقطة (users=$V_USERS owner=$V_OWNER hashLen=$V_HASH) — لا ترفع لقطة معطوبة" >&2
  exit 1
fi
SIZE=$(stat -c%s infra/vercel/preview.db)
echo "OK: infra/vercel/preview.db — ${SIZE} bytes · مستخدمون: ${V_USERS} · شركات: ${V_COMPANIES} · قواعد أجور: ${V_RULES} · ${V_OWNER} · bcrypt=${V_HASH}"
