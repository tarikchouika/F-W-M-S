// HRMP — سياسة التحقق من الهوية عند الحضور + رموز QR الدوّارة (SPEC §4.2 — المرحلة 4)
// «تُحدَّد بتخصيص الجهة المالكة، مع تخصيص أضيق للشركة ثم الموقع فقط ضمن ما يسمح به المالك»
// QR: رمز قصير العمر موقَّع HMAC في الخادم — لا رمز ثابت مطبوع (يُصوَّر ويُرسَل)
import { createHash, createHmac, randomBytes, timingSafeEqual } from "crypto";
import { db } from "@/lib/db";

export const POLICY_MODES = [
  "none",
  "qr",
  "face",
  "qr_and_face",
  "qr_or_face",
] as const;
export type PolicyMode = (typeof POLICY_MODES)[number];

export function isPolicyMode(value: string): value is PolicyMode {
  return (POLICY_MODES as readonly string[]).includes(value);
}

/** عوامل التحقق لكل وضع — شبه الشبكة (lattice) للتخصيص الأضيق */
export function factorsOf(mode: PolicyMode): Set<"qr" | "face"> {
  switch (mode) {
    case "none":
      return new Set();
    case "qr":
      return new Set(["qr"]);
    case "face":
      return new Set(["face"]);
    default:
      return new Set(["qr", "face"]); // qr_and_face | qr_or_face
  }
}

/** هل الوضع الطفل ضمن ما يسمح به الأب؟ (عوامل الطفل ⊆ عوامل الأب) — قاعدة «فقط ضمن ما يسمح به المالك» */
export function isWithin(mode: PolicyMode, parent: PolicyMode): boolean {
  for (const factor of factorsOf(mode)) {
    if (!factorsOf(parent).has(factor)) return false;
  }
  return true;
}

export function modeRequiresFace(mode: PolicyMode): boolean {
  return factorsOf(mode).has("face");
}

/// ─── حلّ السياسة النافذة لموقع: الموقع ← الشركة ← المنصة ───────

export type ResolvedPolicy = {
  mode: PolicyMode;
  level: "site" | "company" | "platform";
  faceAcknowledged: boolean;
};

function asMode(value: string): PolicyMode {
  return isPolicyMode(value) ? value : "none";
}

/** السياسة النافذة لموقع: أعلى مستوى مخصَّص يفوز (الموقع أضيق من الشركة أضيق من المنصة) */
export async function resolvePolicyForSite(site: {
  id: string;
  companyId: string;
}): Promise<ResolvedPolicy> {
  const [sitePolicy, companyPolicy, platformPolicy] = await Promise.all([
    db.verificationPolicy.findFirst({
      where: { companyId: site.companyId, siteId: site.id },
    }),
    db.verificationPolicy.findFirst({
      where: { companyId: site.companyId, siteId: null },
    }),
    db.verificationPolicy.findFirst({
      where: { companyId: null, siteId: null },
    }),
  ]);
  if (sitePolicy) {
    return { mode: asMode(sitePolicy.policy), level: "site", faceAcknowledged: sitePolicy.faceAcknowledged };
  }
  if (companyPolicy) {
    return { mode: asMode(companyPolicy.policy), level: "company", faceAcknowledged: companyPolicy.faceAcknowledged };
  }
  if (platformPolicy) {
    return { mode: asMode(platformPolicy.policy), level: "platform", faceAcknowledged: platformPolicy.faceAcknowledged };
  }
  // لا سياسة معرّفة إطلاقًا → GPS فقط (الافتراض المحافظ — تفعيل غيره قرار صريح)
  return { mode: "none", level: "company", faceAcknowledged: false };
}

/// ─── رموز QR الدوّارة (HMAC بلا حالة — TTL قصير، nonce يمنع إعادة الاستخدام) ──

export const QR_TTL_SECONDS = 90; // دوّار قصير العمر — «لا يكفي تصويره» (SPEC §4.2)

function qrSecret(): string {
  const base = process.env.AUTH_SECRET ?? "hrmp-dev-qr-secret"; // اشتقاق مفتاح مستقل عن JWT
  return createHash("sha256").update(`${base}:qr`).digest("hex");
}

export type QrPayload = { s: string; c: string; e: number; n: string };

export function issueQrToken(
  site: { id: string; companyId: string },
  now = new Date()
): { token: string; payload: QrPayload; expiresAt: Date } {
  const expiresAt = new Date(now.getTime() + QR_TTL_SECONDS * 1000);
  const payload: QrPayload = {
    s: site.id,
    c: site.companyId,
    e: Math.floor(expiresAt.getTime() / 1000),
    n: randomBytes(9).toString("base64url"),
  };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", qrSecret()).update(body).digest("base64url");
  return { token: `${body}.${sig}`, payload, expiresAt };
}

export type QrVerifyResult =
  | { ok: true; nonce: string }
  | { ok: false; reason: "qr_invalid" | "qr_expired" };

export function verifyQrToken(
  token: string,
  expected: { siteId: string; companyId: string },
  now = new Date()
): QrVerifyResult {
  try {
    const dot = token.indexOf(".");
    if (dot <= 0) return { ok: false, reason: "qr_invalid" };
    const body = token.slice(0, dot);
    const sig = token.slice(dot + 1);
    const expectedSig = createHmac("sha256", qrSecret()).update(body).digest("base64url");
    const a = Buffer.from(sig, "utf8");
    const b = Buffer.from(expectedSig, "utf8");
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return { ok: false, reason: "qr_invalid" };
    }
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as QrPayload;
    if (payload.s !== expected.siteId || payload.c !== expected.companyId) {
      return { ok: false, reason: "qr_invalid" };
    }
    if (payload.e * 1000 < now.getTime()) {
      return { ok: false, reason: "qr_expired" };
    }
    return { ok: true, nonce: payload.n };
  } catch {
    return { ok: false, reason: "qr_invalid" };
  }
}

/// ─── تقييم التحقق لحدث حضور وفق السياسة النافذة ────────────────

export type VerificationInput = {
  qrToken?: string | null;
  face?: { matched: boolean; liveness: boolean } | null;
};

export type VerificationOutcome = {
  satisfied: PolicyMode; // ما تحقق فعلاً — يُخزَّن في الحدث
  failed: "qr_missing" | "qr_invalid" | "qr_expired" | "face_missing" | "face_failed" | null;
  qrNonce: string | null;
};

/**
 * تقييم التحقق وفق السياسة — الفشل لا يقفل العامل بل يتحول لتسجيل بمراجعة
 * (SPEC §4.2: «عند فشل المطابقة: تسجيل بمراجعة … مع بقاء الشرط الجغرافي»)
 */
export function evaluateVerification(
  mode: PolicyMode,
  input: VerificationInput,
  expected: { siteId: string; companyId: string },
  now = new Date()
): VerificationOutcome {
  if (mode === "none") return { satisfied: "none", failed: null, qrNonce: null };

  // تقييم QR
  let qrOk = false;
  let qrNonce: string | null = null;
  let qrFailure: VerificationOutcome["failed"] = null;
  if (input.qrToken) {
    const verdict = verifyQrToken(input.qrToken, expected, now);
    if (verdict.ok) {
      qrOk = true;
      qrNonce = verdict.nonce;
    } else {
      qrFailure = verdict.reason;
    }
  } else {
    qrFailure = "qr_missing";
  }

  // تقييم الوجه (النتيجة من الجهاز — لا تُخزَّن صور خام أبدًا، SPEC §4.2)
  let faceOk = false;
  let faceFailure: VerificationOutcome["failed"] = null;
  if (input.face) {
    if (input.face.matched && input.face.liveness) {
      faceOk = true;
    } else {
      faceFailure = "face_failed";
    }
  } else {
    faceFailure = "face_missing";
  }

  switch (mode) {
    case "qr":
      return qrOk
        ? { satisfied: "qr", failed: null, qrNonce }
        : { satisfied: "none", failed: qrFailure, qrNonce: null };
    case "face":
      return faceOk
        ? { satisfied: "face", failed: null, qrNonce: null }
        : { satisfied: "none", failed: faceFailure, qrNonce: null };
    case "qr_and_face": {
      const failed = !qrOk ? qrFailure : !faceOk ? faceFailure : null;
      return failed
        ? { satisfied: qrOk && faceOk ? "qr_and_face" : "none", failed, qrNonce: qrOk ? qrNonce : null }
        : { satisfied: "qr_and_face", failed: null, qrNonce };
    }
    case "qr_or_face": {
      if (qrOk) return { satisfied: "qr", failed: null, qrNonce };
      if (faceOk) return { satisfied: "face", failed: null, qrNonce: null };
      const failed = qrFailure === "qr_missing" && faceFailure === "face_missing" ? "qr_missing" : qrFailure ?? faceFailure;
      return { satisfied: "none", failed, qrNonce: null };
    }
    default:
      return { satisfied: "none", failed: null, qrNonce: null };
  }
}
