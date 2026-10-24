// HRMP — ملكية المنصة (SPEC §3.2 — المرحلة 8): حالة المالك + أداة نقل الملكية
// super_admin حصرًا (platform.manage) — وكل خطوة حساسة تُعيد المصادقة بكلمة المرور.
// GET  /api/platform/ownership           → حالة المالك + النقل الجاري + آخر منجز + السجل
// POST /api/platform/ownership           → أفعال النقل: initiate | approve-current |
//                                          issue-code | approve-new | execute | cancel |
//                                          confirm-rotation | update-owner
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth/session";
import { requirePermission, AccessError } from "@/lib/rbac";
import { getPlatformBranding } from "@/lib/branding";
import {
  OwnershipError,
  getOwnershipStatus,
  initiateTransfer,
  approveByCurrentOwner,
  issueNewOwnerApprovalCode,
  approveByNewOwner,
  executeTransfer,
  confirmSecretsRotated,
  cancelTransfer,
  listTransfers,
  updateOwnerIdentity,
} from "@/lib/ownership";

export async function GET() {
  try {
    const session = await getSession();
    requirePermission(session, "platform.manage");
    const branding = await getPlatformBranding();
    const status = await getOwnershipStatus(branding);
    const history = await listTransfers(10);
    return NextResponse.json({ ...status, history });
  } catch (error) {
    if (error instanceof AccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[platform/ownership:GET]", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

const initiateSchema = z.object({
  action: z.literal("initiate"),
  password: z.string().min(1).max(200),
  newOwnerLegalName: z.string().min(2).max(200),
  newOwnerDisplayName: z.string().min(1).max(120),
  newOwnerContactEmail: z.string().email().max(190).nullable().optional(),
  newOwnerContactPhone: z.string().max(40).nullable().optional(),
  newOwnerInitialAdminEmail: z.string().email().max(190),
  reason: z.string().max(500).nullable().optional(),
});

const passwordActionSchema = z.object({
  password: z.string().min(1).max(200),
});

const approveNewSchema = passwordActionSchema.extend({
  action: z.literal("approve-new"),
  approvalCode: z.string().min(4).max(20),
});

const cancelSchema = passwordActionSchema.extend({
  action: z.literal("cancel"),
  reason: z.string().max(500).optional(),
});

const updateOwnerSchema = passwordActionSchema.extend({
  action: z.literal("update-owner"),
  legalName: z.string().min(2).max(200).optional(),
  displayName: z.string().min(1).max(120).optional(),
  contactEmail: z.string().email().max(190).nullable().optional(),
  contactPhone: z.string().max(40).nullable().optional(),
  logoUrl: z.string().max(500).nullable().optional(),
  websiteUrl: z.string().max(500).nullable().optional(),
  termsUrl: z.string().max(500).nullable().optional(),
  footerText: z.string().max(300).nullable().optional(),
  defaultLocale: z.enum(["ar", "fr", "en", "es"]).optional(),
  defaultCurrency: z.string().regex(/^[A-Z]{3}$/).optional(),
  modulesJson: z.string().max(2000).nullable().optional(),
});

const bodySchema = z.discriminatedUnion("action", [
  initiateSchema,
  z.object({ action: z.literal("approve-current") }).extend(passwordActionSchema.shape),
  z.object({ action: z.literal("issue-code") }).extend(passwordActionSchema.shape),
  approveNewSchema,
  z.object({ action: z.literal("execute") }).extend(passwordActionSchema.shape),
  z.object({ action: z.literal("confirm-rotation") }).extend(passwordActionSchema.shape),
  cancelSchema,
  updateOwnerSchema,
]);

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    requirePermission(session, "platform.manage");
    const body = await req.json().catch(() => null);
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "invalid_input", issues: parsed.error.issues.slice(0, 5) }, { status: 400 });
    }
    const input = parsed.data;
    const userId = session!.sub;

    switch (input.action) {
      case "initiate": {
        const result = await initiateTransfer(
          userId,
          {
            newOwnerLegalName: input.newOwnerLegalName,
            newOwnerDisplayName: input.newOwnerDisplayName,
            newOwnerContactEmail: input.newOwnerContactEmail ?? null,
            newOwnerContactPhone: input.newOwnerContactPhone ?? null,
            newOwnerInitialAdminEmail: input.newOwnerInitialAdminEmail,
            reason: input.reason ?? null,
          },
          input.password
        );
        return NextResponse.json({ ok: true, ...result }, { status: 201 });
      }
      case "approve-current": {
        return NextResponse.json({ ok: true, ...(await approveByCurrentOwner(userId, input.password)) });
      }
      case "issue-code": {
        // الرمز يُعرض هنا مرة واحدة (لا يُخزَّن نصًا) — سلّمه للمالك الجديد خارج النظام
        const result = await issueNewOwnerApprovalCode(userId, input.password);
        return NextResponse.json({ ok: true, ...result });
      }
      case "approve-new": {
        return NextResponse.json({ ok: true, ...(await approveByNewOwner(userId, input.password, input.approvalCode)) });
      }
      case "execute": {
        const result = await executeTransfer(userId, input.password);
        // كلمة المرور الابتدائية وسر JWT المقترح يُعرضان مرة واحدة هنا فقط
        return NextResponse.json({ ok: true, ...result });
      }
      case "confirm-rotation": {
        return NextResponse.json({ ok: true, ...(await confirmSecretsRotated(userId, input.password)) });
      }
      case "cancel": {
        return NextResponse.json({ ok: true, ...(await cancelTransfer(userId, input.password, input.reason)) });
      }
      case "update-owner": {
        await updateOwnerIdentity(
          userId,
          {
            legalName: input.legalName,
            displayName: input.displayName,
            contactEmail: input.contactEmail,
            contactPhone: input.contactPhone,
            logoUrl: input.logoUrl,
            websiteUrl: input.websiteUrl,
            termsUrl: input.termsUrl,
            footerText: input.footerText,
            defaultLocale: input.defaultLocale,
            defaultCurrency: input.defaultCurrency,
            modulesJson: input.modulesJson,
          },
          input.password
        );
        return NextResponse.json({ ok: true });
      }
      default:
        return NextResponse.json({ error: "unknown_action" }, { status: 400 });
    }
  } catch (error) {
    if (error instanceof AccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof OwnershipError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const status = (error as { status?: number }).status;
    if (typeof status === "number") {
      return NextResponse.json({ error: (error as Error).message }, { status });
    }
    console.error("[platform/ownership:POST]", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
