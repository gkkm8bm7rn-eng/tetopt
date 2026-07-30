#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from pathlib import Path

from audit_product_photos import image_metrics
from import_photos import process_product


def load_source_products(path: Path) -> list[dict]:
    products = json.loads(path.read_text(encoding="utf-8"))
    for index, product in enumerate(products, 1):
        product.setdefault("id", index)
    return products


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", default="products.json")
    parser.add_argument("--ids", required=True)
    parser.add_argument("--max-photos", type=int, default=12)
    parser.add_argument("--max-side", type=int, default=1600)
    parser.add_argument("--max-kb", type=int, default=420)
    parser.add_argument("--out", default="data/refetch")
    args = parser.parse_args()

    ids = [int(value.strip()) for value in args.ids.split(",") if value.strip()]
    products = {int(p["id"]): p for p in load_source_products(Path(args.source))}
    root = Path(".")
    out_dir = Path(args.out)
    report = {"requested_ids": ids, "products": []}

    for product_id in ids:
        product = products[product_id]
        result = process_product(
            product,
            repository_root=root,
            assets_dir=out_dir,
            max_photos=args.max_photos,
            max_side=args.max_side,
            max_kb=args.max_kb,
        )
        candidates = []
        for rel in result.images:
            path = root / rel
            metrics = image_metrics(path)
            candidates.append({"path": rel, **metrics})
        candidates.sort(key=lambda item: item.get("general_score", -99), reverse=True)
        report["products"].append({
            "id": product_id,
            "name": product.get("name", ""),
            "specs": product.get("specs", ""),
            "photoBank": product.get("photoBank"),
            "productUrl": product.get("productUrl"),
            "error": result.error,
            "discovered": result.discovered,
            "candidates": candidates,
        })

    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "review.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")

    lines = ["Повторный поиск фотографий", "=" * 60, ""]
    for product in report["products"]:
        lines += [
            f"ID {product['id']} — {product['name']}",
            product["specs"],
            f"Найдено ссылок: {product['discovered']}; ошибка: {product['error'] or 'нет'}",
            "",
        ]
        for number, candidate in enumerate(product["candidates"], 1):
            lines.append(
                f"[{number}] {candidate['path']}  score={candidate['general_score']}  "
                f"{candidate['width']}×{candidate['height']}  sharp={candidate['sharpness']}  "
                f"bbox={candidate['bbox_ratio']} margin={candidate['min_margin']} "
                f"touches={candidate['edge_touches']} white={candidate['white_background']}"
            )
            lines.extend("    |" + row + "|" for row in candidate["preview"])
            lines.append("")
        lines += ["-" * 60, ""]
    (out_dir / "review.txt").write_text("\n".join(lines), encoding="utf-8")
    print(f"Prepared review for {len(report['products'])} product(s)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
