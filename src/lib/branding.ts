// HRMP — هوية مالك المنصة (white-label — SPEC §3.2، المرحلة 8)
// المبدأ: «لا شيء مكتوب باسم المطوّر داخل الكود أو القوالب: الاسم والشعار وعناوين
// الاتصال وشروط الاستخدام وتذييل التقارير كلها إعدادات تخصيص» — كلها من كيان
// platform_owner في القاعدة، لا ثوابت في الكود. المصادقة عند العرض من الخادم دائمًا.
import { db } from "@/lib/db";

/** الهوية المعروضة في الواجهات والتذييلات — نسخة مسطّحة من كيان المالك */
export type PlatformBranding = {
  id: string;
  legalName: string;
  displayName: string;
  contactEmail: string | null;
  contactPhone: string | null;
  logoUrl: string | null;
  websiteUrl: string | null;
  termsUrl: string | null;
  footerText: string | null;
  defaultLocale: string;
  defaultCurrency: string;
  modulesJson: string | null;
  transferFreeze: boolean;
};

/** احتياط محايد إن لم يوجد كيان مالك (قاعدة فارغة قبل البذور) — اسم منتج لا اسم مطوّر */
const NEUTRAL_FALLBACK: PlatformBranding = {
  id: "",
  legalName: "HRMP Platform",
  displayName: "HRMP",
  contactEmail: null,
  contactPhone: null,
  logoUrl: null,
  websiteUrl: null,
  termsUrl: null,
  footerText: null,
  defaultLocale: "ar",
  defaultCurrency: "MAD",
  modulesJson: null,
  transferFreeze: false,
};

/**
 * تحميل هوية المالك الفعالة (كيان واحد — النقل يحدّث الصف نفسه فتبقى FK سليمة)
 *
 * محصّنة ضد فشل القاعدة (بلاغ المالك 2026-10-19 «صفحة خطأ عند تسجيل الدخول» —
 * Application error: a server-side exception): دالة عرضٍ هذه — فشل استعلامها
 * العابر (إقلاع بارد متوازٍ على Vercel مثلًا) لا يجوز أن يعطّل صفحات الدخول
 * واللوحات بأكملها؛ فالهوية المحايدة المتوقعة أصلًا لقاعدة فارغة هي نفسها
 * الاحتياط الطبيعي عند الفشل. الخطأ يُسجَّل للسجلات ويتابع كأي عطل تشغيلي.
 */
export async function getPlatformBranding(): Promise<PlatformBranding> {
  try {
    const owner = await db.platformOwner.findFirst({ orderBy: { createdAt: "asc" } });
    if (!owner) return { ...NEUTRAL_FALLBACK };
    return {
      id: owner.id,
      legalName: owner.legalName,
      displayName: owner.displayName,
      contactEmail: owner.contactEmail,
      contactPhone: owner.contactPhone,
      logoUrl: owner.logoUrl,
      websiteUrl: owner.websiteUrl,
      termsUrl: owner.termsUrl,
      footerText: owner.footerText,
      defaultLocale: owner.defaultLocale,
      defaultCurrency: owner.defaultCurrency,
      modulesJson: owner.modulesJson,
      transferFreeze: owner.transferFreeze,
    };
  } catch (e) {
    console.error("[HRMP][branding] فشل تحميل هوية المالك — الاحتياط المحايد:", e);
    return { ...NEUTRAL_FALLBACK };
  }
}

// ─── تفعيل/تعطيل الوحدات والمسارات بحسب المالك (SPEC §3.2) ────

/** مفاتيح الوحدات والمسارات القابلة للتعطيل — null/غياب المفتاح = مفعّل (الافتراضي الآمن) */
export const MODULE_KEYS = [
  "module.scheduling",
  "module.attendance",
  "module.coverage",
  "module.payroll",
  "module.declarations",
  "module.reports",
  "regime.general",
  "regime.agricultural",
  "regime.public_civil_service",
  "regime.public_entreprise",
] as const;
export type ModuleKey = (typeof MODULE_KEYS)[number];

export function isModuleKey(v: unknown): v is ModuleKey {
  return typeof v === "string" && (MODULE_KEYS as readonly string[]).includes(v);
}

/** تحليل modulesJson بأمان — أي خلل = الكل مفعّل (لا يُعطَّل شيء ببيانات تالفة) */
export function parseModules(json: string | null): Record<string, boolean> {
  if (!json) return {};
  try {
    const parsed = JSON.parse(json) as Record<string, unknown>;
    const out: Record<string, boolean> = {};
    for (const key of MODULE_KEYS) {
      const v = parsed[key];
      out[key] = v === undefined ? true : v === true;
    }
    return out;
  } catch {
    return {};
  }
}

export function isModuleEnabled(modules: Record<string, boolean>, key: ModuleKey): boolean {
  return modules[key] !== false;
}

/** تجميد التغييرات الإدارية أثناء نقل ملكية جارٍ (SPEC §3.2 خطوة 1) — من الخادم دائمًا */
export async function isPlatformFrozen(): Promise<boolean> {
  const owner = await db.platformOwner.findFirst({
    select: { transferFreeze: true },
    orderBy: { createdAt: "asc" },
  });
  return owner?.transferFreeze === true;
}
