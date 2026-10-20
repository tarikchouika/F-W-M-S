// FWMS — الشعار في صيغ PNG (للـDOCX): SVG المصدر (public/logo.svg) ← sharp
// يُستعمل في ترويسة وثائق DOCX ليطابق الشعار المعروض في PDF والواجهة.
// إن تعذّر التحويل (بيئة بلا sharp/librsvg) يُعيد null ⇒ الوثيقة تبقى سليمة
// بلا شعار (الفشل متسامح عمدًا — لا يُسقط الوثيقة).
import { join } from "node:path";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";

/** مسار ملف الشعار — standalone يعمل من .next/standalone لكن public يُنسخ إليه */
export function logoPath(): string {
  const candidates = [
    join(process.cwd(), "public", "logo.svg"),
    join(process.cwd(), "..", "public", "logo.svg"),
  ];
  for (const c of candidates) if (existsSync(c)) return c;
  return candidates[0];
}

let cached: Buffer | null = null;

/** الشعار PNG بمقاس معيّن (مُخزَّن مؤقتًا لكل عملية توليد) */
export async function logoPng(size = 180): Promise<Buffer | null> {
  if (cached) return cached;
  try {
    const sharpModule = await import("sharp");
    const sharp = (sharpModule.default ?? sharpModule) as typeof import("sharp");
    const svg = await readFile(logoPath());
    cached = await sharp(svg, { density: 400 }).resize(size, size).png().toBuffer();
    return cached;
  } catch {
    return null;
  }
}
