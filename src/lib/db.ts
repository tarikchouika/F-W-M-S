import { PrismaClient } from '@prisma/client'
import { existsSync, copyFileSync } from 'node:fs'
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
  const target = join(tmpdir(), PREVIEW_RUNTIME_NAME)
  try {
    if (!existsSync(target)) copyFileSync(snapshot, target)
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
