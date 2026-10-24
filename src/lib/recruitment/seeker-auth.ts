// HRMP — جلسة الباحث عن عمل: JWT مستقل بكيان مستقل (طلب المالك 2026-10-24)
// ---------------------------------------------------------------------------
// الباحثون كيان عام لا صلة له بعضويات الشركات (SPEC §3.1) — لذا جلستهم كيان
// منفصل تمامًا: كوكي خاص HRMP_SEEKER_SESSION ومُصدِر مختلف "hrmp-seeker" تحت
// سر AUTH_SECRET نفسه. لا يمكن لجلسة باحث فتح أي مسار لوحة/شركة، ولا لجلسة
// موظف فتح بوابة الباحث — التمييز بالمُصدِر + الحقول لا بالدور فقط.
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { db } from "@/lib/db";

export const SEEKER_COOKIE = "HRMP_SEEKER_SESSION";
export const SEEKER_MAX_AGE = 60 * 60 * 12; // 12 ساعة — نفس عقد جلسات المنصة

export type SeekerSessionPayload = {
  sub: string; // seekerId
  email: string;
  name: string;
  issuedAt: number;
};

function getSecretKey(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("AUTH_SECRET مفقود أو قصير جدًا (المطلوب ≥32 محرفًا) — راجع .env.example");
  }
  return new TextEncoder().encode(secret);
}

export async function signSeekerSession(payload: SeekerSessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setIssuer("hrmp-seeker")
    .setExpirationTime(`${SEEKER_MAX_AGE}s`)
    .sign(getSecretKey());
}

async function verifySeekerToken(token: string): Promise<SeekerSessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey(), { issuer: "hrmp-seeker" });
    if (typeof payload.sub === "string" && typeof payload.iat === "number") {
      return {
        sub: payload.sub,
        email: (payload.email as string) ?? "",
        name: (payload.name as string) ?? "",
        issuedAt: payload.iat,
      };
    }
    return null;
  } catch {
    return null;
  }
}

/** الجلسة الموثّقة من القاعدة: الحساب نشط + إبطال الجلسات القديمة محترم */
export async function getSeekerSession(): Promise<SeekerSessionPayload | null> {
  const store = await cookies();
  const token = store.get(SEEKER_COOKIE)?.value;
  if (!token) return null;
  const raw = await verifySeekerToken(token);
  if (!raw) return null;

  const seeker = await db.jobSeeker.findUnique({
    where: { id: raw.sub },
    select: { isActive: true, sessionsInvalidatedAt: true },
  });
  if (!seeker || !seeker.isActive) return null;

  // نفس قاعدة إبطال جلسات المنصة (حدود الثانية الواحدة — سباق المرحلة 8 الموثّق)
  const invalidatedAt = seeker.sessionsInvalidatedAt;
  if (invalidatedAt && raw.issuedAt * 1000 < Math.floor(invalidatedAt.getTime() / 1000) * 1000) {
    return null;
  }
  return raw;
}

export async function setSeekerCookie(token: string): Promise<void> {
  const store = await cookies();
  store.set(SEEKER_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: SEEKER_MAX_AGE,
    path: "/",
  });
}

export async function clearSeekerCookie(): Promise<void> {
  const store = await cookies();
  store.delete(SEEKER_COOKIE);
}
