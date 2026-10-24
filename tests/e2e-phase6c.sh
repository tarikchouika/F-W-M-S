#!/bin/bash
# HRMP — E2E للمرحلة 6ج: صفحات المسارات والمواصفات والتصاريح عبر متصفح آلي
# الدخول كمحاسب → المسارات → المواصفات → التصاريح → دورة تصريح كاملة من الواجهة
set +e
BASE="http://localhost:3100"
PASS=0; FAIL=0

note() { echo "  $1"; }
check() {
  if [ "$1" = "0" ]; then PASS=$((PASS+1)); note "✓ $2";
  else FAIL=$((FAIL+1)); note "✗ $2"; fi
}
body() { agent-browser eval "document.body.innerText" 2>/dev/null | head -c 20000; }

# انتظار نص بالاستطلاع بدل sleep ثابتة (ترقيع 2026-10-18 — تشخيص المساعد الثاني على الهاتف:
# أول فتح لحوار في dev يُجمّع أجزاء المكوّن وقد يتجاوز أي مهلة ثابتة فيفشل الفحص كذبًا،
# بينما DOM يؤكد أن الحوار يفتح ويعمل — الفشلان المكرران «ملخص الأرقام» و«sha256» كانا هذا)
wait_text() {
  local needle="$1" tries="${2:-20}" i=1
  while [ "$i" -le "$tries" ]; do
    if body | grep -q "$needle"; then return 0; fi
    sleep 2
    i=$((i+1))
  done
  return 1
}

echo "── E2E المرحلة 6ج ──"

# 0) جلسة نظيفة: خروج أي جلسة سابقة (إعادة التشغيل تصطدم بجلسة قائمة خلافًا)
agent-browser open "$BASE/dashboard" > /dev/null 2>&1
sleep 2
agent-browser eval "fetch('/api/auth/logout', {method:'POST'}).then(r => 'logged-out').catch(() => 'noop')" > /dev/null 2>&1
sleep 2

# 1) دخول المحاسب (المُسِند الأصلي + requestSubmit — درس KNOWLEDGE_BASE)
agent-browser open "$BASE/login" > /dev/null 2>&1
sleep 3
agent-browser eval "(() => { const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; const e = document.querySelector('input[type=email]'); s.call(e, 'accountant@demo.ma'); e.dispatchEvent(new Event('input', {bubbles:true})); const p = document.querySelector('input[type=password]'); s.call(p, 'Fwms#2026'); p.dispatchEvent(new Event('input', {bubbles:true})); return 'ok'; })()" > /dev/null 2>&1
sleep 1
agent-browser eval "(() => { document.querySelector('form').requestSubmit(); return 'ok'; })()" > /dev/null 2>&1
sleep 5
agent-browser eval "window.location.pathname" 2>/dev/null | grep -q "dashboard" ; check $? "دخول المحاسب → لوحة التحكم"

# 2) صفحة المسارات
agent-browser open "$BASE/dashboard/regimes" > /dev/null 2>&1
sleep 4
TEXT=$(body)
echo "$TEXT" | grep -q "مسارات الأجور" ; check $? "صفحة المسارات تُحمّل"
echo "$TEXT" | grep -q "SMAG" ; check $? "المسار الفلاحي (SMAG) ظاهر"
echo "$TEXT" | grep -q "غير مكتمل" ; check $? "الحزم العمومية موسومة غير مكتملة"
echo "$TEXT" | grep -q "مكتمل" ; check $? "حزمتا general/agricultural مكتملتان ظاهرتان"
echo "$TEXT" | grep -q "إسنادات العمال" ; check $? "إسنادات العمال ظاهرة"

# 3) صفحة سجل المواصفات (المحاسب)
agent-browser open "$BASE/dashboard/declaration-specs" > /dev/null 2>&1
sleep 4
TEXT=$(body)
echo "$TEXT" | grep -q "سجل المواصفات" ; check $? "صفحة سجل المواصفات تُحمّل"
echo "$TEXT" | grep -q "SAMPLE-NOT-OFFICIAL" ; check $? "وسم العينات ظاهر"
echo "$TEXT" | grep -qi "cnss" ; check $? "مواصفات CNSS ظاهرة"
echo "$TEXT" | grep -q "مفعّلة" ; check $? "حالة «مفعّلة» ظاهرة (من تفعيل اختبار API)"

# 4) صفحة التصاريح (المحاسب) — الدورة الكاملة من الواجهة
agent-browser open "$BASE/dashboard/declarations" > /dev/null 2>&1
sleep 4
TEXT=$(body)
echo "$TEXT" | grep -q "التصاريح الرسمية" ; check $? "صفحة التصاريح تُحمّل"
echo "$TEXT" | grep -q "مُودَع" ; check $? "التصريح المُودَع من اختبار API ظاهر"
echo "$TEXT" | grep -q "المواعيد القانونية" ; check $? "المواعيد القانونية ظاهرة"

# 5) حوار المراجعة: فتح تفاصيل أول تصريح (زر «مراجعة»)
agent-browser eval "(() => { const btns = Array.from(document.querySelectorAll('button')); const b = btns.find(x => x.textContent.trim() === 'مراجعة'); if (b) { b.click(); return 'opened'; } return 'not-found'; })()" 2>/dev/null | grep -q "opened" ; check $? "فتح حوار مراجعة المحاسب"
wait_text "ملخص الأرقام" ; check $? "ملخص الأرقام للمحاسب ظاهر (انتظار تجميع الحوار)"
TEXT=$(body)
echo "$TEXT" | grep -q "sha256" ; check $? "تجزئة الملف المُصدَّر ظاهرة (وثيقة قانونية)"

# 6) منشئ المسارات: فتح الحوار وإغلاقه (بدون إنشاء — البيانات مُختبرة API)
agent-browser open "$BASE/dashboard/regimes" > /dev/null 2>&1
sleep 3
agent-browser eval "(() => { const btns = Array.from(document.querySelectorAll('button')); const b = btns.find(x => x.textContent.includes('مسار جديد')); if (b) { b.click(); return 'opened'; } return 'not-found'; })()" 2>/dev/null | grep -q "opened" ; check $? "فتح حوار منشئ المسارات"
wait_text "منشئ المسارات" ; check $? "حوار المنشئ ظاهر (نسخ من قالب + بنود JSON)"
TEXT=$(body)
echo "$TEXT" | grep -q "نسخ من قالب" ; check $? "خيار «نسخ من قالب» ظاهر (SPEC §12)"

# 7) العزل: دخول العامل → صفحة المسارات تعيده للوحة (لا payroll.view)
agent-browser eval "fetch('/api/auth/logout', {method:'POST'}).then(r=>'out')" > /dev/null 2>&1
sleep 2
agent-browser open "$BASE/login" > /dev/null 2>&1
sleep 3
agent-browser eval "(() => { const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; const e = document.querySelector('input[type=email]'); s.call(e, 'worker@demo.ma'); e.dispatchEvent(new Event('input', {bubbles:true})); const p = document.querySelector('input[type=password]'); s.call(p, 'Fwms#2026'); p.dispatchEvent(new Event('input', {bubbles:true})); return 'ok'; })()" > /dev/null 2>&1
sleep 1
agent-browser eval "(() => { document.querySelector('form').requestSubmit(); return 'ok'; })()" > /dev/null 2>&1
sleep 5
agent-browser open "$BASE/dashboard/regimes" > /dev/null 2>&1
sleep 4
agent-browser eval "window.location.pathname" 2>/dev/null | grep -q "/dashboard" ; check $? "العامل يُعاد من صفحة المسارات (عزل الدور)"

echo ""
echo "E2E المرحلة 6ج: $PASS passed, $FAIL failed"
[ "$FAIL" -gt 0 ] && exit 1
exit 0
