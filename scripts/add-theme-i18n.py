#!/usr/bin/env python3
# FWMS — إضافة مفاتيح المظهر (الوضع القاتم/الفاتح) إلى القواميس الأربع معًا
# (قاعدة AGENTS.md رقم 1: لا نصوص ثابتة في الكود — كل نص في ملفات الترجمة).
# يعمل مرة واحدة؛ idempotent بمفتاح موجود (بنمط scripts/add-0.10.3-i18n.py).
#
# السياق: ربط next-themes (كانت مثبَّتة دون استعمال) + مبدّل مظهر ثلاثي الحالات
# (فاتح/قاتم/تلقائي) في صفحة الدخول وترويسة اللوحة.
import json
from pathlib import Path

BASE = Path("src/i18n/dictionaries")
LANGS = ["ar", "fr", "en", "es"]

# (قسم، مفتاح) → الترجمات بالترتيب ar, fr, en, es
ADD = {
    ("theme", "label"): (
        "المظهر",
        "Thème",
        "Theme",
        "Tema",
    ),
    ("theme", "light"): (
        "فاتح",
        "Clair",
        "Light",
        "Claro",
    ),
    ("theme", "dark"): (
        "قاتم",
        "Sombre",
        "Dark",
        "Oscuro",
    ),
    ("theme", "system"): (
        "تلقائي حسب النظام",
        "Système",
        "System",
        "Sistema",
    ),
}

for lang in LANGS:
    path = BASE / f"{lang}.json"
    data = json.loads(path.read_text(encoding="utf-8"))
    added = 0
    idx = LANGS.index(lang)
    for (section, key), values in ADD.items():
        sec = data.setdefault(section, {})
        if key in sec:
            continue  # idempotent
        sec[key] = values[idx]
        added += 1
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"✓ {lang}.json: أُضيف {added} مفتاحًا")

print("تم — تحقق: bun run check:i18n")
