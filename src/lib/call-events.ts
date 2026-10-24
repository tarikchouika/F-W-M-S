"use client";

// HRMP — جسر طلب الاتصال المباشر (بلاغ المالك 2026-10-24)
// voice-console (أزرار الاتصال) في شجرة مختلفة عن تخطيط اللوحة (حيث يعيش
// مدير الاتصال ليصلك الرن في أي صفحة) — جسر مفرد بسيط يربطهما بلا
// window-globals ولا prop-drilling: المكوّن يسجّل نفسه، والأزرار تطلب.
export type StartCallRequest = {
  userId: string;
  name: string;
  media: "audio" | "video";
};

type CallRequestHandler = (req: StartCallRequest) => void;

let handler: CallRequestHandler | null = null;

/** مدير الاتصال يسجّل نفسه عند التركيب وينزل نفسه عند التفكيك */
export function setCallRequestHandler(h: CallRequestHandler | null): void {
  handler = h;
}

/** أي زر اتصال في المنصة يطلب بدء اتصال عبر هذا المدخل */
export function requestStartCall(req: StartCallRequest): void {
  handler?.(req);
}
