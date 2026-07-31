#!/usr/bin/env python3
from __future__ import annotations

import json
from pathlib import Path

import apply_exact_manzana_107 as base

EXPECTED_SPECS = "ЛДСП/HPL/металл, 80х80х75см, мрамор светлый/белый"
SUPPLIER_CODE = 20620


def validate_catalog_before_update() -> None:
    html = base.CATALOG.read_text(encoding="utf-8")
    start = html.index(base.MARKER) + len(base.MARKER)
    end = html.index(";\n", start)
    products = json.loads(html[start:end])
    product = next((item for item in products if int(item.get("id", 0)) == base.PRODUCT_ID), None)
    if product is None:
        raise RuntimeError("Товар ID 107 не найден")
    specs = str(product.get("specs") or "")
    if "80х80х75" not in specs or "мрамор светлый/белый" not in specs.lower():
        raise RuntimeError(f"ID 107 имеет другой вариант: {specs}")


def main() -> int:
    validate_catalog_before_update()
    base.SUPPLIER_CODE = SUPPLIER_CODE
    result = base.main()
    report = json.loads(base.REPORT.read_text(encoding="utf-8"))
    report["supplierCode"] = SUPPLIER_CODE
    report["officialVariant"] = EXPECTED_SPECS
    report["correction"] = "Код 19729 отклонён как раздвижной вариант 100–130 см; применён точный код 20620 для карточки 80×80×75 см."
    base.REPORT.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"id": base.PRODUCT_ID, "supplierCode": SUPPLIER_CODE, "variant": EXPECTED_SPECS}, ensure_ascii=False))
    return result


if __name__ == "__main__":
    raise SystemExit(main())
