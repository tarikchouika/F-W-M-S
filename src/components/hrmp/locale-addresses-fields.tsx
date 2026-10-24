// HRMP — حقول «العنوان بلغات أخرى» المشتركة (علاج بلاغ المالك 2026-10-23
// «خلل ترجمة العناوين الجغرافية»): نفس نمط LocaleNamesFields — القيمة تُرسل
// ككائن addresses ويسقطها الخادم إن خلت (zod localeNamesSchema عبر addressesColumnValue).
"use client";

import { useI18n } from "@/i18n/provider";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { parseNames } from "@/lib/localized-name";
import type { Dispatch, SetStateAction } from "react";

export type LocaleAddressesForm = { addrAr: string; addrFr: string; addrEn: string; addrEs: string };

export const EMPTY_LOCALE_ADDRESSES: LocaleAddressesForm = { addrAr: "", addrFr: "", addrEn: "", addrEs: "" };

/** تفريغ عناوين صف (raw JSON) إلى حقول النموذج الأربعة */
export function localeAddressesFromRow(row: { addresses?: string | null }): LocaleAddressesForm {
  const map = parseNames(row.addresses);
  return {
    addrAr: map?.ar ?? "",
    addrFr: map?.fr ?? "",
    addrEn: map?.en ?? "",
    addrEs: map?.es ?? "",
  };
}

/** كائن addresses الجاهز للإرسال من حقول النموذج */
export function localeAddressesBody(form: LocaleAddressesForm) {
  return { ar: form.addrAr.trim(), fr: form.addrFr.trim(), en: form.addrEn.trim(), es: form.addrEs.trim() };
}

export function LocaleAddressesFields({
  form,
  setForm,
  disabled,
}: {
  form: LocaleAddressesForm;
  // any مقصودة: يقبل أي نموذج مدير دون تخصيص نوع لكل مدير
  setForm: Dispatch<SetStateAction<any>>;
  disabled?: boolean;
}) {
  const { t } = useI18n();
  const set = (key: keyof LocaleAddressesForm) => (e: { target: { value: string } }) =>
    setForm((f: Record<string, unknown>) => ({ ...f, [key]: e.target.value }));
  const rows: [keyof LocaleAddressesForm, string, string][] = [
    ["addrAr", "common.localeNameAr", "rtl"],
    ["addrFr", "common.localeNameFr", "ltr"],
    ["addrEn", "common.localeNameEn", "ltr"],
    ["addrEs", "common.localeNameEs", "ltr"],
  ];
  return (
    <div className="rounded-lg border border-border/70 bg-muted/30 p-3">
      <p className="text-sm font-semibold text-foreground">{t("common.localeAddressesTitle")}</p>
      <p className="mb-2 text-xs text-muted-foreground">{t("common.localeAddressesHint")}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {rows.map(([key, labelKey, dir]) => (
          <div key={key} className="flex flex-col gap-1.5">
            <Label htmlFor={key}>{t(labelKey)}</Label>
            <Input id={key} value={form[key]} onChange={set(key)} maxLength={240} disabled={disabled} dir={dir} />
          </div>
        ))}
      </div>
    </div>
  );
}
