import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
import { dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 🔒 فحص أمني 2026-10-21: كان هذا المدخل عالميًا (بلا files) — و`eslint .` بعد أي
// بناء محلي يصطدم بـ`src/lib/reports/render-worker.cjs` (مُنتَج بناء مُتجاهَل في
// git يولّده compile-render-worker.mjs)؛ الملف لا يطابق نمط المدخل الذي يسجّل
// إضافة react-hooks (`js,jsx,mjs,ts,tsx,mts,cts` — بلا cjs) فيبقى مدخل القواعد
// هذا مطبّقًا عليه بلا تعريف الإضافة ⇒ «could not find plugin react-hooks».
// فشل كامن يتوقف على وجود مُنتَج البناء محليًا (لهذا تقلّب بين الجلسات/البيئات).
// العلاج المزدوج: (1) تجاهل المُنتَج صراحةً في lint — لا معنى لفحص 1.6MB مولّدة،
// (2) مطابقة نطاق هذا المدخل لنمط المدخل المسجّل للإضافات نفسه — لا تغيير سلوك
// (القواعد كلها قواعد كود أصلًا) وزوال الانهيار على أي ملف غير مطابق.
const eslintConfig = [...nextCoreWebVitals, ...nextTypescript, {
  files: ["**/*.{js,jsx,mjs,ts,tsx,mts,cts}"],
  rules: {
    // TypeScript rules
    "@typescript-eslint/no-explicit-any": "off",
    "@typescript-eslint/no-unused-vars": "off",
    "@typescript-eslint/no-non-null-assertion": "off",
    "@typescript-eslint/ban-ts-comment": "off",
    "@typescript-eslint/prefer-as-const": "off",
    "@typescript-eslint/no-unused-disable-directive": "off",
    
    // React rules
    "react-hooks/exhaustive-deps": "off",
    "react-hooks/purity": "off",
    // 2026-10-18 — تخفيف مُبرَّر إلى warn (قرار المالك بعد عرض الدليل):
    // القاعدة تُعلِّن خطأً على أي استدعاء لدالة تحتوي setState من effect، حتى لو وقعت
    // كل setState بعد await. أثبتنا تجريبيًا (ملف إثبات) أن:
    //   • `void load()` يفشل دائمًا مهما كان ترتيب العبارات
    //   • `void (async () => { await load(); })()` ينجح — وهو مطابق سلوكيًا تمامًا
    // أي إنها إعلان خاطئ على نمط جلب بيانات قياسي، لا خلل سلوكي حقيقي.
    // نُبقيها ظاهرة (warn) للتدقيق المستمر دون أن تُسدّ CI عند كل push.
    "react-hooks/set-state-in-effect": "warn",
    "react/no-unescaped-entities": "off",
    "react/display-name": "off",
    "react/prop-types": "off",
    "react-compiler/react-compiler": "off",
    
    // Next.js rules
    "@next/next/no-img-element": "off",
    "@next/next/no-html-link-for-pages": "off",
    
    // General JavaScript rules
    "prefer-const": "off",
    "no-unused-vars": "off",
    "no-console": "off",
    "no-debugger": "off",
    "no-empty": "off",
    "no-irregular-whitespace": "off",
    "no-case-declarations": "off",
    "no-fallthrough": "off",
    "no-mixed-spaces-and-tabs": "off",
    "no-redeclare": "off",
    "no-undef": "off",
    "no-unreachable": "off",
    "no-useless-escape": "off",
  },
}, {
  ignores: ["node_modules/**", ".next/**", "out/**", "build/**", "next-env.d.ts", "examples/**", "skills", "src/lib/reports/render-worker.cjs"]
}];

export default eslintConfig;
