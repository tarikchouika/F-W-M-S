#!/usr/bin/env python3
# HRMP — تدقيق مفاتيح t() في مكونات المرحلة 6ج مقابل قاموس ar (درس WORKLOG 6أ/6ب:
# المفاتيح المفقودة من الأربع معًا يمرّ منها فحص التكافؤ — التدقيق الشامل إلزامي نهاية كل جلسة)
import json
import re
import sys

FILES = [
    "src/components/hrmp/regimes-manager.tsx",
    "src/components/hrmp/declaration-specs-manager.tsx",
    "src/components/hrmp/declarations-manager.tsx",
    "src/components/hrmp/payroll-manager.tsx",
]

with open("src/i18n/dictionaries/ar.json", encoding="utf-8") as f:
    ar = json.load(f)

def has_key(d, dotted):
    node = d
    for part in dotted.split("."):
        if not isinstance(node, dict) or part not in node:
            return False
        node = node[part]
    return True

missing = []
used = set()
for path in FILES:
    with open(path, encoding="utf-8") as f:
        content = f.read()
    # t("key") و t(`key`) — نلتقط النصية والقالبية الثابتة
    for m in re.finditer(r'\bt\(\s*["\'`]([^"\'`$]+\{?[^"\'`]*)["\'`]\s*[,\)]', content):
        key = m.group(1)
        if "$" in key or "{" in key:
            continue
        used.add(key)
        if not has_key(ar, key):
            missing.append((path, key))

print(f"مفاتيح t() المستخدمة في مكونات 6ج: {len(used)}")
if missing:
    print("مفاتيح مفقودة من ar.json:")
    for path, key in missing:
        print(f"  ✗ {path}: {key}")
    sys.exit(1)
print("✓ كل المفاتيح موجودة في ar.json (وبالتكافؤ: في الأربع)")
