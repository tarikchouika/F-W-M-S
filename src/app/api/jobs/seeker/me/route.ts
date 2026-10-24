// HRMP — ملف الباحث (بوابة /jobs/me): الحالة + الطلبات — بيانات الباحث نفسه حصرًا
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSeekerSession } from "@/lib/recruitment/seeker-auth";
import { listMyApplications } from "@/lib/recruitment/service";
import { getUiLocale } from "@/i18n/ui-locale";

export async function GET() {
  try {
    const session = await getSeekerSession();
    if (!session) {
      return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    }
    const locale = await getUiLocale();
    const [profile, applications] = await Promise.all([
      db.jobSeeker.findUnique({
        where: { id: session.sub },
        select: {
          id: true,
          fullName: true,
          email: true,
          phone: true,
          status: true,
          emailVerifiedAt: true,
          phoneVerifiedAt: true,
          documentType: true,
          documentName: true,
          rejectionReason: true,
          createdAt: true,
        },
      }),
      listMyApplications(session.sub, locale),
    ]);
    if (!profile) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    return NextResponse.json({
      seeker: {
        ...profile,
        phone: `+${profile.phone}`,
        hasDocument: !!profile.documentType,
        emailVerified: !!profile.emailVerifiedAt,
        phoneVerified: !!profile.phoneVerifiedAt,
      },
      applications,
    });
  } catch (error) {
    console.error("[jobs/seeker/me]", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
