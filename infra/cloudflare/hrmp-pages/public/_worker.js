// HRMP — بوابة الواجهة العامة على Cloudflare Pages (مشروع hrmp → hrmp.pages.dev)
// ملكية المساعد الأول — infra/cloudflare/** (COORDINATION §3)
//
// النمط: بوابة عكسية (Pages Advanced Mode) — نفس نمط بوابة fwms القائمة
// (infra/cloudflare/fwms-pages — تبقى حية) والأصل هو الخادم المرجعي نفسه:
// fwms.tarikc.workers.dev (بوابة الهاتف عبر النفق — DEPLOYMENT.md §3.2).
//
// لماذا بوابة وليس تشغيل التطبيق نفسه على Pages؟
// التطبيق Next.js كامل الخدمة يعتمد حصرًا على Node APIs لا يوفرها workerd:
// Prisma + SQLite (ملف محلي) + bcrypt + sharp + عملية العرض الابنة.
// أي محاولة تشغيله مباشرة على Pages = إعادة كتابة جذرية تكسر المكتسبات —
// فالبوابة تحفظ الكود الواحد وسلوكه (SPEC §7) وتعرضه على نطاق المنصة الجديد.

const ORIGIN = "fwms.tarikc.workers.dev"; // أصل الخادم المرجعي (الهاتف عبر النفق) — بلا بروتوكول ولا منفذ

const worker = {
  async fetch(request) {
    const url = new URL(request.url);

    // فحص ذاتي للبوابة (لا يُمرَّر إلى الأصل) — للمراقبة التشغيلية
    if (url.pathname === "/_gateway/health") {
      return Response.json({
        ok: true,
        service: "hrmp-pages-gateway",
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
    // التوجيه بالنطاق عبر ترويسة Host — يجب أن تحمل اسم الأصل لا البوابة
    headers.set("host", ORIGIN);
    headers.set("x-forwarded-host", url.hostname);
    headers.set("x-forwarded-proto", "https");
    // عنوان العميل الحقيقي (فحص أمني 2026-10-19) — ترويسة مخصّصة يقرأها التطبيق
    // (x-fwms-client-ip — اسم محمي عبر إعادة التسمية: البوابات المنشرة ترسلها).
    const clientIp = request.headers.get("cf-connecting-ip") || "";
    headers.set("x-fwms-client-ip", clientIp);
    if (clientIp) headers.set("x-forwarded-for", clientIp);
    // نقل حتمي غير مضغوط من الأصل — يمنع ازدواجية ترميز المحتوى عبر البوابة
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
        "HRMP Gateway: الأصل غير متاح حاليًا (" + ORIGIN + ") — تحقق من الخادم المرجعي والنفق",
        { status: 503, headers: { "content-type": "text/plain; charset=utf-8" } },
      );
    }
  },
};

export default worker;
