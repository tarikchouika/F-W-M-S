#!/usr/bin/env python3
# HRMP — تحديث ملاحظة المرحلة في لوحة التحكم إلى 0.7.0 (المرحلة 6ج)
import json

UPDATE = {
    "ar": "أنت تستخدم الإصدار 0.7.0 (المرحلة 6ج: المسارات والتصاريح الرسمية — محرك أجور يقرأ تعريف المسار من البيانات: بنود اشتراكات وخطوات ضريبة قابلة للتركيب، حزمتا SMIG وSMAG مستقلتان، والحزم العمومية هيكل فارغ يمنع الاعتماد؛ وسجل مواصفات بإصدارات وتفعيل: تخطيط eBDS يعرفه المحاسب وXSD يرفعه للـ DGI؛ ودورة تصريح كاملة: مسودة ← مولَّد ← مراجعة المحاسب ← معتمد ← مُصدَّر بـ hash ← مُودَع بإشعار استلام — لا ملف رسمي قبل اعتماد المحاسب). الوحدات التالية تُبنى تباعًا وفق المواصفة.",
    "fr": "Vous utilisez la version 0.7.0 (Phase 6c : régimes et déclarations officielles — moteur de paie lisant le régime depuis les données : cotisations et étapes composites, régimes SMIG et SMAG indépendants, régimes publics vides bloquant l'approbation ; registre de spécifications versionné et activable : layout eBDS défini par le comptable et XSD importé pour la DGI ; cycle de déclaration complet : brouillon ← généré ← revue comptable ← approuvé ← exporté avec hash ← déposé avec accusé — aucun fichier officiel avant approbation). Les modules suivants sont construits progressivement selon la spécification.",
    "en": "You are using version 0.7.0 (Phase 6c: pay regimes and official declarations — payroll engine reading the regime from data: composable contribution items and tax steps, independent SMIG and SMAG regimes, public bundles as empty structures blocking approval; versioned specification registry with activation: eBDS layout defined by the accountant and XSD uploaded for DGI; full declaration cycle: draft ← generated ← accountant review ← approved ← exported with hash ← filed with receipt — no official file before accountant approval). Next modules are built progressively per the spec.",
    "es": "Está usando la versión 0.7.0 (Fase 6c: régimes y declaraciones oficiales — motor de nómina que lee el régimen desde los datos: partidas de cotización y pasos fiscales componibles, régimes SMIG y SMAG independientes, conjuntos públicos vacíos que bloquean la aprobación; registro de especificaciones con versiones y activación: layout eBDS definido por el contador y XSD subido para la DGI; ciclo de declaración completo: borrador ← generado ← revisión del contador ← aprobado ← exportado con hash ← presentado con acuse — ningún archivo oficial antes de la aprobación). Los módulos siguientes se construyen progresivamente según la especificación.",
}

for lang in ["ar", "fr", "en", "es"]:
    path = f"src/i18n/dictionaries/{lang}.json"
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    data["dashboard"]["phaseNoteBody"] = UPDATE[lang]
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print(f"  ✓ {lang}: ملاحظة المرحلة → 0.7.0")
print("تم")
