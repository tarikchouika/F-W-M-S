#!/usr/bin/env python3
# HRMP — حقن مفاتيح i18n المرحلة 6أ/6ب في القواميس الأربعة (ar/fr/en/es)
# يتبع سابقة scripts/add-phase5-i18n.py — التشغيل: python3 scripts/add-phase6-i18n.py
import json
import os

DICT_DIR = os.path.join(os.path.dirname(__file__), "..", "src", "i18n", "dictionaries")

# ── ملاحظة المرحلة في لوحة التحكم ──
PHASE_NOTE = {
    "ar": "أنت تستخدم الإصدار 0.6.0 (المرحلة 6أ/6ب: محرك الأجور — الساعات والإضافي بنسب المادة 201، ثم خط الاقتطاعات القانونية كاملًا: CNSS وAMO وIR والحصة المهنية مع تكلفة المشغّل، ودورة اعتماد تقفل الكشف المعتمد، ودفتر حركات append-only، و«أجوري» للعامل). الوحدات التالية تُبنى تباعًا وفق المواصفة.",
    "fr": "Vous utilisez la version 0.6.0 (Phase 6a/6b : moteur de paie — heures et heures supplémentaires selon l'article 201, puis la chaîne complète des retenues légales : CNSS, AMO, IR et frais professionnels avec coût employeur, un cycle d'approbation qui verrouille le bulletin, un registre append-only, et « Ma paie » pour le salarié). Les modules suivants seront construits progressivement selon la spécification.",
    "en": "You are using version 0.6.0 (Phase 6a/6b: the payroll engine — hours and overtime per Article 201, then the full statutory deduction chain: CNSS, AMO, IR and professional expenses with employer cost, an approval cycle that locks the approved payslip, an append-only ledger, and \"My pay\" for workers). Remaining modules will be built progressively per the spec.",
    "es": "Estás usando la versión 0.6.0 (Fase 6a/6b: el motor de nómina — horas y extras según el artículo 201, luego la cadena completa de retenciones legales: CNSS, AMO, IR y gastos profesionales con coste del empleador, un ciclo de aprobación que bloquea la nómina aprobada, un registro append-only, y «Mi nómina» para el trabajador). Los módulos restantes se construirán progresivamente según la especificación.",
}

D = {
"ar": {
  "payroll": {
    "title": "الأجور", "subtitle": "فترات الأجور الشهرية ودورة الاعتماد: مسودة ← مراجعة ← معتمدة — بقواعد مدونة الشغل المغربية",
    "periodsTitle": "فترات الأجور", "createPeriod": "فترة أجور جديدة", "createPeriodDesc": "اختر الشهر والسنة — لا تُنشأ فترة مستقبلية",
    "year": "السنة", "month": "الشهر", "createConfirm": "إنشاء",
    "periodCreated": "أُنشئت فترة الأجور (مسودة)", "periodExists": "توجد فترة بنفس الشهر فعلًا", "futurePeriod": "لا يمكن إنشاء فترة مستقبلية",
    "statusDraft": "مسودة", "statusReviewing": "قيد المراجعة", "statusApproved": "معتمدة",
    "generate": "توليد", "generatedOk": "وُلِّد {count} كشفًا (تخطَّى {skipped})", "submittedOk": "أُرسلت الفترة للمراجعة",
    "approve": "اعتماد", "approvedOk": "اعتُمدت الفترة ووصل إشعار العمال ({count} كشفًا)",
    "smigBadge": "أقل من SMIG", "smigBlocked": "الاعتماد ممنوع: عامل بأجر أقل من الحد الأدنى",
    "smigWarning": "{count} كشفًا بأجر أقل من الحد الأدنى (SMIG) — الاعتماد ممنوع حتى التصحيح",
    "unverifiedBlocked": "الاعتماد ممنوع: قواعد أجور غير موثقة من المحاسب",
    "unverifiedRules": "{count} قاعدة أجور غير موثقة بعد — اعتماد الفترات ممنوع حتى يوثقها المحاسب",
    "verifyAll": "توثيق الكل", "rulesVerifiedAll": "وُثِّقت {count} قاعدة",
    "noPayslips": "ولِّد الكشوف أولًا قبل الإرسال للمراجعة", "notDraft": "الإجراء يتطلب حالة مسودة", "notReviewing": "الاعتماد يتطلب حالة قيد المراجعة",
    "generatedOn": "وُلِّدت {date}",
    "statPeriods": "الفترات", "statApproved": "فترات معتمدة", "statNetTotal": "صافي معتمد",
    "colPeriod": "الفترة", "colPayslips": "الكشوف", "colGross": "الإجمالي", "colNet": "الصافي", "colEmployerCost": "تكلفة المشغّل",
    "viewPeriod": "عرض", "holidaysLink": "العطل الرسمية", "workersLink": "أجور العمال",
    "periodDetail": "تفاصيل الفترة", "periodDetailSubtitle": "كشوف الفترة ببنودها الكاملة — كيف حُسب كل مبلغ",
    "backToPeriods": "عودة إلى الفترات",
    "missingProfiles": "{count} عاملًا بلا ملف أجر — لن يُولَّد له كشف (أضِفه من «أجور العمال»)",
    "totGross": "إجمالي brut", "totCnss": "CNSS (أجير)", "totAmo": "AMO (أجير)", "totIr": "IR", "totNet": "الصافي", "totEmployer": "اشتراكات المشغّل",
    "payslipsTitle": "كشوف الفترة", "noPayslipsYet": "لم تُولَّد كشوف بعد — استخدم زر التوليد",
    "colRef": "المرجع", "colWorker": "العامل", "colHours": "الساعات", "colOt": "الإضافي", "colDeductions": "الاقتطاعات",
    "viewPayslip": "الكشف", "payslipDesc": "بنود الكشف من المصدر: ساعات وإضافي واقتطاعات بتواريخ سريان القواعد",
    "approvedBadge": "معتمد — مقفل",
    "pslHours": "الساعات", "pslOt": "الإضافي", "pslDays": "الأيام", "pslNet": "الصافي",
    "colLine": "البند", "colQty": "الكمية", "colRate": "النسبة", "colAmount": "المبلغ",
    "exemptInfo": "معفى من IR حتى {amount}",
    "sumGross": "الأجر الإجمالي (brut)", "sumCnss": "CNSS (حصة الأجير)", "sumAmo": "AMO (حصة الأجير)", "sumIr": "IR الصافي",
    "sumNet": "الصافي للدفع", "sumEmployer": "اشتراكات المشغّل", "sumTotalCost": "التكلفة الإجمالية (brut + مشغّل)",
    "dailyTitle": "أيام العمل", "colDay": "اليوم", "colDayKind": "النوع", "colMinutes": "الدقائق",
    "dayNormal": "عادي", "dayRest": "راحة", "dayHoliday": "عطلة",
    "addAdjustment": "بند يدوي (مكافأة/بدل/خصم)",
    "adjKind": "النوع", "adjAmount": "المبلغ (درهم)", "adjReason": "السبب", "adjReasonPlaceholder": "سبب البند — يظهر في الكشف والتدقيق",
    "adjAdd": "إضافة البند", "adjDefaultReason": "بند يدوي",
    "adjustmentAdded": "أُضيف البند وأُعيد الحساب", "adjustmentRemoved": "حُذف البند وأُعيد الحساب",
    "lockedError": "الكشف معتمد ومقفل — التصحيح ببند في فترة لاحقة",
    "adjBonus": "مكافأة", "adjTransport": "بدل نقل", "adjMeals": "منح وجبات", "adjDeduction": "خصم/سلف (من الصافي)",
    "lineBaseHours": "أجر الساعات العادية", "lineBaseDays": "أجر الأيام", "lineBaseMonthly": "الأجر الشهري الأساسي",
    "lineAbsence": "خصم غياب غير مبرر",
    "lineOtDayNormal": "إضافي نهار (يوم عادي) +25%", "lineOtNightNormal": "إضافي ليل (يوم عادي) +50%",
    "lineOtDayRest": "إضافي نهار (راحة/عطلة) +50%", "lineOtNightRest": "إضافي ليل (راحة/عطلة) +100%",
    "lineBonus": "مكافأة", "lineTransport": "بدل نقل", "lineMeals": "منح وجبات", "lineDeduction": "خصم/سلف",
    "lineCnssShort": "CNSS — خدمات قصيرة الأجل (أجير)", "lineCnssLong": "CNSS — خدمات طويلة الأجل (أجير)",
    "lineAmo": "AMO — التأمين الإجباري عن المرض (أجير)", "linePro": "الحصة المهنية (معفاة من IR)",
    "lineIr": "الضريبة على الدخل IR", "lineFamily": "خصم الأعباء العائلية",
    "lineEmpPrestShort": "مشغّل — خدمات قصيرة الأجل 1.05%", "lineEmpPrestLong": "مشغّل — خدمات طويلة الأجل 7.93%",
    "lineEmpFamily": "مشغّل — التعويضات العائلية 6.40%", "lineEmpAmo": "مشغّل — AMO 4.11%", "lineEmpTfp": "مشغّل — الرسم المهني TFP 1.60%",
    "lineUnknown": "بند",
    "workersTitle": "أجور العمال", "workersSubtitle": "أنظمة الاحتساب (بالساعة/باليوم/شهري) + الأعباء العائلية وسقوف النقل",
    "workersListTitle": "عمال الشركة وملفات أجورهم",
    "colPayType": "نظام الأجر", "colRate": "التعرفة", "colDependents": "المعالون", "colZone": "نطاق النقل",
    "noProfile": "بلا ملف", "perHour": "ساعة", "perDay": "يوم", "perMonth": "شهر",
    "zoneUrban": "داخل المدار", "zoneOutside": "خارج المدار",
    "payTypeHourly": "بالساعة", "payTypeDaily": "باليوم/الوردية", "payTypeMonthly": "شهري",
    "rateLabel": "التعرفة (درهم)", "hireDate": "تاريخ التعيين",
    "workerSaved": "حُفظ ملف أجر العامل", "workerEditDesc": "نظام الاحتساب والتعرفة والأعباء العائلية — تُطبَّق من الفترة الموالية",
    "smigHint": "تنبيه: النظام يمنع اعتماد كشف بأجر فعلي أقل من الحد الأدنى الساري (SMIG)"
  },
  "myPayslips": {
    "title": "أجوري", "subtitle": "كشوف أجرك المعتمدة — بشفافية كل بند",
    "hours": "الساعات", "overtime": "الإضافي", "gross": "الإجمالي", "deductions": "الاقتطاعات", "net": "الصافي",
    "details": "التفاصيل", "detailDesc": "بنود الكشف: كيف حُسب كل مبلغ"
  },
  "holidays": {
    "title": "العطل الرسمية", "subtitle": "عطل {year} — تدخلها الإدارة بتواريخ مؤكدة، وتُعامل كيوم راحة في احتساب الإضافي",
    "addTitle": "إضافة عطلة", "date": "التاريخ", "namePlaceholder": "مثال: عيد الشغل", "add": "إضافة",
    "added": "أُضيفت العطلة", "exists": "توجد عطلة بهذا التاريخ فعلًا", "removed": "حُذفت العطلة",
    "listTitle": "عطل {year}",
    "religiousNote": "العطل الدينية متغيرة برؤية الهلال — أدخل تاريخ كل سنة بعد تأكيده رسميًا",
    "viewOnly": "عرض فقط — الإدخال للمدير"
  },
  "dashboard_add": {"holidays": "العطل الرسمية", "myPayslips": "أجوري"},
  "notifications_add": {"payslipLine1": "اعتُمد كشف أجرك للفترة", "payslipLine2": "المرجع"}
},
"fr": {
  "payroll": {
    "title": "Paie", "subtitle": "Périodes mensuelles et cycle d'approbation : brouillon ← révision ← approuvée — selon le code du travail marocain",
    "periodsTitle": "Périodes de paie", "createPeriod": "Nouvelle période", "createPeriodDesc": "Choisissez le mois et l'année — aucune période future",
    "year": "Année", "month": "Mois", "createConfirm": "Créer",
    "periodCreated": "Période créée (brouillon)", "periodExists": "Une période existe déjà pour ce mois", "futurePeriod": "Impossible de créer une période future",
    "statusDraft": "Brouillon", "statusReviewing": "En révision", "statusApproved": "Approuvée",
    "generate": "Générer", "generatedOk": "{count} bulletins générés ({skipped} ignorés)", "submittedOk": "Période envoyée en révision",
    "approve": "Approuver", "approvedOk": "Période approuvée — notification envoyée ({count} bulletins)",
    "smigBadge": "Sous SMIG", "smigBlocked": "Approbation bloquée : salaire inférieur au minimum légal",
    "smigWarning": "{count} bulletins sous le salaire minimum (SMIG) — approbation bloquée jusqu'à correction",
    "unverifiedBlocked": "Approbation bloquée : règles de paie non vérifiées par le comptable",
    "unverifiedRules": "{count} règles de paie non vérifiées — l'approbation est bloquée jusqu'à vérification",
    "verifyAll": "Tout vérifier", "rulesVerifiedAll": "{count} règles vérifiées",
    "noPayslips": "Générez d'abord les bulletins", "notDraft": "Action réservée au statut brouillon", "notReviewing": "L'approbation exige le statut en révision",
    "generatedOn": "Générée le {date}",
    "statPeriods": "Périodes", "statApproved": "Approuvées", "statNetTotal": "Net approuvé",
    "colPeriod": "Période", "colPayslips": "Bulletins", "colGross": "Brut", "colNet": "Net", "colEmployerCost": "Coût employeur",
    "viewPeriod": "Voir", "holidaysLink": "Jours fériés", "workersLink": "Salaires employés",
    "periodDetail": "Détail de la période", "periodDetailSubtitle": "Bulletins avec détail complet — comment chaque montant est calculé",
    "backToPeriods": "Retour aux périodes",
    "missingProfiles": "{count} employés sans profil de paie — aucun bulletin généré",
    "totGross": "Brut total", "totCnss": "CNSS (salarié)", "totAmo": "AMO (salarié)", "totIr": "IR", "totNet": "Net total", "totEmployer": "Cotisations employeur",
    "payslipsTitle": "Bulletins de la période", "noPayslipsYet": "Aucun bulletin généré — utilisez le bouton Générer",
    "colRef": "Référence", "colWorker": "Employé", "colHours": "Heures", "colOt": "Heures sup.", "colDeductions": "Retenues",
    "viewPayslip": "Bulletin", "payslipDesc": "Lignes du bulletin : heures, heures sup. et retenues selon les règles en vigueur",
    "approvedBadge": "Approuvé — verrouillé",
    "pslHours": "Heures", "pslOt": "Heures sup.", "pslDays": "Jours", "pslNet": "Net",
    "colLine": "Ligne", "colQty": "Quantité", "colRate": "Taux", "colAmount": "Montant",
    "exemptInfo": "Exonéré d'IR jusqu'à {amount}",
    "sumGross": "Salaire brut", "sumCnss": "CNSS (part salarié)", "sumAmo": "AMO (part salarié)", "sumIr": "IR net",
    "sumNet": "Net à payer", "sumEmployer": "Cotisations employeur", "sumTotalCost": "Coût total (brut + employeur)",
    "dailyTitle": "Jours travaillés", "colDay": "Jour", "colDayKind": "Type", "colMinutes": "Minutes",
    "dayNormal": "Normal", "dayRest": "Repos", "dayHoliday": "Férié",
    "addAdjustment": "Ligne manuelle (prime/indemnité/retenue)",
    "adjKind": "Type", "adjAmount": "Montant (MAD)", "adjReason": "Motif", "adjReasonPlaceholder": "Motif affiché sur le bulletin et l'audit",
    "adjAdd": "Ajouter", "adjDefaultReason": "Ligne manuelle",
    "adjustmentAdded": "Ligne ajoutée et recalcul effectué", "adjustmentRemoved": "Ligne supprimée et recalcul effectué",
    "lockedError": "Bulletin approuvé et verrouillé — correction par ligne sur une période ultérieure",
    "adjBonus": "Prime", "adjTransport": "Indemnité de transport", "adjMeals": "Allocation repas", "adjDeduction": "Retenue/avance (sur le net)",
    "lineBaseHours": "Salaire des heures normales", "lineBaseDays": "Salaire des jours", "lineBaseMonthly": "Salaire mensuel de base",
    "lineAbsence": "Retenue d'absence non justifiée",
    "lineOtDayNormal": "Heures sup. jour (jour ouvrable) +25%", "lineOtNightNormal": "Heures sup. nuit (jour ouvrable) +50%",
    "lineOtDayRest": "Heures sup. jour (repos/férié) +50%", "lineOtNightRest": "Heures sup. nuit (repos/férié) +100%",
    "lineBonus": "Prime", "lineTransport": "Indemnité de transport", "lineMeals": "Allocation repas", "lineDeduction": "Retenue/avance",
    "lineCnssShort": "CNSS — prestations court terme (salarié)", "lineCnssLong": "CNSS — prestations long terme (salarié)",
    "lineAmo": "AMO — assurance maladie (salarié)", "linePro": "Frais professionnels (exonérés d'IR)",
    "lineIr": "Impôt sur le revenu (IR)", "lineFamily": "Déduction charges de famille",
    "lineEmpPrestShort": "Employeur — court terme 1,05%", "lineEmpPrestLong": "Employeur — long terme 7,93%",
    "lineEmpFamily": "Employeur — allocations familiales 6,40%", "lineEmpAmo": "Employeur — AMO 4,11%", "lineEmpTfp": "Employeur — taxe de formation professionnelle 1,60%",
    "lineUnknown": "Ligne",
    "workersTitle": "Salaires des employés", "workersSubtitle": "Modes de calcul (horaire/journalier/mensuel) + charges de famille et plafonds transport",
    "workersListTitle": "Employés et leurs profils de paie",
    "colPayType": "Mode", "colRate": "Tarif", "colDependents": "À charge", "colZone": "Zone transport",
    "noProfile": "Sans profil", "perHour": "heure", "perDay": "jour", "perMonth": "mois",
    "zoneUrban": "urbain", "zoneOutside": "hors urbain",
    "payTypeHourly": "Horaire", "payTypeDaily": "Journalier", "payTypeMonthly": "Mensuel",
    "rateLabel": "Tarif (MAD)", "hireDate": "Date d'embauche",
    "workerSaved": "Profil de paie enregistré", "workerEditDesc": "Mode de calcul, tarif et charges de famille — appliqués dès la période suivante",
    "smigHint": "Le système bloque l'approbation d'un bulletin sous le SMIG en vigueur"
  },
  "myPayslips": {
    "title": "Ma paie", "subtitle": "Vos bulletins approuvés — chaque ligne expliquée",
    "hours": "Heures", "overtime": "Heures sup.", "gross": "Brut", "deductions": "Retenues", "net": "Net",
    "details": "Détails", "detailDesc": "Lignes du bulletin : comment chaque montant est calculé"
  },
  "holidays": {
    "title": "Jours fériés", "subtitle": "Jours fériés {year} — saisis par l'administration, traités comme jour de repos pour les heures supplémentaires",
    "addTitle": "Ajouter un jour férié", "date": "Date", "namePlaceholder": "ex. Fête du Travail", "add": "Ajouter",
    "added": "Jour férié ajouté", "exists": "Un jour férié existe déjà à cette date", "removed": "Jour férié supprimé",
    "listTitle": "Jours fériés {year}",
    "religiousNote": "Les fêtes religieuses dépendent de l'observation lunaire — saisissez chaque année après confirmation officielle",
    "viewOnly": "Lecture seule — saisie réservée au directeur"
  },
  "dashboard_add": {"holidays": "Jours fériés", "myPayslips": "Ma paie"},
  "notifications_add": {"payslipLine1": "Votre bulletin de la période", "payslipLine2": "réf."}
},
"en": {
  "payroll": {
    "title": "Payroll", "subtitle": "Monthly pay periods and approval cycle: draft ← review ← approved — per Moroccan labor law",
    "periodsTitle": "Pay periods", "createPeriod": "New pay period", "createPeriodDesc": "Pick month and year — future periods are rejected",
    "year": "Year", "month": "Month", "createConfirm": "Create",
    "periodCreated": "Pay period created (draft)", "periodExists": "A period already exists for this month", "futurePeriod": "Cannot create a future period",
    "statusDraft": "Draft", "statusReviewing": "In review", "statusApproved": "Approved",
    "generate": "Generate", "generatedOk": "Generated {count} payslips ({skipped} skipped)", "submittedOk": "Period submitted for review",
    "approve": "Approve", "approvedOk": "Period approved — workers notified ({count} payslips)",
    "smigBadge": "Below SMIG", "smigBlocked": "Approval blocked: wage below the legal minimum",
    "smigWarning": "{count} payslips below the legal minimum (SMIG) — approval blocked until fixed",
    "unverifiedBlocked": "Approval blocked: pay rules not verified by the accountant",
    "unverifiedRules": "{count} pay rules not yet verified — approval blocked until the accountant verifies them",
    "verifyAll": "Verify all", "rulesVerifiedAll": "{count} rules verified",
    "noPayslips": "Generate payslips first", "notDraft": "Action requires draft status", "notReviewing": "Approval requires in-review status",
    "generatedOn": "Generated {date}",
    "statPeriods": "Periods", "statApproved": "Approved", "statNetTotal": "Approved net",
    "colPeriod": "Period", "colPayslips": "Payslips", "colGross": "Gross", "colNet": "Net", "colEmployerCost": "Employer cost",
    "viewPeriod": "View", "holidaysLink": "Public holidays", "workersLink": "Worker pay rates",
    "periodDetail": "Period detail", "periodDetailSubtitle": "Payslips with full line breakdown — how every amount was computed",
    "backToPeriods": "Back to periods",
    "missingProfiles": "{count} workers without a pay profile — no payslip generated",
    "totGross": "Total gross", "totCnss": "CNSS (employee)", "totAmo": "AMO (employee)", "totIr": "IR", "totNet": "Total net", "totEmployer": "Employer contributions",
    "payslipsTitle": "Period payslips", "noPayslipsYet": "No payslips yet — use the Generate button",
    "colRef": "Reference", "colWorker": "Worker", "colHours": "Hours", "colOt": "Overtime", "colDeductions": "Deductions",
    "viewPayslip": "Payslip", "payslipDesc": "Payslip lines from source data: hours, overtime and deductions per effective rules",
    "approvedBadge": "Approved — locked",
    "pslHours": "Hours", "pslOt": "Overtime", "pslDays": "Days", "pslNet": "Net",
    "colLine": "Line", "colQty": "Qty", "colRate": "Rate", "colAmount": "Amount",
    "exemptInfo": "IR-exempt up to {amount}",
    "sumGross": "Gross pay", "sumCnss": "CNSS (employee share)", "sumAmo": "AMO (employee share)", "sumIr": "Net IR",
    "sumNet": "Net pay", "sumEmployer": "Employer contributions", "sumTotalCost": "Total cost (gross + employer)",
    "dailyTitle": "Worked days", "colDay": "Day", "colDayKind": "Type", "colMinutes": "Minutes",
    "dayNormal": "Normal", "dayRest": "Rest", "dayHoliday": "Holiday",
    "addAdjustment": "Manual line (bonus/allowance/deduction)",
    "adjKind": "Type", "adjAmount": "Amount (MAD)", "adjReason": "Reason", "adjReasonPlaceholder": "Line reason — shown on payslip and audit",
    "adjAdd": "Add line", "adjDefaultReason": "Manual line",
    "adjustmentAdded": "Line added and recomputed", "adjustmentRemoved": "Line removed and recomputed",
    "lockedError": "Payslip approved and locked — corrections go on a later period",
    "adjBonus": "Bonus", "adjTransport": "Transport allowance", "adjMeals": "Meal allowance", "adjDeduction": "Deduction/advance (from net)",
    "lineBaseHours": "Regular hours pay", "lineBaseDays": "Days pay", "lineBaseMonthly": "Base monthly salary",
    "lineAbsence": "Unexcused absence deduction",
    "lineOtDayNormal": "Overtime day (workday) +25%", "lineOtNightNormal": "Overtime night (workday) +50%",
    "lineOtDayRest": "Overtime day (rest/holiday) +50%", "lineOtNightRest": "Overtime night (rest/holiday) +100%",
    "lineBonus": "Bonus", "lineTransport": "Transport allowance", "lineMeals": "Meal allowance", "lineDeduction": "Deduction/advance",
    "lineCnssShort": "CNSS — short-term benefits (employee)", "lineCnssLong": "CNSS — long-term benefits (employee)",
    "lineAmo": "AMO — mandatory health insurance (employee)", "linePro": "Professional expenses (IR-exempt)",
    "lineIr": "Income tax (IR)", "lineFamily": "Family dependents deduction",
    "lineEmpPrestShort": "Employer — short-term 1.05%", "lineEmpPrestLong": "Employer — long-term 7.93%",
    "lineEmpFamily": "Employer — family allowances 6.40%", "lineEmpAmo": "Employer — AMO 4.11%", "lineEmpTfp": "Employer — vocational training levy 1.60%",
    "lineUnknown": "Line",
    "workersTitle": "Worker pay rates", "workersSubtitle": "Pay types (hourly/daily/monthly) + dependents and transport caps",
    "workersListTitle": "Company workers and their pay profiles",
    "colPayType": "Pay type", "colRate": "Rate", "colDependents": "Dependents", "colZone": "Transport zone",
    "noProfile": "No profile", "perHour": "hour", "perDay": "day", "perMonth": "month",
    "zoneUrban": "urban", "zoneOutside": "outside urban area",
    "payTypeHourly": "Hourly", "payTypeDaily": "Daily", "payTypeMonthly": "Monthly",
    "rateLabel": "Rate (MAD)", "hireDate": "Hire date",
    "workerSaved": "Worker pay profile saved", "workerEditDesc": "Pay type, rate and dependents — applied from the next period",
    "smigHint": "The system blocks approving a payslip below the effective SMIG"
  },
  "myPayslips": {
    "title": "My pay", "subtitle": "Your approved payslips — every line explained",
    "hours": "Hours", "overtime": "Overtime", "gross": "Gross", "deductions": "Deductions", "net": "Net",
    "details": "Details", "detailDesc": "Payslip lines: how every amount was computed"
  },
  "holidays": {
    "title": "Public holidays", "subtitle": "{year} holidays — entered by admin, treated as rest days for overtime",
    "addTitle": "Add holiday", "date": "Date", "namePlaceholder": "e.g. Labour Day", "add": "Add",
    "added": "Holiday added", "exists": "A holiday already exists on this date", "removed": "Holiday removed",
    "listTitle": "{year} holidays",
    "religiousNote": "Religious holidays follow lunar observation — enter them each year after official confirmation",
    "viewOnly": "View only — entry reserved for admin"
  },
  "dashboard_add": {"holidays": "Public holidays", "myPayslips": "My pay"},
  "notifications_add": {"payslipLine1": "Your payslip for period", "payslipLine2": "ref."}
},
"es": {
  "payroll": {
    "title": "Nómina", "subtitle": "Períodos mensuales y ciclo de aprobación: borrador ← revisión ← aprobado — según el código de trabajo marroquí",
    "periodsTitle": "Períodos de nómina", "createPeriod": "Nuevo período", "createPeriodDesc": "Elige mes y año — no se permiten períodos futuros",
    "year": "Año", "month": "Mes", "createConfirm": "Crear",
    "periodCreated": "Período creado (borrador)", "periodExists": "Ya existe un período para este mes", "futurePeriod": "No se puede crear un período futuro",
    "statusDraft": "Borrador", "statusReviewing": "En revisión", "statusApproved": "Aprobado",
    "generate": "Generar", "generatedOk": "{count} nóminas generadas ({skipped} omitidas)", "submittedOk": "Período enviado a revisión",
    "approve": "Aprobar", "approvedOk": "Período aprobado — trabajadores notificados ({count} nóminas)",
    "smigBadge": "Bajo SMIG", "smigBlocked": "Aprobación bloqueada: salario por debajo del mínimo legal",
    "smigWarning": "{count} nóminas por debajo del mínimo (SMIG) — aprobación bloqueada hasta corregir",
    "unverifiedBlocked": "Aprobación bloqueada: reglas de nómina sin verificar por el contable",
    "unverifiedRules": "{count} reglas de nómina sin verificar — aprobación bloqueada hasta su verificación",
    "verifyAll": "Verificar todo", "rulesVerifiedAll": "{count} reglas verificadas",
    "noPayslips": "Genera primero las nóminas", "notDraft": "La acción requiere estado borrador", "notReviewing": "La aprobación requiere estado en revisión",
    "generatedOn": "Generado el {date}",
    "statPeriods": "Períodos", "statApproved": "Aprobados", "statNetTotal": "Neto aprobado",
    "colPeriod": "Período", "colPayslips": "Nóminas", "colGross": "Bruto", "colNet": "Neto", "colEmployerCost": "Coste del empleador",
    "viewPeriod": "Ver", "holidaysLink": "Festivos", "workersLink": "Salarios",
    "periodDetail": "Detalle del período", "periodDetailSubtitle": "Nóminas con desglose completo — cómo se calculó cada importe",
    "backToPeriods": "Volver a períodos",
    "missingProfiles": "{count} trabajadores sin perfil salarial — sin nómina generada",
    "totGross": "Bruto total", "totCnss": "CNSS (empleado)", "totAmo": "AMO (empleado)", "totIr": "IR", "totNet": "Neto total", "totEmployer": "Cotizaciones del empleador",
    "payslipsTitle": "Nóminas del período", "noPayslipsYet": "Aún no hay nóminas — usa el botón Generar",
    "colRef": "Referencia", "colWorker": "Trabajador", "colHours": "Horas", "colOt": "Extras", "colDeductions": "Retenciones",
    "viewPayslip": "Nómina", "payslipDesc": "Líneas de la nómina: horas, extras y retenciones según las reglas vigentes",
    "approvedBadge": "Aprobado — bloqueado",
    "pslHours": "Horas", "pslOt": "Extras", "pslDays": "Días", "pslNet": "Neto",
    "colLine": "Línea", "colQty": "Cantidad", "colRate": "Tasa", "colAmount": "Importe",
    "exemptInfo": "Exento de IR hasta {amount}",
    "sumGross": "Salario bruto", "sumCnss": "CNSS (parte del empleado)", "sumAmo": "AMO (parte del empleado)", "sumIr": "IR neto",
    "sumNet": "Neto a pagar", "sumEmployer": "Cotizaciones del empleador", "sumTotalCost": "Coste total (bruto + empleador)",
    "dailyTitle": "Días trabajados", "colDay": "Día", "colDayKind": "Tipo", "colMinutes": "Minutos",
    "dayNormal": "Normal", "dayRest": "Descanso", "dayHoliday": "Festivo",
    "addAdjustment": "Línea manual (prima/indemnización/deducción)",
    "adjKind": "Tipo", "adjAmount": "Importe (MAD)", "adjReason": "Motivo", "adjReasonPlaceholder": "Motivo visible en la nómina y la auditoría",
    "adjAdd": "Añadir", "adjDefaultReason": "Línea manual",
    "adjustmentAdded": "Línea añadida y recalculada", "adjustmentRemoved": "Línea eliminada y recalculada",
    "lockedError": "Nómina aprobada y bloqueada — corrección en un período posterior",
    "adjBonus": "Prima", "adjTransport": "Indemnización de transporte", "adjMeals": "Ayuda de comidas", "adjDeduction": "Deducción/anticipo (del neto)",
    "lineBaseHours": "Salario de horas ordinarias", "lineBaseDays": "Salario de días", "lineBaseMonthly": "Salario mensual base",
    "lineAbsence": "Deducción por ausencia injustificada",
    "lineOtDayNormal": "Extra diurna (día laboral) +25%", "lineOtNightNormal": "Extra nocturna (día laboral) +50%",
    "lineOtDayRest": "Extra diurna (descanso/festivo) +50%", "lineOtNightRest": "Extra nocturna (descanso/festivo) +100%",
    "lineBonus": "Prima", "lineTransport": "Indemnización de transporte", "lineMeals": "Ayuda de comidas", "lineDeduction": "Deducción/anticipo",
    "lineCnssShort": "CNSS — prestaciones corto plazo (empleado)", "lineCnssLong": "CNSS — prestaciones largo plazo (empleado)",
    "lineAmo": "AMO — seguro de enfermedad obligatorio (empleado)", "linePro": "Gastos profesionales (exento de IR)",
    "lineIr": "Impuesto sobre la renta (IR)", "lineFamily": "Deducción por cargas familiares",
    "lineEmpPrestShort": "Empleador — corto plazo 1,05%", "lineEmpPrestLong": "Empleador — largo plazo 7,93%",
    "lineEmpFamily": "Empleador — asignaciones familiares 6,40%", "lineEmpAmo": "Empleador — AMO 4,11%", "lineEmpTfp": "Empleador — formación profesional 1,60%",
    "lineUnknown": "Línea",
    "workersTitle": "Salarios de trabajadores", "workersSubtitle": "Modalidades (horaria/diaria/mensual) + cargas familiares y topes de transporte",
    "workersListTitle": "Trabajadores y sus perfiles salariales",
    "colPayType": "Modalidad", "colRate": "Tarifa", "colDependents": "Cargas", "colZone": "Zona transporte",
    "noProfile": "Sin perfil", "perHour": "hora", "perDay": "día", "perMonth": "mes",
    "zoneUrban": "urbana", "zoneOutside": "fuera del área urbana",
    "payTypeHourly": "Horaria", "payTypeDaily": "Diaria", "payTypeMonthly": "Mensual",
    "rateLabel": "Tarifa (MAD)", "hireDate": "Fecha de contratación",
    "workerSaved": "Perfil salarial guardado", "workerEditDesc": "Modalidad, tarifa y cargas — aplicadas desde el próximo período",
    "smigHint": "El sistema bloquea aprobar nóminas por debajo del SMIG vigente"
  },
  "myPayslips": {
    "title": "Mi nómina", "subtitle": "Tus nóminas aprobadas — cada línea explicada",
    "hours": "Horas", "overtime": "Extras", "gross": "Bruto", "deductions": "Retenciones", "net": "Neto",
    "details": "Detalles", "detailDesc": "Líneas de la nómina: cómo se calculó cada importe"
  },
  "holidays": {
    "title": "Días festivos", "subtitle": "Festivos de {year} — introducidos por la administración, tratados como descanso para las extras",
    "addTitle": "Añadir festivo", "date": "Fecha", "namePlaceholder": "p. ej. Día del Trabajo", "add": "Añadir",
    "added": "Festivo añadido", "exists": "Ya existe un festivo en esta fecha", "removed": "Festivo eliminado",
    "listTitle": "Festivos de {year}",
    "religiousNote": "Las fiestas religiosas dependen de la observación lunar — introdúcelas cada año tras la confirmación oficial",
    "viewOnly": "Solo lectura — entrada reservada al administrador"
  },
  "dashboard_add": {"holidays": "Días festivos", "myPayslips": "Mi nómina"},
  "notifications_add": {"payslipLine1": "Tu nómina del período", "payslipLine2": "ref."}
}
}

def main():
    total_added = 0
    for locale in ["ar", "fr", "en", "es"]:
        path = os.path.join(DICT_DIR, f"{locale}.json")
        with open(path, encoding="utf-8") as f:
            dict_ = json.load(f)
        payload = D[locale]

        # أسماء المستوى الأعلى الجديدة كاملة
        for ns in ["payroll", "myPayslips", "holidays"]:
            dict_.setdefault(ns, {}).update(payload[ns])
            total_added += len(payload[ns])

        # إضافات داخل أسماء قائمة
        for k, v in payload["dashboard_add"].items():
            dict_["dashboard"].setdefault(k, v)
            total_added += 1
        for k, v in payload["notifications_add"].items():
            dict_["notifications"].setdefault(k, v)
            total_added += 1

        # ملاحظة المرحلة الجديدة
        dict_["dashboard"]["phaseNoteBody"] = PHASE_NOTE[locale]

        with open(path, "w", encoding="utf-8") as f:
            json.dump(dict_, f, ensure_ascii=False, indent=2)
            f.write("\n")
        print(f"✓ {locale}: payroll={len(payload['payroll'])} + myPayslips={len(payload['myPayslips'])} + holidays={len(payload['holidays'])} + dashboard/notifications extras")

    print(f"≈ {total_added // 4} مفتاحًا جديدًا × 4 لغات + تحديث ملاحظة المرحلة")

if __name__ == "__main__":
    main()
