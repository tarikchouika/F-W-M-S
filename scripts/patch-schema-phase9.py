#!/usr/bin/env python3
# HRMP — ترقية مخطط Prisma إلى المرحلة 9 (v0.10.0) — يعدّل prisma/schema.prisma بمواضع دقيقة
# تعمل مرة واحدة؛ التغييرات بعدها تُدار يدويا. كل تعديل يتحقق من وجوده قبل تطبيقه (فشل = رسالة واضحة).
import re, sys

PATH = "prisma/schema.prisma"
src = open(PATH, encoding="utf-8").read()
changed = []

def fail(msg):
    print(f"✗ {msg}")
    sys.exit(1)

# ── 1) WorkerGroup: إضافة الحقول والعلاقات والنماذج الجديدة ──
m = re.search(r"model WorkerGroup \{.*?\n\}\n", src, re.DOTALL)
if not m:
    fail("لم يُعثر على نموذج WorkerGroup")
block = m.group(0)
if "leaderUserId" in block:
    changed.append("WorkerGroup: مُرقّى سلفًا")
else:
    new_block = '''model WorkerGroup {
  id           String   @id @default(cuid())
  companyId    String
  name         String
  description  String?
  status       String   @default("active") // active | archived
  kind         String   @default("regular") // regular | reserve — فرق الإحتياط (يعيّنها الأدمن)
  leaderUserId String? // مسؤول الفريق — يُخطر آنيًا عند دخول/مغادرة الأعضاء منطقة الفريق
  siteId       String? // موقع العمل المرجعي — المنطقة الجغرافية تُشتق منه إن لم تُحدد مباشرة
  zoneLat      Float? // مركز منطقة الفريق — إن خلا الحقلان استُخدم موقع الموقع المرجعي
  zoneLng      Float?
  zoneRadiusM  Int? // نصف قطر منطقة الفريق (م) — أوسع من نطاق التحقق (50م) لأنها متابعة لا تسجيل حضور
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  company Company @relation(fields: [companyId], references: [id])
  leader  User?   @relation("GroupLeader", fields: [leaderUserId], references: [id])
  site    Site?   @relation("GroupSite", fields: [siteId], references: [id])
  members WorkerGroupMember[]

  @@index([companyId, status])
  @@index([companyId, kind])
  @@index([leaderUserId])
}

/// عضوية عامل/حرفي/تقني في فريق (المرحلة 9) — دورة حياة بالإزالة المؤرخة (نمط UserMembership)
/// لا قيد فريد مركّب: الإضافة تتحقق في الخدمة من عدم وجود عضوية سارية (وإلا تعارضت مع الإزالة/الإعادة)
model WorkerGroupMember {
  id          String    @id @default(cuid())
  companyId   String
  groupId     String
  userId      String
  jobTitleKey String? // مسمى وظيفي داخل الفريق من الكتالوج (اختياري — المهنة الأساسية في الملف)
  status      String    @default("active") // active | removed
  addedAt     DateTime  @default(now())
  addedBy     String? // من أضافه (تدقيق)
  removedAt   DateTime?

  group WorkerGroup @relation(fields: [groupId], references: [id])
  user  User       @relation("GroupMember", fields: [userId], references: [id])

  @@index([groupId, status])
  @@index([companyId, userId, status])
}

/// نبضة موقع آنية لعضو فريق (المرحلة 9) — المراقبة الحية للوجود داخل/خارج منطقة الفريق
/// المصدر: مراقب المتصفح أثناء فتح اللوحة (watcher) أو إرسال يدوي — لا تتبع خلفي (خصوصية)
model MemberLocationPing {
  id         String   @id @default(cuid())
  companyId  String
  groupId    String? // الفريق الذي أُرسلت النبضة في سياقه
  userId     String
  lat        Float
  lng        Float
  accuracyM  Float?
  source     String   @default("watcher") // watcher | manual
  reportedAt DateTime @default(now())

  user User @relation("LocationReporter", fields: [userId], references: [id])

  @@index([companyId, userId, reportedAt])
  @@index([groupId, reportedAt])
}

/// رسالة صوتية مباشرة (المرحلة 9) — عزل الفرق: تُخزَّن بنطاق فريق المُرسل،
/// ولا تُقرأ إلا لطرفيها ومن يملك صلاحية الإشراف (سوبر أدمن/أدمن/كوأدمن)
model VoiceMessage {
  id          String    @id @default(cuid())
  companyId   String
  groupId     String // فريق المُرسل — الرسائل بين الفرق منفصلة تمامًا
  senderId    String
  recipientId String
  durationSec Int       @default(0)
  mime        String    @default("audio/webm")
  sizeBytes   Int       @default(0)
  audio       Bytes // المحتوى الثنائي (SQLite BLOB) — مقاطع قصيرة ≤ 120ث
  listenedAt  DateTime? // وقت استماع المستقبِل (أول تشغيل)
  createdAt   DateTime  @default(now())

  sender    User @relation("VoiceSender", fields: [senderId], references: [id])
  recipient User @relation("VoiceRecipient", fields: [recipientId], references: [id])

  @@index([companyId, groupId, createdAt])
  @@index([recipientId, listenedAt])
}

/// تفويض صلاحية (المرحلة 9) — السوبر أدمن وحده يفوّض؛ يمنح صلاحية فوق دور المنحوح له
/// حتى انتهاء الصلاحية أو سحبها — تحقق دائم في الخادم عند كل فعل حساس
model PermissionDelegation {
  id         String    @id @default(cuid())
  companyId  String
  grantorId  String // السوبر أدمن المفوِّض
  granteeId  String // المستخدم المنحوح له
  permission String // من PERMISSIONS (rbac.ts) — القابلة للتفويض موثقة في delegations.ts
  note       String?
  grantedAt  DateTime  @default(now())
  expiresAt  DateTime? // null = بلا انتهاء
  revokedAt  DateTime?

  grantor User @relation("DelegationGrantor", fields: [grantorId], references: [id])
  grantee User @relation("DelegationGrantee", fields: [granteeId], references: [id])

  @@index([companyId, granteeId])
  @@index([companyId, grantorId])
}
'''
    src = src[:m.start()] + new_block + src[m.end():]
    changed.append("WorkerGroup مُرقّى + 4 نماذج جديدة (عضوية/نبضة/صوتية/تفويض)")

# ── 2) User: علاقات المرحلة 9 ──
if '"GroupLeader"' not in src.split("model User {")[1].split("model UserMembership")[0]:
    anchor = '  payslips          Payslip[]         @relation("PayslipWorker")\n'
    if anchor not in src:
        fail("لم يُعثر على مرساة علاقات User")
    add = anchor + '''  ledGroups          WorkerGroup[]     @relation("GroupLeader")
  groupMemberships   WorkerGroupMember[] @relation("GroupMember")
  locationPings      MemberLocationPing[] @relation("LocationReporter")
  sentVoices         VoiceMessage[]    @relation("VoiceSender")
  receivedVoices     VoiceMessage[]    @relation("VoiceRecipient")
  grantedDelegations  PermissionDelegation[] @relation("DelegationGrantor")
  receivedDelegations PermissionDelegation[] @relation("DelegationGrantee")
'''
    src = src.replace(anchor, add, 1)
    changed.append("User: 7 علاقات جديدة")
else:
    changed.append("User: علاقات موجودة سلفًا")

# ── 3) Site: علاقة المجموعات ──
if '@relation("GroupSite")' not in src:
    anchor = "  attendanceEvents     AttendanceEvent[]\n"
    if anchor not in src:
        fail("لم يُعثر على مرساة علاقات Site")
    src = src.replace(anchor, anchor + '  groups               WorkerGroup[]     @relation("GroupSite")\n', 1)
    changed.append("Site: علاقة GroupSite")
else:
    changed.append("Site: علاقة موجودة سلفًا")

# ── 4) EmployeeProfile: حقلا المسمى الوظيفي ──
if "jobTitleKey" not in src:
    anchor = '  cnssNumber      String? // رقم CNSS للعامل — إلزامي لتصريح Damancom (SPEC §4.6)\n'
    if anchor not in src:
        fail("لم يُعثر على مرساة EmployeeProfile (cnssNumber)")
    add = anchor + '''  jobTitleKey     String? // المسمى الوظيفي من الكتالوج المعتمد (المرحلة 9) — مهنة الشخص الأساسية
  jobTitleCustom  String? // مسمى حر خارج الكتالوج — يُعرض بجانب المسمى الرسمي إن وُجد
'''
    src = src.replace(anchor, add, 1)
    changed.append("EmployeeProfile: حقلا المسمى الوظيفي")
else:
    changed.append("EmployeeProfile: حقلا المسمى موجودان سلفًا")

open(PATH, "w", encoding="utf-8").write(src)
print("OK — " + " | ".join(changed))
