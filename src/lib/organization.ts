// FWMS — تحقق مدخلات البنية التنظيمية (SPEC §5 و§8 — المرحلة 2)
// zod في الخادم دائمًا (SPEC §6) — كل مسار يتحقق قبل أي كتابة
import { z } from "zod";
import { localeNamesSchema } from "@/lib/localized-name";

// حدود الجغرافيا (SPEC §4.2): نصف قطر افتراضي 50 م قابل للتعديل لكل موقع
export const RADIUS_MIN_M = 10;
export const RADIUS_MAX_M = 5000;
export const RADIUS_DEFAULT_M = 50;

export const SITE_STATUS = ["active", "archived"] as const;
export const COMPANY_STATUS = ["active", "suspended"] as const;

const nameField = z.string().trim().min(2).max(120);
const optionalText = (max: number) => z.string().trim().max(max).optional().or(z.literal(""));

/** معرّف كيان صالح الشكل (cuid) */
export const entityIdSchema = z.string().trim().min(10).max(64);

// ── الشركات (super_admin — SPEC §3) ─────────────────────────────

export const companyCreateSchema = z.object({
  names: localeNamesSchema.optional(),
  legalName: nameField,
  tradeName: optionalText(120),
  taxId: optionalText(32),
  cnssNumber: optionalText(32),
  locale: z.enum(["ar", "fr", "en", "es"]).default("ar"),
  timezone: z.string().trim().min(3).max(64).default("Africa/Casablanca"),
});

export const companyUpdateSchema = z.object({
  names: localeNamesSchema.optional(),
  legalName: nameField.optional(),
  tradeName: optionalText(120),
  taxId: optionalText(32),
  cnssNumber: optionalText(32),
  locale: z.enum(["ar", "fr", "en", "es"]).optional(),
  timezone: z.string().trim().min(3).max(64).optional(),
  status: z.enum(COMPANY_STATUS).optional(),
});

// ── الفروع ──────────────────────────────────────────────────────

export const branchCreateSchema = z.object({
  name: nameField,
  code: optionalText(32),
  city: optionalText(80),
  address: optionalText(240),
  names: localeNamesSchema.optional(),
});

export const branchUpdateSchema = branchCreateSchema.partial().extend({
  status: z.enum(SITE_STATUS).optional(),
});

// ── المشاريع ────────────────────────────────────────────────────

export const projectCreateSchema = z.object({
  names: localeNamesSchema.optional(),
  name: nameField,
  code: optionalText(32),
  branchId: optionalText(64), // "" = غير مسند
  startsAt: optionalText(32), // "2026-10-16" أو ISO
  endsAt: optionalText(32),
});

export const projectUpdateSchema = projectCreateSchema.partial().extend({
  status: z.enum(SITE_STATUS).optional(),
});

// ── المواقع (قلب Geofencing — SPEC §4.2) ────────────────────────

export const siteCreateSchema = z.object({
  names: localeNamesSchema.optional(),
  name: nameField,
  address: optionalText(240),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  radiusM: z
    .number()
    .int()
    .min(RADIUS_MIN_M)
    .max(RADIUS_MAX_M)
    .default(RADIUS_DEFAULT_M),
  branchId: optionalText(64),
  projectId: optionalText(64),
});

export const siteUpdateSchema = siteCreateSchema.partial().extend({
  status: z.enum(SITE_STATUS).optional(),
});

// ── مجموعات العمال ──────────────────────────────────────────────

export const groupCreateSchema = z.object({
  name: nameField,
  description: optionalText(240),
});

export const groupUpdateSchema = groupCreateSchema.partial().extend({
  status: z.enum(SITE_STATUS).optional(),
});

// ── أدوات مشتركة ────────────────────────────────────────────────

/** توحيد القيم الفارغة إلى null */
export function emptyToNull(v: string | undefined | null): string | null {
  return v && v.trim().length > 0 ? v.trim() : null;
}

/** تحويل تاريخ اختياري إلى Date أو null — يرمي "invalid_date" إن كان غير صالح */
export function parseOptionalDate(v: string | undefined | null): Date | null {
  const s = emptyToNull(v);
  if (!s) return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) throw new Error("invalid_date");
  return d;
}
