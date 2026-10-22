#!/usr/bin/env node
// FWMS — توليد أيقونات PWA (مستبدلة بالمُولِّد الجديد — 2026-10-21)
// السبب: اللوغو لم يعد SVG (logo.svg) بل صورة نقطية معتمدة (public/brand/logo-source.jpg).
// المُولِّد الفعلي الآن: scripts/gen-brand-assets.mjs (لوغو كامل + علامة شفافة + أيقونات + favicon.ico).
// هذا الملف يبقى كواجهة تشغيل مختصرة (npm run icons) والتفويض للمُولِّد الجديد.
import { spawnSync } from "node:child_process";
import path from "node:path";

const script = path.join(__dirname, "gen-brand-assets.mjs");
const res = spawnSync(process.execPath, [script], { stdio: "inherit" });
process.exit(res.status ?? 1);
