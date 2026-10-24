// HRMP — أنواع محرك الأجور (SPEC §4.3 و§11 — المرحلة 6أ+6ب)
// المال Int بالسنتيم | النسب مخزنة «نسبة مئوية ×10000» (4.48% → 44800 → الكسر = قيمة/10^6)
// المحرك كله دوال نقية (pure) بلا قاعدة بيانات — قابل للاختبار المباشر (SPEC §4.3: منطق الحساب وحدة نقية)

export type PayType = "hourly" | "daily" | "monthly";

export const PAY_TYPES: PayType[] = ["hourly", "daily", "monthly"];
export const TRANSPORT_ZONES = ["urban", "outside"] as const;
export type TransportZone = (typeof TRANSPORT_ZONES)[number];

/** ملف العامل المدخل للحساب (من EmployeeProfile) */
export type EmployeeInput = {
  userId: string;
  payType: PayType;
  hourlyRateCents: number | null;
  dailyRateCents: number | null;
  monthlyCents: number | null;
  dependentsCount: number;
  transportZone: TransportZone;
};

/** شريحة زمنية عملت فعلًا (UTC ms) — من حضور موثق أو من مجدول (بلا حضور) */
export type WorkSlice = {
  startMs: number;
  endMs: number;
};

/** سياق تصنيف الدقائق: منطقة الشركة، يوم الراحة، العطل، حدود الليل، سقف الأسبوع */
export type HoursContext = {
  timezone: string;
  restDay: number; // 0=الأحد … 6=السبت (CompanySettings.restDay)
  holidays: string[]; // "YYYY-MM-DD" محلي
  nightStartMin: number; // من قاعدة night.start (1260 = 21:00)
  nightEndMin: number; // من قاعدة night.end (360 = 06:00)
  weeklyThresholdMin: number; // work.weekly_hours × 60
};

/** دلاء الإضافي الأربعة (SPEC §11.4 — المادة 201) بالدقائق */
export type OvertimeBuckets = {
  dayNormal: number; // نهار × يوم عادي → +25%
  nightNormal: number; // ليل × يوم عادي → +50%
  dayRest: number; // نهار × راحة/عطلة → +50%
  nightRest: number; // ليل × راحة/عطلة → +100%
};

/** تفصيل يوم واحد (شفافية «كيف حُسب كل مبلغ» — SPEC §4.3) */
export type DayBreakdownRow = {
  date: string; // YYYY-MM-DD محلي
  minutes: number; // دقائق العمل في اليوم
  dayKind: "normal" | "rest" | "holiday";
  otMinutes: number; // دقائق الإضافي في اليوم
};

/** ناتج محرك الساعات */
export type WorkedTime = {
  baseMinutes: number; // الدقائق العادية (غير الإضافي) المؤدى عنها الأساس
  overtime: OvertimeBuckets;
  totalMinutes: number;
  workedDays: string[]; // أيام محلية اشتغل فيها فعلًا
  breakMinutes: number; // استراحات مجدولة (معلومة)
  scheduledMinutes: number; // صافي المجدول (بعد الاستراحة)
  attendedMinutes: number; // صافي الموثق حضورًا
  attendanceBased: boolean; // true = يوجد حضور موثق (الأساس الدقائق الفعلية)
  daily: DayBreakdownRow[];
};

/** بند يدوي (مكافأة/خصم/بدل) — كل بند له سبب ومنشئ (SPEC §4.3) */
export type ManualLineInput = {
  kind: "bonus" | "deduction" | "allowance_transport" | "allowance_meals";
  amountCents: number; // موجب دائمًا (الإشارة تُحدَّد بالنوع)
  reason?: string;
};

/** مرجعية القاعدة المستخدمة (SPEC 6ب: مرجع كل نسبة بتاريخ سريان) */
export type RuleProvenance = {
  key: string;
  value: string;
  unit: string;
  source: string | null;
  effectiveFrom: string; // YYYY-MM-DD
  verifiedBy: string | null;
};

/** مجموعة القواعد المحلولة زمنيًا — كل قيمة من pay_rules لا من الكود (AGENTS §1.8) */
export type PayRuleSet = {
  smigHourlyCents: number;
  weeklyHours: number;
  dailyHours: number; // ساعات اليوم القياسية (تحويل اليومي←الساعي)
  otDayNormalBp: number;
  otNightNormalBp: number;
  otDayRestBp: number;
  otNightRestBp: number;
  nightStartMin: number;
  nightEndMin: number;
  cnssEmployeeShortBp: number;
  cnssEmployeeLongBp: number;
  cnssCeilingCents: number;
  amoEmployeeBp: number;
  employerPrestShortBp: number;
  employerPrestLongBp: number;
  employerFamilyBp: number;
  employerAmoBp: number;
  employerTfpBp: number;
  irBrackets: IrBracket[];
  irFamilyDeductionCents: number; // للشخص الواحد شهريًا
  irFamilyDeductionCapPeople: number; // سقف الأشخاص (6)
  proRate35LimitCents: number;
  proCap35Cents: number;
  proRate35Bp: number;
  proRate25Bp: number;
  proRate25CapCents: number;
  exemptTransportUrbanCents: number;
  exemptTransportOutsideCents: number;
  exemptMealsIrDailyCents: number;
  exemptMealsCnssDailyCents: number;
  provenance: Record<string, RuleProvenance>;
};

/** شريحة IR شهرية (من JSON قاعدة ir.brackets) */
export type IrBracket = {
  upToMonthlyCents: number | null;
  rateBp: number;
  deductMonthlyCents: number;
};

/** بند كشف محسوب (قبل التخزين) */
export type ComputedLine = {
  kind: string;
  minutes: number | null;
  rateBp: number | null;
  amountCents: number; // موجب = استحقاق، سالب = خصم/اقتطاع
  exemptIrCents: number;
  exemptCnssCents: number;
  order: number;
  reason?: string;
};

/** تحذير الحساب (رموز تُترجم في الواجهة) */
export type PayrollWarning =
  | "smig_breached"
  | "transport_cap_exceeded"
  | "meals_caps_exceeded"
  | "negative_net"
  | "no_attendance"
  | "unverified_rules"
  | "regime_needs_confirmation"
  | "regime_changed_mid_period";

/** ناتج الحساب الكامل */
export type Computation = {
  lines: ComputedLine[];
  totals: {
    workedMinutes: number;
    breakMinutes: number;
    overtimeMinutes: number;
    workedDays: number;
    grossCents: number;
    sbiCents: number;
    cnssBaseCents: number;
    cnssEmployeeCents: number;
    amoEmployeeCents: number;
    employeeOtherCents: number; // بنود اقتطاع غير قياسية من مسار مخصص (SPEC §12)
    proDeductionCents: number;
    rniCents: number;
    irGrossCents: number;
    familyDeductionCents: number;
    irNetCents: number;
    netCents: number;
    employerCostCents: number;
    totalCostCents: number;
    effectiveHourlyCents: number | null;
  };
  smigBreached: boolean;
  warnings: PayrollWarning[];
};

/** مدخل الحساب الكامل */
export type ComputeInput = {
  employee: EmployeeInput;
  worked: WorkedTime;
  manualLines: ManualLineInput[];
  rules: PayRuleSet;
  monthlyHoursDivisor: number; // CompanySettings.monthlyHoursDivisor (191 = 44×52/12) — أو أساس المسار (فلاحي: 26×8=208)
  regime?: import("./regime").RegimeDefinition; // المرحلة 6ج: تعريف المسار (بنود + خطوات) — غيابه = سلوك 6أ/6ب
};

/** خطأ قاعدة مفقودة — لا قيم افتراضية في الكود أبدًا (AGENTS §1.8) */
export class MissingPayRuleError extends Error {
  keys: string[];
  constructor(keys: string[]) {
    super(`missing_pay_rule: ${keys.join(", ")}`);
    this.name = "MissingPayRuleError";
    this.keys = keys;
  }
}
