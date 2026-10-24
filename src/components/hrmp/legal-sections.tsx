// HRMP — عارض مقاطع الصفحة القانونية/الدليل: يبنيها من شجرة القاموس (s1h…s5l4)
// استعمال: <LegalSections dict={dict.legal.terms} />
//
// (بلاغ المالك 2026-10-22 «العرض العام للصفحات القانونية والتوضيحية غير متناسب
// مع الحواسيب»): كان العمود max-w-3xl (768px) وسط شاشات 1536-1920px بخط 14px
// وبطاقات شبيهة بمنظر الجوال — هوّل المساحات الفارغة وكثّر التمرير. الآن:
// عمود أوسع على الحواسيب (max-w-5xl) + خط أكبر للقراءة المريحة (15px/سطر 32px)
// + ترقيم مقاطع بهوية ذهبية يعطي إحساس «وثيقة» لا «تطبيق جوال».
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
// (بلاغ المالك 2026-10-24 «عبارة أخر تحديث 0.11.0 مكتوبة من إصدار قديم»):
// القواميس تحمل الآن عنصرًا {version} — يُستبدل هنا من مصدر الإصدار الواحد
// version.ts حصرًا (قاعدة جلسة 2026-10-18: لا يُثبَّت رقم إصدار في قاموس أبدًا).
import { APP_VERSION } from "@/lib/version";

/** استبدال عناصر القوالب في نص شجرة القاموس — حاليًا {version} فقط */
function fillVars(text: string): string {
  return text.replaceAll("{version}", APP_VERSION);
}

export type LegalSection = { h: string; b: string; bullets: string[] };

export function sectionsOf(tree: Record<string, string>): LegalSection[] {
  const out: LegalSection[] = [];
  for (let i = 1; i <= 9; i++) {
    const h = tree[`s${i}h`];
    const b = tree[`s${i}b`];
    if (!h && !b) break;
    const bullets: string[] = [];
    for (let l = 1; l <= 4; l++) {
      const v = tree[`s${i}l${l}`];
      if (typeof v === "string" && v.trim()) bullets.push(fillVars(v));
    }
    out.push({ h: fillVars(h ?? ""), b: fillVars(b ?? ""), bullets });
  }
  return out;
}

export function LegalSections({ tree }: { tree: Record<string, string> }) {
  const sections = sectionsOf(tree);
  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 py-6 lg:max-w-5xl">
      <header className="space-y-3 pb-2 pt-4">
        <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-4xl">
          {fillVars(tree.title)}
        </h1>
        <p className="text-base leading-8 text-muted-foreground sm:text-lg">{fillVars(tree.subtitle)}</p>
        {/* خط ذهبي بهوية المنصة تحت العنوان — يصل الصفحات العامة بالوثائق المولَّدة */}
        <div className="h-1 w-24 rounded-full bg-gold" aria-hidden />
      </header>

      {sections.map((s, i) => (
        <Card key={i} className="border-border/70">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-start gap-3 text-base font-bold sm:text-lg">
              <span
                className="mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-lg bg-gold/15 text-sm font-extrabold tabular-nums text-gold"
                aria-hidden
              >
                {i + 1}
              </span>
              <span className="leading-8">{s.h}</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-[15px] leading-8 text-foreground/90">{s.b}</p>
            {s.bullets.length ? (
              <ul className="space-y-2.5 ps-0">
                {s.bullets.map((b, j) => (
                  <li key={j} className="flex items-start gap-2.5 text-[15px] leading-7 text-foreground/85">
                    <span className="mt-2.5 size-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
