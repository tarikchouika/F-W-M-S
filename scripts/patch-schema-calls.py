#!/usr/bin/env python3
# FWMS — تعديل مخطط Prisma: حقول مسح الصوتيات المؤقتة + نموذجا الاتصال المباشر
# (بلاغ المالك 2026-10-24: اتصال آني بلا تخزين + صوتيات تُمسح بعد الاستهلاك)
# مراسي إنجليزية/رمزية فقط — لا مطابقة نص عربي (درس التركيب المتحوّل يونيكود)

SCHEMA = "/home/z/my-project/fwms/prisma/schema.prisma"
src = open(SCHEMA, encoding="utf-8").read()

# ── 1) علاقات المستخدم: startedCalls/receivedCalls بعد receivedDirect ──
anchor = '  receivedDirect      DirectMessage[]        @relation("DirectRecipient")\n'
assert anchor in src, "anchor: receivedDirect"
if "startedCalls" not in src:
    src = src.replace(
        anchor,
        anchor + '  startedCalls        CallSession[]           @relation("CallCaller")\n'
                 '  receivedCalls       CallSession[]           @relation("CallCallee")\n',
        1,
    )

# ── 2) VoiceMessage: حقول purgedAt/purgedBy ──
vm_old = "  listenedAt  DateTime? // \u0648\u0642\u062a \u0627\u0633\u062a\u0645\u0627\u0639 \u0627\u0644\u0645\u0633\u062a\u0642\u0628\u0650\u0644 (\u0623\u0648\u0644 \u062a\u0634\u063a\u064a\u0644)\n  createdAt   DateTime  @default(now())\n"
if vm_old not in src:
    # سقوط آمن: طبّع الأسطر (توحيد التشكيل) ثم ابحث بالمرساة الرمزية
    import unicodedata
    norm = unicodedata.normalize("NFC", src)
    vm_old_norm = unicodedata.normalize("NFC", vm_old)
    assert vm_old_norm in norm, "anchor: listenedAt row"
    src = norm
vm_new = vm_old + "  purgedAt    DateTime? // \u0644\u062d\u0638\u0629 \u0645\u0633\u062d \u0627\u0644\u0645\u062d\u062a\u0648\u0649 \u0627\u0644\u0635\u0648\u062a\u064a (\u0627\u0633\u062a\u0647\u0644\u0627\u0643 \u0623\u0648 TTL) \u2014 \u0628\u0639\u062f\u0647\u0627 \u0627\u0644\u0628\u062b 410\n  purgedBy    String?   // \u0645\u0646 \u0645\u0633\u062d\u0647\u0627: \u0645\u0639\u0631\u0651\u0641 \u0627\u0644\u0645\u0633\u062a\u0642\u0628\u0650\u0644/\u0627\u0644\u0645\u0634\u0631\u0641 \u0623\u0648 \"ttl\"\n"
src = src.replace(vm_old, vm_new, 1)

# ── 3) فهرس purgedAt ──
idx_old = "  @@index([recipientId, listenedAt])\n}\n"
idx_new = "  @@index([recipientId, listenedAt])\n  @@index([purgedAt])\n}\n"
assert idx_old in src, "anchor: voice indexes"
src = src.replace(idx_old, idx_new, 1)

# ── 4) نموذجا الاتصال الجديدان بعد DirectMessage (مرساة الفهارس) ──
dm_tail = "  @@index([companyId, groupId, createdAt])\n  @@index([recipientId, viewedAt])\n}\n"
calls = """
/// \u062c\u0644\u0633\u0629 \u0627\u062a\u0635\u0627\u0644 \u0645\u0628\u0627\u0634\u0631 (\u0628\u0644\u0627\u063a \u0627\u0644\u0645\u0627\u0644\u0643 2026-10-24): \u0635\u0648\u062a/\u0635\u0648\u0631\u0629 \u0622\u0646\u064a \u0628\u064a\u0646 \u0645\u0633\u062a\u062e\u062f\u0645\u064e\u064a\u0646 \u0639\u0628\u0631
/// WebRTC \u2014 \u0627\u0644\u0648\u0633\u0627\u0626\u0637 \u062a\u062a\u062f\u0641\u0642 \u0646\u0638\u064a\u0631-\u0625\u0644\u0649-\u0646\u0638\u064a\u0631 \u0645\u0634\u0641\u0651\u0631\u0629 (DTLS-SRTP) \u0648\u0644\u0627 \u062a\u0645\u0631\u0651 \u0628\u0627\u0644\u062e\u0627\u062f\u0645
/// \u0648\u0644\u0627 \u062a\u064f\u062e\u0632\u0651\u0646 \u0641\u064a \u0627\u0644\u0645\u0646\u0635\u0629 \u0625\u0637\u0644\u0627\u0642\u064b\u0627\u061b \u0647\u0630\u0627 \u0627\u0644\u0633\u062c\u0644 \u0628\u064a\u0627\u0646\u0627\u062a \u0648\u0635\u0641\u064a\u0629 \u0644\u0644\u062a\u062f\u0642\u064a\u0642 \u0641\u0642\u0637
/// (\u0645\u0646 \u0627\u062a\u0635\u0644 \u0628\u0645\u0646\u060c \u0645\u062a\u0649\u060c \u0627\u0644\u0645\u062f\u0629\u060c \u0627\u0644\u062d\u0627\u0644\u0629) \u0628\u0644\u0627 \u0623\u064a \u0645\u062d\u062a\u0648\u0649 \u0648\u0633\u0627\u0626\u0637.
model CallSession {
  id        String    @id @default(cuid())
  companyId String
  callerId  String
  calleeId  String
  media     String    // audio | video
  status    String    @default("ringing") // ringing | active | ended | declined | missed
  startedAt DateTime? // \u0644\u062d\u0638\u0629 \u0627\u062a\u0635\u0627\u0644 \u0627\u0644\u0648\u0633\u0627\u0626\u0637 \u0641\u0639\u0644\u064a\u064b\u0627
  endedAt   DateTime?
  createdAt DateTime  @default(now())

  caller User @relation("CallCaller", fields: [callerId], references: [id])
  callee User @relation("CallCallee", fields: [calleeId], references: [id])

  @@index([companyId, createdAt])
  @@index([calleeId, status, createdAt])
}

/// \u0625\u0634\u0627\u0631\u0629 \u062a\u0623\u0634\u064a\u0631 WebRTC (\u0628\u0644\u0627\u063a \u0627\u0644\u0645\u0627\u0644\u0643 2026-10-24): ring/offer/answer/ice/end/decline
/// \u2014 \u0625\u0634\u0627\u0631\u0627\u062a \u062a\u0623\u0633\u064a\u0633 \u0627\u0644\u0627\u062a\u0635\u0627\u0644 \u0648\u062d\u062f\u0647\u0627 \u062a\u0645\u0631\u0651 \u0628\u0627\u0644\u062e\u0627\u062f\u0645 (SDP \u0648\u0645\u0631\u0634\u062d\u0648 ICE)
/// \u0648\u0647\u064a \u0642\u0635\u064a\u0631\u0629 \u0627\u0644\u0639\u0645\u0631: \u062a\u064f\u062d\u0630\u0641 \u0628\u0639\u062f \u062f\u0642\u0627\u0626\u0642 \u0645\u0646 \u0625\u0646\u0634\u0627\u0626\u0647\u0627\u061b \u0627\u0644\u0648\u0633\u0627\u0626\u0637 \u0646\u0641\u0633\u0647\u0627 \u0644\u0627 \u062a\u0644\u0645\u0633 \u0627\u0644\u062e\u0627\u062f\u0645 \u0623\u0628\u062f\u064b\u0627.
model CallSignal {
  id          String   @id @default(cuid())
  companyId   String
  callId      String
  fromUserId  String
  toUserId    String
  kind        String // ring | offer | answer | ice | end | decline | busy
  payloadJson String // JSON \u0642\u0635\u064a\u0631 (SDP \u0623\u0648 \u0645\u0631\u0634\u062d ICE \u0628\u0644\u0627 \u062d\u0645\u0648\u0644\u0629) \u2014 \u0645\u0624\u0642\u062a \u0628\u0637\u0628\u064a\u0639\u062a\u0647
  createdAt   DateTime @default(now())

  @@index([toUserId, createdAt])
  @@index([createdAt])
}
"""
assert dm_tail in src, "anchor: direct message tail"
if "model CallSession" not in src:
    src = src.replace(dm_tail, dm_tail + calls, 1)

open(SCHEMA, "w", encoding="utf-8").write(src)
print("OK: purgedAt/purgedBy + CallSession + CallSignal + user relations")
