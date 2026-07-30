#!/usr/bin/env python3
from __future__ import annotations

import json
import re
import shutil
from datetime import datetime, timezone
from pathlib import Path

PRODUCTS_MARKER = "    const PRODUCTS = "


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def main() -> int:
    root = Path(".")
    source_dir = root / "data/retailer/20"
    target_dir = root / "assets/products/20"
    required = {
        source_dir / "01.webp": target_dir / "01.webp",  # точный общий вид: стол + 4 стула
        source_dir / "03.webp": target_dir / "02.webp",  # полезный дополнительный ракурс
        source_dir / "02.webp": target_dir / "03.webp",  # стол отдельно
    }
    for source in required:
        if not source.is_file():
            raise SystemExit(f"Нет проверенного исходника: {source}")
    target_dir.mkdir(parents=True, exist_ok=True)
    for source, target in required.items():
        shutil.copy2(source, target)

    catalog_path = root / "catalog-source.html"
    text = catalog_path.read_text(encoding="utf-8")
    start = text.index(PRODUCTS_MARKER) + len(PRODUCTS_MARKER)
    end = text.index(";\n", start)
    products = json.loads(text[start:end])
    product = next(item for item in products if int(item["id"]) == 20)
    order = [
        "assets/products/20/01.webp",
        "assets/products/20/02.webp",
        "assets/products/20/03.webp",
    ]
    product["images"] = order
    product["directImage"] = order[0]
    new_text = text[:start] + json.dumps(products, ensure_ascii=False, separators=(",", ":")) + text[end:]
    catalog_path.write_text(new_text, encoding="utf-8")

    progress_path = root / "photo-processing-progress.json"
    progress = json.loads(progress_path.read_text(encoding="utf-8"))
    progress["updatedAt"] = now_iso()
    progress["reviewedIds"] = sorted(set(progress.get("reviewedIds", [])) | {20})
    progress["completedIds"] = sorted(set(progress.get("completedIds", [])) | {20})
    progress["manualReviewIds"] = [value for value in progress.get("manualReviewIds", []) if int(value) != 20]
    progress["lastBatch"] = 1
    progress_path.write_text(json.dumps(progress, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    batch_path = root / "data/curation-batch-01.json"
    batch = json.loads(batch_path.read_text(encoding="utf-8"))
    batch["completedIds"] = sorted(set(batch.get("completedIds", [])) | {20})
    batch["manualReviewIds"] = [value for value in batch.get("manualReviewIds", []) if int(value) != 20]
    batch.setdefault("orders", {})["20"] = order
    batch.setdefault("notes", {})["20"] = "Повторный поиск выполнен; общий вид точной модели 21794 получен у карточки официального дилера в 1000×1000."
    batch_path.write_text(json.dumps(batch, ensure_ascii=False, indent=2), encoding="utf-8")

    index_path = root / "index.html"
    index_text = index_path.read_text(encoding="utf-8")
    match = re.search(r'catalog-loader\.js\?v=(\d+)', index_text)
    if match:
        next_version = int(match.group(1)) + 1
        index_text = index_text[:match.start(1)] + str(next_version) + index_text[match.end(1):]
        index_path.write_text(index_text, encoding="utf-8")

    report = {
        "batch": 1,
        "finalizedAt": progress["updatedAt"],
        "productId": 20,
        "productCode": 21794,
        "status": "completed",
        "order": order,
        "source": {
            "page": "https://www.vseinstrumenti.ru/product/obedennyj-komplekt-tetchair-sonata-dining-set-stol-4-stula-massiv-sosny-stol-120x75x73-sm-stul-41x50x95-sm-antik-belyj-21794-15246466/",
            "firstPhoto": "https://cdn.vseinstrumenti.ru/images/goods/tovary-dlya-ofisa-i-doma/mebel/15246466/1000x1000/174733918.jpg",
            "exactModelConfirmed": True,
            "fullSetVisible": True,
            "dimensions": "1000x1000"
        },
        "completedIds": progress["completedIds"],
        "manualReviewIds": progress["manualReviewIds"]
    }
    (root / "data/curation-batch-01-final.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
