#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path

PRODUCTS_MARKER = "    const PRODUCTS = "
INTERIOR_PREFIX = "assets/interiors/"


def read_products(text: str) -> tuple[list[dict], int, int]:
    start = text.index(PRODUCTS_MARKER) + len(PRODUCTS_MARKER)
    end = text.index(";\n", start)
    return json.loads(text[start:end]), start, end


def iso_now() -> str:
    return datetime.now(timezone.utc).astimezone().replace(microsecond=0).isoformat()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--catalog", default="catalog-source.html")
    parser.add_argument("--batch", required=True)
    parser.add_argument("--progress", default="photo-processing-progress.json")
    parser.add_argument("--index", default="index.html")
    parser.add_argument("--result", default="data/curation-batch-result.json")
    args = parser.parse_args()

    root = Path(".")
    catalog_path = Path(args.catalog)
    batch_path = Path(args.batch)
    progress_path = Path(args.progress)
    index_path = Path(args.index)

    batch = json.loads(batch_path.read_text(encoding="utf-8"))
    catalog_text = catalog_path.read_text(encoding="utf-8")
    products, start, end = read_products(catalog_text)
    by_id = {int(product["id"]): product for product in products}

    applied: list[int] = []
    missing_files: dict[str, list[str]] = {}
    for raw_id, order in batch.get("orders", {}).items():
        product_id = int(raw_id)
        if product_id not in by_id:
            raise SystemExit(f"Товар ID {product_id} отсутствует в каталоге")
        normalized: list[str] = []
        for rel in order:
            clean = str(rel).split("?", 1)[0].split("#", 1)[0]
            if clean.startswith(INTERIOR_PREFIX):
                raise SystemExit(f"Непроверенная интерьерная визуализация запрещена: {rel}")
            if not (root / clean).is_file():
                missing_files.setdefault(str(product_id), []).append(clean)
            if clean not in normalized:
                normalized.append(clean)
        if not normalized:
            raise SystemExit(f"Пустая галерея для ID {product_id}")
        if str(product_id) in missing_files:
            continue
        product = by_id[product_id]
        product["images"] = normalized
        product["directImage"] = normalized[0]
        applied.append(product_id)

    if missing_files:
        raise SystemExit("Отсутствуют файлы: " + json.dumps(missing_files, ensure_ascii=False))

    new_catalog = catalog_text[:start] + json.dumps(products, ensure_ascii=False, separators=(",", ":")) + catalog_text[end:]
    catalog_path.write_text(new_catalog, encoding="utf-8")

    reviewed = sorted({int(x) for x in batch.get("reviewedIds", [])})
    completed = sorted({int(x) for x in batch.get("completedIds", [])})
    manual = sorted({int(x) for x in batch.get("manualReviewIds", [])})
    progress = {
        "version": 2,
        "updatedAt": iso_now(),
        "activeTarget": int(batch.get("activeTarget", 1362)),
        "reviewedIds": reviewed,
        "completedIds": completed,
        "manualReviewIds": manual,
        "lastBatch": int(batch.get("batch", 0)),
        "rules": {
            "firstPhoto": "verified full-product view of exact model and colour",
            "extraPhotos": "only useful real angles; no redundant detail crops",
            "interiors": "last only after exact manual model verification; otherwise omitted",
            "brokenImages": "never published; no placeholders",
            "archivedSource": "hidden-products.json",
            "batchGate": "next batch starts only after publication and dual-site verification"
        }
    }
    progress_path.write_text(json.dumps(progress, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    index_text = index_path.read_text(encoding="utf-8")
    import re
    match = re.search(r'catalog-loader\.js\?v=(\d+)', index_text)
    if match:
        next_version = int(match.group(1)) + 1
        index_text = index_text[:match.start(1)] + str(next_version) + index_text[match.end(1):]
        index_path.write_text(index_text, encoding="utf-8")

    result = {
        "batch": batch.get("batch"),
        "appliedAt": progress["updatedAt"],
        "appliedIds": applied,
        "reviewedIds": reviewed,
        "completedIds": completed,
        "manualReviewIds": manual,
        "orders": batch.get("orders", {}),
        "status": "applied"
    }
    result_path = Path(args.result)
    result_path.parent.mkdir(parents=True, exist_ok=True)
    result_path.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(result, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
