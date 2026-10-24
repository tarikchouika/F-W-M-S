"use client";

// HRMP — مبدّل المظهر (فاتح / قاتم / تلقائي حسب النظام)
//
// يستعمل next-themes (كانت التبعية مثبَّتة دون أي استعمال). التخزين في localStorage
// باسم FWMS_THEME، والوضع الافتراضي «تلقائي» فيتبع النظام (`prefers-color-scheme`).
//
// حماية من انزياح hydration: next-themes يضبط `.dark` على <html> بعد الإقلاع،
// فلا نعرض الحالة الفعلية إلا بعد `mounted` — وإلا اختلف رمز/نص الزر بين SSR
// والعميل فتظهر وميضة تصحيح (نفس منطق global-error.tsx الموثّق في v0.10.3).
import { useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import { Check, Monitor, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";

type ThemeChoice = "light" | "dark" | "system";
type ThemeLabelKey = "theme.light" | "theme.dark" | "theme.system";

const CHOICES: { value: ThemeChoice; Icon: typeof Sun; labelKey: ThemeLabelKey }[] = [
  { value: "light", Icon: Sun, labelKey: "theme.light" },
  { value: "dark", Icon: Moon, labelKey: "theme.dark" },
  { value: "system", Icon: Monitor, labelKey: "theme.system" },
];

const subscribeNoop = () => () => {}; // لا اشتراك — قراءة لمرة واحدة (نمط global-error.tsx)

export function ThemeSwitcher({
  variant = "ghost",
  className,
}: {
  variant?: "ghost" | "outline" | "secondary";
  className?: string;
}) {
  const { t } = useI18n();
  const { theme, setTheme } = useTheme();
  // «mount» لقطة خارجية لا حالة داخل effect — الخادم «false» والعميل «true» عند
  // إقلاع أول render. نفس نمط global-error.tsx الموثّق: بلا setState في effect.
  const mounted = useSyncExternalStore(subscribeNoop, () => true, () => false);

  const active: ThemeChoice = mounted && (theme === "light" || theme === "dark") ? theme : "system";
  const activeLabelKey = CHOICES.find((c) => c.value === active)!.labelKey;
  const ActiveIcon = CHOICES.find((c) => c.value === active)!.Icon;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant={variant}
          size="sm"
          className={cn("gap-2 font-medium", !mounted && "opacity-60", className)}
          aria-label={t("theme.label")}
          disabled={!mounted}
        >
          {/* الأيقونة والنص يُرسمان ثابتين قبل الإقلاع (Monitor + «تلقائي») حتى لا يقفز الرمز */}
          <ActiveIcon className="size-4" aria-hidden />
          <span className="hidden sm:inline">{t(mounted ? activeLabelKey : "theme.system")}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-44">
        {CHOICES.map(({ value, Icon, labelKey }) => (
          <DropdownMenuItem
            key={value}
            onClick={() => setTheme(value)}
            className={cn("justify-between gap-3", value === active && "font-semibold")}
          >
            <span className="flex items-center gap-2">
              <Icon className="size-4" aria-hidden />
              {t(labelKey)}
            </span>
            {value === active && <Check className="size-4 text-primary" aria-hidden />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
