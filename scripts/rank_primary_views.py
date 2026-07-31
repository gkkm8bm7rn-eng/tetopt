#!/usr/bin/env python3
"""Choose the clearest front three-quarter image as the first catalog photo.

The script works only with existing local product photos. It never invents a
missing view and never deletes gallery images. A CLIP zero-shot classifier
compares front three-quarter, front, side, rear, detail, and interior views.
The best front-facing full-product image is moved to images[0]; all remaining
photos keep their original relative order.
"""
from __future__ import annotations

import argparse
import json
import math
import os
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from PIL import Image, ImageFilter, ImageStat, UnidentifiedImageError


PROMPT_TEMPLATES = (
    "a clean catalog product photo of the whole {subject} viewed from the front at a slight three-quarter angle",
    "a clean catalog product photo of the whole {subject} viewed straight from the front",
    "a clean catalog product photo of the whole {subject} viewed from the side",
    "a clean catalog product photo showing the back or rear of the {subject}",
    "a close-up detail photo showing only part of the {subject}",
    "a room interior lifestyle photo containing the {subject}",
)
LABELS = ("front_three_quarter", "front", "side", "rear", "detail", "interior")


@dataclass
class Candidate:
    product_id: int
    product_name: str
    subject: str
    path: str
    original_index: int
    full_view_score: float
    sharpness: float
    quality_ok: bool
    probabilities: list[float] | None = None
    ranking_score: float = -math.inf


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--index", default="catalog-source.html")
    parser.add_argument("--report", default="data/primary-view-report.json")
    parser.add_argument("--model", default="ViT-B-32")
    parser.add_argument("--pretrained", default="openai")
    parser.add_argument("--batch-size", type=int, default=48)
    parser.add_argument("--device", default="cpu")
    return parser.parse_args()


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
    if updated == html:
        return
    temp = path.with_suffix(path.suffix + ".tmp")
    temp.write_text(updated, encoding="utf-8")
    temp.replace(path)


def is_interior(value: str) -> bool:
    return value.startswith("assets/interiors/")


def subject_for(product: dict[str, Any]) -> str:
    text = f"{product.get('category', '')} {product.get('collection', '')} {product.get('name', '')}".lower()
    if any(word in text for word in ("кресл", "стул", "табур", "пуф", "банкет")):
        return "chair or seat"
    if "диван" in text:
        return "sofa"
    if any(word in text for word in ("стол", "подстоль")):
        return "table"
    if any(word in text for word in ("шкаф", "комод", "тумб", "этажерк", "стеллаж", "полк", "обувниц")):
        return "cabinet or shelving unit"
    if "вешал" in text:
        return "coat rack"
    if any(word in text for word in ("кровать", "матрас")):
        return "bedroom furniture item"
    if any(word in text for word in ("комплект", "набор", "группа")):
        return "furniture set"
    if any(word in text for word in ("зеркал", "декор", "кашпо", "ламп", "светиль")):
        return "home decor item"
    return "furniture item"


def photo_metrics(path: Path) -> tuple[float, float, bool]:
    """Estimate full-product visibility and technical quality without inferring angle."""
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
        if 0.06 <= foreground_ratio <= 0.76:
            score += 28
        elif foreground_ratio > 0.90:
            score -= 30
        if 0.08 <= bbox_ratio <= 0.84:
            score += 34
        elif bbox_ratio > 0.93:
            score -= 32
        score += min(24.0, min_margin * 240)
        score -= touched_edges * 10

        edges = sample.convert("L").filter(ImageFilter.FIND_EDGES)
        sharpness = float(ImageStat.Stat(edges).var[0])
        resolution_ok = min(original_width, original_height) >= 650 and max(original_width, original_height) >= 900
        sharpness_ok = sharpness >= 30
        quality_ok = resolution_ok and sharpness_ok
        return score, sharpness, quality_ok


def load_clip(model_name: str, pretrained: str, device: str):
    import torch
    import open_clip

    torch.set_num_threads(max(1, min(4, os.cpu_count() or 1)))
    model, _, preprocess = open_clip.create_model_and_transforms(
        model_name,
        pretrained=pretrained,
        device=device,
    )
    tokenizer = open_clip.get_tokenizer(model_name)
    model.eval()
    return torch, model, preprocess, tokenizer


def score_candidates(candidates: list[Candidate], model_name: str, pretrained: str, batch_size: int, device: str) -> None:
    torch, model, preprocess, tokenizer = load_clip(model_name, pretrained, device)
    grouped: dict[str, list[Candidate]] = defaultdict(list)
    for candidate in candidates:
        grouped[candidate.subject].append(candidate)

    with torch.inference_mode():
        for subject, group in grouped.items():
            prompts = [template.format(subject=subject) for template in PROMPT_TEMPLATES]
            text_tokens = tokenizer(prompts).to(device)
            text_features = model.encode_text(text_tokens)
            text_features = text_features / text_features.norm(dim=-1, keepdim=True)

            for offset in range(0, len(group), batch_size):
                chunk = group[offset:offset + batch_size]
                tensors = []
                valid: list[Candidate] = []
                for candidate in chunk:
                    try:
                        with Image.open(candidate.path) as image:
                            tensors.append(preprocess(image.convert("RGB")))
                        valid.append(candidate)
                    except (UnidentifiedImageError, OSError, ValueError):
                        continue
                if not tensors:
                    continue
                image_batch = torch.stack(tensors).to(device)
                image_features = model.encode_image(image_batch)
                image_features = image_features / image_features.norm(dim=-1, keepdim=True)
                logits = 100.0 * image_features @ text_features.T
                probabilities = logits.softmax(dim=-1).cpu().tolist()
                for candidate, probs in zip(valid, probabilities):
                    candidate.probabilities = [float(value) for value in probs]
                    p3q, pfront, pside, prear, pdetail, pinterior = candidate.probabilities
                    full_component = max(-0.35, min(0.45, candidate.full_view_score / 150.0))
                    quality_component = 0.10 if candidate.quality_ok else -0.08
                    sharpness_component = min(0.08, candidate.sharpness / 9000.0)
                    official_front_bonus = 0.42 if Path(candidate.path).name.startswith("00-front") else 0.0
                    candidate.ranking_score = (
                        2.80 * p3q
                        + 1.05 * pfront
                        - 1.20 * pside
                        - 1.70 * prear
                        - 1.45 * pdetail
                        - 1.10 * pinterior
                        + full_component
                        + quality_component
                        + sharpness_component
                        + official_front_bonus
                    )


def main() -> int:
    args = parse_args()
    index_path = Path(args.index).resolve()
    root = index_path.parent
    html, products, start, end = read_products(index_path)

    all_candidates: list[Candidate] = []
    candidates_by_product: dict[int, list[Candidate]] = defaultdict(list)
    records: list[dict[str, Any]] = []
    missing: list[dict[str, Any]] = []

    for product in products:
        product_id = int(product.get("id", 0))
        subject = subject_for(product)
        current = [value for value in product.get("images", []) if isinstance(value, str) and value]
        product_images = [value for value in current if not is_interior(value)]
        for index, relative in enumerate(product_images):
            clean_relative = relative.split("?", 1)[0]
            path = root / clean_relative
            if not path.is_file():
                continue
            try:
                full_score, sharpness, quality_ok = photo_metrics(path)
            except (UnidentifiedImageError, OSError, ValueError):
                continue
            candidate = Candidate(
                product_id=product_id,
                product_name=str(product.get("name") or ""),
                subject=subject,
                path=clean_relative,
                original_index=index,
                full_view_score=full_score,
                sharpness=sharpness,
                quality_ok=quality_ok,
            )
            all_candidates.append(candidate)
            candidates_by_product[product_id].append(candidate)
        if not candidates_by_product[product_id]:
            missing.append({"id": product_id, "name": product.get("name"), "reason": "Нет читаемых локальных товарных фотографий"})

    if not all_candidates:
        raise SystemExit("Не найдено ни одной локальной фотографии для классификации")

    score_candidates(all_candidates, args.model, args.pretrained, args.batch_size, args.device)

    changed = 0
    low_confidence = 0
    for product in products:
        product_id = int(product.get("id", 0))
        current = [value for value in product.get("images", []) if isinstance(value, str) and value]
        product_images = [value for value in current if not is_interior(value)]
        interiors = [value for value in current if is_interior(value)]
        candidates = [candidate for candidate in candidates_by_product.get(product_id, []) if candidate.probabilities]
        if not candidates:
            continue

        locked = next((item for item in candidates if item.original_index == 0 and Path(item.path).name.startswith("00-front")), None)
        candidates.sort(key=lambda item: (item.ranking_score, -item.original_index), reverse=True)
        best = locked or candidates[0]
        alternatives = [item for item in candidates if item is not best]
        second_score = max((item.ranking_score for item in alternatives), default=best.ranking_score)
        margin = best.ranking_score - second_score
        p3q, pfront, pside, prear, pdetail, pinterior = best.probabilities or [0.0] * 6
        front_probability = p3q + pfront
        uncertain = margin < 0.055 or front_probability < 0.40
        if uncertain:
            low_confidence += 1

        selected = best.path
        reordered = [selected] + [value for value in product_images if value.split("?", 1)[0] != selected] + interiors
        before_first = product_images[0] if product_images else None
        if reordered != current or str(product.get("directImage") or "").split("?", 1)[0] != selected:
            product["images"] = reordered
            product["directImage"] = selected
            changed += 1

        records.append({
            "id": product_id,
            "name": product.get("name"),
            "category": product.get("category"),
            "before_first": before_first,
            "after_first": selected,
            "changed": before_first != selected,
            "best_label": LABELS[max(range(len(best.probabilities or [])), key=lambda i: (best.probabilities or [0])[i])],
            "front_three_quarter_probability": round(p3q, 4),
            "front_probability": round(pfront, 4),
            "side_probability": round(pside, 4),
            "rear_probability": round(prear, 4),
            "detail_probability": round(pdetail, 4),
            "interior_probability": round(pinterior, 4),
            "ranking_score": round(best.ranking_score, 4),
            "margin": round(margin, 4),
            "low_confidence": uncertain,
            "gallery_count": len(reordered),
        })

    write_products(index_path, html, products, start, end)
    report_path = root / args.report
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report = {
        "version": 1,
        "rule": "whole_product_front_three_quarter_then_front",
        "model": args.model,
        "pretrained": args.pretrained,
        "total_products": len(products),
        "classified_products": len(records),
        "classified_images": len(all_candidates),
        "changed_galleries": changed,
        "low_confidence_products": low_confidence,
        "missing_products": missing,
        "records": records,
    }
    serialized = json.dumps(report, ensure_ascii=False, indent=2) + "\n"
    if not report_path.exists() or report_path.read_text(encoding="utf-8") != serialized:
        report_path.write_text(serialized, encoding="utf-8")

    print(f"Классифицировано товаров: {len(records)}/{len(products)}")
    print(f"Классифицировано изображений: {len(all_candidates)}")
    print(f"Изменён первый кадр или directImage: {changed}")
    print(f"Низкая уверенность: {low_confidence}")
    print(f"Без читаемых локальных фото: {len(missing)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
