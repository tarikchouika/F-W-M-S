#!/usr/bin/env node
// FWMS — توليد أيقونات PWA من logo.svg (sharp): 192/512 + favicon بديل PNG
// يعمل مرة واحدة عند تغيّر الشعار (استيراد ديناميكي داخل main — متوافق مع قواعد lint).

async function main() {
  const sharpModule = await import("sharp");
  const sharp = sharpModule.default ?? sharpModule;
  const fs = await import("node:fs");
  const path = await import("node:path");
  const SRC = path.join(__dirname, "..", "public", "logo.svg");
  const OUT_DIR = path.join(__dirname, "..", "public", "icons");
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const svg = fs.readFileSync(SRC);
  const jobs = [
    { name: "icon-192.png", size: 192 },
    { name: "icon-512.png", size: 512 },
    { name: "apple-touch-icon.png", size: 180 },
    { name: "favicon-512.png", size: 64 },
  ];
  for (const job of jobs) {
    await sharp(svg, { density: 384 })
      .resize(job.size, job.size, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 0 } })
      .png()
      .toFile(path.join(OUT_DIR, job.name));
    console.log("✓", job.name, job.size + "x" + job.size);
  }
  console.log("OK — public/icons");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
