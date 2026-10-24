// HRMP — إدارة سياسات التحقق (SPEC §4.2): المنصة ← الشركة ← الموقع «فقط ضمن ما يسمح به المالك»
// تفعيل أي وضع يشمل الوجه يتطلب إقرار المالك القانوني (faceAcknowledged — القانون 09-08/CNDP)
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { localizedName, localizeRow, localizeNested } from "@/lib/localized-name";
import { getUiLocale } from "@/i18n/ui-locale";
import { requirePermission, AccessError } from "@/lib/rbac";
import { writeAudit } from "@/lib/audit";
import { isPolicyMode, isWithin, modeRequiresFace, POLICY_MODES, type PolicyMode } from "@/lib/verification";

const policyPutSchema = z.object({
  level: z.enum(["platform", "company", "site"]),
  siteId: z.string().min(1).max(64).nullish(),
  policy: z.enum(POLICY_MODES),
  faceAcknowledged: z.boolean().default(false),
});

/** الوضع الأقصى المسموح افتراضياً عند غياب سياسة الأب (كل العوامل) */
const VIRTUAL_ALL: PolicyMode = "qr_or_face";

async function loadRows(companyId: string) {
  const [platform, company, siteRows] = await Promise.all([
    db.verificationPolicy.findFirst({ where: { companyId: null, siteId: null } }),
    db.verificationPolicy.findFirst({ where: { companyId, siteId: null } }),
    db.verificationPolicy.findMany({
      where: { companyId, siteId: { not: null } },
      include: { site: { select: { id: true, name: true, names: true } } },
    }),
  ]);
  return { platform, company, siteRows };
}

export async function GET() {
  try {
    const session = await getSession();
    const locale = await getUiLocale();
    requirePermission(session, "company.manage");

    const { platform, company, siteRows } = await loadRows(session!.companyId);

    return NextResponse.json({
      platform: platform
        ? { policy: platform.policy, faceAcknowledged: platform.faceAcknowledged, updatedAt: platform.updatedAt }
        : null,
      company: company
        ? { policy: company.policy, faceAcknowledged: company.faceAcknowledged, updatedAt: company.updatedAt }
        : null,
      sites: siteRows.map((r) => ({
        siteId: r.siteId,
        siteName: r.site ? localizedName(r.site, locale, "name") : "—",
        policy: r.policy,
        faceAcknowledged: r.faceAcknowledged,
        updatedAt: r.updatedAt,
      })),
    });
  } catch (error) {
    if (error instanceof AccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[verification-policies]", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await getSession();
    requirePermission(session, "company.manage");
    // سياسة المنصة قرار مالك المنصة حصراً (SPEC §4.2: «بحسب المالك»)
    const body = await req.json().catch(() => null);
    const levelParsed = z.enum(["platform", "company", "site"]).safeParse(
      (body as { level?: unknown } | null)?.level
    );
    if (levelParsed.success && levelParsed.data === "platform") {
      requirePermission(session, "platform.manage");
    }

    const parsed = policyPutSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "invalid_input" }, { status: 400 });
    }
    const { level, policy, faceAcknowledged } = parsed.data;

    // 1) بوابة الوجه: إقرار المالك القانوني إلزامي قبل أي وضع يشمل الوجه (SPEC §4.2)
    if (modeRequiresFace(policy) && !faceAcknowledged) {
      return NextResponse.json({ error: "face_acknowledgment_required" }, { status: 400 });
    }

    // 2) التخصيص الأضيق فقط ضمن ما يسمح به الأب
    // الأب الفعّال للموقع = الأشدّ بين سياسة الشركة وسياسة المنصة (منع تجاوز المالك عبر الشركة)
    const { platform, company } = await loadRows(session!.companyId);
    let parentId: string | null = null;
    let parentMode: PolicyMode;

    const platformMode = platform && isPolicyMode(platform.policy) ? platform.policy : null;
    const companyMode = company && isPolicyMode(company.policy) ? company.policy : null;

    if (level === "platform") {
      parentMode = VIRTUAL_ALL; // المنصة قمة السلسلة
    } else if (level === "company") {
      parentMode = platformMode ?? VIRTUAL_ALL;
      parentId = platform?.id ?? null;
    } else {
      // الأشدّ بين الشركة والمنصة: من يحمل مجموعة عوامل أصغر
      if (companyMode && platformMode) {
        const companyStricter = isWithin(companyMode, platformMode); // عوامل الشركة ⊆ عوامل المنصة
        parentMode = companyStricter ? companyMode : platformMode;
        parentId = companyStricter ? company!.id : platform!.id;
      } else if (companyMode) {
        parentMode = companyMode;
        parentId = company!.id;
      } else if (platformMode) {
        parentMode = platformMode;
        parentId = platform!.id;
      } else {
        parentMode = VIRTUAL_ALL;
      }
    }
    if (!isWithin(policy, parentMode)) {
      return NextResponse.json(
        { error: "policy_narrowing_violation", parentMode },
        { status: 400 }
      );
    }

    // 3) الكتابة حسب المستوى
    if (level === "site") {
      const siteId = parsed.data.siteId ?? "";
      const site = await db.site.findFirst({
        where: { id: siteId, companyId: session!.companyId, status: "active" },
        select: { id: true, name: true },
      });
      if (!site) {
        return NextResponse.json({ error: "invalid_reference" }, { status: 400 });
      }

      const existing = await db.verificationPolicy.findFirst({
        where: { companyId: session!.companyId, siteId: site.id },
      });
      const row = existing
        ? await db.verificationPolicy.update({
            where: { id: existing.id },
            data: { policy, faceAcknowledged },
          })
        : await db.verificationPolicy.create({
            data: { companyId: session!.companyId, siteId: site.id, policy, faceAcknowledged },
          });

      await writeAudit({
        companyId: session!.companyId,
        userId: session!.sub,
        action: "policy.update",
        entity: "verification_policy",
        entityId: row.id,
        before: existing ? { policy: existing.policy, faceAcknowledged: existing.faceAcknowledged } : null,
        after: { level, siteId: site.id, siteName: site.name, policy, faceAcknowledged, parentMode },
      });
      return NextResponse.json({ policy: { level, siteId: site.id, policy, faceAcknowledged } });
    }

    // مستوى المنصة أو الشركة — siteId دائماً null
    const companyId = level === "platform" ? null : session!.companyId;
    const existing = await db.verificationPolicy.findFirst({
      where: { companyId, siteId: null },
    });
    const row = existing
      ? await db.verificationPolicy.update({
          where: { id: existing.id },
          data: { policy, faceAcknowledged },
        })
      : await db.verificationPolicy.create({
          data: { companyId, siteId: null, policy, faceAcknowledged },
        });

    await writeAudit({
      companyId: session!.companyId,
      userId: session!.sub,
      action: "policy.update",
      entity: "verification_policy",
      entityId: row.id,
      before: existing ? { policy: existing.policy, faceAcknowledged: existing.faceAcknowledged } : null,
      after: { level, policy, faceAcknowledged, parentMode },
    });
    return NextResponse.json({ policy: { level, policy, faceAcknowledged } });
  } catch (error) {
    if (error instanceof AccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[verification-policies]", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
