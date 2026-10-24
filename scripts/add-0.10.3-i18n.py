#!/usr/bin/env python3
# HRMP — إضافة مفاتيح i18n لإصدار 0.10.3 (حدود أخطاء رباعية اللغة) إلى القواميس الأربع معًا
# (قاعدة CI: أي نقص في لغة = فشل). يعمل مرة واحدة؛ idempotent بمفتاح موجود.
# السياق: بلاغ المالك 2026-10-19 «يوجد خلل في الترجمة» — صفحات الأخطاء (error.tsx /
# global-error.tsx من v0.10.2) كانت عربية حصرًا لكل اللغات، وعنوان تبويب /verify
# مثبت عربيًا، ووحدة الأمتار «م» مثبتة في جداول الحضور.
import json
from pathlib import Path

BASE = Path("src/i18n/dictionaries")
LANGS = ["ar", "fr", "en", "es"]

# (قسم، مفتاح) → الترجمات بالترتيب ar, fr, en, es
ADD = {
    # ── errors (حدود الأخطاء: تُستعمل في error.tsx، وتُرادف نسخة مصغرة مضمنة في global-error.tsx) ──
    ("errors", "title"): (
        "حدث خطأ غير متوقع",
        "Une erreur inattendue s'est produite",
        "An unexpected error occurred",
        "Ha ocurrido un error inesperado",
    ),
    ("errors", "pageHint"): (
        "وقعت مشكلة مؤقتة أثناء تحميل هذه الصفحة، وليست من إدخالك شيئًا. جرّب إعادة المحاولة — إن تكررت فتواصل مع الدعم الفني مع رمز الخطأ أدناه.",
        "Un problème temporaire est survenu lors du chargement de cette page — il ne provient pas de votre saisie. Réessayez ; si le problème persiste, contactez le support technique avec le code d'erreur ci-dessous.",
        "A temporary issue occurred while loading this page — it is not caused by anything you entered. Please try again; if it keeps happening, contact technical support with the error code below.",
        "Ocurrió un problema temporal al cargar esta página; no se debe a nada que hayas introducido. Inténtalo de nuevo; si persiste, contacta con el soporte técnico con el código de error que aparece abajo.",
    ),
    ("errors", "platformHint"): (
        "وقعت مشكلة مؤقتة أثناء تحميل المنصة. جرّب إعادة المحاولة — إن تكررت فتواصل مع الدعم الفني مع رمز الخطأ أدناه.",
        "Un problème temporaire est survenu lors du chargement de la plateforme. Réessayez ; si le problème persiste, contactez le support technique avec le code d'erreur ci-dessous.",
        "A temporary issue occurred while loading the platform. Please try again; if it keeps happening, contact technical support with the error code below.",
        "Ocurrió un problema temporal al cargar la plataforma. Inténtalo de nuevo; si persiste, contacta con el soporte técnico con el código de error que aparece abajo.",
    ),
    ("errors", "reload"): (
        "تحديث الصفحة",
        "Rafraîchir la page",
        "Reload page",
        "Recargar la página",
    ),
    ("errors", "digestLabel"): (
        "رمز الخطأ للدعم",
        "Code d'erreur (support)",
        "Error code for support",
        "Código de error para soporte",
    ),
}

for lang in LANGS:
    path = BASE / f"{lang}.json"
    data = json.loads(path.read_text(encoding="utf-8"))
    added = 0
    for (section, key), values in ADD.items():
        idx = LANGS.index(lang)
        val = values[idx]
        sec = data.setdefault(section, {})
        if key in sec:
            continue  # idempotent
        sec[key] = val
        added += 1
    # ترتيب القسم الأخير داخل common لا يُلمس — نكتب بترتيب الإدراج الأصلي
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"✓ {lang}.json: أُضيف {added} مفتاحًا")

print("تم — القواميس الأربعة متطابقة البنية (تحقق: bun run check:i18n)")
