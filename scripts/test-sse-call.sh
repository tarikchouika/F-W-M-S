#!/usr/bin/env bash
# FWMS — اختبار قناة SSE: تسجيل دخول العامل ثم فتح القناة والتقاط أحداث الاتصال
# التشغيل: bash /home/z/my-project/fwms/scripts/test-sse-call.sh
set -euo pipefail
BASE="http://localhost:3100"

# دخول العامل
curl -s -c /tmp/sse-w.txt -X POST "$BASE/api/auth/login" -H "Content-Type: application/json" \
  -d '{"email":"worker@demo.ma","password":"Fwms#2026"}' > /dev/null
echo "✓ دخول العامل"

# فتح قناة SSE في الخلفية وتجميع الأحداث
(curl -s -N -b /tmp/sse-w.txt "$BASE/api/realtime" > /tmp/sse-events.txt 2>&1 &) 
sleep 3

# المالك يبدأ اتصالًا
CALL=$(curl -s -b /tmp/fwms-cookies.txt -X POST "$BASE/api/calls" -H "Content-Type: application/json" \
  -d '{"to":"user-employee","media":"video"}')
CALL_ID=$(echo "$CALL" | python3 -c "import json,sys; print(json.load(sys.stdin)['callId'])")
echo "✓ اتصال أُنشئ: $CALL_ID"
sleep 5

# المرسل يرسل offer ثم ice (محاكاة WebRTC)
curl -s -b /tmp/fwms-cookies.txt -X POST "$BASE/api/calls/$CALL_ID/signal" -H "Content-Type: application/json" \
  -d '{"kind":"offer","payload":{"sdp":"v=0 fake-offer-sdp","type":"offer"}}' > /dev/null
curl -s -b /tmp/fwms-cookies.txt -X POST "$BASE/api/calls/$CALL_ID/signal" -H "Content-Type: application/json" \
  -d '{"kind":"ice","payload":{"candidate":"candidate:1 udp","sdpMid":"0"}}' > /dev/null
echo "✓ أُرسلت offer + ice من المرسل"
sleep 6

echo "=== أحداث SSE التي وصلت العامل ==="
rg "^event: |^data: " /tmp/sse-events.txt | head -20

# إنهاء الاتصال من المرسل
curl -s -b /tmp/fwms-cookies.txt -X POST "$BASE/api/calls/$CALL_ID/signal" -H "Content-Type: application/json" \
  -d '{"kind":"end"}' > /dev/null
echo "✓ أُنهي الاتصال"
sleep 5
echo "=== أحداث بعد الإنهاء ==="
rg "^event: |^data: " /tmp/sse-events.txt | tail -8

pkill -f "curl -s -N" 2>/dev/null || true
echo "تم"
