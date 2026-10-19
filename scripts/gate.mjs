#!/usr/bin/env node
// FWMS — بوابة الجودة قبل الدفع (gate)
//
// لماذا وُجدت (علاج دائم لا يدوي):
//   1) استيراد ناقص (`ThemeSwitcher`) كان يمرّ إلى main ثم يسقط CI بعد الدفع —
//      الفحص كان موجودًا لكن **بعد** النشر، فالفائدة تحوّلت إلى إرسال كسر.
//   2) عدّاد التحذيرات كان يتحرّك صامتًا (34 ← 35) دون أن يمنعه أحد، فالتراجع
//      في الجودة لا يُلاحَظ إلا بمراجعة يدوية.
//   ⇒ هذه البوابة تجمع `lint` + `tsc` وتقاسهما على **ميزانية موثّقة**
//     (scripts/gate-baseline.json) وتخرج برمز فشل صريح، فيحبطها خطاف
//     .githooks/pre-push قبل أن يصل شيء إلى المستودع.
//
// لماذا هذا الشكل لا غيره:
//   * `lint` وحده لا يلتقط كل شيء و`tsc` وحده لا يلتقط التنبيهات — الاثنان معًا
//     هما ما كشف الخطأين أصلًا.
//   * الميزانية بدل «هل صفر؟» تسمح بتقدّم مشروع فيه ميزانية معروفة، وتمنع أي
//     ازدياد غير مقصود. رفعها يتم بتحرير ملف صريح داخل المستودع (بصمة git).
//
// الاستخدام:
//   bun run gate            # بوابة كاملة (lint + tsc)
//   bun run gate --quick    # lint فقط (أسرع — يُستعمل في خطاف commit إن لزم)
//   bun run gate --json     # مخرجات آلية
//
// الرموز: 0 = ناجحة · 1 = تجاوز ميزانية · 2 = تعذّر تشغيل أداة.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const QUICK = process.argv.includes("--quick");
const JSON_OUT = process.argv.includes("--json");

const baseline = JSON.parse(readFileSync(join(ROOT, "scripts/gate-baseline.json"), "utf8"));

/** ملفات هذه الدفعة (مقارنة بـorigin/main + ما هو غير مُثبت) — تُحسب مرّة واحدة */
const changed = changedPaths();

/** تشغيل أمر وإرجاع الخرج الخام + رمز الخروج (لا يرمي استثناء على فشل الفحص نفسه) */
function run(cmd, args) {
  const r = spawnSync(cmd, args, { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (r.error && r.error.code === "ENOENT") return { missing: true, out: "", code: 127, tail: "" };
  const out = `${r.stdout ?? ""}${r.stderr ?? ""}`;
  return { missing: false, out, code: r.status ?? 0, tail: out.split("\n").slice(-10).join("\n") };
}

/** `✖34 problems (0 errors, 34 warnings)` ← { problems, errors, warnings } */
function parseLint(out) {
  const m = out.match(/✖\s*(\d+)\s+problems?\s+\((\d+)\s+errors?,\s+(\d+)\s+warnings?\)/);
  if (m) return { problems: +m[1], errors: +m[2], warnings: +m[3] };
  // eslint يخرج صفر مشكلة بجملة مختلفة في بعض النسخ
  if (/^\s*$/m.test(out) && !/error|warning/.test(out)) return { problems: 0, errors: 0, warnings: 0 };
  return null;
}

/** سطور `path(line,col): error TSxxxx` */
function countTsc(out) {
  return out.split("\n").filter((l) => /error TS\d+/.test(l)).length;
}

/**
 * ملفات هذه الدفعة: كل ما تغيّر منذ `origin/main` (أي ما سيصل بالدفع) وما هو
 * غير مُثبت. لماذا هذا ضروري لا ترف: الخطاف يُشغَّل عند `pre-push` بعد أن يكون
 * الملف **مُثبتًا أصلًا** ⇒ `git status` وحده يكون فارغًا ويخفي الملف الجديد
 * داخلًا لسطور الخط الأساس. المقارنة بـ`origin/main` هي ما يُظهر «ما زاد فعلاً».
 */
function changedPaths() {
  const set = new Set();
  const absorb = (txt) => {
    for (const raw of txt.split("\n")) {
      const p = raw.replace(/^.. /, "").trim().split(" -> ").pop();
      if (p) set.add(p.replace(/^["']|["']$/g, ""));
    }
  };
  const probe = (args) => {
    const r = spawnSync("git", args, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    if ((r.status ?? 1) === 0 && r.stdout) absorb(r.stdout);
  };
  probe(["diff", "--name-only", "origin/main...HEAD"]);
  probe(["status", "--porcelain"]);
  return set;
}

/** تجميع مخرجات eslint: ملف ← العدد ← القواعد ← المواضع، مع تمييز ملفات الدفعة */
function lintFindings(out, changed) {
  const byFile = new Map();
  let file = "(عام)";
  let msg = "";
  for (const raw of out.split("\n")) {
    const head = raw.trim();
    // سطر عنوان ملف يسبق سطوره (eslint يفصله بسطر مستقل) ولا ينتهي بـ`:125:10`
    if (head && !/^\d+:\d+\s/.test(head) && /^[^\s].*\.(?:ts|tsx|js|mjs|cjs|jsx|css|json)$/.test(head)) {
      file = head.replace(`${ROOT}/`, "");
      continue;
    }
    const m = raw.match(/^\s*(\d+:\d+)\s+(error|warning)\s+(.*)$/);
    if (m) {
      msg = m[3].replace(/^Error:\s*/, "");
      const e = byFile.get(file) ?? { count: 0, rules: new Set(), lines: [], msgs: new Set() };
      e.count += 1;
      e.lines.push(m[1]);
      e.msgs.add(msg);
      byFile.set(file, e);
      continue;
    }
    // اسم القاعدة يأتي في نهاية إطار الكود وليس في سطر النتيجة
    const rule = head.match(/(?:^|\s)([\w@][\w-]*\/[\w-]+)$/);
    if (rule && byFile.get(file)) byFile.get(file).rules.add(rule[1]);
  }
  return [...byFile.entries()]
    .map(([path, e]) => ({
      path,
      count: e.count,
      rules: [...e.rules].join(", ") || "؟",
      lines: e.lines.join(" · "),
      msg: [...e.msgs][0] ?? "",
      isNew: changed.has(path),
    }))
    .sort((a, b) => Number(b.isNew) - Number(a.isNew) || a.path.localeCompare(b.path));
}

const results = [];
let fatal = null;

// ── 1) lint ──────────────────────────────────────────────────────────────────
const lint = run("bun", ["run", "lint"]);
if (lint.missing) fatal = "bun غير متاح في PATH";
const lintStats = parseLint(lint.out);
if (!lintStats && !lint.missing) fatal = fatal ?? "تعذّر قراءة مخرجات eslint";
results.push({
  name: "lint",
  metric: lintStats ? `${lintStats.errors} خطأ / ${lintStats.warnings} تحذيرًا` : "؟",
  limit: `${baseline.lintErrors} خطأ / ${baseline.lintWarnings} تحذيرًا`,
  over: lintStats ? lintStats.errors > baseline.lintErrors || lintStats.warnings > baseline.lintWarnings : true,
  under: lintStats ? lintStats.errors < baseline.lintErrors || lintStats.warnings < baseline.lintWarnings : false,
});

// ── 2) tsc (تخطّي في --quick) ────────────────────────────────────────────────
if (!QUICK) {
  const tsc = run("bunx", ["tsc", "--noEmit"]);
  if (tsc.missing) fatal = fatal ?? "bunx غير متاح في PATH";
  const n = countTsc(tsc.out);
  // عيّنة الأخطاء: أولًا ما يخص هذه الدفعة (ملفّات origin/main...HEAD) لأن آخر
  // أسطر خرج tsc تقع في `tests/` ولا علاقة لها بالتغيير المراد علاجه.
  const tscRows = tsc.out
    .split("\n")
    .filter((l) => /error TS\d+/.test(l))
    .map((l) => {
      const rel = l.trim().replace(`${ROOT}/`, "");
      const p = (rel.match(/^([^((]+)/) ?? [])[1]?.trim() ?? "";
      return { line: rel, isNew: changed.has(p) };
    });
  const freshTsc = tscRows.filter((x) => x.isNew);
  const samples = (freshTsc.length ? freshTsc : tscRows.slice(0, 8))
    .slice(0, 10)
    .map((x) => `${freshTsc.length ? "✱ " : ""}${x.line}`)
    .concat(freshTsc.length === 0 && tscRows.length > 8 ? ["… ولم يُعثر على خطأ مُصنَّف ضمن هذه الدفعة"] : []);
  results.push({
    name: "tsc",
    metric: `${n} خطأ`,
    limit: `${baseline.tscErrors} خطأ`,
    over: n > baseline.tscErrors,
    under: n < baseline.tscErrors,
    detail: n > baseline.tscErrors ? samples.join("\n") : tsc.code !== 0 && n === 0 ? tsc.tail : "",
  });
}

// ── الإخراج ─────────────────────────────────────────────────────────────────
const over = results.filter((r) => r.over);
const under = results.filter((r) => r.under);
const ok = !fatal && over.length === 0;

if (JSON_OUT) {
  console.log(JSON.stringify({ ok, fatal, results, baseline }, null, 2));
  process.exit(fatal ? 2 : ok ? 0 : 1);
}

console.log("═══ بوابة الجودة قبل الدفع ═══");
for (const r of results) {
  const mark = r.over ? "⛔" : r.under ? "⬇" : "✅";
  console.log(` ${mark} ${r.name.padEnd(6)} ${r.metric.padEnd(22)} (الميزانية: ${r.limit})`);
}

if (fatal) {
  console.log(`\n⛔ ${fatal}`);
  process.exit(2);
}

if (over.length) {
  console.log("\n⛔ تجاوز الميزانية — الدفع مرفوض قبل الوصول إلى main:");
  if (results.some((r) => r.name === "lint" && r.over)) {
    const rows = lintFindings(lint.out, changed);
    const fresh = rows.filter((r) => r.isNew).length;
    console.log(`\n  تفاصيل lint — ✱ = ضمن هذه الدفعة (${fresh} من ${rows.length} ملفًا):`);
    for (const r of rows) {
      const note = r.isNew && r.msg ? `  ← ${r.msg.slice(0, 74)}` : "";
      console.log(`    ${r.isNew ? "✱" : " "} ${String(r.count).padStart(2)} × ${r.path}  @ ${r.lines}  [${r.rules}]${note}`);
    }
    console.log("    (الصيغة الكاملة: bun run lint)");
  }
  for (const r of results.filter((x) => x.detail)) {
    console.log(`\n  ${r.name} — عيّنة من المخرجات (شغّل الأمر يدويًا للقائمة الكاملة):`);
    for (const l of r.detail.split("\n")) if (l.trim()) console.log(`    ${l.trim()}`);
  }
  console.log("\n  الخياران (بلا رفع صامت):");
  console.log("   (أ) أصلح المشكلة — هو المقصود غالبًا.");
  console.log("   (ب) إن كانت ميزانية مقصودة: حرّر scripts/gate-baseline.json بقرار صريح موثّق");
  console.log("       في قسم \"raised\" — يظهر التغيير في git ويُراجَع مع الالتزام.");
  process.exit(1);
}

if (under.length) {
  console.log("\n⬇ الأداء تحسّن عن الميزانية — اخفض الأرقام في gate-baseline.json لتعيق أي تراجع.");
}
console.log("\n✅ البوابة ناجحة — الدفع مسموح.");
process.exit(0);
