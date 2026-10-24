#!/usr/bin/env python3
# HRMP — إضافة مفاتيح i18n لجولة إصلاح «خلل الترجمة» الثانية (2026-10-19)
# نمط سكربتات المراحل نفسه (add-0.10.3-i18n.py): idempotent — لا يكرر ولا يستبدل الموجود.
import json, collections, sys, io

BASE = "/home/z/my-project/hrmp/src/i18n/dictionaries"

# المفاتيح الجديدة: (شجرة، مفتاح، القيم بالترتيب ar/fr/en/es)
NEW = {
    "meta": {
        "title": {
            "ar": "HRMP — نظام إدارة القوى العاملة الميدانية",
            "fr": "HRMP — Gestion de la main-d'œuvre terrain",
            "en": "HRMP — Field Workforce Management",
            "es": "HRMP — Gestión de la mano de obra de campo",
        },
        "description": {
            "ar": "منصة مغربية متعددة الشركات لإدارة العمالة الميدانية: حضور جغرافي، جدولة، أجور بقواعد مدونة الشغل (CNSS/AMO/IR)، وتصاريح رسمية — بأربع لغات.",
            "fr": "Plateforme marocaine multi-entreprises pour la main-d'œuvre de terrain : présence géolocalisée, planification, paie selon le code du travail (CNSS/AMO/IR) et déclarations officielles — en quatre langues.",
            "en": "Moroccan multi-tenant platform for field workforce: geofenced attendance, scheduling, payroll under the labour code (CNSS/AMO/IR), and official declarations — in four languages.",
            "es": "Plataforma marroquí multiempresa para la mano de obra de campo: asistencia geolocalizada, planificación, nóminas según el código de trabajo (CNSS/AMO/IR) y declaraciones oficiales — en cuatro idiomas.",
        },
    },
    "errors": {
        "notFoundTitle": {
            "ar": "الصفحة غير موجودة",
            "fr": "Page introuvable",
            "en": "Page not found",
            "es": "Página no encontrada",
        },
        "notFoundHint": {
            "ar": "العنوان الذي طلبته غير موجود أو نُقل — تحقق من الرابط أو عد إلى صفحة البداية.",
            "fr": "L'adresse demandée n'existe pas ou a été déplacée — vérifiez le lien ou revenez à la page d'accueil.",
            "en": "The requested address does not exist or has moved — check the link or go back to the home page.",
            "es": "La dirección solicitada no existe o fue movida — revise el enlace o vuelva a la página de inicio.",
        },
        "notFoundAction": {
            "ar": "العودة إلى الرئيسية",
            "fr": "Retour à l'accueil",
            "en": "Back to home",
            "es": "Volver al inicio",
        },
    },
    "dashboard": {
        "welcomeWithName": {
            "ar": "أهلاً، {name}",
            "fr": "Bonjour, {name}",
            "en": "Hello, {name}",
            "es": "Hola, {name}",
        },
    },
    "regimes": {
        "contributionsPlaceholder": {
            "ar": '[{"key":"mutuelle_employee","side":"employee","label":"تأمين تكميلي","rateBp":10000,"basis":"gross","order":45}]',
            "fr": '[{"key":"mutuelle_employee","side":"employee","label":"Mutuelle complémentaire","rateBp":10000,"basis":"gross","order":45}]',
            "en": '[{"key":"mutuelle_employee","side":"employee","label":"Complementary health cover","rateBp":10000,"basis":"gross","order":45}]',
            "es": '[{"key":"mutuelle_employee","side":"employee","label":"Mutual complementaria","rateBp":10000,"basis":"gross","order":45}]',
        },
    },
}

LOCALES = ["ar", "fr", "en", "es"]

def deep_merge(target: dict, additions: dict, path="") -> int:
    """دمج شجرة الإضافات داخل الهدف — يضيف الجديد فقط (idempotent) ويرفض استبدال المختلف."""
    added = 0
    for k, v in additions.items():
        key_path = f"{path}{k}"
        if k not in target:
            if isinstance(v, dict) and any(isinstance(x, dict) for x in v.values()):
                target[k] = {}
                added += deep_merge(target[k], v, key_path + ".")
            elif isinstance(v, dict):
                target[k] = v
                added += len(v)
            else:
                target[k] = v
                added += 1
        elif isinstance(target[k], dict) and isinstance(v, dict):
            added += deep_merge(target[k], v, key_path + ".")
        else:
            print(f"  ! تعارض: {key_path} موجود بقيمة مختلفة — تُرك الأصلي", file=sys.stderr)
    return added

total = 0
for loc in LOCALES:
    path = f"{BASE}/{loc}.json"
    with io.open(path, encoding="utf-8") as f:
        data = json.load(f, object_pairs_hook=collections.OrderedDict)
    # شجرة الإضافات بهذه اللغة
    additions = {}
    for section, keys in NEW.items():
        additions[section] = {}
        for key, vals in keys.items():
            additions[section][key] = vals[loc]
    n = deep_merge(data, additions)
    with io.open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print(f"  {loc}: +{n} قيمة جديدة")
    total += n

print(f"✓ اكتمل: {total} قيمة عبر 4 لغات")
