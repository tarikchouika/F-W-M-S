// FWMS — شعار المنصة المعتمد (2026-10-21): لوغو ذهبي جديد بدل النجمة/الدبوس.
//
// المعنى المرسوم: حرفا «FW» بالذهب المطروق، نسيج زليج مغربي داخل الحروف،
// دبوس موقع (الحضور الجغرافي) + ترس (الجدولة) + ثلاثة عمّال بسهم صعود (القوى العاملة
// والتنمية)، على أرضية كحلية عميقة — هوية «ذهب + كحلي» بدل «أخضر + ذهب».
//
// الملفّات (تُولَّد بـ`node scripts/gen-brand-assets.mjs` من public/brand/logo-source.jpg):
//   /brand/logo-square-128.webp — اللوغو كاملًا (أرضية كحلية + علامة ذهبية) للواجهة
//   /brand/logo-mark.webp       — العلامة الذهبية بخلفية شفافة (العلامة المائية والزخرفة)
//
// `unoptimized` مقصود: الأصول ثابتة محسوبة مسبقًا (3.5KB للشعار) ⇒ لا محسّن صور
// على الخادم ولا انتظار، والعرض مُتحكَّم به بـCSS.
import Image from "next/image";

/** اللوغو الكامل (أرضية كحلية) — للترويسة والفوتر والشريط الجانبي وبطاقة الدخول */
export function FwmsLogo({ className = "size-8" }: { className?: string }) {
  return (
    <Image
      src="/brand/logo-square-128.webp"
      alt="FWMS"
      aria-label="FWMS"
      width={128}
      height={128}
      unoptimized
      className={`${className} rounded-[22%] object-cover shadow-[0_2px_10px_-4px_rgba(11,27,51,0.6)]`}
    />
  );
}

/** العلامة الذهبية الشفافة — للعلامة المائية والزخرفة والوثائق */
export function FwmsMark({ className = "size-8" }: { className?: string }) {
  return (
    <Image
      src="/brand/logo-mark.webp"
      alt=""
      aria-hidden
      width={512}
      height={512}
      unoptimized
      className={className}
    />
  );
}
