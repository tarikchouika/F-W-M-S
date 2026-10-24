// HRMP — رفع صورة وثيقة هوية الباحث (بطاقة وطنية/جواز/رخصة): multipart مع حدود صارمة
import { NextRequest, NextResponse } from "next/server";
import { getSeekerSession } from "@/lib/recruitment/seeker-auth";
import { uploadSeekerDocument } from "@/lib/recruitment/service";
import { DOC_ACCEPTED_MIMES, DOC_MAX_BYTES, isDocumentType } from "@/lib/recruitment/types";

export async function POST(req: NextRequest) {
  try {
    const session = await getSeekerSession();
    if (!session) {
      return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    }

    // الحد الصلب قبل أي قراءة: Length القادمة (يمنع تضخيم الذاكرة بملف عملاق)
    const declared = Number(req.headers.get("content-length") ?? "0");
    if (declared > DOC_MAX_BYTES + 64 * 1024) {
      return NextResponse.json({ error: "doc_too_large" }, { status: 413 });
    }

    const form = await req.formData().catch(() => null);
    if (!form) {
      return NextResponse.json({ error: "invalid_input" }, { status: 400 });
    }
    const type = String(form.get("type") ?? "");
    const file = form.get("file");
    if (!isDocumentType(type) || !(file instanceof File)) {
      return NextResponse.json({ error: "invalid_input" }, { status: 400 });
    }
    if (file.size === 0 || file.size > DOC_MAX_BYTES) {
      return NextResponse.json({ error: "doc_too_large" }, { status: 413 });
    }
    // المِيم من نوع المحتوى المُعلن + بادئة البايتات (شمّ خفيف يمنع التسمية الكاذبة)
    const mime = file.type || "application/octet-stream";
    if (!(DOC_ACCEPTED_MIMES as readonly string[]).includes(mime)) {
      return NextResponse.json({ error: "doc_bad_mime" }, { status: 415 });
    }
    const bytes = Buffer.from(await file.arrayBuffer());
    const magicJpeg = bytes.length > 2 && bytes[0] === 0xff && bytes[1] === 0xd8;
    const magicPng = bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
    const magicWebp =
      bytes.length > 12 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50;
    const magicOk =
      (mime === "image/jpeg" && magicJpeg) ||
      (mime === "image/png" && magicPng) ||
      (mime === "image/webp" && magicWebp);
    if (!magicOk) {
      return NextResponse.json({ error: "doc_bad_mime" }, { status: 415 });
    }

    const result = await uploadSeekerDocument(session.sub, {
      type,
      fileName: file.name || "document",
      mime,
      bytes,
    });
    if (!result.ok) {
      const status = result.error === "doc_too_large" ? 413 : result.error === "doc_bad_mime" ? 415 : 400;
      return NextResponse.json({ error: result.error }, { status });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[jobs/seeker/document]", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
