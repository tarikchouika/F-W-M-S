// HRMP — الخطوط المضمّنة للتقارير (SPEC §4.4.1: «خطوط عربية مضمّنة» — Noto Naskh Arabic)
// الخطوط تسكن public/fonts (OFL) فتصل الخادمَين: dev (جذر المشروع) و standalone (يُنسخ public إليه)
// وقواعد بيانات Termux/Vercel معًا — بلا اعتماد على خطوط النظام إطلاقًا في PDF/DOCX
import { join } from "node:path";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";

let fontconfigPrepared = false;

/** حل مسار مجلد الخطوط الفعلي — standalone يُشغَّل من .next/standalone لكن public يُنسخ إليه */
export function fontsDir(): string {
  const candidates = [
    join(process.cwd(), "public", "fonts"),
    join(process.cwd(), "..", "public", "fonts"), // تشغيل من .next/standalone بـ cwd مختلف
  ];
  for (const c of candidates) {
    if (existsSync(join(c, "NotoNaskhArabic-Regular.ttf"))) return c;
  }
  return candidates[0];
}

export const FONT_FILES = {
  naskhRegular: "NotoNaskhArabic-Regular.ttf",
  naskhBold: "NotoNaskhArabic-Bold.ttf",
  sansRegular: "NotoSans-Regular.ttf",
  sansBold: "NotoSans-Bold.ttf",
} as const;

/** عائلة الخط حسب اتجاه المستند: العربية Naskh، واللاتينية Noto Sans */
export function docFontFamily(language: string): string {
  return language === "ar" ? "Naskh" : "NotoSans";
}

/** قراءة ملف خط (لتضمينه في DOCX — يظهر سليمًا على أي جهاز) */
export async function readFont(file: string): Promise<Buffer> {
  return readFile(join(fontsDir(), file));
}

/**
 * تهيئة fontconfig لتوليد PNG عبر sharp/librsvg: ملف إعدادات يشير لمجلد خطوط المشروع
 * فقط — لا خطوط نظام. يجب استدعاؤها قبل أول استخدام لـ sharp (يُضبط المتغير قبل الاستيراد الديناميكي).
 * على بيئة بلا fontconfig (بعض serverless) يفشل PNG بلطف ويبقى PDF/DOCX سليمين (موثَّق).
 */
export async function ensureFontconfig(): Promise<boolean> {
  if (fontconfigPrepared) return true;
  try {
    const { writeFile, mkdir } = await import("node:fs/promises");
    const os = await import("node:os");
    const cacheDir = join(os.tmpdir(), "hrmp-fc-cache");
    await mkdir(cacheDir, { recursive: true });
    const confPath = join(os.tmpdir(), "hrmp-fonts.conf");
    const conf = `<?xml version="1.0"?>
<!DOCTYPE fontconfig SYSTEM "fonts.dtd">
<fontconfig>
  <dir>${fontsDir()}</dir>
  <cachedir>${cacheDir}</cachedir>
</fontconfig>`;
    await writeFile(confPath, conf, "utf8");
    process.env.FONTCONFIG_FILE = confPath;
    fontconfigPrepared = true;
    return true;
  } catch {
    return false;
  }
}
