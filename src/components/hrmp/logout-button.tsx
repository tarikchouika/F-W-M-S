"use client";

// HRMP — زر تسجيل الخروج: يستدعي الـ API ثم يعيد التوجيه للصفحة الرئيسية
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { LogOut, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";

export function LogoutButton({ variant = "ghost" }: { variant?: "ghost" | "outline" | "secondary" }) {
  const { t } = useI18n();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => null);
    startTransition(() => {
      router.push("/");
      router.refresh();
    });
  }

  return (
    <Button
      variant={variant}
      size="sm"
      onClick={logout}
      className={cn("gap-2 font-medium", isPending && "opacity-60")}
      disabled={isPending}
      aria-label={t("nav.logout")}
    >
      {isPending ? (
        <LoaderCircle className="size-4 animate-spin" aria-hidden />
      ) : (
        <LogOut className="size-4 rtl:-scale-x-100" aria-hidden />
      )}
      <span className="hidden sm:inline">{t("nav.logout")}</span>
    </Button>
  );
}
