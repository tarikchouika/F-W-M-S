// FWMS — بوابة الواجهة العامة على Cloudflare Pages (مشروع fwms → fwms-dg8.pages.dev)
// ملكية المساعد الأول — infra/cloudflare/** (COORDINATION §3)
//
// النمط: بوابة عكسية (Pages Advanced Mode) — نفس نمط البوابة القائمة `fwms-proxy`
// لكن أصلها الأصلي هو نشر Vercel الحي (DEPLOYMENT.md §1-§2) بدل خادم الهاتف.
//
// لماذا بوابة وليس تشغيل التطبيق نفسه على Pages؟
// التطبيق Next.js كامل الخدمة يعتمد حصرًا على Node APIs لا يوفرها workerd:
// Prisma + SQLite (ملف محلي) + bcrypt + sharp + عملية العرض الابنة.
// أي محاولة تشغيله مباشرة على Pages = إعادة كتابة جذرية تكسر المكتسبات —
// فالبوابة تحفظ الكود الواحد وسلوكه (SPEC §7) وتعرضه على نطاق Cloudflare المطلوب.
//
// سياسة الأصل: fwms-orpin.vercel.app (نشر تلقائي من main — يحمل إصلاحات v0.9.2:
// أيقونة Globe + لقطة معاينة القاعدة). للتبديل إلى بوابة الهاتف بعد إعادة بنائه
// إلى ≥0.9.2: عدّل ORIGIN إلى "fwms.tarikc.workers.dev" ثم أعد النشر — راجع README.

const ORIGIN = "fwms-orpin.vercel.app"; // أصل النشر الحي — بلا بروتوكول ولا منفذ

const worker = {
  async fetch(request) {
    const url = new URL(request.url);

    // فحص ذاتي للبوابة (لا يُمرَّر إلى الأصل) — للمراقبة التشغيلية
    if (url.pathname === "/_gateway/health") {
      return Response.json({
        ok: true,
        service: "fwms-pages-gateway",
        origin: ORIGIN,
        publicHost: url.hostname,
        time: new Date().toISOString(),
      });
    }

    const target = new URL(request.url);
    target.protocol = "https:";
    target.hostname = ORIGIN;
    target.port = "";

    const headers = new Headers(request.headers);
    // Vercel يوجِّه بالنطاق عبر ترويسة Host — يجب أن تحمل اسم الأصل لا البوابة
    headers.set("host", ORIGIN);
    headers.set("x-forwarded-host", url.hostname);
    headers.set("x-forwarded-proto", "https");
    // نقل حتمي غير مضغوط من الأصل — يمنع ازدواجية ترميز المحتوى عبر البوابة
    // (CF يعيد الضغط تلقائيًا عند الخروج نحو المتصفح بما يقبله)
    headers.set("accept-encoding", "identity");

    try {
      const res = await fetch(
        new Request(target.toString(), {
          method: request.method,
          headers,
          body: request.body,
          redirect: "manual",
        }),
      );

      const h = new Headers(res.headers);
      // أي توجيه مطلق نحو الأصل يُعاد كتابته إلى نطاق البوابة العامة
      const loc = h.get("location");
      if (loc) {
        try {
          const lu = new URL(loc, target);
          if (lu.hostname === ORIGIN && lu.hostname !== url.hostname) {
            lu.protocol = "https:";
            lu.hostname = url.hostname;
            lu.port = "";
            h.set("location", lu.toString());
          }
        } catch {
          // قيمة غير قابلة للتحليل — تُترك كما هي
        }
      }
      return new Response(res.body, { status: res.status, headers: h });
    } catch {
      return new Response(
        "FWMS Gateway: الأصل غير متاح حاليًا — تحقق من نشر Vercel (" + ORIGIN + ")",
        { status: 503, headers: { "content-type": "text/plain; charset=utf-8" } },
      );
    }
  },
};

export default worker;
