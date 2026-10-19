// FWMS — عارض مقاطع الصفحة القانونية/الدليل: يبنيها من شجرة القاموس (s1h…s5l4)
// استعمال: <LegalSections dict={dict.legal.terms} />
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

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
      if (typeof v === "string" && v.trim()) bullets.push(v);
    }
    out.push({ h: h ?? "", b: b ?? "", bullets });
  }
  return out;
}

export function LegalSections({ tree }: { tree: Record<string, string> }) {
  const sections = sectionsOf(tree);
  return (
    <div className="mx-auto w-full max-w-3xl space-y-5">
      <header className="space-y-2 pt-4">
        <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">{tree.title}</h1>
        <p className="text-sm text-muted-foreground">{tree.subtitle}</p>
      </header>

      {sections.map((s, i) => (
        <Card key={i}>
          <CardHeader>
            <CardTitle className="text-base">{s.h}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm leading-7 text-foreground/90">{s.b}</p>
            {s.bullets.length ? (
              <ul className="space-y-2 ps-0">
                {s.bullets.map((b, j) => (
                  <li key={j} className="flex items-start gap-2 text-sm leading-6 text-foreground/85">
                    <span className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
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
