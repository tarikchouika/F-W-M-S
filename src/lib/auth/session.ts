// FWMS — إدارة الجلسة من الخادم: قراءة cookie، جلسة موسّعة من القاعدة، وحرّاس الوصول
import { cookies, headers } from "next/headers";
import { db } from "@/lib/db";
import { SESSION_COOKIE, SESSION_MAX_AGE, signSession, verifySession, type SessionPayload } from "./jwt";

export type { SessionPayload };

/** قراءة الجلسة الخام من cookie (سريعة، بلا قاعدة) */
export async function getRawSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySession(token);
}

/** الجلسة الموثّقة من القاعدة: العضوية النشطة يجب أن تكون سارية والشركة نشطة */
export async function getSession(): Promise<
  | (SessionPayload & {
      companyName: string;
      companyLocale: string;
      companyTimezone: string;
    })
  | null
> {
  const raw = await getRawSession();
  if (!raw) return null;

  const membership = await db.userMembership.findFirst({
    where: {
      id: raw.membershipId,
      userId: raw.sub,
      revokedAt: null,
      company: { status: "active" },
    },
    include: {
      company: true,
      user: {
        select: { isActive: true, sessionsInvalidatedAt: true },
      },
    },
  });

  if (!membership || !membership.user.isActive) return null;

  // إبطال حقيقي للجلسات: رمز صدر قبل علامة الإبطال (خروج/تدوير) يُرفض.
  // دقة iat ثانية واحدة (معيار JWT) والعلامة بالمللي ثانية — نقارن على حدود الثانية
  // كي لا تُرفض جلسة صدرت في نفس ثانية الإبطال بعده (سباق اختبار المرحلة 8 2026-10-18:
  // دخول المالك الجديد بعد النقل مباشرة كان يُرفض ظلمًا). هامش السماح ≤ ثانية والتعطيل
  // الحتمي يبقى عبر isActive فوق.
  const invalidatedAt = membership.user.sessionsInvalidatedAt;
  if (invalidatedAt && raw.issuedAt * 1000 < Math.floor(invalidatedAt.getTime() / 1000) * 1000) return null;

  return {
    ...raw,
    role: membership.role,
    companyId: membership.companyId,
    companyName: membership.company.legalName,
    companyLocale: membership.company.locale,
    companyTimezone: membership.company.timezone,
  };
}

export async function setSessionCookie(token: string): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_MAX_AGE,
    path: "/",
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

/** إصدار جلسة جديدة لعضوية (يُستخدم عند الدخول وتبديل الشركة) */
export async function issueSession(
  payload: Omit<SessionPayload, "email" | "name" | "locale">
): Promise<string> {
  const user = await db.user.findUnique({ where: { id: payload.sub } });
  if (!user) throw new Error("user not found");
  const token = await signSession({
    ...payload,
    email: user.email,
    name: user.fullName,
    locale: user.locale,
  });
  return token;
}

/** بيانات الطلب للتدقيق */
export async function requestMeta(): Promise<{ ip: string | null; userAgent: string | null }> {
  const h = await headers();
  const ip =
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    h.get("x-real-ip") ??
    null;
  return { ip, userAgent: h.get("user-agent") };
}
