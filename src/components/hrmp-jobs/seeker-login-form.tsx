"use client";

// HRMP — نموذج دخول الباحث عن عمل: نفس عقد دخول المنصة (حد معدل + رسائل محددة)
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { LoaderCircle, LogIn, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useI18n } from "@/i18n/provider";

function loginError(t: (k: string) => string, code: string): string {
  const map: Record<string, string> = {
    bad_credentials: "jobs.errors.bad_credentials",
    rate_limited: "jobs.errors.rate_limited",
    not_active: "jobs.errors.not_active",
    invalid_input: "jobs.errors.invalid_input",
    internal_error: "jobs.errors.internal_error",
  };
  return t(map[code] ?? "jobs.errors.internal_error");
}

export function SeekerLoginForm() {
  const { t } = useI18n();
  const { toast } = useToast();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    try {
      const res = await fetch("/api/jobs/seeker/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (res.ok) {
        router.push("/jobs/me");
        router.refresh();
      } else {
        toast({ variant: "destructive", description: loginError(t, data?.error ?? "internal_error") });
      }
    } catch {
      toast({ variant: "destructive", description: t("jobs.errors.internal_error") });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-md space-y-5 pt-10">
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-xl font-bold">{t("jobs.login.title")}</CardTitle>
          <CardDescription>{t("jobs.login.subtitle")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="seeker-email">{t("jobs.register.email")}</Label>
            <Input
              id="seeker-email"
              type="email"
              dir="ltr"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              maxLength={190}
              autoComplete="email"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="seeker-password">{t("jobs.register.password")}</Label>
            <Input
              id="seeker-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              maxLength={128}
              autoComplete="current-password"
            />
          </div>
          <Button
            className="w-full gap-2 font-bold"
            onClick={submit}
            disabled={busy || !email || !password}
          >
            {busy ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <LogIn className="size-4" aria-hidden />}
            {t("jobs.login.cta")}
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            {t("jobs.login.noAccount")}{" "}
            <Link href="/jobs/register" className="font-semibold text-primary underline-offset-4 hover:underline">
              <span className="inline-flex items-center gap-1">
                <UserPlus className="size-3.5" aria-hidden />
                {t("jobs.login.register")}
              </span>
            </Link>
          </p>
          <p className="text-center text-xs leading-relaxed text-muted-foreground/80">
            {t("jobs.login.note")}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
