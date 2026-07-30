#!/usr/bin/env python3
"""Audit and reorder existing product galleries before publication.

The script never invents a missing image and never substitutes a detail shot when
no confident full-product view is found. Such products remain unchanged and are
written to data/photo-curation-report.json for manual selection.
"""
from __future__ import annotations

import argparse
import json
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from PIL import Image, ImageFilter, ImageStat, UnidentifiedImageError


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def read_products(path: Path) -> tuple[str, list[dict[str, Any]], int, int]:
    html = path.read_text(encoding="utf-8")
    marker = "const PRODUCTS ="
    marker_pos = html.find(marker)
    if marker_pos < 0:
        raise ValueError(f"В {path} не найден массив PRODUCTS")
    start = marker_pos + len(marker)
    while start < len(html) and html[start].isspace():
        start += 1
    products, consumed = json.JSONDecoder().raw_decode(html[start:])
    if not isinstance(products, list):
        raise ValueError("PRODUCTS должен быть массивом")
    return html, products, start, start + consumed


def write_products(path: Path, html: str, products: list[dict[str, Any]], start: int, end: int) -> None:
    payload = json.dumps(products, ensure_ascii=False, separators=(",", ":"))
    updated = html[:start] + payload + html[end:]
    temp = path.with_suffix(path.suffix + ".tmp")
    temp.write_text(updated, encoding="utf-8")
    temp.replace(path)


@dataclass
class PhotoAudit:
    path: str
    width: int
    height: int
    view_score: float
    sharpness: float
    quality_ok: bool


def photo_metrics(path: Path) -> PhotoAudit:
    with Image.open(path) as source:
        source.load()
        image = source.convert("RGB")
        original_width, original_height = image.size
        sample = image.copy()
        sample.thumbnail((180, 180), Image.Resampling.LANCZOS)
        width, height = sample.size
        corners = (
            sample.getpixel((0, 0)), sample.getpixel((width - 1, 0)),
            sample.getpixel((0, height - 1)), sample.getpixel((width - 1, height - 1)),
        )
        background = tuple(sum(pixel[channel] for pixel in corners) / 4 for channel in range(3))

        mask: list[bool] = []
        for pixel in sample.getdata():
            distance = sum(abs(pixel[channel] - background[channel]) for channel in range(3))
            mask.append(distance > 62)

        foreground_ratio = sum(mask) / max(1, width * height)
        xs: list[int] = []
        ys: list[int] = []
        for index, foreground in enumerate(mask):
            if foreground:
                xs.append(index % width)
                ys.append(index // width)

        if xs:
            left, right = min(xs), max(xs)
            top, bottom = min(ys), max(ys)
            bbox_ratio = ((right - left + 1) * (bottom - top + 1)) / max(1, width * height)
            margins = (
                left / width, (width - 1 - right) / width,
                top / height, (height - 1 - bottom) / height,
            )
            min_margin = min(margins)
            touched_edges = sum(margin < 0.018 for margin in margins)
        else:
            bbox_ratio = 0.0
            min_margin = 0.0
            touched_edges = 4

        score = 0.0
        if 0.06 <= foreground_ratio <= 0.75:
            score += 28
        elif foreground_ratio > 0.90:
            score -= 30
        if 0.08 <= bbox_ratio <= 0.82:
            score += 34
        elif bbox_ratio > 0.92:
            score -= 32
        score += min(24.0, min_margin * 240)
        score -= touched_edges * 10
        if original_height >= original_width:
            score += 4

        edges = sample.convert("L").filter(ImageFilter.FIND_EDGES)
        sharpness = float(ImageStat.Stat(edges).var[0])
        resolution_ok = min(original_width, original_height) >= 700 and max(original_width, original_height) >= 1000
        sharpness_ok = sharpness >= 35
        quality_ok = resolution_ok and sharpness_ok
        total_score = score + min(18.0, sharpness / 60.0)
        return PhotoAudit(path.as_posix(), original_width, original_height, total_score, sharpness, quality_ok)


def is_hanger(product: dict[str, Any]) -> bool:
    text = f"{product.get('collection', '')} {product.get('category', '')} {product.get('name', '')}".lower()
    return "вешал" in text


def is_interior_path(value: str) -> bool:
    return value.startswith("assets/interiors/")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--index", default="catalog-source.html")
    parser.add_argument("--report", default="data/photo-curation-report.json")
    parser.add_argument("--max-product-photos", type=int, default=3)
    parser.add_argument("--minimum-primary-score", type=float, default=10.0)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    index_path = Path(args.index).resolve()
    root = index_path.parent
    html, products, start, end = read_products(index_path)

    changed = 0
    checked = 0
    manual: list[dict[str, Any]] = []
    quality_warnings: list[dict[str, Any]] = []

    for product in products:
        product_id = int(product.get("id", 0))
        current = [value for value in product.get("images", []) if isinstance(value, str) and value]
        interiors = [value for value in current if is_interior_path(value)]
        product_paths = [value for value in current if not is_interior_path(value)]
        existing = [value for value in product_paths if (root / value).is_file()]
        if not existing:
            manual.append({
                "id": product_id,
                "name": product.get("name"),
                "reason": "Нет локальных товарных фотографий; требуется повторный поиск в фотобанке и ручной выбор при неудаче.",
            })
            continue

        audits: list[PhotoAudit] = []
        for relative in existing:
            try:
                audit = photo_metrics(root / relative)
                audit.path = relative
                audits.append(audit)
            except (UnidentifiedImageError, OSError, ValueError) as exc:
                quality_warnings.append({"id": product_id, "path": relative, "reason": str(exc)})

        if not audits:
            manual.append({"id": product_id, "name": product.get("name"), "reason": "Все локальные файлы повреждены или не читаются."})
            continue

        checked += 1
        audits.sort(key=lambda item: (item.view_score, item.quality_ok, item.sharpness, item.width * item.height), reverse=True)
        primary = audits[0]
        if primary.view_score < args.minimum_primary_score:
            manual.append({
                "id": product_id,
                "name": product.get("name"),
                "reason": "Не найден уверенный общий вид среди локальных фотографий; карточка оставлена без автоматической перестановки.",
                "best_candidate": {
                    "path": primary.path,
                    "score": round(primary.view_score, 1),
                    "size": f"{primary.width}x{primary.height}",
                    "sharpness": round(primary.sharpness, 1),
                },
            })
            continue

        limit = 2 if is_hanger(product) else args.max_product_photos
        selected = audits[:limit]
        new_images = [item.path for item in selected] + interiors
        if new_images != current:
            product["images"] = new_images
            product["directImage"] = new_images[0]
            changed += 1

        for item in selected:
            if not item.quality_ok:
                quality_warnings.append({
                    "id": product_id,
                    "name": product.get("name"),
                    "path": item.path,
                    "size": f"{item.width}x{item.height}",
                    "sharpness": round(item.sharpness, 1),
                    "reason": "Изображение требует замены на более чёткий исходник.",
                })

    write_products(index_path, html, products, start, end)
    report_path = root / args.report
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps({
        "updated_at": utc_now(),
        "total_products": len(products),
        "checked_products": checked,
        "changed_galleries": changed,
        "manual_review": manual,
        "quality_warnings": quality_warnings,
    }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print(f"Проверено карточек: {checked}/{len(products)}")
    print(f"Изменён порядок или количество фото: {changed}")
    print(f"На ручной выбор: {len(manual)}")
    print(f"Предупреждения качества: {len(quality_warnings)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
