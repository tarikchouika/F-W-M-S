#!/usr/bin/env bash
# HRMP — دفع main والوسوم إلى GitHub (للمساعدَين الآليَين — COORDINATION §5)
# الاستخدام:
#   FWMS_GITHUB_TOKEN=ghp_xxxxxxxxxxxx ./scripts/push.sh
# التوكن يُمرَّر كمتغير بيئة فقط ولا يُكتب في أي ملف مرفوع أبدًا (DEPLOYMENT §4).
# لا force-push إلى main — هذا السكربت يدفع فقط للأمام.
set -euo pipefail

# (إعادة التسمية 2026-10-24): التوكن والاسم الجديدان أولًا، والقديمان يُقبلان للتوافق
TOKEN="${HRMP_GITHUB_TOKEN:-${FWMS_GITHUB_TOKEN:-}}"
if [ -z "$TOKEN" ]; then
  echo "HRMP_GITHUB_TOKEN (أو FWMS_GITHUB_TOKEN للتوافق) غير مضبوط — مرّر توكن GitHub كمتغير بيئة" >&2
  exit 1
fi
REMOTE="${HRMP_REMOTE:-${FWMS_REMOTE:-https://github.com/tarikchouika/HRMP.git}}"

AUTH_REMOTE="${REMOTE/https:\/\//https:\/\/x-access-token:${TOKEN}@}"

echo "→ دفع main والوسوم إلى ${REMOTE} ..."
git push "$AUTH_REMOTE" main --tags
echo "✓ تم الدفع. تحقق من CI: https://github.com/tarikchouika/HRMP/actions"
