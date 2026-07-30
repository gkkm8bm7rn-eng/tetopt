#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import math
import re
from pathlib import Path
from statistics import mean

import cv2
import numpy as np
from PIL import Image, ImageOps

PRODUCTS_MARKER = "    const PRODUCTS = "
ASCII_CHARS = " .:-=+*#%@"


def read_products(path: Path) -> list[dict]:
    text = path.read_text(encoding="utf-8")
    start = text.index(PRODUCTS_MARKER) + len(PRODUCTS_MARKER)
    end = text.index(";\n", start)
    return json.loads(text[start:end])


def read_hidden(path: Path) -> set[int]:
    if not path.exists():
        return set()
    data = json.loads(path.read_text(encoding="utf-8"))
    return {int(x) for x in data.get("ids", [])}


def clean_asset(path: str) -> str:
    return path.split("?", 1)[0].split("#", 1)[0]


def image_metrics(path: Path) -> dict:
    with Image.open(path) as src:
        src.load()
        image = ImageOps.exif_transpose(src).convert("RGB")
    rgb = np.asarray(image)
    h, w = rgb.shape[:2]
    gray = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)
    sharpness = float(cv2.Laplacian(gray, cv2.CV_64F).var())

    border = np.concatenate([
        rgb[: max(2, h // 40), :, :].reshape(-1, 3),
        rgb[-max(2, h // 40) :, :, :].reshape(-1, 3),
        rgb[:, : max(2, w // 40), :].reshape(-1, 3),
        rgb[:, -max(2, w // 40) :, :].reshape(-1, 3),
    ])
    border_median = np.median(border, axis=0)
    border_std = float(np.mean(np.std(border.astype(np.float32), axis=0)))
    border_luma = float(np.mean(border_median))

    color_distance = np.linalg.norm(rgb.astype(np.float32) - border_median.astype(np.float32), axis=2)
    threshold = max(24.0, float(np.percentile(color_distance, 62)) * 0.55)
    mask = (color_distance > threshold).astype(np.uint8) * 255

    # Edge information helps when the product is light on a light background.
    edges = cv2.Canny(gray, 45, 135)
    mask = cv2.bitwise_or(mask, cv2.dilate(edges, np.ones((3, 3), np.uint8), iterations=1))
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, np.ones((7, 7), np.uint8), iterations=2)
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8), iterations=1)

    count, labels, stats, _ = cv2.connectedComponentsWithStats(mask, 8)
    components = []
    for idx in range(1, count):
        x, y, bw, bh, area = [int(v) for v in stats[idx]]
        if area >= max(60, int(w * h * 0.0015)):
            components.append((area, x, y, bw, bh, idx))
    components.sort(reverse=True)

    if components:
        # Use several meaningful components so thin legs/hooks are not lost.
        largest_area = components[0][0]
        chosen = [c for c in components if c[0] >= largest_area * 0.035][:12]
        x1 = min(c[1] for c in chosen)
        y1 = min(c[2] for c in chosen)
        x2 = max(c[1] + c[3] for c in chosen)
        y2 = max(c[2] + c[4] for c in chosen)
        component_area = sum(c[0] for c in chosen)
    else:
        x1 = y1 = 0
        x2, y2 = w, h
        component_area = 0

    bbox_w, bbox_h = max(1, x2 - x1), max(1, y2 - y1)
    bbox_ratio = (bbox_w * bbox_h) / float(w * h)
    foreground_ratio = component_area / float(w * h)
    margins = {
        "left": x1 / w,
        "right": (w - x2) / w,
        "top": y1 / h,
        "bottom": (h - y2) / h,
    }
    min_margin = min(margins.values())
    edge_touches = sum(v < 0.012 for v in margins.values())
    center_x = ((x1 + x2) / 2) / w
    center_y = ((y1 + y2) / 2) / h
    center_offset = math.hypot(center_x - 0.5, center_y - 0.5)
    background_uniformity = max(0.0, 1.0 - border_std / 70.0)
    white_background = max(0.0, min(1.0, (border_luma - 150) / 90.0)) * background_uniformity

    # A whole-product studio view normally has a quiet border, visible margins,
    # a centred object and a bounding box that is large but not cropped.
    size_score = max(0.0, 1.0 - abs(bbox_ratio - 0.48) / 0.48)
    margin_score = min(1.0, max(0.0, min_margin / 0.055))
    centering_score = max(0.0, 1.0 - center_offset / 0.34)
    sharpness_score = min(1.0, math.log1p(max(0.0, sharpness)) / math.log(900.0))
    resolution_score = min(1.0, min(w, h) / 1000.0)
    crop_penalty = edge_touches * 0.22 + (0.28 if bbox_ratio > 0.88 else 0.0)
    detail_penalty = 0.25 if foreground_ratio > 0.72 else 0.0
    general_score = (
        0.26 * white_background
        + 0.22 * margin_score
        + 0.18 * size_score
        + 0.14 * centering_score
        + 0.11 * sharpness_score
        + 0.09 * resolution_score
        - crop_penalty
        - detail_penalty
    )

    # Build a compact silhouette/edge preview for review in a text-only report.
    preview_w = 42
    preview_h = max(16, min(30, round(preview_w * h / w * 0.48)))
    merged = cv2.bitwise_or(mask, edges)
    preview = cv2.resize(merged, (preview_w, preview_h), interpolation=cv2.INTER_AREA)
    rows = []
    for row in preview:
        rows.append("".join(ASCII_CHARS[min(len(ASCII_CHARS) - 1, int(v) * len(ASCII_CHARS) // 256)] for v in row))

    return {
        "width": w,
        "height": h,
        "sharpness": round(sharpness, 1),
        "border_luma": round(border_luma, 1),
        "border_std": round(border_std, 1),
        "bbox_ratio": round(bbox_ratio, 4),
        "foreground_ratio": round(foreground_ratio, 4),
        "min_margin": round(min_margin, 4),
        "edge_touches": edge_touches,
        "center_offset": round(center_offset, 4),
        "white_background": round(white_background, 4),
        "general_score": round(general_score, 4),
        "preview": rows,
    }


def audit(products: list[dict], hidden: set[int], ids: list[int], root: Path) -> dict:
    by_id = {int(p["id"]): p for p in products}
    audited = []
    for product_id in ids:
        if product_id in hidden or product_id not in by_id:
            continue
        product = by_id[product_id]
        candidates = []
        seen = set()
        for raw in list(product.get("images") or []) + [product.get("directImage")]:
            if not raw or not isinstance(raw, str):
                continue
            rel = clean_asset(raw)
            if not rel.startswith("assets/products/") or rel in seen:
                continue
            seen.add(rel)
            path = root / rel
            if not path.is_file():
                candidates.append({"path": rel, "missing": True, "general_score": -99})
                continue
            try:
                metrics = image_metrics(path)
                candidates.append({"path": rel, **metrics})
            except Exception as exc:
                candidates.append({"path": rel, "error": str(exc), "general_score": -99})
        candidates.sort(key=lambda x: x.get("general_score", -99), reverse=True)
        confidence = 0.0
        if candidates:
            first = candidates[0].get("general_score", -99)
            second = candidates[1].get("general_score", -99) if len(candidates) > 1 else -99
            confidence = min(1.0, max(0.0, (first + 0.15) * 0.8 + max(0.0, first - second) * 0.7))
        audited.append({
            "id": product_id,
            "name": product.get("name", ""),
            "category": product.get("category", ""),
            "current_images": list(product.get("images") or []),
            "recommended_first": candidates[0]["path"] if candidates else None,
            "confidence": round(confidence, 3),
            "manual_review": confidence < 0.58 or not candidates or candidates[0].get("edge_touches", 4) >= 2,
            "candidates": candidates,
        })
    return {"ids": ids, "products": audited}


def write_text(report: dict, path: Path) -> None:
    lines = ["FORMA HOME — визуальный аудит фотографий", "=" * 54, ""]
    for product in report["products"]:
        lines += [
            f"ID {product['id']} — {product['name']}",
            f"Категория: {product['category']}",
            f"Рекомендовано первым: {product['recommended_first']}",
            f"Уверенность: {product['confidence']}; ручная проверка: {'ДА' if product['manual_review'] else 'нет'}",
            "",
        ]
        for idx, candidate in enumerate(product["candidates"], 1):
            lines.append(f"  [{idx}] {candidate['path']}")
            if candidate.get("missing"):
                lines.append("      ФАЙЛ ОТСУТСТВУЕТ")
                continue
            if candidate.get("error"):
                lines.append(f"      ОШИБКА: {candidate['error']}")
                continue
            lines.append(
                "      "
                f"score={candidate['general_score']}  {candidate['width']}×{candidate['height']}  "
                f"sharp={candidate['sharpness']}  bbox={candidate['bbox_ratio']}  "
                f"margin={candidate['min_margin']}  touches={candidate['edge_touches']}  "
                f"white={candidate['white_background']}"
            )
            lines.extend("      |" + row + "|" for row in candidate["preview"])
            lines.append("")
        lines += ["-" * 54, ""]
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(lines), encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--catalog", default="catalog-source.html")
    parser.add_argument("--hidden", default="hidden-products.json")
    parser.add_argument("--ids", required=True, help="Диапазон 12-20 или список 12,13,14")
    parser.add_argument("--json", default="data/photo-audit.json")
    parser.add_argument("--text", default="data/photo-audit.txt")
    args = parser.parse_args()

    if "-" in args.ids and "," not in args.ids:
        start, end = [int(x) for x in args.ids.split("-", 1)]
        ids = list(range(start, end + 1))
    else:
        ids = [int(x.strip()) for x in args.ids.split(",") if x.strip()]

    root = Path(".")
    report = audit(read_products(Path(args.catalog)), read_hidden(Path(args.hidden)), ids, root)
    Path(args.json).parent.mkdir(parents=True, exist_ok=True)
    Path(args.json).write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    write_text(report, Path(args.text))
    print(f"Audited {len(report['products'])} products")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
