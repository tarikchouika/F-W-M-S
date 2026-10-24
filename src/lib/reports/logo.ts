// HRMP — الشعار في صيغ PNG (للـDOCX) والعلامة المائية (للـPDF/PNG)
// المصدر (2026-10-21): اللوغو المعتمد من المالك — public/brand/logo-square.jpg
// والعلامة الذهبية الشفافة public/brand/logo-mark.png (تُولَّد بـscripts/gen-brand-assets.mjs).
// يُستعمل في ترويسة وثائق DOCX وPDF وPNG ليطابق الشعار المعروض في الواجهة.
// إن تعذّر التحويل (بيئة بلا sharp/librsvg) يُعيد null ⇒ الوثيقة تبقى سليمة
// بلا شعار (الفشل متسامح عمدًا — لا يُسقط الوثيقة).
import { join } from "node:path";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";

/** مسار ملف الشعار — standalone يعمل من .next/standalone لكن public يُنسخ إليه */
function resolveFirst(candidates: string[]): string {
  for (const c of candidates) if (existsSync(c)) return c;
  return candidates[0];
}

/** مسار اللوغو الكامل (أرضية كحلية + علامة ذهبية) */
export function logoPath(): string {
  return resolveFirst([
    join(process.cwd(), "public", "brand", "logo-square.jpg"),
    join(process.cwd(), "..", "public", "brand", "logo-square.jpg"),
    join(process.cwd(), "public", "logo.svg"),
    join(process.cwd(), "..", "public", "logo.svg"),
  ]);
}

/** مسار العلامة الذهبية الشفافة (تُرسم فوق شريط الهوية الكحلي) */
export function markPath(): string {
  return resolveFirst([
    join(process.cwd(), "public", "brand", "logo-mark.png"),
    join(process.cwd(), "..", "public", "brand", "logo-mark.png"),
  ]);
}

let cached: Buffer | null = null;

/** الشعار PNG بمقاس معيّن (مُخزَّن مؤقتًا لكل عملية توليد) */
export async function logoPng(size = 180): Promise<Buffer | null> {
  if (cached) return cached;
  try {
    const sharpModule = await import("sharp");
    const sharp = (sharpModule.default ?? sharpModule) as typeof import("sharp");
    const src = await readFile(logoPath());
    cached = await sharp(src, { density: 400 }).resize(size, size, { fit: "cover" }).png().toBuffer();
    return cached;
  } catch {
    return null;
  }
}

let cachedMark: Buffer | null | undefined;

/** العلامة المائية PNG (شفافة) — تُستعمل في شريط هوية PDF وPNG */
export async function markPng(): Promise<Buffer | null> {
  if (cachedMark !== undefined) return cachedMark;
  try {
    cachedMark = await readFile(markPath());
  } catch {
    cachedMark = null;
  }
  return cachedMark;
}
