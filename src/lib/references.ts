// FWMS — المراجع الرسمية المغربية (مصادر موثوقة + روابط تحميل نصوص القانون)
// ─────────────────────────────────────────────────────────────────────────────
// لماذا هذا الملف؟
//   المنصة تحسب أجورًا واشتراكات وتصاريخًا وفق قواعد قانونية مغربية (CNSS ·
//   AMO · IR · SMIG). وقواعد `pay_rules` تحمل تاريخ السريان و«المصدر» — لكن
//   المستخدم يحتاج **الوصول المباشر إلى المصدر الرسمي** (البوابة الرسمية
//   والنص الكامل) ليتحقق بنفسه.
//
// القواعد المتّبعة (درس: الروابط是第一 قيمة):
//   1) **كل رابط هنا مُتحقَّق منه حيًّا** (HTTP 200/206 + نوع المحتوى) بتاريخ
//      `VERIFIED_ON` — ولا يُنشر رابط لم يُفحص.
//   2) **نصوص القانون**: العنوان الرسمي كما هو + الاستشهاد (رقم النص ونشرة
//      Bulletin Officiel) ⇒ مرجع قانوني لا رابط هشّ.
//   3) **لا روابط عميقة للـBulletin Officiel للأرقام القديمة** (نمط 404 خارج
//      السنوات الأخيرة) ⇒ رابط الأرشيف الرسمي بدلها (أبقى وأوثق).
//   4) **لا ادّعاء توزيع**: هذه الصفحة مراجع، والمنصة ليست جهة موزّعة رسميًا.
// ─────────────────────────────────────────────────────────────────────────────

/** تاريخ آخر تحقّق حيّ من الروابط (يُعرض في الصفحة) */
export const VERIFIED_ON = "2026-10-20";

export type SourceCategory = "social" | "fiscal" | "labor" | "identity" | "state" | "payment" | "portal";

export type OfficialSource = {
  id: string;
  /** الاسم الرسمي (غير مترجَم — اسم جهة رسمية) */
  org: string;
  /** الاسم الرسمي الكامل (مترجَم: references.orgs.<id>.name) */
  url: string;
  /** ما تستعمله المنصة من هذه الجهة (references.orgs.<id>.use) */
  category: SourceCategory;
  /** رابط صفحة نافذة/قابلة للتحميل مباشرة (إن وُجد) */
  fileUrl?: string;
};

export const OFFICIAL_SOURCES: OfficialSource[] = [
  {
    id: "cnss",
    org: "CNSS",
    url: "https://www.cnss.ma/fr/employeur",
    category: "social",
    fileUrl: "https://www.cnss.ma/fr/reglementation",
  },
  {
    id: "dgi",
    org: "DGI",
    url: "https://www.tax.gov.ma/",
    category: "fiscal",
    fileUrl: "https://www.tax.gov.ma/wps/portal/DGI/Teleservices",
  },
  {
    id: "emploi",
    org: "Ministère de l'Emploi",
    url: "https://miepeec.gov.ma/fr/espace-travail/ministere-emploi-legislation-et-reglementations/",
    category: "labor",
  },
  {
    id: "sgg",
    org: "Secrétariat Général du Gouvernement",
    url: "https://www.sgg.gov.ma/Legislation.aspx",
    category: "state",
    fileUrl: "https://www.sgg.gov.ma/BulletinOfficiel.aspx",
  },
  {
    id: "lof",
    org: "Ministère de l'Économie et des Finances",
    url: "https://lof.finances.gov.ma/fr/documentation-et-publications/textes-legislatifs-et-reglementaires",
    category: "fiscal",
  },
  {
    id: "cndp",
    org: "CNDP / CNIE",
    url: "https://www.cnie.ma/fr",
    category: "identity",
  },
  {
    id: "anapec",
    org: "ANAPEC",
    url: "https://anapec.ma/",
    category: "labor",
  },
  {
    id: "bkam",
    org: "Bank Al-Maghrib",
    url: "https://www.bkam.ma/",
    category: "payment",
  },
  {
    id: "sante",
    org: "Ministère de la Santé",
    url: "https://www.sante.gov.ma/",
    category: "social",
  },
  {
    id: "equipement",
    org: "Ministère de l'Équipement et de l'Eau",
    url: "https://www.equipement.gov.ma/",
    category: "state",
  },
  {
    id: "maroc",
    org: "Portail du Maroc",
    url: "https://www.maroc.ma/",
    category: "portal",
  },
  {
    id: "eservices",
    org: "Portail e-Services",
    url: "https://www.e-services.ma/",
    category: "portal",
  },
];

export type LawFile = {
  id: string;
  /** العنوان الرسمي للنص (كما هو — لا يُترجَم) */
  title: string;
  /** الاستشهاد الرسمي: رقم النص + نشرة Bulletin Officiel */
  citation: string;
  /** رابط التحميل المباشر (PDF) أو صفحة الاستضافة الرسمية */
  url: string;
  /** هل الرابط ملف PDF مباشر؟ */
  direct: boolean;
  /** الجهة المُصدِرة */
  org: string;
  /** ما يضبطه هذا النص في المنصة (references.laws.<id>.scope) */
  scope: "cnss" | "amo" | "labor" | "dismissal" | "social" | "identity" | "activity";
};

export const LAW_FILES: LawFile[] = [
  {
    id: "cnss-recueil-rg",
    title:
      "Recueil des textes législatifs et réglementaires relatifs au régime de sécurité sociale (régime général)",
    citation: "CNSS — compilation consolidée, mise à jour 07/01/2026",
    url: "https://www.cnss.ma/sites/default/files/2026-06/Recueil-textes-juridiques07012026-RG.pdf",
    direct: true,
    org: "CNSS",
    scope: "cnss",
  },
  {
    id: "cnss-recueil-amo",
    title: "Recueil des textes juridiques consolidés (AMO — TADAMON — Salarié — Pensionné)",
    citation: "CNSS — compilation consolidée, mise à jour 10/09/2025",
    url: "https://www.cnss.ma/sites/default/files/2026-06/Recueil-textes-juridiques10092025-amotadamon-salarie-pensionne.pdf",
    direct: true,
    org: "CNSS",
    scope: "amo",
  },
  {
    id: "amo-loi-65-00",
    title: "Loi n° 65-00 relative à l'Assurance Maladie Obligatoire de base",
    citation: "CNSS — texte intégral (avec la loi 27-22 modificative)",
    url: "https://www.cnss.ma/sites/default/files/2026-06/loi-65-00-amo_0.pdf",
    direct: true,
    org: "CNSS",
    scope: "amo",
  },
  {
    id: "amo-dahir",
    title: "Dahir n° 1.22.65 promulguant la loi n° 27-22 modifiant la loi n° 65-00 (AMO)",
    citation: "CNSS — dahir de promulgation",
    url: "https://www.cnss.ma/sites/default/files/2026-06/dahir%20n%C2%B01.22.65.pdf",
    direct: true,
    org: "CNSS",
    scope: "amo",
  },
  {
    id: "nma-2010",
    title: "Nomenclature marocaine des activités (NMA 2010)",
    citation: "Nomenclature de référence des codes d'activité (usage CNSS et DGI)",
    url: "https://www.cnss.ma/sites/default/files/2026-06/nomenclature%20marocaine%20des%20activit%C3%A9s%2C%20nma%202010%20%28version%20fran%C3%A7aise%29.pdf",
    direct: true,
    org: "CNSS",
    scope: "activity",
  },
  {
    id: "decret-2-04-512",
    title: "Décret n° 2-04-512 du 16 kaada 1425 (29 décembre 2004) relatif au repos hebdomadaire",
    citation: "Ministère de l'Emploi — décret d'application du Code du travail (loi 65-99)",
    url: "https://miepeec.gov.ma/wp-content/uploads/2019/12/D%C3%A9cret-n-%C2%B0-2-04-512-1.pdf",
    direct: true,
    org: "Ministère de l'Emploi",
    scope: "labor",
  },
  {
    id: "decret-2-04-422",
    title: "Décret n° 2-04-422 du 16 kaada 1425 (29 décembre 2004) fixant les mentions de la carte de travail",
    citation: "Ministère de l'Emploi — décret d'application du Code du travail (loi 65-99)",
    url: "https://miepeec.gov.ma/wp-content/uploads/2019/12/D%C3%A9cret-n%C2%B0-2-04-422-1.pdf",
    direct: true,
    org: "Ministère de l'Emploi",
    scope: "labor",
  },
  {
    id: "decret-2-04-513",
    title: "Décret n° 2-04-513 du 16 kaada 1425 (29 décembre 2004) relatif au travail des femmes et des mineurs",
    citation: "Ministère de l'Emploi — décret d'application du Code du travail (loi 65-99)",
    url: "https://miepeec.gov.ma/wp-content/uploads/2019/12/D%C3%A9cret-n%C2%B0-2-04-513-1.pdf",
    direct: true,
    org: "Ministère de l'Emploi",
    scope: "dismissal",
  },
  {
    id: "decret-2-04-514",
    title: "Décret n° 2-04-514 du 16 kaada 1425 (29 décembre 2004) relatif au règlement intérieur",
    citation: "Ministère de l'Emploi — décret d'application du Code du travail (loi 65-99)",
    url: "https://miepeec.gov.ma/wp-content/uploads/2019/12/D%C3%A9cret-n%C2%B0-2-04-514-1.pdf",
    direct: true,
    org: "Ministère de l'Emploi",
    scope: "labor",
  },
  {
    id: "decret-2-10-183",
    title: "Décret n° 2-10-183 du 9 hija 1431 (16 novembre 2010) relatif aux relations collectives de travail",
    citation: "Ministère de l'Emploi — décret d'application du Code du travail (loi 65-99)",
    url: "https://miepeec.gov.ma/wp-content/uploads/2019/12/D%C3%A9cret-n%C2%B0-2-10-183-1.pdf",
    direct: true,
    org: "Ministère de l'Emploi",
    scope: "labor",
  },
  {
    id: "bo-archives",
    title: "Bulletins Officiels — archives et sommaires (numéros et dates de publication)",
    citation:
      "Secrétariat Général du Gouvernement — tous les numéros, y compris le Bulletin Officiel n° 5167 du 8 décembre 2003 (Code du travail, loi 65-99)",
    url: "https://www.sgg.gov.ma/BulletinOfficiel.aspx",
    direct: false,
    org: "Secrétariat Général du Gouvernement",
    scope: "labor",
  },
];

/** التصنيفات (تُستعمل في ترتيب العرض) */
export const CATEGORY_ORDER: SourceCategory[] = [
  "social",
  "fiscal",
  "labor",
  "identity",
  "state",
  "payment",
  "portal",
];
