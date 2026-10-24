// HRMP — حقول «الاسم بلغات أخرى» المشتركة (علاج أسماء الكيانات 2026-10-19)
// تستعملها نماذج الشركة/الفرع/المشروع/الموقع؛ القيمة تُرسل ككائن names
// ويسقطها الخادم إن خلت (zod localeNamesSchema).
"use client";

import { useI18n } from "@/i18n/provider";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { parseNames } from "@/lib/localized-name";
import type { Dispatch, SetStateAction } from "react";

export type LocaleNamesForm = { namesAr: string; namesFr: string; namesEn: string; namesEs: string };

export const EMPTY_LOCALE_NAMES: LocaleNamesForm = { namesAr: "", namesFr: "", namesEn: "", namesEs: "" };

/** تفريغ أسماء صف (raw JSON) إلى حقول النموذج الأربعة */
export function localeNamesFromRow(row: { names?: string | null }): LocaleNamesForm {
  const map = parseNames(row.names);
  return {
    namesAr: map?.ar ?? "",
    namesFr: map?.fr ?? "",
    namesEn: map?.en ?? "",
    namesEs: map?.es ?? "",
  };
}

/** كائن names الجاهز للإرسال من حقول النموذج */
export function localeNamesBody(form: LocaleNamesForm) {
  return { ar: form.namesAr.trim(), fr: form.namesFr.trim(), en: form.namesEn.trim(), es: form.namesEs.trim() };
}

export function LocaleNamesFields({
  form,
  setForm,
  disabled,
}: {
  form: LocaleNamesForm;
  // any مقصودة: يقبل أي نموذج مدير (SiteForm/BranchForm/...) دون تخصيص نوع لكل مدير
  setForm: Dispatch<SetStateAction<any>>;
  disabled?: boolean;
}) {
  const { t } = useI18n();
  const set = (key: keyof LocaleNamesForm) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));
  const rows: [keyof LocaleNamesForm, string, string][] = [
    ["namesAr", "common.localeNameAr", "rtl"],
    ["namesFr", "common.localeNameFr", "ltr"],
    ["namesEn", "common.localeNameEn", "ltr"],
    ["namesEs", "common.localeNameEs", "ltr"],
  ];
  return (
    <div className="rounded-lg border border-border/70 bg-muted/30 p-3">
      <p className="text-sm font-semibold text-foreground">{t("common.localeNamesTitle")}</p>
      <p className="mb-2 text-xs text-muted-foreground">{t("common.localeNamesHint")}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {rows.map(([key, labelKey, dir]) => (
          <div key={key} className="flex flex-col gap-1.5">
            <Label htmlFor={key}>{t(labelKey)}</Label>
            <Input id={key} value={form[key]} onChange={set(key)} maxLength={120} disabled={disabled} dir={dir} />
          </div>
        ))}
      </div>
    </div>
  );
}
