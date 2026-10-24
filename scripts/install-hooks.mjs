#!/usr/bin/env node
// HRMP — تفعيل خطافات المستودع (تُستدعى من postinstall)
//
// لماذا عبر postinstall: `core.hooksPath` **إعداد محلي** لا يُرفع مع git، فإن
// اعتمدنا على ضبط يدوي يُنسى في كل نسخة جديدة وتعود المشكلة. ربطه بـpostinstall
// يجعل أي `bun install` (جهاز، نسخة، CI) يفعّله من تلقائه، و`core.hooksPath=.githooks`
// يجعل الخطافات نفسها **ملفوفة مُرفوعة** في_git_ لا في `.git/hooks` المهمَل.
//
// بلا استثناءات مؤذية: إن فشل ضبط الإعداد (حزمة بلا `.git` مثل CI الدفعية أو
// نسخة مضغوطة) يخرج 0 ولا يكسر التثبيت — الخطافات ميزة تكميلية لا شرط بناء.
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const HOOKS = join(ROOT, ".githooks", "pre-push");

if (!existsSync(HOOKS)) {
  console.log("⚠ .githooks/pre-push مفقود — لم يُفعَّل خطاف.");
  process.exit(0);
}

try {
  // `--get` على إعداد غير مضبوط يخرج برمز 1 — حالة شرعية لا خطأ، لذلك لا
  // نستخدم execFileSync الذي كان يرمي استثناءً ويُسكت الحارس قبل تفعيله.
  const probe = spawnSync("git", ["config", "--get", "core.hooksPath"], {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  const current = (probe.stdout ?? "").trim();

  if (current === ".githooks") {
    // صامت عند الإعادة — نجاح متكرر لا يُطبع
    process.exit(0);
  }

  execFileSync("git", ["config", "core.hooksPath", ".githooks"], {
    cwd: ROOT,
    stdio: "ignore",
  });
  console.log(
    `✓ فُعّل خطاف ما قبل الدفع (core.hooksPath=.githooks${current ? ` · كان ${current}` : " · كان غير مضبوط"}): بوابة جودة + منع force-push`,
  );
} catch {
  // لا مستودع git أو مرفوض الإعداد — لا يُفشل التثبيت
  process.exit(0);
}
