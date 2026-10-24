// HRMP — عامل عرض المستندات (عملية ابنة تعمل بـ bun مباشرة)
// ⚠️ لماذا عملية ابنة؟ (درس جلسة المرحلة 7): داخل خادم dev تحل Turbopack الحزم الخارجية
// بظروف browser (yoga wasm + fontkit browser) فتنكسر العربية («font.unitsPerEm null»)
// بينما bun المباشر (الاختبارات المستقلة 3/3) يحمل بنية node الصحيحة.
// الإنتاج (الهاتف): يُشغَّل الخادم بـ bun — process.execPath = bun ✓.
// هذا الملف بلا أسماء '@/' المستعارة حصرًا — يُستدعى بـ:
//   bun src/lib/reports/render-worker.ts <job.json> <out.bin>
// يطبع نتيجة JSON على stdout: {ok:true,format,size} أو {ok:false,error}
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import type { AnyReportData, ReportLanguage, ReportOptions } from "./types";
import { renderReportPdf } from "./pdf";
import { renderReportDocx } from "./docx";
import { renderReportPng } from "./png";
import { renderReportCsv } from "./csv";

async function main() {
  const [jobPath, outPath] = process.argv.slice(2);
  if (!jobPath || !outPath) throw new Error("usage: render-worker.ts <job.json> <out.bin>");
  const job = JSON.parse(await readFile(jobPath, "utf8")) as {
    format: string;
    data: AnyReportData;
    language: ReportLanguage;
    options: ReportOptions;
    meta: {
      refNumber: string;
      contentHash: string;
      verifyUrl: string;
      generatedAt: string;
      generatedBy: string;
    };
  };

  const { format, data, language, options, meta } = job;
  let bytes: Uint8Array;
  if (format === "pdf") {
    bytes = await renderReportPdf(data, language, options, meta);
  } else if (format === "docx") {
    bytes = await renderReportDocx(data, language, options, meta);
  } else if (format === "png") {
    bytes = await renderReportPng(data, language, options, meta);
  } else if (format === "csv") {
    bytes = renderReportCsv(data, language, options, meta);
  } else {
    throw new Error(`worker_bad_format:${format}`);
  }

  await writeFile(outPath, bytes);
  const hash = createHash("sha256").update(bytes).digest("hex");
  process.stdout.write(JSON.stringify({ ok: true, format, size: bytes.byteLength, hash }));
}

main().catch((e) => {
  process.stdout.write(JSON.stringify({ ok: false, error: (e as Error).message ?? String(e) }));
  process.exit(1);
});
