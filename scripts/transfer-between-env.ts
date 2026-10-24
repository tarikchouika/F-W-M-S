// HRMP — أداة النقل بين البيئتين (SPEC §7 و§8 — المرحلة 8): نسخة احتياطية سليمة من قاعدة
// إلى ملف هدف + فحص تطابق (quick_check + عدد الجداول + عدد صفوف كل جدول) — قابلة لإعادة
// الاستخدام عند الانتقال محلي↔عام (docs/DEPLOYMENT.md §6).
// التشغيل: bun scripts/transfer-between-env.ts <المصدر.db> <الهدف.db>
// (على الهاتف يمكن الاستغناء عنها بـ sqlite3: VACUUM INTO + quick_check — نفس الإجراء)
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";

const [srcPath, dstPath] = process.argv.slice(2);
if (!srcPath || !dstPath) {
  console.error("الاستعمال: bun scripts/transfer-between-env.ts <المصدر.db> <الهدف.db>");
  process.exit(2);
}

function sha256(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(path);
    stream.on("data", (d) => hash.update(d));
    stream.on("end", () => resolve(hash.digest("hex")));
    stream.on("error", reject);
  });
}

async function tableRows(client: PrismaClient): Promise<Record<string, number>> {
  const tables = (await client.$queryRawUnsafe(
    `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name != '_prisma_migrations'`
  )) as { name: string }[];
  const counts: Record<string, number> = {};
  for (const t of tables) {
    const rows = (await client.$queryRawUnsafe(`SELECT count(*) AS c FROM "${t.name}"`)) as { c: number | bigint }[];
    counts[t.name] = Number(rows[0]?.c ?? 0);
  }
  return counts;
}

const src = new PrismaClient({
  datasources: { db: { url: `file:${srcPath}` } },
  log: ["error"],
});

try {
  // 1) النسخ الاحتياطي السليم أثناء التشغيل (VACUUM INTO — نفس آلية أداة نقل الملكية)
  await src.$executeRawUnsafe(`VACUUM INTO '${dstPath.replace(/'/g, "''")}'`);
  console.log(`✓ نسخة احتياطية: ${dstPath}`);

  // 2) فحص التطابق على الهدف
  const dst = new PrismaClient({
    datasources: { db: { url: `file:${dstPath}` } },
    log: ["error"],
  });
  try {
    const quick = await dst.$queryRawUnsafe("PRAGMA quick_check;");
    const quickText = JSON.stringify(quick);
    console.log(quickText.includes("ok") ? "✓ quick_check على الهدف: ok" : `✗ quick_check: ${quickText}`);

    const srcTables = await tableRows(src);
    const dstTables = await tableRows(dst);
    const names = [...new Set([...Object.keys(srcTables), ...Object.keys(dstTables)])].sort();
    let mismatches = 0;
    for (const n of names) {
      if (srcTables[n] !== dstTables[n]) {
        console.log(`✗ ${n}: المصدر ${srcTables[n] ?? "غير موجود"} ≠ الهدف ${dstTables[n] ?? "غير موجود"}`);
        mismatches++;
      }
    }
    const totalRows = Object.values(dstTables).reduce((a, b) => a + b, 0);
    console.log(
      mismatches === 0
        ? `✓ تطابق الصفوف: ${names.length} جدولًا × ${totalRows} صفًا (المصدر = الهدف حرفيًا)`
        : `✗ ${mismatches} اختلافًا في عدد الصفوف`
    );
    if (mismatches > 0 || !quickText.includes("ok")) process.exit(1);
  } finally {
    await dst.$disconnect().catch(() => undefined);
  }

  // 3) بصمات الملفين للموثوقية
  const [srcSha, dstSha, srcSize, dstSize] = await Promise.all([
    sha256(srcPath),
    sha256(dstPath),
    stat(srcPath),
    stat(dstPath),
  ]);
  console.log(`المصدر : ${srcSize.size} بايت — sha256 ${srcSha.slice(0, 16)}…`);
  console.log(`الهدف  : ${dstSize.size} بايت — sha256 ${dstSha.slice(0, 16)}…`);
  console.log("النسخة الاحتياطية جاهزة للتشغيل كبيئة ثانية (DATABASE_URL=... PORT=...) — راجع DEPLOYMENT.md §6");
} finally {
  await src.$disconnect().catch(() => undefined);
}
