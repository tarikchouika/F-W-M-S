"use client";

// HRMP — مبدّل اللغة (أربع لغات، SPEC §2): إجراء خادمي يضبط cookie ثم يجدد العرض
import { useRouter } from "next/navigation";
import { useTransition } from "react";
// أيقونة Globe محايدة لغويًا: أيقونة lucide «Languages» السابقة ترسم حرفًا صينيًا (文) بجانب حرف A —
// بدت للباحث كلمة صينية غريبة في الواجهة (بلاغ المالك 2026-10-18)؛ الكرة الأرضية اصطلاح عالمي محايد.
import { Globe, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useI18n } from "@/i18n/provider";
import { setLocaleAction } from "@/i18n/actions";
import { locales, localeLabels, type Locale } from "@/i18n/config";
import { cn } from "@/lib/utils";

export function LangSwitcher({
  variant = "ghost",
  className,
}: {
  variant?: "ghost" | "outline" | "secondary";
  className?: string;
}) {
  const { locale, t } = useI18n();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  async function switchTo(next: Locale) {
    if (next === locale) return;
    await setLocaleAction(next);
    startTransition(() => {
      router.refresh();
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant={variant}
          size="sm"
          className={cn("gap-2 font-medium", isPending && "opacity-60", className)}
          aria-label={t("lang.label")}
          disabled={isPending}
        >
          <Globe className="size-4" aria-hidden />
          <span className="hidden sm:inline">{localeLabels[locale]}</span>
          <span className="sm:hidden">{locale.toUpperCase()}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-40">
        {locales.map((l) => (
          <DropdownMenuItem
            key={l}
            onClick={() => switchTo(l)}
            className={cn("justify-between", l === locale && "font-semibold")}
            dir={l === "ar" ? "rtl" : "ltr"}
          >
            <span>{localeLabels[l]}</span>
            {l === locale && <Check className="size-4 text-primary" aria-hidden />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
