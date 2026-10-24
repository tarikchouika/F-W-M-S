"use client";

// HRMP — نموذج تسجيل الدخول: تحقق من الحقول، حالات تحميل وأخطاء مترجمة (SPEC §6)
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { LogIn, Mail, Lock, AlertCircle, LoaderCircle, ArrowRight, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useI18n } from "@/i18n/provider";

type ErrorKind = "invalid_credentials" | "account_inactive" | "no_active_membership" | "network" | null;

export function LoginForm() {
  const { t, dir } = useI18n();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<ErrorKind>(null);
  const BackArrow = dir === "rtl" ? ArrowRight : ArrowLeft;

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;
    setError(null);

    // تحقق بسيط في الواجهة — التحقق الفعلي في الخادم دائمًا (SPEC §3)
    if (!email || !password) {
      setError("invalid_credentials");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (res.ok) {
        router.push("/dashboard");
        router.refresh();
        return;
      }
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      const kind: ErrorKind =
        data?.error === "invalid_credentials"
          ? "invalid_credentials"
          : data?.error === "account_inactive"
            ? "account_inactive"
            : data?.error === "no_active_membership"
              ? "no_active_membership"
              : "network";
      setError(kind);
    } catch {
      setError("network");
    } finally {
      setSubmitting(false);
    }
  }

  const errorText =
    error === "invalid_credentials"
      ? t("auth.invalidCredentials")
      : error === "account_inactive"
        ? t("auth.inactiveAccount")
        : error === "no_active_membership"
          ? t("auth.inactiveAccount")
          : t("auth.genericError");

  return (
    <form onSubmit={onSubmit} className="flex w-full flex-col gap-5" noValidate>
      {error && (
        <Alert variant="destructive" role="alert">
          <AlertCircle className="size-4" aria-hidden />
          <AlertDescription>{errorText}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col gap-2">
        <Label htmlFor="email">{t("auth.email")}</Label>
        <div className="relative">
          <Mail
            className="pointer-events-none absolute inset-y-0 start-3 my-auto size-4 text-muted-foreground"
            aria-hidden
          />
          <Input
            id="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder={t("auth.emailPlaceholder")}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="ps-9"
            dir="ltr"
            required
            disabled={submitting}
          />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="password">{t("auth.password")}</Label>
        <div className="relative">
          <Lock
            className="pointer-events-none absolute inset-y-0 start-3 my-auto size-4 text-muted-foreground"
            aria-hidden
          />
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            placeholder={t("auth.passwordPlaceholder")}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="ps-9"
            required
            disabled={submitting}
          />
        </div>
      </div>

      <Button type="submit" size="lg" className="gap-2 font-bold" disabled={submitting}>
        {submitting ? (
          <>
            <LoaderCircle className="size-4 animate-spin" aria-hidden />
            {t("auth.submitting")}
          </>
        ) : (
          <>
            <LogIn className="size-4" aria-hidden />
            {t("auth.submit")}
          </>
        )}
      </Button>

      <div className="flex flex-col items-center gap-3 text-sm text-muted-foreground">
        <span className="text-xs">{t("auth.demoHint")}</span>
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 font-medium text-primary hover:underline"
        >
          <BackArrow className="size-3.5" aria-hidden />
          {t("auth.backHome")}
        </Link>
      </div>
    </form>
  );
}
