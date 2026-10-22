"use client";

// FWMS — عناصر مشتركة لصفحات المرحلة 2: ترويسة، شارة حالة، حوار تأكيد، حالات القوائم
import { useState, type ReactNode } from "react";
import { AlertCircle, LoaderCircle, RefreshCcw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useI18n } from "@/i18n/provider";

/** خطأ API برمز الخطأ من الخادم (forbidden/invalid_input/shift_conflict/...) + حمولة الخطأ إن وُجدت */
export class ApiError extends Error {
  code: string;
  data: unknown;
  constructor(code: string, data?: unknown) {
    super(code);
    this.code = code;
    this.data = data;
  }
}

/** طلب API موحد: يرمي ApiError برمز الخادم عند الفشل */
export async function apiRequest<T = unknown>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch {
    throw new ApiError("network");
  }
  const data = (await res.json().catch(() => null)) as { error?: string } | null;
  if (!res.ok) {
    throw new ApiError(data?.error ?? "request_failed", data);
  }
  return data as T;
}

/** رسالة خطأ مترجمة من رمز الخادم */
export function apiErrorMessage(t: (key: string) => string, error: unknown): string {
  const code = error instanceof ApiError ? error.code : "";
  if (code === "forbidden") return t("common.forbidden");
  if (code === "invalid_input" || code === "invalid_reference") return t("common.invalidInput");
  if (code === "network") return t("common.networkError");
  if (code === "same_day_only") return t("shifts.sameDayOnly");
  if (code === "shift_conflict") return t("shifts.conflictTitle");
  if (code === "invalid_duration" || code === "too_long") return t("common.invalidInput");
  if (code === "no_open_checkin") return t("myAttendance.noOpenCheckin");
  if (code === "already_checked_in") return t("myAttendance.alreadyCheckedIn");
  if (code === "rate_limited") return t("myAttendance.rateLimited");
  if (code === "not_reviewable") return t("attendance.notReviewable");
  if (code === "face_acknowledgment_required") return t("policies.faceAckRequired");
  if (code === "policy_narrowing_violation") return t("policies.narrowingViolation");
  // أخطاء الحذف النهائي (أمر المالك 2026-10-23) — رسائل مرشدة من قواميس errors.*
  if (code === "user_has_records") return t("errors.user_has_records");
  if (code === "cannot_delete_self") return t("errors.cannot_delete_self");
  if (code === "cannot_delete_super_admin") return t("errors.cannot_delete_super_admin");
  if (code === "company_is_active_session") return t("errors.company_is_active_session");
  if (code === "project_has_sites") return t("errors.project_has_sites");
  if (code === "site_has_records") return t("errors.site_has_records");
  if (code === "branch_has_children") return t("errors.branch_has_children");
  if (code === "no_delete_permission") return t("errors.no_delete_permission");
  return t("common.operationFailed");
}

/** ترويسة موحدة لصفحات إدارة المرحلة 2 */
export function PageHeader({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">{title}</h1>
        {subtitle && <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {children && <div className="flex min-w-0 flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}

/** شارة الحالة: نشط / مؤرشف / معلّق */
export function StatusBadge({ status }: { status: string }) {
  const { t } = useI18n();
  if (status === "active") return <Badge className="font-semibold">{t("common.active")}</Badge>;
  if (status === "suspended")
    return <Badge variant="destructive" className="font-semibold">{t("common.suspended")}</Badge>;
  return <Badge variant="secondary" className="font-semibold">{t("common.archived")}</Badge>;
}

/** حوار تأكيد لإجراء حساس (أرشفة/تعليق) — SPEC §3: الأفعال الحساسة صريحة وموثّقة */
export function ConfirmAction({
  triggerLabel,
  triggerVariant = "ghost",
  triggerSize = "sm",
  triggerClassName,
  title,
  description,
  confirmLabel,
  destructive = true,
  onConfirm,
}: {
  triggerLabel: ReactNode;
  triggerVariant?: "default" | "secondary" | "ghost" | "outline" | "destructive";
  triggerSize?: "default" | "sm" | "lg" | "icon";
  triggerClassName?: string;
  title: string;
  description: string;
  confirmLabel: string;
  destructive?: boolean;
  onConfirm: () => Promise<void>;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleConfirm() {
    if (busy) return;
    setBusy(true);
    try {
      await onConfirm();
      setOpen(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button variant={triggerVariant} size={triggerSize} className={triggerClassName}>
          {triggerLabel}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>{t("common.cancel")}</AlertDialogCancel>
          <AlertDialogAction
            className={destructive ? undefined : ""}
            disabled={busy}
            onClick={(e) => {
              e.preventDefault(); // نبقى في الحوار حتى تنتهي العملية
              void handleConfirm();
            }}
          >
            {busy ? t("common.saving") : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** تنسيق تاريخ موحد (توقيت الشركة الافتراضي — SPEC: UTC تخزينًا، Casablanca عرضًا) */
export function formatDate(iso: string | Date | null | undefined, locale: string): string {
  if (!iso) return "—";
  const intl =
    locale === "ar" ? "ar-MA" : locale === "fr" ? "fr-MA" : locale === "es" ? "es-MA" : "en-MA";
  return new Intl.DateTimeFormat(intl, {
    dateStyle: "medium",
    timeZone: "Africa/Casablanca",
  }).format(new Date(iso));
}

/** حالات القوائم: تحميل / خطأ / فراغ */
export function ListState({
  loading,
  error,
  empty,
  onRetry,
}: {
  loading: boolean;
  error: boolean;
  empty: boolean;
  onRetry?: () => void;
}) {
  const { t } = useI18n();
  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
        <LoaderCircle className="size-4 animate-spin" aria-hidden />
        {t("common.loading")}
      </div>
    );
  }
  if (error) {
    return (
      <Alert variant="destructive" role="alert">
        <AlertCircle className="size-4" aria-hidden />
        <AlertDescription className="flex items-center justify-between gap-3">
          <span>{t("common.operationFailed")}</span>
          {onRetry && (
            <Button variant="outline" size="sm" onClick={onRetry} className="gap-1.5">
              <RefreshCcw className="size-3.5" aria-hidden />
              {t("common.retry")}
            </Button>
          )}
        </AlertDescription>
      </Alert>
    );
  }
  if (empty) {
    return <p className="py-10 text-center text-sm text-muted-foreground">{t("common.noData")}</p>;
  }
  return null;
}
