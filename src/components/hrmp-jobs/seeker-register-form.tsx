"use client";

// HRMP — معالج تسجيل باحث عن عمل (طلب المالك 2026-10-24): أربع خطوات متتابعة
// مع مؤشر تقدم واضح. الخطوات الخادمية: إنشاء الحساب (جلسة فورية) → OTP بريد →
// OTP هاتف → رفع الوثيقة. إعادة الإرسال بعد 45ث، وكل الأخطاء تعرض رسائل
// i18n محددة لا رموزًا غامضة. وضع التجربة (بلا مزوّد) يظهر الرمز صراحة بتحذير.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  BadgeCheck,
  CheckCircle2,
  FileUp,
  LoaderCircle,
  LogIn,
  Mail,
  Smartphone,
  UserRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";

type Step = 1 | 2 | 3 | 4 | 5; // 5 = اكتمال

const RESEND_COOLDOWN_S = 45;

function registerError(t: (k: string, p?: Record<string, string | number>) => string, code: string): string {
  const map: Record<string, string> = {
    email_taken: "jobs.errors.email_taken",
    phone_taken: "jobs.errors.phone_taken",
    invalid_email: "jobs.errors.invalid_email",
    invalid_phone: "jobs.errors.invalid_phone",
    weak_password: "jobs.errors.weak_password",
    invalid_name: "jobs.errors.invalid_name",
    internal_email: "jobs.errors.internal_email",
    rate_limited: "jobs.errors.rate_limited",
    invalid_input: "jobs.errors.invalid_input",
    wrong_code: "jobs.errors.wrong_code",
    expired: "jobs.errors.expired",
    too_many_attempts: "jobs.errors.too_many_attempts",
    not_found_otp: "jobs.errors.not_found_otp",
    not_found: "jobs.errors.not_found_otp",
    already_verified: "jobs.errors.already_verified",
    provider_not_configured: "jobs.errors.provider_not_configured",
    provider_error: "jobs.errors.provider_not_configured",
    doc_too_large: "jobs.errors.doc_too_large",
    doc_bad_mime: "jobs.errors.doc_bad_mime",
    doc_bad_type: "jobs.errors.doc_bad_type",
    unauthenticated: "jobs.errors.unauthenticated",
    internal_error: "jobs.errors.internal_error",
  };
  return t(map[code] ?? "jobs.errors.internal_error");
}

async function postJson(url: string, body: unknown): Promise<{ ok: boolean; status: number; data: { error?: string; devCode?: string } | null }> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }).catch(() => null);
  if (!res) return { ok: false, status: 0, data: null };
  const data = (await res.json().catch(() => null)) as { error?: string; devCode?: string } | null;
  return { ok: res.ok, status: res.status, data };
}

export function SeekerRegisterForm() {
  const { t, locale } = useI18n();
  const { toast } = useToast();
  const router = useRouter();

  const [step, setStep] = useState<Step>(1);
  const [busy, setBusy] = useState(false);

  // الخطوة 1: بيانات الحساب
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");

  // الخطوتان 2/3: OTP
  const [otpCode, setOtpCode] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const cooldownTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // الخطوة 4: الوثيقة
  const [docType, setDocType] = useState("national_id");
  const [docFile, setDocFile] = useState<File | null>(null);

  useEffect(() => {
    return () => {
      if (cooldownTimer.current) clearInterval(cooldownTimer.current);
    };
  }, []);

  const startCooldown = useCallback(() => {
    setCooldown(RESEND_COOLDOWN_S);
    if (cooldownTimer.current) clearInterval(cooldownTimer.current);
    cooldownTimer.current = setInterval(() => {
      setCooldown((c) => {
        if (c <= 1) {
          if (cooldownTimer.current) clearInterval(cooldownTimer.current);
          return 0;
        }
        return c - 1;
      });
    }, 1000);
  }, []);

  async function createAccount() {
    setBusy(true);
    try {
      const r = await postJson("/api/jobs/seeker/register", { fullName, email, phone, password, locale });
      if (r.ok) {
        await sendOtp("email");
        setStep(2);
      } else {
        toast({ variant: "destructive", description: registerError(t, r.data?.error ?? "internal_error") });
      }
    } finally {
      setBusy(false);
    }
  }

  async function sendOtp(channel: "email" | "phone") {
    const r = await postJson("/api/jobs/seeker/otp/send", { channel });
    if (r.ok) {
      setDevCode(r.data?.devCode ?? null);
      setOtpCode("");
      startCooldown();
      if (r.data?.devCode) {
        toast({ description: t("jobs.register.otpDevWarning", { code: r.data.devCode }) });
      }
    } else {
      toast({ variant: "destructive", description: registerError(t, r.data?.error ?? "internal_error") });
      throw new Error(r.data?.error ?? "send_failed");
    }
  }

  async function verifyOtp(channel: "email" | "phone") {
    setBusy(true);
    try {
      const r = await postJson("/api/jobs/seeker/otp/verify", { channel, code: otpCode });
      if (r.ok) {
        toast({ description: t("jobs.register.otpVerified") });
        setDevCode(null);
        if (channel === "email") {
          await sendOtp("phone");
          setStep(3);
        } else {
          setStep(4);
        }
      } else {
        toast({ variant: "destructive", description: registerError(t, r.data?.error ?? "internal_error") });
      }
    } finally {
      setBusy(false);
    }
  }

  async function uploadDocument() {
    if (!docFile) return;
    setBusy(true);
    try {
      const form = new FormData();
      form.set("type", docType);
      form.set("file", docFile);
      const res = await fetch("/api/jobs/seeker/document", { method: "POST", body: form });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (res.ok) {
        toast({ description: t("jobs.register.docUploaded") });
        setStep(5);
      } else {
        toast({ variant: "destructive", description: registerError(t, data?.error ?? "internal_error") });
      }
    } catch {
      toast({ variant: "destructive", description: t("jobs.errors.internal_error") });
    } finally {
      setBusy(false);
    }
  }

  const stepMeta = [
    { n: 1, labelKey: "jobs.register.stepAccount", Icon: UserRound },
    { n: 2, labelKey: "jobs.register.stepEmail", Icon: Mail },
    { n: 3, labelKey: "jobs.register.stepPhone", Icon: Smartphone },
    { n: 4, labelKey: "jobs.register.stepDoc", Icon: FileUp },
  ];
  const progress = step === 5 ? 100 : Math.round(((step - 1) / 4) * 100);

  return (
    <div className="mx-auto max-w-xl space-y-5 pt-6">
      <div className="space-y-2 text-center">
        <h1 className="text-balance text-2xl font-extrabold tracking-tight sm:text-3xl">
          {t("jobs.register.title")}
        </h1>
        <p className="mx-auto max-w-md text-pretty text-sm leading-relaxed text-muted-foreground">
          {t("jobs.register.subtitle")}
        </p>
      </div>

      {step < 5 && (
        <>
          <Progress value={progress} className="h-1.5" aria-label="progress" />
          <ol className="grid grid-cols-4 gap-2">
            {stepMeta.map((s) => {
              const state = step > s.n ? "done" : step === s.n ? "current" : "todo";
              return (
                <li
                  key={s.n}
                  className={cn(
                    "flex flex-col items-center gap-1.5 rounded-lg border p-2 text-center transition-colors",
                    state === "done" && "border-primary/40 bg-primary/10 text-primary",
                    state === "current" && "border-primary bg-secondary text-foreground",
                    state === "todo" && "border-border/60 text-muted-foreground/70"
                  )}
                >
                  {state === "done" ? (
                    <CheckCircle2 className="size-4 shrink-0" aria-hidden />
                  ) : (
                    <s.Icon className="size-4 shrink-0" aria-hidden />
                  )}
                  <span className="text-[11px] font-semibold leading-tight">{t(s.labelKey)}</span>
                </li>
              );
            })}
          </ol>
        </>
      )}

      <Card>
        {step === 1 && (
          <>
            <CardHeader>
              <CardTitle className="text-lg">{t("jobs.register.stepAccount")}</CardTitle>
              <CardDescription>{t("jobs.register.passwordHint")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="reg-name">{t("jobs.register.fullName")}</Label>
                <Input
                  id="reg-name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder={t("jobs.register.fullNamePlaceholder")}
                  maxLength={80}
                  autoComplete="name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="reg-email">{t("jobs.register.email")}</Label>
                <Input
                  id="reg-email"
                  type="email"
                  dir="ltr"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  maxLength={190}
                  autoComplete="email"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="reg-phone">{t("jobs.register.phone")}</Label>
                <Input
                  id="reg-phone"
                  type="tel"
                  dir="ltr"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder={t("jobs.register.phonePlaceholder")}
                  maxLength={20}
                  autoComplete="tel"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="reg-password">{t("jobs.register.password")}</Label>
                <Input
                  id="reg-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  maxLength={128}
                  autoComplete="new-password"
                />
                <p className="text-xs text-muted-foreground">{t("jobs.register.passwordHint")}</p>
              </div>
              <Button
                className="w-full gap-2 font-bold"
                onClick={createAccount}
                disabled={busy || !fullName || !email || !phone || password.length < 10}
              >
                {busy && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
                {t("jobs.register.createCta")}
              </Button>
              <p className="text-center text-sm text-muted-foreground">
                {t("jobs.register.hasAccount")}{" "}
                <Link href="/jobs/login" className="font-semibold text-primary underline-offset-4 hover:underline">
                  <span className="inline-flex items-center gap-1">
                    <LogIn className="size-3.5" aria-hidden />
                    {t("jobs.login.cta")}
                  </span>
                </Link>
              </p>
            </CardContent>
          </>
        )}

        {(step === 2 || step === 3) && (
          <>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                {step === 2 ? <Mail className="size-5 text-primary" aria-hidden /> : <Smartphone className="size-5 text-primary" aria-hidden />}
                {t(step === 2 ? "jobs.register.stepEmail" : "jobs.register.stepPhone")}
              </CardTitle>
              <CardDescription>
                {t(step === 2 ? "jobs.register.otpSentEmail" : "jobs.register.otpSentPhone", {
                  [step === 2 ? "email" : "phone"]: step === 2 ? email : phone,
                })}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {devCode && (
                <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-center">
                  <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">
                    {t("jobs.register.otpDevWarning", { code: devCode })}
                  </p>
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="reg-otp">{t("jobs.register.otpEnter")}</Label>
                <Input
                  id="reg-otp"
                  inputMode="numeric"
                  dir="ltr"
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="000000"
                  className="text-center text-lg font-bold tracking-[0.4em]"
                  autoComplete="one-time-code"
                />
              </div>
              <Button
                className="w-full gap-2 font-bold"
                onClick={() => verifyOtp(step === 2 ? "email" : "phone")}
                disabled={busy || otpCode.length !== 6}
              >
                {busy && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
                <BadgeCheck className="size-4" aria-hidden />
                {t("jobs.register.otpVerify")}
              </Button>
              <div className="text-center">
                {cooldown > 0 ? (
                  <p className="text-xs text-muted-foreground">
                    {t("jobs.register.otpResendIn", { seconds: cooldown })}
                  </p>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs"
                    disabled={busy}
                    onClick={() => void sendOtp(step === 2 ? "email" : "phone").catch(() => null)}
                  >
                    {t("jobs.register.otpResend")}
                  </Button>
                )}
              </div>
            </CardContent>
          </>
        )}

        {step === 4 && (
          <>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <FileUp className="size-5 text-primary" aria-hidden />
                {t("jobs.register.stepDoc")}
              </CardTitle>
              <CardDescription>{t("jobs.register.docHint")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="reg-doc-type">{t("jobs.register.docType")}</Label>
                <Select value={docType} onValueChange={setDocType}>
                  <SelectTrigger id="reg-doc-type" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(["national_id", "passport", "driver_license"] as const).map((dt) => (
                      <SelectItem key={dt} value={dt}>
                        {t(`jobs.register.docTypes.${dt}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="reg-doc-file">{t("jobs.register.docFile")}</Label>
                <Input
                  id="reg-doc-file"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(e) => setDocFile(e.target.files?.[0] ?? null)}
                />
                {docFile && (
                  <p className="truncate text-xs text-muted-foreground" dir="ltr">
                    {docFile.name} · {(docFile.size / (1024 * 1024)).toFixed(1)}MB
                  </p>
                )}
              </div>
              <Button
                className="w-full gap-2 font-bold"
                onClick={uploadDocument}
                disabled={busy || !docFile || !docType}
              >
                {busy && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
                <FileUp className="size-4" aria-hidden />
                {t("jobs.register.docUpload")}
              </Button>
            </CardContent>
          </>
        )}

        {step === 5 && (
          <>
            <CardHeader className="items-center text-center">
              <div className="mx-auto mb-2 flex size-14 items-center justify-center rounded-full bg-primary/15">
                <CheckCircle2 className="size-8 text-primary" aria-hidden />
              </div>
              <CardTitle className="text-xl">{t("jobs.register.finishTitle")}</CardTitle>
              <CardDescription className="mx-auto max-w-sm text-pretty leading-relaxed">
                {t("jobs.register.finishDesc")}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col items-center gap-3">
              <Badge variant="secondary" className="gap-1.5">
                <BadgeCheck className="size-3.5" aria-hidden />
                {t("jobs.me.status.pending")}
              </Badge>
              <div className="flex flex-wrap items-center justify-center gap-2">
                <Button asChild size="sm" className="font-semibold" onClick={() => router.push("/jobs/me")}>
                  <Link href="/jobs/me">{t("jobs.register.finishPortal")}</Link>
                </Button>
                <Button asChild variant="outline" size="sm">
                  <Link href="/jobs">{t("jobs.me.browseCta")}</Link>
                </Button>
              </div>
            </CardContent>
          </>
        )}
      </Card>
    </div>
  );
}
