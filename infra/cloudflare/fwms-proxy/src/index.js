// FWMS — بوابة عامة عبر Workers VPC إلى خادم الهاتف خلف النفق (ملكية المساعد الثاني)
// تُمرر الطلب كما هو (طريقة/ترويسات/جسم) مع ترويسات التوجيه الصحيحة للتطبيق خلف البوابة.
const handler = {
	async fetch(request, env) {
		const url = new URL(request.url);

		// وجهة الخدمة: VPC Service يتجاهل المضيف/المنفذ في fetch ويستخدم إعداد الخدمة المسجّل
		const target = new URL(request.url);
		target.protocol = "http:";
		target.hostname = "127.0.0.1";
		target.port = "3000";

		const headers = new Headers(request.headers);
		headers.set("host", url.hostname);
		headers.set("x-forwarded-host", url.hostname);
		headers.set("x-forwarded-proto", "https");
		// عنوان العميل الحقيقي (فحص أمني 2026-10-19): نفق cloudflared يعيد كتابة
		// X-Forwarded-For بعنوانه الداخلي (127.0.0.1) ⇒ كان سجل التدقيق بلا قيمة
		// جنائية + حدّ معدل الدخول كلي لكل بريد (lockout DoS). نضع العنوان
		// الحقيقي في ترويسة مخصّصة يقرأها التطبيق، ونُعيد كتابتها دائمًا حتى
		// لا ينتحلها عميل (قيمة العميل تُستبدل دائمًا بـ CF-Connecting-IP).
		const clientIp = request.headers.get("cf-connecting-ip") || "";
		headers.set("x-fwms-client-ip", clientIp);
		// ونُبقي X-Forwarded-For الأصلي كما هو (مرجع احتياطي للتطبيق)
		if (clientIp) headers.set("x-forwarded-for", clientIp);

		try {
			return await env.FWMS.fetch(
				new Request(target.toString(), {
					method: request.method,
					headers,
					body: request.body,
					redirect: "manual",
				}),
			);
		} catch {
			return new Response(
				"FWMS: خادم الهاتف غير متاح حالياً (تحقق من النفق والخادم)",
				{ status: 503, headers: { "content-type": "text/plain; charset=utf-8" } },
			);
		}
	},
};

export default handler;
