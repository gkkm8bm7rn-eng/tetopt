#!/usr/bin/env python3
from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path

OVERRIDES = {
    81: ["assets/products/81/03.webp"],
    87: ["assets/products/87/01.webp", "assets/products/87/03.webp"],
    88: ["assets/products/88/02.webp", "assets/products/88/01.webp"],
    90: ["assets/products/90/01.webp", "assets/products/90/03.webp"],
}
REASONS = {
    81: "Кадр 03 показывает товар целиком и имеет достаточную резкость; кадры 01 и 02 исключены как размытые.",
    87: "Кадр 01 выбран общим видом; кадр 03 оставлен дополнительным. Кадр 02 исключён как размытый.",
    88: "Кадр 02 выбран общим видом; кадр 01 оставлен дополнительным. Кадр 03 исключён как размытый.",
    90: "Кадр 01 выбран общим видом как более резкий; кадр 03 оставлен дополнительным. Кадр 02 исключён из-за недостаточной резкости.",
}
MARKER = "    const PRODUCTS = "
CATALOG = Path("catalog-source.html")
LOADER = Path("catalog-loader.js")
INDEX = Path("index.html")
PROGRESS = Path("photo-processing-progress.json")
REPORT = Path("data/batch-03-resolution-report.json")


def validate_asset(product_id: int, path: str) -> dict:
    if not path.startswith(f"assets/products/{product_id}/"):
        raise RuntimeError(f"ID {product_id}: посторонний путь {path}")
    file = Path(path)
    if not file.is_file() or file.stat().st_size < 2500:
        raise RuntimeError(f"ID {product_id}: отсутствует или повреждён файл {path}")
    raw = file.read_bytes()
    if not raw.startswith(b"RIFF") or raw[8:12] != b"WEBP":
        raise RuntimeError(f"ID {product_id}: файл не WebP {path}")
    return {"path": path, "bytes": len(raw)}


def bump_versions() -> str:
    now = datetime.now(timezone.utc)
    asset_version = now.strftime("%Y%m%d-%H%M-b03-resolved")
    loader = LOADER.read_text(encoding="utf-8")
    loader, count = re.subn(r'const assetVersion="[^"]+";', f'const assetVersion="{asset_version}";', loader, count=1)
    if count != 1:
        raise RuntimeError("Не удалось обновить assetVersion")
    LOADER.write_text(loader, encoding="utf-8")

    index = INDEX.read_text(encoding="utf-8")
    match = re.search(r'catalog-loader\.js\?v=(\d+)', index)
    if not match:
        raise RuntimeError("Не найдена версия загрузчика")
    value = str(int(match.group(1)) + 1)
    index = index[:match.start(1)] + value + index[match.end(1):]
    INDEX.write_text(index, encoding="utf-8")
    return asset_version


def main() -> int:
    html = CATALOG.read_text(encoding="utf-8")
    start = html.index(MARKER) + len(MARKER)
    end = html.index(";\n", start)
    products = json.loads(html[start:end])
    by_id = {int(product["id"]): product for product in products}
    changes = []

    for product_id, images in OVERRIDES.items():
        product = by_id.get(product_id)
        if product is None:
            raise RuntimeError(f"ID {product_id}: товар не найден")
        assets = [validate_asset(product_id, path) for path in images]
        before = list(product.get("images") or [])
        product["images"] = images
        product["directImage"] = images[0]
        changes.append({
            "id": product_id,
            "name": product.get("name"),
            "before": before,
            "after": images,
            "reason": REASONS[product_id],
            "assets": assets,
        })

    CATALOG.write_text(
        html[:start] + json.dumps(products, ensure_ascii=False, separators=(",", ":")) + html[end:],
        encoding="utf-8",
    )
    asset_version = bump_versions()
    now = datetime.now(timezone.utc).isoformat()

    progress = json.loads(PROGRESS.read_text(encoding="utf-8"))
    progress["version"] = int(progress.get("version", 0)) + 1
    progress["updatedAt"] = now
    progress["inProgressBatch"] = 3
    progress["unresolvedIds"] = []
    progress["lastBatchStatus"] = "batch_03_resolved_pending_live_verification"
    PROGRESS.write_text(json.dumps(progress, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    report = {
        "batch": 3,
        "resolvedIds": sorted(OVERRIDES),
        "unresolvedIds": [],
        "assetVersion": asset_version,
        "status": "resolved_pending_live_verification",
        "updatedAt": now,
        "products": changes,
    }
    REPORT.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"resolved": sorted(OVERRIDES), "assetVersion": asset_version}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
