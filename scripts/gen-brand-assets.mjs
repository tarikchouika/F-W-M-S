// FWMS — توليد أصول الهوية البصرية من اللوغو الجديد (2026-10-21)
// المصدر: public/brand/logo-source.jpg (اللوغو المعتمد من المالك — 1024×1024)
//
// المخرجات:
//   public/brand/logo-square.png  — اللوغو كاملًا (خلفية كحلية + علامة ذهبية) للهيدر والفوتر والشريط الجانبي
//   public/brand/logo-mark.png     — العلامة الذهبية بخلفية شفافة (العلامة المائية والزخرفة)
//   public/brand/logo-watermark.png— نسخة العلامة المائية (نفس الأصل،قياس 1200)
//   public/icons/favicon-32.png · icon-192.png · icon-512.png · apple-touch-icon.png
//   public/icons/maskable-512.png  — نسخة maskable (هامش آمن 20%)
//   public/favicon.ico             — ICO متعدد المقاسات (32/48) ببيانات PNG
//
// التشغيل: node scripts/gen-brand-assets.mjs
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const BRAND = path.join(ROOT, "public", "brand");
const ICONS = path.join(ROOT, "public", "icons");
const SRC = path.join(BRAND, "logo-source.jpg");

const sharp = (await import("sharp")).default;

/** يبني قناة ألفا من الإضاءة: الخلفية الكحلية تصبح شفافة والذهب يبقى */
async function goldMark(size) {
  const src = await sharp(SRC).resize(size, size, { fit: "cover" }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { data, info } = src;
  const ch = info.channels;
  const out = Buffer.alloc(size * size);
  const rgbOut = Buffer.alloc(size * size * 3);
  // عتبات الفصل: الكحلية L<0.22 · الذهب L>0.42 (تُعاير بالقياس الفعلي أدناه)
  const LO = 0.22, HI = 0.42;
  // تدرّج ذهبي نظيف يُعاد رسمه فوق Relief الأصلي (داكن ← فاتح) — ذهب شعار، لا صورة رمادية
  const DARK = [122, 84, 26];
  const LIGHT = [252, 226, 158];
  for (let i = 0; i < size * size; i++) {
    const r = data[i * ch] / 255, g = data[i * ch + 1] / 255, b = data[i * ch + 2] / 255;
    const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    let a = (l - LO) / (HI - LO);
    a = a < 0 ? 0 : a > 1 ? 1 : a;
    a = a * a * (3 - 2 * a); // smoothstep — حافّة ناعمة بلا حبيبات
    out[i] = Math.round(a * 255);
    // تدرّج على أساس الإضاءة الأصلية (يحفظ Relief ويوحّد اللون)
    // العيار الفعلي: ذهب الشعار p10=0.365 · p50=0.631 · p90=0.907 ⇒ النطاق 0.34→0.95
    let t = (l - 0.34) / (0.95 - 0.34);
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    t = t * t * (3 - 2 * t);
    rgbOut[i * 3] = Math.round(DARK[0] + (LIGHT[0] - DARK[0]) * t);
    rgbOut[i * 3 + 1] = Math.round(DARK[1] + (LIGHT[1] - DARK[1]) * t);
    rgbOut[i * 3 + 2] = Math.round(DARK[2] + (LIGHT[2] - DARK[2]) * t);
  }
  return sharp(rgbOut, { raw: { width: size, height: size, channels: 3 } })
    .joinChannel(out, { raw: { width: size, height: size, channels: 1 } })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

/** ICO ببيانات PNG مضمّنة (Vista+) */
function buildIco(entries) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type = icon
  header.writeUInt16LE(entries.length, 4);
  let offset = 6 + entries.length * 16;
  const dir = [];
  for (const e of entries) {
    const d = Buffer.alloc(16);
    d.writeUInt8(e.size >= 256 ? 0 : e.size, 0);
    d.writeUInt8(e.size >= 256 ? 0 : e.size, 1);
    d.writeUInt8(0, 2); // colors in palette
    d.writeUInt8(0, 3);
    d.writeUInt16LE(1, 4); // color planes
    d.writeUInt16LE(32, 6); // bits per pixel
    d.writeUInt32LE(e.data.length, 8);
    d.writeUInt32LE(offset, 12);
    offset += e.data.length;
    dir.push(d);
  }
  return Buffer.concat([header, ...dir, ...entries.map((e) => e.data)]);
}

async function main() {
  if (!existsSync(SRC)) {
    console.error(`✗ المصدر غير موجود: ${SRC}`);
    process.exit(1);
  }
  await mkdir(BRAND, { recursive: true });
  await mkdir(ICONS, { recursive: true });

  // 1) اللوغو كاملًا (خلفية كحلية) — JPEG للويب والوثائق (pdfkit/docx لا يقبلان WebP)
  const square = await sharp(SRC).resize(1024, 1024, { fit: "cover" }).jpeg({ quality: 88, mozjpeg: true }).toBuffer();
  await writeFile(path.join(BRAND, "logo-square.jpg"), square);
  //    نسخة WebP خفيفة للواجهة (اللوغو يظهر بـ32–96px ⇒ 128px تكفي لكل الشاشات)
  await writeFile(path.join(BRAND, "logo-square-128.webp"), await sharp(SRC).resize(128, 128, { fit: "cover" }).webp({ quality: 86 }).toBuffer());
  await writeFile(path.join(BRAND, "logo-square-256.webp"), await sharp(SRC).resize(256, 256, { fit: "cover" }).webp({ quality: 88 }).toBuffer());

  // 2) العلامة الذهبية الشفافة
  //    - PNG 512: يُستعمل في شريط هوية الـPDF (pdfkit يقبل PNG/JPEG فقط)
  const markPng = await goldMark(512);
  await writeFile(path.join(BRAND, "logo-mark.png"), markPng);
  //    - WebP: أخفّ للويب (العلامة داخل الواجهة)
  const markWebp = await sharp(markPng).webp({ quality: 88, alphaQuality: 90 }).toBuffer();
  await writeFile(path.join(BRAND, "logo-mark.webp"), markWebp);
  //    - العلامة المائية: WebP كبير (العلامة المائية تُعرض بمئات البكسل)
  const watermark = await sharp(await goldMark(1200)).webp({ quality: 76, alphaQuality: 80 }).toBuffer();
  await writeFile(path.join(BRAND, "logo-watermark.webp"), watermark);

  // 3) الأيقونات من اللوغو الكامل (الكحلية تبقى خلفية الأيقونة)
  //    PNG بلوحة ألوان (palette) — الخلفية ذات النسيج الفوتوغرافي لا تُضغط كـRGBA
  const icon = async (size, palette = true) =>
    sharp(SRC)
      .resize(size, size, { fit: "cover" })
      .png(palette ? { palette: true, colours: 256, quality: 92, compressionLevel: 9 } : { compressionLevel: 9 })
      .toBuffer();
  await writeFile(path.join(ICONS, "favicon-32.png"), await icon(32));
  await writeFile(path.join(ICONS, "favicon-512.png"), await icon(64));
  await writeFile(path.join(ICONS, "icon-192.png"), await icon(192));
  await writeFile(path.join(ICONS, "icon-512.png"), await icon(512));
  await writeFile(path.join(ICONS, "apple-touch-icon.png"), await icon(180));
  // maskable: هامش آمن 20% (الخلفية الكحلية تملأ المربّع)
  const maskable = await sharp({
    create: { width: 512, height: 512, channels: 3, background: { r: 11, g: 27, b: 51 } },
  })
    .composite([{ input: await sharp(SRC).resize(410, 410, { fit: "cover" }).png({ palette: true, colours: 256, quality: 92 }).toBuffer(), top: 51, left: 51 }])
    .png({ palette: true, colours: 256, quality: 92, compressionLevel: 9 })
    .toBuffer();
  await writeFile(path.join(ICONS, "maskable-512.png"), maskable);

  // 4) favicon.ico (32 + 48)
  const ico = buildIco([
    { size: 32, data: await icon(32) },
    { size: 48, data: await icon(48) },
  ]);
  await writeFile(path.join(ROOT, "public", "favicon.ico"), ico);

  console.log("✔ assets generated");
  for (const f of [
    "public/brand/logo-square.jpg",
    "public/brand/logo-square-128.webp",
    "public/brand/logo-square-256.webp",
    "public/brand/logo-mark.png",
    "public/brand/logo-mark.webp",
    "public/brand/logo-watermark.webp",
    "public/icons/favicon-32.png",
    "public/icons/icon-192.png",
    "public/icons/icon-512.png",
    "public/icons/apple-touch-icon.png",
    "public/icons/maskable-512.png",
    "public/favicon.ico",
  ]) {
    const { size } = await import("node:fs").then((fs) => fs.statSync(path.join(ROOT, f)));
    console.log(`  ${f} — ${size}B`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
