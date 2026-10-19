#!/usr/bin/env bash
# FWMS — نسخ احتياطي آمن لقاعدة SQLite + سياسة دوران (ملكية المساعد الثاني)
# المرجع: docs/DATABASE_GUIDE.md §7
#   - .backup (SQLite Online Backup API) — آمن أثناء الكتابة (لا نسخ ملف أثناء الكتابة)
#   - تحقق فحص سريع بعد كل نسخة (.quick_check = ok)
#   - دوران: 7 يومية + 4 أسبوعية + 6 شهرية
# الاستخدام: infra/termux/backup-db.sh [--no-rotate]
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="$REPO_DIR/.env"
BACKUP_DIR="$REPO_DIR/db/backups"
LOG_FILE="$BACKUP_DIR/backup.log"
KEEP_DAILY=7
KEEP_WEEKLY=4
KEEP_MONTHLY=6

log() { echo "[$(date '+%F %T')] $*" | tee -a "$LOG_FILE"; }

# 1) مسار القاعدة من .env (DATABASE_URL="file:/abs/path.db")
DB_PATH="$(grep -E '^DATABASE_URL=' "$ENV_FILE" | head -1 | sed 's/^DATABASE_URL="file://; s/"$//')"
if [[ -z "$DB_PATH" || ! -f "$DB_PATH" ]]; then
  log "❌ لم أجد القاعدة: DATABASE_URL في $ENV_FILE → $DB_PATH"
  exit 1
fi

mkdir -p "$BACKUP_DIR"
STAMP="$(date +%F-%H%M)"
TAG="daily"
[[ "$(date +%u)" -eq 7 ]] && TAG="weekly"   # الأحد = أسبوعية
[[ "$(date +%d)" == "01" ]] && TAG="monthly" # أول الشهر = شهرية
OUT="$BACKUP_DIR/fwms-$STAMP-$TAG.db"

# 2) نسخ آمن عبر SQLite Backup API
sqlite3 "$DB_PATH" ".backup '$OUT'"
log "✔ نسخة: $OUT ($(du -h "$OUT" | cut -f1)) [$TAG]"

# 3) تحقق إلزامي: الفحص السريع يجب أن يرجع ok (لا تخريب)
CHECK="$(sqlite3 "$OUT" "PRAGMA quick_check;")"
if [[ "$CHECK" != "ok" ]]; then
  log "❌ النسخة فاسدة (.quick_check=$CHECK): $OUT"
  exit 1
fi
log "✔ PRAGMA quick_check = ok"

# 4) تحقق بنيوي: عدد الجداول والسجلات يجب ألا يقل عن القاعدة
TABLES_DB="$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM sqlite_master WHERE type='table'")"
TABLES_BK="$(sqlite3 "$OUT" "SELECT COUNT(*) FROM sqlite_master WHERE type='table'")"
if [[ "$TABLES_BK" -lt "$TABLES_DB" ]]; then
  log "❌ النسخة ناقصة: جداول القاعدة=$TABLES_DB النسخة=$TABLES_BK"
  exit 1
fi
log "✔ بنيوي: $TABLES_BK جدول (القاعدة: $TABLES_DB)"

# 5) سياسة الاحتفاظ (فحص السعة 2026-10-19) — قبل الدوران
#    السبب: لا سياسة احتفاظ ⇒ نمو بلا حدّ:
#      AuditLog ≈ 280 بايت/سطر (200k سطر ≈ 55MB) · MemberLocationPing ينمو
#      مع كل نبضة موقع · VoiceMessage يحمل صوتًا (حتى 2.5MB لكل رسالة).
#    الحدود المطبَّقة (أفقية باليوم): تدقيق 365 · نطاقات 90 · إشعارات 90 · رسائل صوتية 180.
#    التوثيق (الوثائق) لا تُمسّ — لها قيمة قانونية.
if [[ "${FWMS_PRUNE:-1}" == "1" ]]; then
  prune() { # $1=الجدول $2=العمود الزمني $3=عدد الأيام
    local tbl="$1" col="$2" days="$3" deleted
    deleted="$(sqlite3 "$DB_PATH" "DELETE FROM \"$tbl\" WHERE \"$col\" < datetime('now','-${days} days');" 2>&1)" || deleted="0 (خطأ: $deleted)"
    log "  ♻️ احتفاظ: $tbl (>${days} يومًا على $col) — ${deleted}"
  }
  prune AuditLog createdAt 365
  prune MemberLocationPing reportedAt 90
  prune Notification createdAt 90
  prune VoiceMessage createdAt 180
fi

# 6) صلاحيات مقيّدة (600) لملف القاعدة ونسخها — الملف يحوي بصمات كلمات المرور
chmod 600 "$DB_PATH" 2>/dev/null || true
for f in "$DB_PATH"-wal "$DB_PATH"-shm; do [[ -f "$f" ]] && chmod 600 "$f"; done
chmod 700 "$BACKUP_DIR" 2>/dev/null || true
find "$BACKUP_DIR" -maxdepth 1 -name '*.db' -exec chmod 600 {} + 2>/dev/null || true
log "✔ الصلاحيات: القاعدة والنسخ = 600 (كانت 644 — قابلة للقراءة من أي مستخدم على الجهاز)"

# 7) الدوران (إلا بطلب صريح)
if [[ "${1:-}" != "--no-rotate" ]]; then
  rotate() { # $1=اللاحقة $2=العدد المسموح
    local pat="$BACKUP_DIR/fwms-*-$1.db"
    local n=0
    # الأحدث أولًا (شامل لاحقات الأسبوعية/الشهرية في عدّادها المستقل)
    while IFS= read -r f; do
      n=$((n+1))
      [[ $n -gt $2 ]] && rm -f "$f" && log "  ↻ دوران: حُذف $f"
    done < <(ls -1t $pat 2>/dev/null)
  }
  rotate daily "$KEEP_DAILY"
  rotate weekly "$KEEP_WEEKLY"
  rotate monthly "$KEEP_MONTHLY"
  log "✔ الدوران: daily=$KEEP_DAILY weekly=$KEEP_WEEKLY monthly=$KEEP_MONTHLY"
fi

log "✅ اكتملت النسخة الاحتياطية: $OUT"
