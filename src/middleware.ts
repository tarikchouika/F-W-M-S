import { NextResponse, type NextRequest } from "next/server";

// FWMS — وسيط لغة الرابط (?lang=): SSR صحيح من الطلب الأول
// ---------------------------------------------------------------------------
// بلاغ المالك «خلل الترجمة» 2026-10-19 (الجولة الثالثة): /login?lang=fr كان
// يعرض نصًّا فرنسيًّا داخل <html lang="ar" dir="rtl"> — لأن الجذر (layout) يقرأ
// كوكي FWMS_LOCALE، والكوكي لا يُضبط إلا بعد إقلاع العميل (LangParamSync ←
// إجراء خادم ← router.refresh ⇒ وميض RTL أولًا + lang خاطئ لقارئات الشاشة).
// الوسيط يسبق الجميع: يعدّل كوكي الطلب نفسه فيرى الـSSR الجذري اللغة الصحيحة
// من أول بايت (html + metadata + مزوّد i18n دفعة واحدة) ويضبط الكوكي في
// الاستجابة للزيارات القادمة — بلا تحويل للرابط ولا وميض ولا refresh.
//
// LangParamSync (صفحة الدخول) يبقى شبكة أمان: مع هذا الوسيط يصبح no-op
// (لغة المزوّد = لغة الرابط من أول رندر) لكن يُبقى للتراجع الآمن إن عُدّل
// النطاق مستقبلًا.
//
// نمط «تعديل كوكي الطلب» هو النمط الموثّق لـNext 16: request.cookies.set
// يحدّث ترويسة الطلب فعليًا، وNextResponse.next({ request: { headers } })
// يمرّرها إلى الخادم (x-middleware-request-*) — راجع spec-extension/response.js.

const LOCALES = ["ar", "fr", "en", "es"] as const;
const LOCALE_COOKIE = "FWMS_LOCALE";

export function middleware(request: NextRequest) {
  const lang = request.nextUrl.searchParams.get("lang");
  // لا معامل أو قيمة غير معروفة ⇒ لا شيء (resolveLocale يتكفل بالاحتياط)
  if (!lang || !(LOCALES as readonly string[]).includes(lang)) {
    return NextResponse.next();
  }
  // الكوكي محدَّث أصلًا لهذه اللغة؟ (الحالة الشائعة بعد أول زيارة) — تجاوز
  if (request.cookies.get(LOCALE_COOKIE)?.value === lang) {
    return NextResponse.next();
  }

  // (1) اجعل الـSSR يرى اللغة من هذا الطلب نفسه (html lang/dir + metadata + المزوّد)
  request.cookies.set(LOCALE_COOKIE, lang);
  const response = NextResponse.next({ request: { headers: request.headers } });

  // (2) اضبط الكوكي في الاستجابة للزيارات القادمة — نفس عقد setLocaleAction
  //     (إجراء الخادم في src/i18n/actions.ts): سنة كاملة، sameSite lax.
  response.cookies.set(LOCALE_COOKIE, lang, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
  return response;
}

export const config = {
  // أضيق نطاق يحقق الغرض: صفحات «?lang=» العامة المعروفة (الدخول + التحقق
  // العام بمرجعه). بقية اللوحة تتبدل لغتها عبر مبدّل الواجهة (إجراء الخادم)
  // ولا تقبل ?lang= أصلًا — فإبعادها عن الوسيط يُبقي سطح التنفيذ أصغر ما يمكن.
  // (جولة 2026-10-19): الصفحات العامة القانونية والدليل تقبل ?lang= كذلك —
  // نفس آلية صفحة الدخول (كوكي طلب + استجابة، بلا وميض).
  // (جولة 2026-10-24): صفحة تحميل تطبيق أندرويد /app — نفس الآلية.
  matcher: ["/login", "/verify/:path*", "/legal/:path*", "/guide", "/app"],
};
