#!/usr/bin/env bash
# FWMS — تشغيل الخادم المحلي على Termux (Samsung A53 5G)
# ملكية: المساعد الثاني — راجع docs/DATABASE_GUIDE.md §2 و§9
# يمنع نوم أندرويد قتل العملية، ثم يشغل الخادم على كل الواجهات.
#
# ── عقد الخروج (مُعدَّل 2026-10-18 — علاج دائم لعلّة التعلّق) ─────────────────
# كان السكربت ينتهي بـ`exec npm start` أي يستبدل عملية نفسه بالخادم في المقدمة،
# فلا يعود أبدًا ⇒ كل استدعاء كان يُعطَّب بعد مهلة المتصل (رُصد: 600 ثانية)،
# والمتصل لا يعرف هل نجح أم لا. والعقد الآن: **يبدأ معزولًا في الخلفية ← ينتظر
# `/api/health` يُجيب ← يكتب معرّف العملية ← يخرج برقم خروج صريح.** أي أداة تستدعيه
# (أو متصل) تعرف النتيجة فورًا. وخادم/نفق سابقان يُوقَفان أولًا فلا تكاثر ولا خادم
# قديم يخدم بناءً عمره إعادة البناء (درس مُرصد: HTML قديم يستدعي CSS مفقودًا = 500).
set -euo pipefail

cd "$(dirname "$0")/../.."   # جذر المستودع

PORT="${PORT:-3000}"
HEALTH_URL="http://127.0.0.1:${PORT}/api/health"
HEALTH_TIMEOUT="${FWMS_HEALTH_TIMEOUT:-90}"

# ── دوال ────────────────────────────────────────────────────────────────────
log() { printf '%s\n' "$*"; }

stop_prior_server() {
  # نمط مُرسَّب حتى لا يطابق سطر أمر هذا السكربت نفسه (درس pkill: النمط الظاهر
  # في argv يقتل متصل الأمر). يُوقف النسخة القديمة فورًا: لا EADDRINUSE، ولا خادم
  # قديم في الذاكرة يقدّم بناءً قبل إعادة البناء.
  if pkill -TERM -f "\.next/standalone/server\.js" 2>/dev/null; then
    for _ in $(seq 1 20); do
      pgrep -f "\.next/standalone/server\.js" >/dev/null 2>&1 || break
      sleep 0.5
    done
    pkill -KILL -f "\.next/standalone/server\.js" 2>/dev/null || true
    log "✔ أُوقف خادم سابق إن وُجد"
  fi
}

wait_for_health() {
  # انتظار صريح حتى تُجيب الصحة: النجاح قابل للقياس لا مفترض.
  local waited=0
  while [ "$waited" -lt "$HEALTH_TIMEOUT" ]; do
    if curl -fsS --max-time 5 "$HEALTH_URL" >/dev/null 2>&1; then
      log "✔ الصحة تُجيب بعد ${waited}ث — $HEALTH_URL"
      return 0
    fi
    sleep 2
    waited=$((waited + 2))
  done
  log "❌ تعذّر تأكيد الصحة خلال ${HEALTH_TIMEOUT}ث — راجع db/server.log"
  return 1
}

# 0) cron للنسخ الاحتياطي اليومي (إن كان متاحًا — راجع docs/DATABASE_GUIDE.md §7)
service cron start >/dev/null 2>&1 || true

# 1) منع نوم الجهاز (إلزامي في Termux)
command -v termux-wake-lock >/dev/null 2>&1 && termux-wake-lock || echo "⚠ termux-wake-lock غير متوفر (شغّل داخل Termux مباشرة)"

# 2) مزامنة الكود (فحص السعة 2026-10-19: ترتيب الخطوات مُصحَّح — انظر 3)
OLD_HEAD="$(git rev-parse HEAD 2>/dev/null || echo none)"
git pull --ff-only origin main
NEW_HEAD="$(git rev-parse HEAD 2>/dev/null || echo none)"

# 2ب) إن تغيّر هذا السكربت نفسه بالسحب: أعد تشغيل النسخة الجديدة من أوله.
#     bash يقرأ السكربت تزايديًا — متابعة تنفيذ نصّ استُبدل على القرص سلوكٌ غير
#     معرف، والأهم: المنطق الجديد في الخطوة 4 (إعادة البناء عند تغيّر HEAD) لا
#     يعمل ما دامت النسخة القديمة هي المنفِّذة — وهي التي كانت تتخطى البناء.
#     إعادة التشغيل لا تتسلسل: بعد exec يصبح OLD_HEAD = NEW_HEAD فلا يُعاد مجددًا.
if [ "$OLD_HEAD" != "$NEW_HEAD" ] && [ "$OLD_HEAD" != "none" ] \
   && ! git diff --quiet "$OLD_HEAD" "$NEW_HEAD" -- infra/termux/start-server.sh 2>/dev/null; then
  log "↻ سكربت التشغيل نفسه تحدّث بالسحب — إعادة التشغيل بالنسخة الجديدة"
  exec bash "$0" "$@"
fi

# 3) النفق الدائم (Cloudflare Tunnel) — إن وُجد توكنه (docs/DATABASE_GUIDE.md §2.4)
#    حارس التكاثر: لا يُشغَّل نفق ثانٍ إن كان واحدًا قائمًا أصلًا (نصّ الحارس يطابق
#    سطر أمر run-tunnel.sh فقط، فلا يطابق نفسه أثناء إقلاعه).
if grep -q '^CLOUDFLARE_TUNNEL_TOKEN=' .env 2>/dev/null; then
  if pgrep -f 'run-tunnel\.sh' >/dev/null 2>&1 || pgrep -f 'tunnel run --token' >/dev/null 2>&1; then
    log "✔ النفق قائم أصلًا — لم يُشغَّل نفق مكرر"
  else
    nohup bash infra/termux/run-tunnel.sh > db/tunnel.log 2>&1 &
    log "✔ النفق الدائم يُشغَّل في الخلفية (db/tunnel.log)"
  fi
fi

# 4) البناء عند الحاجة ثم التشغيل
#    «عند الحاجة» = غياب .next **أو تغيّر HEAD منذ آخر بناء** — علاج جذر لبلاغ
#    المالك 2026-10-19 «الترجمة لازالت لا تعمل»: الخادم كان يسحب main (بما فيه
#    إصلاحات الترجمة) ثم يتخطى البناء لأن .next موجود — فيقدّم البناء القديم
#    إلى الأبد. بصمة HEAD تُكتب داخل .next بعد كل بناء ناجح (تُمسح معه تلقائيًا
#    عند أي بناء نظيف) وتُقارن عند كل تشغيل: تغيّرت ⇒ أعد البناء.
#    الترتيب (فحص السعة 2026-10-19): **البناء قبل إيقاف الخادم** ⇒ الانقطاع
#    عند التحديث = ثوانٍ (الهجرة + الإقلاع) لا دقائق البناء.
BUILT_COMMIT_FILE=".next/BUILT_COMMIT"
if [ ! -d .next ] \
   || [ ! -f "$BUILT_COMMIT_FILE" ] \
   || [ "$(git rev-parse HEAD 2>/dev/null || echo none)" != "$(cat "$BUILT_COMMIT_FILE" 2>/dev/null || echo none)" ]; then
  log "→ الكود تغيّر منذ آخر بناء (أو لا بناء) — إعادة البناء..."
  npm run build
  git rev-parse HEAD > "$BUILT_COMMIT_FILE"
else
  log "✔ البناء مطابق لرأس المستودع — لا حاجة لإعادة البناء"
fi

# 4أ) إيقاف النسخة السابقة **قبل** تطبيق الهجرات
#     السبب (فحص السعة 2026-10-19): الخادم العامل يمسك ملف القاعدة ⇒ يفشل
#     `prisma migrate deploy` يفشل بـ«database is locked» (SQLite يقفل الملف
#     أثناء الكتابة). الترتيب القديم (migrate قبل stop) كان يعمل فقط ما دامت
#     لا توجد هجرة جديدة — ومع أول هجرة حقيقية (فهرس السعة) يفشل السكربت
#     ولا يُشغَّل الخادم أصلًا. الترتيب الصحيح: بناء ← إيقاف ← هجرة ← إقلاع.
stop_prior_server

# 4ب) هجرات قاعدة البيانات (بعد إيقاف الخادم — انظر 4أ)
npx prisma migrate deploy

# 4ج) المحرّكات الأصلية لـ sharp في standalone (خطوة إلزامية بعد كل بناء — راجع §9.2)
bash infra/termux/fix-sharp-standalone.sh

# 5) بدء نسخة معزولة (لا تعلّق في المقدمة)
export NODE_ENV=production
export PORT
# HOSTNAME يضبطه bash ذاته في كل جلسة (غير مُصدَّر) — إن ورثناه وصدّرناه لزمّ
# Next ربط الاسم على اسم المضيف لا على كل الواجهات ⇒ نقرره صراحةً.
export HOSTNAME="${FWMS_HOSTNAME:-0.0.0.0}"
mkdir -p db
setsid npm start > db/server.log 2>&1 < /dev/null &
SRV_PID=$!
printf '%s\n' "$SRV_PID" > db/server.pid
log "✔ الخادم يُشغَّل معزولًا (PID=$SRV_PID · db/server.log)"

# 6) انتظار الحقيقة ثم الخروج — هذا هو العقد الذي كان ناقصًا
if wait_for_health; then
  log "✅ جاهز — يخرج السكربت (الخادم يبقى يعمل في الخلفية)"
  exit 0
fi
log "⚠ الخروج بفشل — راجع db/server.log"
exit 1
