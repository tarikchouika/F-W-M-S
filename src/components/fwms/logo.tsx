// FWMS — شعار المنصة: دبوس موقع مدمج بنجمة زليج ثمانية (هوية مغربية)
//
// لون النجمة ذهبي (`--fwms-gold`) لا أخضر (`--primary`): الشعار يُرسم فوق أخضر
// دائمًا (تدرّج صفحة الدخول/الهبوط + الشريط الجانبي الأخضر)، فأخضر على أخضر
// يجعل النجمة تتسرّب ويبقى الدبوس وحده. الأخضر + الذهب هو زوج الهوية المعتمد
// (globals.css §`--fwms-gold`) وهو أيضًا ما يبقى مقروءًا في الوضعين فاتحًا وقائمًا.
export function FwmsLogo({ className = "size-8" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label="FWMS"
    >
      {/* نجمة الزليج الثمانية — ذهبية */}
      <path
        d="M24 2 29 11.5 39.5 9 37 19.5 46 24 37 28.5 39.5 39 29 36.5 24 46 19 36.5 8.5 39 11 28.5 2 24 11 19.5 8.5 9 19 11.5 24 2Z"
        className="fill-gold"
      />
      {/* الدبوس الجغرافي */}
      <path
        d="M24 13c-4.97 0-9 4.03-9 9 0 6.5 9 17 9 17s9-10.5 9-17c0-4.97-4.03-9-9-9Z"
        className="fill-background"
      />
      <circle cx="24" cy="22" r="3.6" className="fill-gold" />
      <circle cx="24" cy="22" r="1.6" className="fill-background" />
    </svg>
  );
}
