#!/usr/bin/env python3
# HRMP — إضافة مفاتيح i18n للمرحلة 7 (التقارير والتصدير) إلى القواميس الأربع
# التشغيل: python3 scripts/add-phase7-i18n.py
# يشمل: واجهة صفحة التقارير + أزرار التصدير + نصوص المستندات (reports.doc.*) + أسماء الشهور + صفحة التحقق العامة
import json
import os

DICTS = {
    "ar": "src/i18n/dictionaries/ar.json",
    "fr": "src/i18n/dictionaries/fr.json",
    "en": "src/i18n/dictionaries/en.json",
    "es": "src/i18n/dictionaries/es.json",
}

# ── النصوص الجديدة (المرحلة 7) ──────────────────────────────────
NEW = {
    # ── واجهة صفحة التقارير ──
    "reports.title": {
        "ar": "التقارير والتصدير",
        "fr": "Rapports et export",
        "en": "Reports & export",
        "es": "Informes y exportación",
    },
    "reports.subtitle": {
        "ar": "قسائم وملخصات رسمية بالصيغ الثلاث وبأربع لغات — مولَّدة في الخادم ومختومة إلكترونيًا",
        "fr": "Documents officiels en trois formats et quatre langues — générés côté serveur et scellés électroniquement",
        "en": "Official documents in three formats and four languages — server-generated and electronically sealed",
        "es": "Documentos oficiales en tres formatos y cuatro idiomas — generados en el servidor y sellados electrónicamente",
    },
    "reports.recentExports": {
        "ar": "آخر التصديرات",
        "fr": "Derniers exports",
        "en": "Recent exports",
        "es": "Últimas exportaciones",
    },
    "reports.generate": {
        "ar": "توليد المستند",
        "fr": "Générer le document",
        "en": "Generate document",
        "es": "Generar documento",
    },
    "reports.export": {
        "ar": "تصدير",
        "fr": "Exporter",
        "en": "Export",
        "es": "Exportar",
    },
    "reports.selectKind": {
        "ar": "نوع التقرير",
        "fr": "Type de rapport",
        "en": "Report type",
        "es": "Tipo de informe",
    },
    "reports.selectPayslip": {
        "ar": "اختر القسيمة",
        "fr": "Choisir le bulletin",
        "en": "Select payslip",
        "es": "Seleccionar nómina",
    },
    "reports.selectPeriod": {
        "ar": "اختر الفترة",
        "fr": "Choisir la période",
        "en": "Select period",
        "es": "Seleccionar período",
    },
    "reports.selectWorker": {
        "ar": "اختر العامل",
        "fr": "Choisir le travailleur",
        "en": "Select worker",
        "es": "Seleccionar trabajador",
    },
    "reports.selectDeclaration": {
        "ar": "اختر التصريح",
        "fr": "Choisir la déclaration",
        "en": "Select declaration",
        "es": "Seleccionar declaración",
    },
    "reports.language": {
        "ar": "لغة المستند",
        "fr": "Langue du document",
        "en": "Document language",
        "es": "Idioma del documento",
    },
    "reports.format": {
        "ar": "الصيغة",
        "fr": "Format",
        "en": "Format",
        "es": "Formato",
    },
    "reports.month": {
        "ar": "الشهر",
        "fr": "Mois",
        "en": "Month",
        "es": "Mes",
    },
    "reports.year": {
        "ar": "السنة",
        "fr": "Année",
        "en": "Year",
        "es": "Año",
    },
    "reports.includeEmployerShare": {
        "ar": "إظهار حصة المشغّل",
        "fr": "Afficher la part employeur",
        "en": "Show employer share",
        "es": "Mostrar la parte del empleador",
    },
    "reports.noExports": {
        "ar": "لا تصديرات بعد",
        "fr": "Aucun export pour le moment",
        "en": "No exports yet",
        "es": "Aún no hay exportaciones",
    },
    "reports.exportOk": {
        "ar": "تم توليد المستند — جارٍ التنزيل",
        "fr": "Document généré — téléchargement en cours",
        "en": "Document generated — downloading",
        "es": "Documento generado — descargando",
    },
    "reports.exportReused": {
        "ar": "هذا المستند مُولَّد سابقًا — نُسخته الثابتة هي المُصدَّرة",
        "fr": "Ce document existe déjà — la copie fixe est exportée",
        "en": "This document already exists — its fixed copy is exported",
        "es": "Este documento ya existe — se exporta su copia fija",
    },
    "reports.exportFailed": {
        "ar": "تعذّر توليد المستند",
        "fr": "Échec de génération du document",
        "en": "Failed to generate document",
        "es": "Error al generar el documento",
    },
    "reports.draftBlocked": {
        "ar": "لا يُصدَّر إلا عن فترة معتمدة",
        "fr": "L'export n'est possible que pour une période approuvée",
        "en": "Export is only allowed for an approved period",
        "es": "La exportación solo se permite para un período aprobado",
    },
    "reports.noWageAccess": {
        "ar": "لا يمكن للمشرف تصدير تقارير الأجور (إعداد الشركة يمنعها)",
        "fr": "Le superviseur ne peut pas exporter de rapports de salaires (paramètre société)",
        "en": "Supervisor cannot export wage reports (company setting)",
        "es": "El supervisor no puede exportar informes de salarios (ajuste de empresa)",
    },
    "reports.colKind": {
        "ar": "النوع",
        "fr": "Type",
        "en": "Type",
        "es": "Tipo",
    },
    "reports.colFormat": {
        "ar": "الصيغة",
        "fr": "Format",
        "en": "Format",
        "es": "Formato",
    },
    "reports.colLang": {
        "ar": "اللغة",
        "fr": "Langue",
        "en": "Language",
        "es": "Idioma",
    },
    "reports.colWhen": {
        "ar": "التاريخ",
        "fr": "Date",
        "en": "Date",
        "es": "Fecha",
    },
    "reports.colWho": {
        "ar": "أنشأه",
        "fr": "Créé par",
        "en": "Created by",
        "es": "Creado por",
    },
    "reports.colRef": {
        "ar": "المرجع",
        "fr": "Référence",
        "en": "Reference",
        "es": "Referencia",
    },
    "reports.colVersion": {
        "ar": "الإصدار",
        "fr": "Version",
        "en": "Version",
        "es": "Versión",
    },
    "reports.colTarget": {
        "ar": "المستند",
        "fr": "Document",
        "en": "Document",
        "es": "Documento",
    },
    "reports.kind.payslip": {
        "ar": "قسيمة أجر",
        "fr": "Bulletin de paie",
        "en": "Payslip",
        "es": "Nómina",
    },
    "reports.kind.payroll_summary": {
        "ar": "ملخص أجور الفترة",
        "fr": "Résumé de paie de la période",
        "en": "Period payroll summary",
        "es": "Resumen de nómina del período",
    },
    "reports.kind.attendance_statement": {
        "ar": "بيان حضور",
        "fr": "Relevé de présence",
        "en": "Attendance statement",
        "es": "Informe de asistencia",
    },
    "reports.kind.hours_statement": {
        "ar": "بيان ساعات",
        "fr": "Relevé d'heures",
        "en": "Hours statement",
        "es": "Informe de horas",
    },
    "reports.kind.declarations_summary": {
        "ar": "ملخص التصاريح",
        "fr": "Résumé des déclarations",
        "en": "Declarations summary",
        "es": "Resumen de declaraciones",
    },
    "reports.kind.compliance_report": {
        "ar": "تقرير المطابقة",
        "fr": "Rapport de conformité",
        "en": "Compliance report",
        "es": "Informe de conformidad",
    },
    "reports.kind.platform_summary": {
        "ar": "ملخص المنصة",
        "fr": "Résumé de la plateforme",
        "en": "Platform summary",
        "es": "Resumen de la plataforma",
    },
    "reports.attendanceNote": {
        "ar": "بيانات بلا أي رقم أجر — ملائمة للمشرف الميداني",
        "fr": "Données sans aucun chiffre de salaire — adapté au superviseur de terrain",
        "en": "Data with no wage figures — suited for field supervisors",
        "es": "Datos sin cifras salariales — apto para supervisores de campo",
    },
    "reports.download": {
        "ar": "تنزيل",
        "fr": "Télécharger",
        "en": "Download",
        "es": "Descargar",
    },
    "reports.employeePayslipsHint": {
        "ar": "كشوفك المعتمدة فقط — عن فترات مُقفلة",
        "fr": "Uniquement vos bulletins approuvés — périodes verrouillées",
        "en": "Only your approved payslips — locked periods",
        "es": "Solo tus nóminas aprobadas — períodos bloqueados",
    },
    # ── صفحة التحقق العامة (QR) ──
    "reports.verify.title": {
        "ar": "التحقق من مستند",
        "fr": "Vérification d'un document",
        "en": "Document verification",
        "es": "Verificación de documento",
    },
    "reports.verify.valid": {
        "ar": "مستند أصلي صادرًا من النظام وغير معدَّل",
        "fr": "Document authentique émis par le système et non modifié",
        "en": "Authentic document issued by the system and unmodified",
        "es": "Documento auténtico emitido por el sistema y sin modificar",
    },
    "reports.verify.hashMismatch": {
        "ar": "المستند المقدَّم لا يطابق النسخة الأصلية (معدَّل أو من إصدار مختلف)",
        "fr": "Le document présenté ne correspond pas à l'original (modifié ou autre version)",
        "en": "The presented document does not match the original (modified or different version)",
        "es": "El documento presentado no coincide con el original (modificado u otra versión)",
    },
    "reports.verify.notFound": {
        "ar": "لا يوجد مستند بهذا المرجع",
        "fr": "Aucun document avec cette référence",
        "en": "No document with this reference",
        "es": "No hay documento con esta referencia",
    },
    "reports.verify.details": {
        "ar": "بيانات المستند",
        "fr": "Détails du document",
        "en": "Document details",
        "es": "Detalles del documento",
    },
    "reports.verify.company": {
        "ar": "الجهة المصدرة",
        "fr": "Émetteur",
        "en": "Issuer",
        "es": "Emisor",
    },
    "reports.verify.generatedAt": {
        "ar": "تاريخ الإصدار",
        "fr": "Date d'émission",
        "en": "Issued at",
        "es": "Emitido el",
    },
    "reports.verify.verifyNote": {
        "ar": "قارن البصمة المطبوعة على المستند بالبصمة أدناه",
        "fr": "Comparez l'empreinte imprimée sur le document avec celle ci-dessous",
        "en": "Compare the fingerprint printed on the document with the one below",
        "es": "Compare la huella impresa en el documento con la de abajo",
    },
    "reports.verify.publicBadge": {
        "ar": "تحقق عام — بلا تسجيل دخول",
        "fr": "Vérification publique — sans connexion",
        "en": "Public verification — no sign-in required",
        "es": "Verificación pública — sin iniciar sesión",
    },
    "reports.verify.backHome": {
        "ar": "العودة إلى البوابة",
        "fr": "Retour au portail",
        "en": "Back to portal",
        "es": "Volver al portal",
    },

    # ── نصوص المستندات (reports.doc.*) ──
    "reports.doc.payslipTitle": {
        "ar": "قسيمة الأجر",
        "fr": "Bulletin de paie",
        "en": "Payslip",
        "es": "Nómina",
    },
    "reports.doc.summaryTitle": {
        "ar": "ملخص أجور الفترة",
        "fr": "Résumé de paie de la période",
        "en": "Period payroll summary",
        "es": "Resumen de nómina del período",
    },
    "reports.doc.attendanceTitle": {
        "ar": "بيان الحضور",
        "fr": "Relevé de présence",
        "en": "Attendance statement",
        "es": "Informe de asistencia",
    },
    "reports.doc.hoursTitle": {
        "ar": "بيان الساعات",
        "fr": "Relevé d'heures",
        "en": "Hours statement",
        "es": "Informe de horas",
    },
    "reports.doc.declSummaryTitle": {
        "ar": "ملخص التصاريح الرسمية",
        "fr": "Résumé des déclarations officielles",
        "en": "Official declarations summary",
        "es": "Resumen de declaraciones oficiales",
    },
    "reports.doc.complianceTitle": {
        "ar": "تقرير المطابقة",
        "fr": "Rapport de conformité",
        "en": "Compliance report",
        "es": "Informe de conformidad",
    },
    "reports.doc.platformTitle": {
        "ar": "ملخص المنصة",
        "fr": "Résumé de la plateforme",
        "en": "Platform summary",
        "es": "Resumen de la plataforma",
    },
    "reports.doc.period": {
        "ar": "الفترة",
        "fr": "Période",
        "en": "Period",
        "es": "Período",
    },
    "reports.doc.ref": {
        "ar": "المرجع",
        "fr": "Réf.",
        "en": "Ref.",
        "es": "Ref.",
    },
    "reports.doc.ice": {
        "ar": "ICE",
        "fr": "ICE",
        "en": "ICE",
        "es": "ICE",
    },
    "reports.doc.cnssAff": {
        "ar": "رقم CNSS",
        "fr": "N° CNSS",
        "en": "CNSS No.",
        "es": "N.º CNSS",
    },
    "reports.doc.workerSection": {
        "ar": "بيانات العامل",
        "fr": "Informations du travailleur",
        "en": "Worker information",
        "es": "Información del trabajador",
    },
    "reports.doc.worker": {
        "ar": "العامل",
        "fr": "Travailleur",
        "en": "Worker",
        "es": "Trabajador",
    },
    "reports.doc.cin": {
        "ar": "رقم البطاقة الوطنية",
        "fr": "N° CIN",
        "en": "National ID (CIN)",
        "es": "DNI (CIN)",
    },
    "reports.doc.cnssNumber": {
        "ar": "رقم CNSS",
        "fr": "N° CNSS",
        "en": "CNSS No.",
        "es": "N.º CNSS",
    },
    "reports.doc.payType": {
        "ar": "نظام الأجر",
        "fr": "Type de rémunération",
        "en": "Pay type",
        "es": "Tipo de remuneración",
    },
    "reports.doc.dependents": {
        "ar": "الأعباء العائلية",
        "fr": "Personnes à charge",
        "en": "Dependents",
        "es": "Dependientes",
    },
    "reports.doc.hoursSection": {
        "ar": "الساعات",
        "fr": "Heures",
        "en": "Hours",
        "es": "Horas",
    },
    "reports.doc.workedMinutes": {
        "ar": "الساعات العادية",
        "fr": "Heures normales",
        "en": "Regular hours",
        "es": "Horas ordinarias",
    },
    "reports.doc.overtimeMinutes": {
        "ar": "ساعات الإضافي",
        "fr": "Heures supplémentaires",
        "en": "Overtime hours",
        "es": "Horas extra",
    },
    "reports.doc.workedDays": {
        "ar": "أيام العمل",
        "fr": "Jours travaillés",
        "en": "Worked days",
        "es": "Días trabajados",
    },
    "reports.doc.breakMinutes": {
        "ar": "الاستراحات المخصومة",
        "fr": "Pauses déduites",
        "en": "Deducted breaks",
        "es": "Pausas deducidas",
    },
    "reports.doc.linesSection": {
        "ar": "بنود الكشف",
        "fr": "Lignes du bulletin",
        "en": "Payslip lines",
        "es": "Líneas de nómina",
    },
    "reports.doc.colItem": {
        "ar": "البند",
        "fr": "Élément",
        "en": "Item",
        "es": "Concepto",
    },
    "reports.doc.colHours": {
        "ar": "الساعات",
        "fr": "Heures",
        "en": "Hours",
        "es": "Horas",
    },
    "reports.doc.colRate": {
        "ar": "النسبة",
        "fr": "Taux",
        "en": "Rate",
        "es": "Tasa",
    },
    "reports.doc.colAmount": {
        "ar": "المبلغ",
        "fr": "Montant",
        "en": "Amount",
        "es": "Importe",
    },
    "reports.doc.colRef": {
        "ar": "المرجع",
        "fr": "Réf.",
        "en": "Ref.",
        "es": "Ref.",
    },
    "reports.doc.moreLines": {
        "ar": "+{n} بنود أخرى — راجع القسيمة الكاملة",
        "fr": "+{n} autres lignes — voir le bulletin complet",
        "en": "+{n} more lines — see full payslip",
        "es": "+{n} líneas más — ver nómina completa",
    },
    "reports.doc.totalsSection": {
        "ar": "الإجماليات",
        "fr": "Totaux",
        "en": "Totals",
        "es": "Totales",
    },
    "reports.doc.gross": {
        "ar": "الأجر الإجمالي",
        "fr": "Salaire brut",
        "en": "Gross pay",
        "es": "Salario bruto",
    },
    "reports.doc.cnss": {
        "ar": "اقتطاع CNSS",
        "fr": "Cotisation CNSS",
        "en": "CNSS deduction",
        "es": "Cotización CNSS",
    },
    "reports.doc.amo": {
        "ar": "اقتطاع AMO",
        "fr": "Cotisation AMO",
        "en": "AMO deduction",
        "es": "Cotización AMO",
    },
    "reports.doc.ir": {
        "ar": "الضريبة على الدخل (IR)",
        "fr": "Impôt sur le revenu (IR)",
        "en": "Income tax (IR)",
        "es": "Impuesto sobre la renta (IR)",
    },
    "reports.doc.net": {
        "ar": "الصافي للدفع",
        "fr": "Net à payer",
        "en": "Net payable",
        "es": "Neto a pagar",
    },
    "reports.doc.employerCost": {
        "ar": "اشتراكات المشغّل",
        "fr": "Charges patronales",
        "en": "Employer contributions",
        "es": "Cotizaciones del empleador",
    },
    "reports.doc.totalCost": {
        "ar": "إجمالي تكلفة المشغّل",
        "fr": "Coût total employeur",
        "en": "Total employer cost",
        "es": "Coste total del empleador",
    },
    "reports.doc.employerShareNote": {
        "ar": "ملاحظة: حصة المشغّل غير معروضة في نسخة العامل",
        "fr": "Note : la part employeur n'est pas affichée dans la version du travailleur",
        "en": "Note: the employer share is not shown in the worker's copy",
        "es": "Nota: la parte del empleador no se muestra en la copia del trabajador",
    },
    "reports.doc.smigWarning": {
        "ar": "تنبيه: الأجر الفعلي دون الحد الأدنى القانوني المطبَّق — الفترة لا تُعتمد قبل التصحيح",
        "fr": "Alerte : le salaire réel est inférieur au SMIG/SMAG applicable — la période ne peut être approuvée avant correction",
        "en": "Warning: actual pay is below the applicable minimum wage — the period cannot be approved before correction",
        "es": "Aviso: el salario real está por debajo del salario mínimo aplicable — el período no puede aprobarse antes de corregirlo",
    },
    "reports.doc.workersSection": {
        "ar": "كشوف العمال",
        "fr": "Bulletins des travailleurs",
        "en": "Workers' payslips",
        "es": "Nóminas de los trabajadores",
    },
    "reports.doc.workersCount": {
        "ar": "عدد العمال",
        "fr": "Nombre de travailleurs",
        "en": "Workers count",
        "es": "Número de trabajadores",
    },
    "reports.doc.attendanceSection": {
        "ar": "تفصيل الأيام",
        "fr": "Détail des jours",
        "en": "Day details",
        "es": "Detalle de días",
    },
    "reports.doc.attendanceColDate": {
        "ar": "التاريخ",
        "fr": "Date",
        "en": "Date",
        "es": "Fecha",
    },
    "reports.doc.attendanceColIn": {
        "ar": "الدخول",
        "fr": "Entrée",
        "en": "Check-in",
        "es": "Entrada",
    },
    "reports.doc.attendanceColOut": {
        "ar": "الانصراف",
        "fr": "Sortie",
        "en": "Check-out",
        "es": "Salida",
    },
    "reports.doc.attendanceColMinutes": {
        "ar": "المدة",
        "fr": "Durée",
        "en": "Duration",
        "es": "Duración",
    },
    "reports.doc.attendanceColStatus": {
        "ar": "الحالة",
        "fr": "Statut",
        "en": "Status",
        "es": "Estado",
    },
    "reports.doc.attendanceStatus.done": {
        "ar": "مكتمل",
        "fr": "Complet",
        "en": "Complete",
        "es": "Completo",
    },
    "reports.doc.attendanceStatus.partial": {
        "ar": "جزئي (بلا انصراف)",
        "fr": "Partiel (sans sortie)",
        "en": "Partial (no check-out)",
        "es": "Parcial (sin salida)",
    },
    "reports.doc.attendanceStatus.absent": {
        "ar": "غير مكتمل",
        "fr": "Incomplet",
        "en": "Incomplete",
        "es": "Incompleto",
    },
    "reports.doc.attendancePresentDays": {
        "ar": "أيام الحضور",
        "fr": "Jours de présence",
        "en": "Present days",
        "es": "Días presentes",
    },
    "reports.doc.attendanceTotalMinutes": {
        "ar": "مجموع الساعات",
        "fr": "Total des heures",
        "en": "Total hours",
        "es": "Total de horas",
    },
    "reports.doc.noRows": {
        "ar": "لا سجلات في هذه الفترة",
        "fr": "Aucun enregistrement sur cette période",
        "en": "No records in this period",
        "es": "Sin registros en este período",
    },
    "reports.doc.declSection": {
        "ar": "التصاريح",
        "fr": "Déclarations",
        "en": "Declarations",
        "es": "Declaraciones",
    },
    "reports.doc.colAuthority": {
        "ar": "الجهة",
        "fr": "Autorité",
        "en": "Authority",
        "es": "Autoridad",
    },
    "reports.doc.colDeclKind": {
        "ar": "النوع",
        "fr": "Type",
        "en": "Type",
        "es": "Tipo",
    },
    "reports.doc.colDeclStatus": {
        "ar": "الحالة",
        "fr": "Statut",
        "en": "Status",
        "es": "Estado",
    },
    "reports.doc.complianceIntro": {
        "ar": "مقارنة بين إجماليات كشوف الأجور المعتمدة والملف الرسمي للتصريح — للمراجعة مع كل تصريح (SPEC §4.6)",
        "fr": "Comparaison entre les totaux des bulletons approuvés et le fichier officiel de la déclaration — à joindre à chaque déclaration (SPEC §4.6)",
        "en": "Comparison between approved payslip totals and the declaration's official file — attached to every declaration (SPEC §4.6)",
        "es": "Comparación entre los totales de nóminas aprobadas y el archivo oficial de la declaración — adjunto a cada declaración (SPEC §4.6)",
    },
    "reports.doc.complianceTable": {
        "ar": "جدول المطابقة",
        "fr": "Tableau de conformité",
        "en": "Compliance table",
        "es": "Tabla de conformidad",
    },
    "reports.doc.colField": {
        "ar": "الحقل",
        "fr": "Champ",
        "en": "Field",
        "es": "Campo",
    },
    "reports.doc.colPayslips": {
        "ar": "الكشوف المعتمدة",
        "fr": "Bulletins approuvés",
        "en": "Approved payslips",
        "es": "Nóminas aprobadas",
    },
    "reports.doc.colDeclaration": {
        "ar": "الملف الرسمي",
        "fr": "Fichier officiel",
        "en": "Official file",
        "es": "Archivo oficial",
    },
    "reports.doc.colDiff": {
        "ar": "الفرق",
        "fr": "Écart",
        "en": "Difference",
        "es": "Diferencia",
    },
    "reports.doc.complianceMatch": {
        "ar": "مطابق: كل الحقول متساوية بين الكشوف والملف الرسمي",
        "fr": "Conforme : tous les champs sont égaux entre les bulletins et le fichier officiel",
        "en": "Match: all fields are equal between payslips and the official file",
        "es": "Conforme: todos los campos coinciden entre nóminas y el archivo oficial",
    },
    "reports.doc.complianceDiff": {
        "ar": "انتبه: توجد فروق بين الكشوف والملف الرسمي — راجعها قبل الإيداع",
        "fr": "Attention : des écarts existent entre les bulletins et le fichier officiel — à vérifier avant le dépôt",
        "en": "Caution: differences exist between payslips and the official file — review before filing",
        "es": "Atención: existen diferencias entre nóminas y el archivo oficial — revisar antes de presentar",
    },
    "reports.doc.complianceNoFile": {
        "ar": "لا إجماليات متاحة من الملف الرسمي للمقارنة",
        "fr": "Aucun total disponible du fichier officiel pour comparaison",
        "en": "No totals available from the official file for comparison",
        "es": "No hay totales disponibles del archivo oficial para comparar",
    },
    "reports.doc.officialFile": {
        "ar": "الملف الرسمي",
        "fr": "Fichier officiel",
        "en": "Official file",
        "es": "Archivo oficial",
    },
    "reports.doc.specVersion": {
        "ar": "إصدار المواصفة",
        "fr": "Version de la spécification",
        "en": "Specification version",
        "es": "Versión de la especificación",
    },
    "reports.doc.companiesSection": {
        "ar": "الشركات",
        "fr": "Sociétés",
        "en": "Companies",
        "es": "Empresas",
    },
    "reports.doc.companiesCount": {
        "ar": "عدد الشركات النشطة",
        "fr": "Nombre de sociétés actives",
        "en": "Active companies count",
        "es": "Número de empresas activas",
    },
    "reports.doc.company": {
        "ar": "الشركة",
        "fr": "Société",
        "en": "Company",
        "es": "Empresa",
    },
    "reports.doc.periodsCount": {
        "ar": "الفترات المعتمدة",
        "fr": "Périodes approuvées",
        "en": "Approved periods",
        "es": "Períodos aprobados",
    },
    "reports.doc.page": {
        "ar": "صفحة",
        "fr": "Page",
        "en": "Page",
        "es": "Página",
    },
    "reports.doc.of": {
        "ar": "من",
        "fr": "sur",
        "en": "of",
        "es": "de",
    },
    "reports.doc.footerOfficial": {
        "ar": "وثيقة مولَّدة إلكترونيًا من نظام HRMP",
        "fr": "Document généré électroniquement par HRMP",
        "en": "Electronically generated document by HRMP",
        "es": "Documento generado electrónicamente por HRMP",
    },
    "reports.doc.qrCaption": {
        "ar": "امسح للتحقق من الأصالة",
        "fr": "Scannez pour vérifier l'authenticité",
        "en": "Scan to verify authenticity",
        "es": "Escanee para verificar la autenticidad",
    },

    # ── أسماء الشهور (نصوص المستندات — عرف المغرب) ──
    "reports.month.1": {"ar": "يناير", "fr": "janvier", "en": "January", "es": "enero"},
    "reports.month.2": {"ar": "فبراير", "fr": "février", "en": "February", "es": "febrero"},
    "reports.month.3": {"ar": "مارس", "fr": "mars", "en": "March", "es": "marzo"},
    "reports.month.4": {"ar": "أبريل", "fr": "avril", "en": "April", "es": "abril"},
    "reports.month.5": {"ar": "ماي", "fr": "mai", "en": "May", "es": "mayo"},
    "reports.month.6": {"ar": "يونيو", "fr": "juin", "en": "June", "es": "junio"},
    "reports.month.7": {"ar": "يوليوز", "fr": "juillet", "en": "July", "es": "julio"},
    "reports.month.8": {"ar": "غشت", "fr": "août", "en": "August", "es": "agosto"},
    "reports.month.9": {"ar": "شتنبر", "fr": "septembre", "en": "September", "es": "septiembre"},
    "reports.month.10": {"ar": "أكتوبر", "fr": "octobre", "en": "October", "es": "octubre"},
    "reports.month.11": {"ar": "نونبر", "fr": "novembre", "en": "November", "es": "noviembre"},
    "reports.month.12": {"ar": "دجنبر", "fr": "décembre", "en": "December", "es": "diciembre"},
}


def set_nested(d, dotted, value):
    parts = dotted.split(".")
    node = d
    for part in parts[:-1]:
        if part not in node or not isinstance(node[part], dict):
            node[part] = {}
        node = node[part]
    node[parts[-1]] = value


def main():
    os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    added = 0
    skipped = 0
    for locale, path in DICTS.items():
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        for key, translations in NEW.items():
            # موجود مسبقًا؟ (لا نطغى على تعديل يدوي)
            probe = data
            exists = True
            for part in key.split("."):
                if isinstance(probe, dict) and part in probe:
                    probe = probe[part]
                else:
                    exists = False
                    break
            if exists and isinstance(probe, str):
                skipped += 1
                continue
            set_nested(data, key, translations[locale])
            added += 1
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
            f.write("\n")
        print(f"✓ {locale}: +{added} مفتاحًا (تخطي {skipped} موجودين)")
        added = 0
        skipped = 0
    print("تم — شغّل bun run check:i18n للتحقق من التكافؤ")


if __name__ == "__main__":
    main()
