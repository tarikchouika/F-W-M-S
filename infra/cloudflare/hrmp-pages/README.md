# بوابة HRMP على Cloudflare Pages — hrmp.pages.dev

> مشروع `hrmp` (طلب المالك 2026-10-24: «منصة إدارة الموارد البشرية (HRMP) (hrmp.pages.dev / hrmp.vercel.app)»).
> نفس نمط بوابة `fwms` القائمة (`fwms-dg8.pages.dev`) التي تبقى حية — المصدر `public/_worker.js`
> بوابة عكسية إلى الخادم المرجعي (fwms.tarikc.workers.dev — الهاتف عبر النفق).

## النشر

```bash
cd infra/cloudflare/hrmp-pages
CLOUDFLARE_API_TOKEN=<توكن من .env فقط> npx wrangler pages deploy public --project-name=hrmp --branch=main
```

- يُنشئ المشروع تلقائيًا عند أول نشر (إن لم يكن الاسم محجوزًا لدى طرف ثالث).
- التحقق: `https://hrmp.pages.dev/_gateway/health` ثم `/api/health` ثم `/login` ثم `/jobs`.

## متى تظهر الميزات الجديدة؟

البوابة تعكس الخادم المرجعي (الهاتف) — الميزات تظهر بعد سحب التحديث على الهاتف
(راجع طلبات المساعد الثاني في docs/WORKLOG.md جولة 2026-10-24).
