#!/usr/bin/env bash
# FWMS — إعادة تعيين كلمة مرور المالك على الخادم المرجعي (الهاتف) — تشغيل ذاتي من المالك
# ---------------------------------------------------------------------------
# بلاغ المالك 2026-10-24: «لا أستطيع تسجيل الدخول للحساب من تطبيق الأندرويد
# (تسجيل الدخول يعمل من المتصفح)».
#
# التشخيص المُثبت (قياسًا لا ظنًّا — راجع WORKLOG نفس الجولة):
#   التطبيق يشير إلى الخادم المرجعي (fwms.tarikc.workers.dev ← الهاتف). حساب
#   المالك هناك نشط (توقيت bcrypt يثبت وجوده) لكن كلمة مروره «مستقلة»: دوِّرت
#   في جولة أمنية سابقة ولم تُسلَّم للمالك تسليمًا باقيًا، فكل ما يعرفه من كلمات
#   (كلمة البذور Fwms#2026 وكلمة المعاينة التي يعمل بها متصفحه على بوابة Vercel)
#   يُرجع 401 هناك. المتصفح «يعمل» لأن بوابة Vercel تعمل على لقطة معاينة تحمل
#   كلمة مرور أخرى — تجزئة بيانات اعتماد بين قاعدتين، لا عيب في التطبيق ولا الويب.
#
# العلاج الجذري (هذا السكربت): يضبط المالك كلمة مرور يختارها بنفسه على قاعدة
# الهاتف (المصدر المرجعي الوحيد لبيانات اعتماد الإنتاج). بعده يعمل الدخول من
# التطبيق فورًا — التطبيق والبوابة العامة والمتصفح كلها على نفس القاعدة.
#
# الاستخدام (داخل Termux على الهاتف، من جذر المستودع):
#   infra/termux/reset-owner-password.sh                 # يكتشف حساب المالك تلقائيًا
#   infra/termux/reset-owner-password.sh --email x@y.z   # أو يحدَّد صراحةً
#
# ما يفعله (بترتيبه):
#   0) نسخة احتياطية آمنة قبل أي كتابة (SQLite Backup API + quick_check).
#   1) تحديد الحساب: الوسيط --email، أو الاكتشاف التلقائي (سوبر أدمن نشط واحد
#      بلا عضوية ملغاة)؛ لو تعدد المرشحون يُدرجون ويُطلب --email (لا تخمين أبدًا).
#   2) قراءة كلمة مرور جديدة مرتين بلا صدى (read -s) مع تحقق صرامة:
#      ≥10 محارف + حرف ورقم على الأقل + ليست من قائمة الضعف المعروفة.
#      (أصرّ من حد الواجهة =8 عمدًا: هذا حساب مالك المنصة.)
#   3) التحديث عبر node + bcryptjs (نفس مكتبة التحقق في src/lib/auth/password.ts):
#      passwordHash = bcrypt(10) · isActive=true ·
#      sessionsInvalidatedAt=now (إبطال كل جلسة قديمة فورًا — أي جهاز كان
#      «يعمل بالصدفة» بجلسة قديمة يُخرَج أيضا) · updatedAt=now.
#   4) تحقق إلزامي بعد الكتابة: إعادة قراءة الصف ومطابقة bcrypt — لا نجاح بلا دليل.
#   5) طباعة الخطوة التالية للمالك (افتح التطبيق → سجّل الدخول).
#
# قواعد نافذة (من COORDINATION/DEPLOYMENT):
#   - بيانات اعتماد الإنتاج تعيش في قاعدة الهاتف حصرًا؛ لقطة المعاينة بيانات
#     عرض مستقلة ولا «تُوحَّد» بصماتها مع الإنتاج أبدًا (ولا تُرفع للمستودع).
#   - أي كلمة مرور يولّدها مساعد وتبقى بيده = سر ضائع. المالك يضبط كلمته بنفسه.
set -euo pipefail
# كل ما يُنشأ هنا (نسخة احتياطية/سجلات) مقيّد الصلاحية — الفحص الأمني 2026-10-19
umask 077

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="$REPO_DIR/.env"
BACKUP_DIR="$REPO_DIR/db/backups"

log() { printf '%s\n' "$*"; }
die() { printf '❌ %s\n' "$*" >&2; exit 1; }

# ── 1) مسار القاعدة من .env (نمط backup-db.sh نفسه) ─────────────────────────
[[ -f "$ENV_FILE" ]] || die "لم أجد $ENV_FILE"
DB_PATH="$(grep -E '^DATABASE_URL=' "$ENV_FILE" | head -1 | sed 's/^DATABASE_URL=//; s/^"file://; s/^file://; s/"$//')"
[[ -n "$DB_PATH" && -f "$DB_PATH" ]] || die "لم أجد قاعدة البيانات: DATABASE_URL في .env → $DB_PATH"
command -v sqlite3 >/dev/null 2>&1 || die "sqlite3 غير متوفر (pkg install sqlite)"
command -v node    >/dev/null 2>&1 || die "node غير متوفر"
[[ -d "$REPO_DIR/node_modules/bcryptjs" ]] || die "bcryptjs غير مثبتة — شغّل npm install أولًا"

# ── 2) وسطاء الاستدعاء ───────────────────────────────────────────────────────
EMAIL=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --email) EMAIL="${2:-}"; shift 2 ;;
    *) die "وسيط غير معروف: $1 (المعروف: --email)" ;;
  esac
done

# ── 3) نسخة احتياطية قبل الكتابة (ذات نمط backup-db.sh) ─────────────────────
mkdir -p "$BACKUP_DIR"
STAMP="$(date +%F-%H%M%S)"
OUT="$BACKUP_DIR/fwms-prereset-$STAMP.db"
sqlite3 "$DB_PATH" ".backup '$OUT'"
CHECK="$(sqlite3 "$OUT" "PRAGMA quick_check;")"
[[ "$CHECK" == "ok" ]] || die "النسخة الاحتياطية فاسدة (quick_check=$CHECK) — أُلغيت العملية ولم تُمسّ القاعدة"
log "✔ نسخة احتياطية قبل التعديل: $OUT"

# ── 4) تحديد حساب المالك (لا تخمين: مرشح واحد أو --email صريح) ───────────────
CANDIDATES="$(sqlite3 "$DB_PATH" "
SELECT u.email FROM User u
JOIN UserMembership m ON m.userId = u.id
WHERE m.role = 'super_admin' AND m.revokedAt IS NULL AND u.isActive = 1
ORDER BY u.createdAt LIMIT 5;")"
mapfile -t CAND_ARR <<<"$CANDIDATES"
CAND_ARR=("${CAND_ARR[@]:-$CANDIDATES}") # نص فارغ ⇒ عنصر واحد فارغ يُرشح لاحقًا

if [[ -n "$EMAIL" ]]; then
  TARGET_EMAIL="$EMAIL"
elif [[ "${#CAND_ARR[@]}" -eq 1 && -n "${CAND_ARR[0]}" ]]; then
  TARGET_EMAIL="${CAND_ARR[0]}"
  log "→ اكتشاف تلقائي: حساب مالك وحيد نشط — $TARGET_EMAIL"
else
  log "مرشحو المالك النشطون (سوبر أدمن):"
  printf '  • %s\n' "${CAND_ARR[@]}" 2>/dev/null || true
  die "عدة مرشحين (أو لا أحد) — حدّد الحساب صراحةً: --email <البريد>"
fi

# ── 5) كلمة المرور الجديدة (مخفية، مرتين، بتحقق صرامة) ──────────────────────
read -r -s -p "كلمة المرور الجديدة للمالك ($TARGET_EMAIL): " NEW_PW; echo >&2
read -r -s -p "أعد كتابة كلمة المرور: " NEW_PW2;    echo >&2
[[ "$NEW_PW" == "$NEW_PW2" ]] || die "الكلمتان غير متطابقتين"
[[ ${#NEW_PW} -ge 10 ]]            || die "قصيرة جدًا: المطلوب ≥10 محارف (حساب مالك — أصرّ من حد الواجهة عمدًا)"
# POSIX classes حصرًا: مدى البايتات الممتد (À-ÿ) كلمة قويسها يفسد الترجمة في
# بعض المحليات (فشل تجميع صامت ⇒ رفض كلمات سليمة — كُشف بالتجربة الحية).
[[ "$NEW_PW" =~ [[:alpha:]] ]] || die "يجب أن تحتوي حرفًا واحدًا على الأقل"
[[ "$NEW_PW" =~ [[:digit:]] ]] || die "يجب أن تحتوي رقمًا واحدًا على الأقل"
case "$NEW_PW" in
  "Fwms#2026"|*12345678*|"password"|*"password"*|*qwerty*) die "كلمة ضعيفة/معروفة — اختر غيرها" ;;
esac
NEW_PW2=""

# ── 6) الكتابة + التحقق الإلزامي (node + bcryptjs — نفس مكتبة التطبيق) ───────
# تُمرَّر عبر stdin (لا argv): سطر الأوامر لا يحمل الكلمة أبدًا (تظهر في ps/التاريخ).
UPDATE_RESULT="$(printf '%s' "$NEW_PW" | FWMS_DB="$DB_PATH" FWMS_EMAIL="$TARGET_EMAIL" node -e '
const path = require("path");
const bcrypt = require(path.join(process.cwd(), "node_modules", "bcryptjs"));
const { PrismaClient } = require(path.join(process.cwd(), "node_modules", "@prisma", "client"));
const db = new PrismaClient({ datasources: { db: { url: "file:" + process.env.FWMS_DB } } });
const email = process.env.FWMS_EMAIL;
let plain = "";
process.stdin.on("data", (c) => (plain += c));
process.stdin.on("end", async () => {
  try {
    const user = await db.user.findUnique({ where: { email } });
    if (!user) { console.error("NOT_FOUND"); process.exit(2); }
    const hash = await bcrypt.hash(plain, 10);
    await db.user.update({
      where: { id: user.id },
      data: {
        passwordHash: hash,
        isActive: true,
        sessionsInvalidatedAt: new Date(), // إبطال كل جلسة قديمة فورًا
        updatedAt: new Date(),
      },
    });
    // تحقق إلزامي بعد الكتابة: أعد قراءة الصف وطابق bcrypt
    const after = await db.user.findUnique({ where: { id: user.id } });
    const ok = await bcrypt.compare(plain, after.passwordHash);
    if (!ok || after.isActive !== true) { console.error("VERIFY_FAILED"); process.exit(3); }
    console.log("OK " + user.id);
  } catch (e) { console.error(String(e && e.message || e)); process.exit(1); }
  finally { await db.$disconnect().catch(() => {}); }
});' FWMS_DB="$DB_PATH" FWMS_EMAIL="$TARGET_EMAIL")" || die "فشل التحديث في القاعدة (انظر أعلاه)"
[[ "$UPDATE_RESULT" == OK* ]] || die "نتيجة غير متوقعة: $UPDATE_RESULT"
log "✔ كُتبت الكلمة الجديدة وتحققت بالمطابقة (bcrypt) — وأُبطلت كل الجلسات القديمة"

# ── 7) الخطوة التالية ───────────────────────────────────────────────────────
log ""
log "تم. افتح تطبيق أندرويد الآن وسجّل الدخول بـ $TARGET_EMAIL وكلمة المرور الجديدة."
log "المتصفح الذي كان «يعمل» سيطلب الدخول من جديد كذلك — أُبطلت جلساته القديمة (سلوك مقصود)."
log "احتفظ بالنسخة الاحتياطية: $OUT"
