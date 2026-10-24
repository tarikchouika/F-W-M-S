# docs/DATABASE_GUIDE.md — دليل المساعد الثاني: قاعدة البيانات المحلية SQLite

> **المستند التوجيهي الحصري للمساعد الآلي الثاني** المسؤول عن إنشاء وإدارة قاعدة البيانات المحلية لمنصة FWMS.
> بيئة عملك: **هاتف Samsung A53 5G — Termux + Ubuntu (proot)**.
> قبل أي شيء اقرأ: `AGENTS.md` ثم `KNOWLEDGE_BASE.md` ثم `docs/COORDINATION.md` ثم هذه الوثيقة كاملة.
> مرجع المنتج الكامل: `docs/SPEC.md` (خاصة الأقسام 3 و5 و11 و12).

---

## 1. مهمتك ونطاقك

**مهمتك:** تشغيل طبقة البيانات المحلية للمنصة على الهاتف، بحيث يعمل تطبيق Next.js نفسه المرفوع على GitHub محليًا على Termux بقاعدة SQLite مستقلة تمامًا عن الإنترنت (وضع LAN في SPEC §4.2).

**تملك حصريًا:** `prisma/` (المخطط + migrations + seeds)، `db/`، `infra/termux/`، وهذا الدليل.
**لا تلمس:** `src/**`، `infra/cloudflare/`، `docs/DEPLOYMENT.md` (ملكية المساعد الأول — طلباتك عبر `docs/WORKLOG.md`).

**ناتجك النهائي المطلوب:**
1. قاعدة SQLite سليمة بالمخطط المعتمد + migrations موثّقة.
2. بذور (seeds) بيانات قواعد الأجور المغربية 2025–2026 بتواريخ سريان (§6 أدناه).
3. خادم محلي يعمل ويتصل به التطبيق عبر الشبكة المحلية.
4. نسخ احتياطي مجدول ومُختبَر (استعادة فعلية موثّقة).
5. تحديث `CHANGELOG.md` + `docs/WORKLOG.md` مع كل إنجاز.

## 2. تهيئة البيئة على Termux (Ubuntu)

### 2.1 التثبيت الأول (مرة واحدة)

```bash
# في Termux مباشرة:
pkg update && pkg upgrade -y
pkg install -y proot-distro git nodejs-lts
proot-distro install ubuntu
proot-distro login ubuntu
```

### 2.2 داخل Ubuntu (proot)

```bash
apt update && apt install -y curl git sqlite3 openssl ca-certificates
# Node 22 LTS (مطلوب لـ Next.js 16):
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt install -y nodejs
npm install -g bun  # لتشغيل البذور (prisma seed) — لكن بناء الإنتاج على الهاتف عبر npm (انظر §9 والدرس في KNOWLEDGE_BASE: روابط bun تُرفض من Turbopack هنا)
```

> ⚠️ **قاعدة بيئية مُثبتة على هذه الهاتف:** التثبيت والبناء بـ `npm` (جرب الاثنان: npm بنى بنجاح، bun install أعطى `Invalid symlink` في Turbopack). وتذكّر: `bun install --frozen-lockfile` هو ما يفعله CI على Ubuntu (سليم هناك) — لا تقارن نتائج lint المحلية بنتائج CI.

### 2.3 استنساخ المشروع وتشغيله

```bash
git clone https://github.com/tarikchouika/F-W-M-S.git ~/F-W-M-S
cd ~/F-W-M-S
cp .env.example .env   # ثم حرّر القيم (انظر §4)
npm install            # أو bun install
npx prisma generate
npx prisma migrate deploy        # تطبيق المخطط
npx prisma db seed               # بذور قواعد الأجور (عند توفرها)
npm run build && npm start       # أو وضع التطوير: npm run dev
```

> ملاحظات أداء الهاتف: A53 5G به 6–8GB RAM. ابنِ مرة واحدة (`next build`) وشغّل الإنتاج (`next start`) — أسرع وأخف من وضع التطوير المستمر. أغلق التطبيقات الثقيلة أثناء البناء.

### 2.4 الوصول من الشبكة المحلية

```bash
# اعرف عنوان الهاتف على Wi-Fi:
ip addr show wlan0    # خذ 192.168.x.x
# شغّل الخادم مستمعًا على كل الواجهات:
npm start -- -H 0.0.0.0 -p 3000
# من أي جهاز في نفس الشبكة: http://192.168.x.x:3000
```

**البنية العامة النهائية (منفّذة ومُختبَرة 2026-10-16 — العنوان: `https://fwms.tarikc.workers.dev`):**
```
ويب عام → Worker "fwms" (fwms.tarikc.workers.dev) → Workers VPC Service "fwms-app"
→ Cloudflare Tunnel "fwms-phone" → خادم Next.js على الهاتف (127.0.0.1:3000)
```
- **كل شيء على الحساب الرئيسي (tarikc) — مستقل تماماً.** حساب المشروع الآخر (dmgames-api) **ممنوع** استخدامه لأي مورد FWMS (قرار المالك 2026-10-16).
- المعرّفات: Tunnel `1176a92a-e56e-4f63-9509-16368effc0c9` | VPC Service `01a14655-e11f-74c1-8456-e1781ce1f967` (127.0.0.1:3000) | Worker `fwms` (الشيفرة في `infra/cloudflare/fwms-proxy/`).
- التشغيل: `bash infra/termux/run-tunnel.sh` (التوكن في `.env` → `CLOUDFLARE_TUNNEL_TOKEN` — لا يُرفع أبدًا)، ويُشغَّل تلقائيًا مع `infra/termux/start-server.sh`.
- `NEXTAUTH_URL` في `.env` = العنوان العام أعلاه (لا تغيّره بدون تغيير البوابة).
- **ممنوع فتح منافذ يدوية أو استخدام أدوات نفق عشوائية.** إعادة النشر: `npx wrangler deploy` داخل `infra/cloudflare/fwms-proxy/` (توكن الحساب الرئيسي + `CLOUDFLARE_ACCOUNT_ID`).

## 3. قواعد إدارة SQLite النافذة

1. **لا تعديل يدوي على القاعدة** (لا `sqlite3 db/custom.db "UPDATE ..."`) — كل تغيير بنية عبر `prisma migrate dev --name <وصف>` وكل بيانات عبر seeds أو التطبيق.
2. **الاستثناء الوحيد:** فحص القراءة (`SELECT`) للتشخيص والتحقق.
3. **حافظ على ترقيم migrations تصاعديًا ولا تعدّل migration سابقًا** بعد دفعه إلى GitHub.
4. الملف يعيش في `db/custom.db` (تطوير) — وفي الإنتاج على الهاتف ضع مسارًا مطلقًا آمنًا (§4).
5. **لا تحذف سجلات الحضور أو الأجور أبدًا** (SPEC §11.7) — الأرشفة/الإخفاء فقط.
6. المال: **أعداد صحيحة بالسنتيم** — الحقل `amountCents Int`. لا تستخدم Float/Decimal في SQLite أبدًا.
7. الأحداث الزمنية: UTC (`DateTime` الافتراضي في Prisma عبر SQLite نص ISO). العرض يهتم به التطبيق.

## 4. متغيرات البيئة (`.env` على الهاتف)

```env
DATABASE_URL="file:/home/../abs/path/db/fwms.db"   # مسار مطلق في وحدة تخزين الهاتف
AUTH_SECRET="<سلسلة عشوائية طويلة>"
NEXTAUTH_URL="http://192.168.x.x:3000"
# توكنات أخرى يمررها صاحب المشروع يدويًا فقط — لا ترفع .env إلى git أبدًا
```

توليد سر عشوائي: `openssl rand -base64 48`.

## 5. المخطط المعتمد (المرحلة 0–1)

المرجع النهائي: `prisma/schema.prisma` في المستودع (أنت مالكه — حرّره عبر migrations فقط). الكيانات القائمة:

- `PlatformOwner`, `Company`, `UserMembership` (عضوية مستخدم في شركة بدور)
- `User` (هوية واحدة، بلا company مباشرة — العضوية هي الرابط)
- `AccountantGrant` (منح المحاسب الخارجي بتاريخ بداية/نهاية)
- `AuditLog` (سجل التدقيق: من، فعل، كيان، قبل/بعد JSON نصي، السبب، IP)
- `CompanySettings` (منطقة زمنية، لغة، عملة)
- `VerificationPolicy` (هيكل سياسات التحقق للمستويات الثلاثة — SPEC §4.2)
- `PayRule` (هيكل قواعد الأجور بتاريخ سريان — §6 أدناه)

**الكيانات القادمة** (تُضاف مع المراحل 2+، راجع SPEC §5 للقائمة الكاملة): `branches`, `projects`, `sites` (lat/lng/radius — استخدم أعمدة `Float` + دالة مسافة في طبقة التطبيق؛ SQLite لا يملك PostGIS)، `worker_groups`, `shift_templates`, `shifts`, `attendance_events`, `pay_periods`, `payslips`, `payslip_lines`, `employee_dependents`, `pay_components`, `generated_documents`, `pay_regimes`, `declaration_specs`, `declarations`, `holidays`, `ledger_entries`, `adjustments`, `devices`, `notifications`.

> ⚠️ ملاحظة PostGIS: في PostgreSQL لاحقًا نستخدم PostGIS + فهارس GiST (SPEC §5). في SQLite: خزّن `latitude/longitude/radiusMeters` كأعمدة، واحسب المسافة (Haversine) في طبقة التطبيق (`src/lib/` — اطلبها من المساعد الأول عبر WORKLOG).

## 6. بذور قواعد الأجور المغربية (أولوية عالية — أول تسليم لك)

أنشئ `prisma/seeds/pay-rules.ts` يجعل الجدول `PayRule` يحمل **سطرًا لكل قيمة** بالحقول: `key`, `value` (نص أو Int بالسنتيم), `unit`, `effectiveFrom`, `source`, `verifiedBy`, `verifiedAt`, `companyId` (null = عام للمنصة).

القيم من SPEC §11 (سارية 2025–2026):

| key | القيمة | effectiveFrom | source |
|---|---|---|---|
| `smig.hourly` | 1792 (سنتيم/ساعة) | 2026-01-01 | المرسوم 2.25.983 |
| `smag.daily` | 9744 (سنتيم/يوم) | 2026-04-01 | — |
| `work.weekly_hours` | 44 | (قائم) | مدونة الشغل 65-99 |
| `work.daily_max` | 10 | (قائم) | — |
| `ot.day_normal` | 25 (%) | (قائم) | المادة 201 |
| `ot.night_normal` | 50 (%) | (قائم) | — |
| `ot.day_rest` | 50 (%) | (قائم) | — |
| `ot.night_rest` | 100 (%) | (قائم) | — |
| `night.start` | "21:00" | (قائم) | — |
| `night.end` | "06:00" | (قائم) | — |
| `cnss.employee.short` | 0.52 (%) | 2025-01-01 | تعميم CNSS |
| `cnss.employee.long` | 3.96 (%) | 2025-01-01 | — |
| `cnss.employee.ceiling` | 600000 (سنتيم) | 2025-01-01 | — |
| `amo.employee` | 2.26 (%) | 2025-01-01 | — |
| `cnss.employer.prest_short` | 1.05 (%) | 2025-01-01 | — |
| `cnss.employer.prest_long` | 7.93 (%) | 2025-01-01 | — |
| `cnss.employer.family` | 6.40 (%) | 2025-01-01 | — |
| `cnss.employer.amo` | 4.11 (%) | 2025-01-01 | — |
| `cnss.employer.tfp` | 1.60 (%) | 2025-01-01 | — |
| `ir.brackets` | JSON نصي بالشرائح الست (SPEC §11.6) | 2026-01-01 | قانون المالية 2026 |
| `ir.family_deduction` | 5000 (سنتيم/شخص/شهر) | 2026-01-01 | — |
| `pro.rate_35_limit` | 650000 (سنتيم شهري) | (قائم) | — |
| `pro.cap_35` | 250000 (سنتيم شهري) | (قائم) | — |
| `pro.rate_25_cap` | 291667 (سنتيم شهري) | (قائم) | — |

**ملاحظات إلزامية:**
- النسب: خزّنها مضروبة في 10000 كـ Int (مثال 4.48% → 44800) لتجنب الفواصل العائمة، أو نصًا يحلَّل في التطبيق — اختر **Int بالأساس 10000** ووثّقه في `KNOWLEDGE_BASE`. **(مُنفَّذ: وحدة `basis_points`.)**
- كل سطر يحمل `verifiedBy: null` حتى يراجعه المحاسب — التطبيق يعرضها ك «غير مؤكدة من محاسب». **(مُنفَّذ.)**
- لا تخترع قيمًا ليست في SPEC؛ ما نص SPEC على خلاف فيه → سجّله في KNOWLEDGE_BASE كمسألة مفتوحة.

**الاتفاقيات المُوثَّقة عند التنفيذ الفعلي (2026-10-16):**
- القيم «القائمة» بلا تاريخ معلن في الجدول أعلاه تأخذ `effectiveFrom=2025-01-01` (بداية النطاق المرجعي 2025–2026) — قابلة للتعديل بسطر جديد بتاريخ سريان أحدث.
- `ir.brackets` JSON داخل `valueText` بحقول: `brackets[].{upToMonthlyCents, rateBp, deductMonthlyCents, upToAnnualCents, deductAnnualCents}` (+ `note` و`currency`) — اقرأه كما هو ولا تعدّ صيغته بلا تحديث هذا الدليل.
- الملف المنفَّذ: `prisma/seeds/pay-rules.ts` (24 قاعدة، idempotent) — موصول بـ `prisma/seeds/seed.ts`.
- لم تُزرع أرقام مسار SMAG الإضافية (8س يوميًا/2496 سنويًا/ليل 05:00–20:00/26 يوم أساس شهري — SPEC §12) لأن الوحدات المقننة لا تشمل `days` — تُضاف عند بناء محرّك المسارات (المرحلة 6) بقرار مع المحاسب.

## 7. النسخ الاحتياطي والاستعادة (مُلزم قبل أول تشغيل إنتاجي) — ✅ مُفعّل ومُختبَر 2026-10-16

سكربتات جاهزة (مالكها أنت — لا تكتبها من جديد):
- **`infra/termux/backup-db.sh`**: نسخ آمن عبر SQLite Backup API (`.backup`) + فحص إلزامي (`PRAGMA quick_check` + عدّ الجداول مقابل القاعدة) + دوران: 7 يومية + 4 أسبوعية + 6 شهرية (يُصنَّف تلقائيًا حسب يوم التشغيل: الأحد=weekly، اليوم الأول=monthly).
- **`infra/termux/restore-db-test.sh [نسخة]`**: اختبار استعادة فعلي — يستعيد أحدث نسخة إلى ملف مؤقت، يطابق كل جدول بسطره، ويقرأ عينات فعلية. **شغّله أسبوعيًا وسجّل ناتجه.**
- `infra/termux/backup.sh` غلاف توافق للسكربت القديم.

**الجدولة (منفّذة فعليًا):**
```bash
# crontab -l — يومي 03:15 مع flock (منع التداخل):
15 3 * * * /usr/bin/flock -n /root/HRMP/db/backups/.backup.lock /root/HRMP/infra/termux/backup-db.sh >> /root/HRMP/db/backups/backup.log 2>&1
# cron يُشغَّل داخل Ubuntu: service cron start (يضيفه start-server.sh تلقائيًا)
```

- الملفات في `db/backups/` (متجاهَلة في git — لا ترفع نسخة أبدًا).
- نسخة خارج الجهاز (اختياري): `rclone` إلى تخزين سحابي يعتمده صاحب المشروع.
- ملاحظة بيئة هذه: بناء sqlite3 هنا بلا dot-command `.quick_check` — استعمل `PRAGMA quick_check;` (موثّق في KNOWLEDGE_BASE §9).

## 8. محظوراتك المطلقة

1. ❌ رفع `.env` أو `db/**` أو أي توكن إلى GitHub.
2. ❌ تعديل مخطط بلا migration موثّق، أو كتابة أرقام الأجور في الكود.
3. ❌ حذف بيانات حضور/أجور، أو تعديل `docs/SPEC.md`.
4. ❌ تفعيل أي ميزة بيومترية (`face`) — قرار مالك فقط (SPEC §4.2).
5. ❌ تخطي تحديث `CHANGELOG.md`/`docs/WORKLOG.md` مع كل push.
6. ❌ تشغيل الخادم على منفذ مكشوف للإنترنت العام بدون Tunnel معتمد.

## 9. أوامرك اليومية السريعة

> **مسار 2026-10-24:** نُقل المجلد `/root/F-W-M-S` → `/root/HRMP`. أي `DATABASE_URL` مطلق في `.env` **يجب** أن يتبع المسار الجديد (`file:/root/HRMP/db/fwms.db`)؛ وإلا أنشأ Prisma قاعدة فارغة في المسار القديم عند أول تشغيل (حدث فعلًا وعُولج).

```bash
cd /root/HRMP && git pull --ff-only origin main
npx prisma migrate deploy      # تطبيق migrations جديدة
npx prisma db seed            # البذور (تشمل pay_rules — prisma/seeds/pay-rules.ts)
bash infra/termux/start-server.sh   # wake-lock + cron + النفق + الخادم (كله في واحد)
bash infra/termux/backup-db.sh      # نسخة يدوية عند الحاجة (والنسخة اليومية عبر cron 03:15)
```

- **التشغيل المستمر:** `start-server.sh` (لا حاجة لـ pm2 — nohup كافٍ هنا) + `termux-wake-lock` إلزامي (يضيفه السكربت).
- سجلات: `db/backups/backup.log` (النسخ) و`db/tunnel.log` (النفق).

### 9.1 — إنشاء migration عندما يصل تغيير المخطط من الخارج (مستخلصة 2026-10-16)

عندما يحدّث المساعد الأول `prisma/schema.prisma` في التزامه (ملكيتك للمخطط تبقى هنا)، لا تكتفِ بـ `db push` — أنشئ migration موثّقة بالترتيب:

```bash
npx prisma migrate diff --from-migrations ./prisma/migrations --to-schema-datamodel ./prisma/schema.prisma --script > /tmp/new.sql
# راجع /tmp/new.sql (الجداول/FK/الفهارس)، ثم:
mkdir -p prisma/migrations/<YYYYMMDDHHMMSS>_<اسم_المرحلة>/
cp /tmp/new.sql prisma/migrations/<المجلد_الجديد>/migration.sql
npx prisma migrate deploy && npx prisma migrate status
```

- **لماذا diff وليس نسخًا يدويًا:** المولّد يلتزم تلقائيًا باصطلاحات المخطط (RESTRICT للإلزامية، SET NULL للاختيارية، تسمية الفهارس) — بلا خطأ إملائي.
- **تحقق إلزامي بعد التطبيق:** `PRAGMA integrity_check;` = ok، و`PRAGMA foreign_key_check;` = صفر انتهاك، و`SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NULL;` = صفر، و`PRAGMA table_info(<الجدول_الجديد>);` ليطابق المخطط.
- **قبل أي migration:** نسخة يدوية عبر `bash infra/termux/backup-db.sh` (يشهد بها سجل النسخ).

## 10. معايير قبول مهمتك الأولى (تُقيّم بها) — حالة 2026-10-16

- [x] بيئة Ubuntu تعمل مع Node 22 وSQLite (هنا PRoot Ubuntu 26.04 + Node v22.23 + sqlite3 3.46.1 + bun 1.4.3).
- [x] التطبيق يعمل محليًا و`/api/health` يرجع `{"status":"ok","database":"ok"}` (من الهاتف نفسه؛ اختبار جهاز آخر بالشبكة يبقى عند توفّره).
- [x] `prisma migrate deploy`/`migrate dev` ينفّذ كل migrations بلا خطأ (migration أساسي واحد = 13 جدولاً).
- [x] seeds قواعد الأجور محمّلة: **24 قاعدة** بتواريخ سريان ومصادر + JSON الشرائح الستة.
- [x] نسخة احتياطية آمنة (cron 03:15 + flock) + استعادة مُختبَرة موثّقة (13 جدولاً مطابقًا سطرًا بسطر).
- [x] `termux-wake-lock` + تشغيل مستمر عبر `start-server.sh` (wake-lock + cron + نفق + خادم).
- [x] تحديث CHANGELOG + WORKLOG + KNOWLEDGE_BASE + دفعة إلى GitHub.
