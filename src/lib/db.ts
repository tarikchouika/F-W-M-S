import { PrismaClient } from '@prisma/client'
import { existsSync, copyFileSync, renameSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// ─────────────────────────────────────────────────────────────────────────────
// معاينة سحابية مؤقتة (Vercel) — docs/DEPLOYMENT.md §2
// ─────────────────────────────────────────────────────────────────────────────
// المشكلة التي يعالجها هذا البلوك (بلاغ المالك 2026-10-18 «لا أستطيع تسجيل الدخول»):
// نشر Vercel كان بلا قاعدة بيانات فعلية — `file:` بلا ملف، أو `DATABASE_URL` غير مضبوط
// أصلًا — فيفشل كل استعلام (health: database:error، وصفحة /login ترمي 500 لأنها تلمس
// القاعدة عبر getSession/getPlatformBranding).
//
// الحل (SPEC §7 «كود واحد، والفرق في الإعدادات فقط» + DEPLOYMENT.md «SQLite مؤقت
// لكل نشر معاينة»): لقطة قاعدة جاهزة (مخطط + بذور العرض الكاملة) تُرفع مع المستودع
// في `infra/vercel/preview.db` وتُضمَّن في تتبع البناء (next.config.ts)، ثم عند
// الإقلاع تُنسخ إلى /tmp (نظام ملفات Vercel الوحيد القابل للكتابة) إن لم تكن
// نسخة موجودة، ويُوجَّه DATABASE_URL إليها.
//
// حدود النطاق الصارمة (حفاظًا على المكتسبات — لا سلوك جديد خارج Vercel):
//   1) يعمل حصرًا عندما VERCEL=1 — الهاتف (الإنتاج الحقيقي) والتطوير السحابي لا
//      يغيّران سلوكهما قيد أنملة (يبقى الفشل الصريح الموثَّق في الدروس هو المرجع).
//   2) لا يمسّ أي URL لقاعدة سحابية حقيقية (Turso/Postgres...) — قرار المالك عند
//      اعتماد الإنتاج السحابي يظل بابًا مفتوحًا بلا أي تعارض.
//   3) لا يمسّ `file:` موجودًا فعلًا على القرص (ضبط يدوي صالح يظل محترمًا).
//   4) البيانات مؤقتة لكل «نسخة مثيل» (instance) — تُصفَّر مع كل نشر جديد؛ هذا هو
//      عقد «معاينة» المعلن في DEPLOYMENT.md، والبيانات الحقيقية تبقى في الهاتف.
const PREVIEW_SNAPSHOT_REL = 'infra/vercel/preview.db'
const PREVIEW_RUNTIME_NAME = 'fwms-preview.db'
let previewNoticePrinted = false

function bootstrapServerlessPreview(): void {
  if (process.env.VERCEL !== '1') return
  const raw = (process.env.DATABASE_URL ?? '').trim()
  if (raw && !raw.startsWith('file:')) return // قاعدة سحابية حقيقية — خارج النطاق
  if (raw.startsWith('file:')) {
    const p = raw.slice('file:'.length)
    if (p && existsSync(p)) return // ملف موجود فعلًا — ضبط صالح، لا نلمسه
  }
  const snapshot = join(process.cwd(), PREVIEW_SNAPSHOT_REL)
  if (!existsSync(snapshot)) {
    console.warn(
      '[FWMS][preview] DATABASE_URL غير صالحة على هذا النشر ولا توجد لقطة معاينة ' +
        `(infra/vercel/preview.db) — أعد توليدها بـ scripts/regen-preview-db.sh`,
    )
    return
  }
  // النسخ الذرّي (بلاغ المالك 2026-10-19 «صفحة خطأ عند تسجيل الدخول» —
  // Application error: a server-side exception + Digest): copyFileSync المباشر إلى
  // الاسم النهائي غير ذرّي — عند إقلاع بارد متوازٍ (عدة lambdas تحمل الصفحات معًا
  // بعد نشر جديد) ترى lambda ثانية existsSync=target صحيحًا والملف منسوخ نصفه فقط
  // (733KB تستغرق لحظاتًا قابلة للسباق) فيفتح Prisma صورة قاعدة تالفة ويرمي —
  // وصفحة /login تلمس القاعدة خلال SSR (getSession/getPlatformBranding) فتنهار
  // كلها وتظهر صفحة «Application error…» الإنجليزية للمستخدم.
  // العلاج: النسخ إلى اسم مؤقت فريد (PID+زمن+عشوائية) ثم renameSync — الـ rename
  // على نفس نظام الملفات ذرّي، فلا يظهر الاسم النهائي للقرّاء إلا مكتملًا تمامًا؛
  // وتكرار النسخ المتوازي بلا ضرر (الفائز الأخير يبقى وكل النسخ سليمة).
  const target = join(tmpdir(), PREVIEW_RUNTIME_NAME)
  try {
    if (existsSync(target)) {
      // مع النسخ الذرّي: وجود الهدف = جاء عبر rename = مكتمل 100% — استعمله كما هو
    } else {
      const stamp = `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      const tmpPath = `${target}.${stamp}.tmp`
      copyFileSync(snapshot, tmpPath)
      try {
        renameSync(tmpPath, target) // ذرّي — لحظة الظهور = لحظة الاكتمال
      } catch {
        // سبقنا إليه فائز آخر بـ rename — نسخته مكتملة بالضرورة؛ نحذف نسختنا الفائضة
        try { rmSync(tmpPath, { force: true }) } catch { /* يتيمة بلا ضرر */ }
      }
    }
    process.env.DATABASE_URL = `file:${target}`
    if (!previewNoticePrinted) {
      previewNoticePrinted = true
      console.warn(
        `[FWMS][preview] قاعدة معاينة مؤقتة من لقطة المستودع → ${target} ` +
          '(بيانات عرض مؤقتة تُصفَّر مع النشر — الإنتاج الحقيقي على الخادم المحلي بـ DATABASE_URL خاصة)',
      )
    }
  } catch (e) {
    console.warn('[FWMS][preview] فشل تجهيز قاعدة المعاينة:', e)
  }
}

bootstrapServerlessPreview()

// ─────────────────────────────────────────────────────────────────────────────
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    // لوغ الاستعلامات للتطوير فقط — إيقافه في الإنتاج وفرُ أداء حقيقي على الخادم
    // المحلي الصغير (كل استعلام كان يُطبع بلا استثناء — المرحلة 8: تحسين الأداء SPEC §8)
    log: process.env.NODE_ENV === 'production' ? ['error'] : ['query'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
