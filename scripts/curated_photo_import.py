#!/usr/bin/env python3
"""Run the supplier photo importer with FORMA HOME publication rules.

Rules enforced before a product gets local photos:
- the first image must be a likely full-product view;
- close-up/detail and supplier interior shots cannot become the main image;
- hangers receive at most two product photos (the interior visualization is added separately);
- low-resolution or uncertain results are sent to manual review instead of being published;
- WebP encoding prioritizes sharpness for full-screen and mobile viewing.
"""
from __future__ import annotations

import hashlib
import importlib.util
import io
import shutil
import sys
import tempfile
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import unquote

from PIL import Image, ImageFilter, ImageOps, ImageStat, UnidentifiedImageError

SCRIPT_DIR = Path(__file__).resolve().parent
BASE_PATH = SCRIPT_DIR / "import_photos.py"
spec = importlib.util.spec_from_file_location("forma_base_importer", BASE_PATH)
if spec is None or spec.loader is None:
    raise RuntimeError(f"Не удалось загрузить {BASE_PATH}")
base = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = base
spec.loader.exec_module(base)

GENERAL_WORDS = (
    "01", "main", "primary", "front", "full", "overall", "general", "product", "hero",
    "главн", "общий", "целиком", "полный", "фасад", "спереди",
)
DETAIL_WORDS = (
    "detail", "close", "macro", "zoom", "texture", "fragment", "crop",
    "детал", "фактур", "крупн", "крюч", "основан", "ножк", "соедин", "шов",
    "механизм", "сиденье", "спинка",
)
INTERIOR_WORDS = ("interior", "lifestyle", "room", "scene", "интерьер", "комнат", "обстанов")


@dataclass
class PreparedPhoto:
    source: str
    data: bytes
    width: int
    height: int
    fingerprint: int
    score: float
    sharpness: float


def _contains_any(text: str, words: tuple[str, ...]) -> bool:
    return any(word in text for word in words)


def source_score(source: str) -> tuple[float, bool]:
    label = unquote(source).lower()
    score = 0.0
    if _contains_any(label, GENERAL_WORDS):
        score += 55
    if _contains_any(label, DETAIL_WORDS):
        score -= 70
    interior = _contains_any(label, INTERIOR_WORDS)
    if interior:
        score -= 90
    return score, interior


def visual_metrics(image: Image.Image) -> tuple[float, float, bool]:
    """Estimate whether the product is fully visible with margins and whether the image is sharp."""
    sample = image.convert("RGB")
    sample.thumbnail((160, 160), Image.Resampling.LANCZOS)
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

    if not xs:
        bbox_ratio = 0.0
        min_margin = 0.0
        touched_edges = 4
    else:
        left, right = min(xs), max(xs)
        top, bottom = min(ys), max(ys)
        bbox_ratio = ((right - left + 1) * (bottom - top + 1)) / max(1, width * height)
        margins = (
            left / width, (width - 1 - right) / width,
            top / height, (height - 1 - bottom) / height,
        )
        min_margin = min(margins)
        touched_edges = sum(margin < 0.018 for margin in margins)

    score = 0.0
    if 0.08 <= foreground_ratio <= 0.72:
        score += 25
    elif foreground_ratio > 0.88:
        score -= 25
    if 0.10 <= bbox_ratio <= 0.78:
        score += 32
    elif bbox_ratio > 0.90:
        score -= 28
    score += min(22.0, min_margin * 220)
    score -= touched_edges * 9
    if height >= width:
        score += 4

    edges = sample.convert("L").filter(ImageFilter.FIND_EDGES)
    sharpness = float(ImageStat.Stat(edges).var[0])
    room_scene = foreground_ratio > 0.86 and bbox_ratio > 0.93
    return score, sharpness, room_scene


def encode_photo(raw: bytes, max_side: int, max_kb: int) -> tuple[bytes, int, int, int, float, float, bool]:
    with Image.open(io.BytesIO(raw)) as source:
        source.load()
        image = ImageOps.exif_transpose(source)
        if getattr(image, "n_frames", 1) > 1:
            image.seek(0)
        if image.width < 420 or image.height < 420:
            raise ValueError(f"слишком маленькое изображение: {image.width}×{image.height}")
        if image.mode not in ("RGB", "RGBA"):
            image = image.convert("RGBA" if "transparency" in image.info else "RGB")

        view_score, sharpness, room_scene = visual_metrics(image)
        image.thumbnail((max_side, max_side), Image.Resampling.LANCZOS)
        fingerprint = base.image_dhash(image)
        target = max_kb * 1024
        working = image
        best: bytes | None = None

        for _ in range(4):
            for quality in (88, 84, 80, 76, 72):
                output = io.BytesIO()
                working.save(output, format="WEBP", quality=quality, method=6, exact=True)
                encoded = output.getvalue()
                if best is None or len(encoded) < len(best):
                    best = encoded
                if len(encoded) <= target:
                    return encoded, working.width, working.height, fingerprint, view_score, sharpness, room_scene
            if max(working.size) <= 1000:
                break
            working = working.resize(
                (max(1, int(working.width * 0.90)), max(1, int(working.height * 0.90))),
                Image.Resampling.LANCZOS,
            )

        assert best is not None
        return best, working.width, working.height, fingerprint, view_score, sharpness, room_scene


def photo_limit(product: dict, requested: int) -> int:
    text = f"{product.get('collection', '')} {product.get('name', '')}".lower()
    return min(requested, 2) if "вешал" in text else requested


def curated_process_product(product, repository_root, assets_dir, max_photos, max_side, max_kb):
    product_id = int(product["id"])
    session = base.make_session()
    page_urls = [str(product.get("photoBank") or ""), str(product.get("productUrl") or "")]
    page_urls = [url for url in page_urls if url]
    candidates = {}
    errors: list[str] = []

    # First search plus mandatory repeated search: photobank and product page are both exhausted.
    for page_url in page_urls:
        try:
            page_text, final_url = base.fetch_html(session, page_url)
            for candidate in base.discover_candidates(page_text, final_url, product):
                key = (candidate.kind, candidate.url)
                current = candidates.get(key)
                if current is None or candidate.score > current.score:
                    candidates[key] = candidate
        except Exception as exc:
            errors.append(f"{page_url}: {exc}")

    ordered = sorted(candidates.values(), key=lambda candidate: candidate.score, reverse=True)
    if not ordered:
        message = "После повторного поиска не найдены ссылки на фотографии"
        if errors:
            message += "; " + " | ".join(errors[:2])
        return base.ProductResult(product_id, [], 0, message + ". Требуется ручной выбор.")

    final_dir = repository_root / assets_dir / str(product_id)
    final_dir.parent.mkdir(parents=True, exist_ok=True)
    temp_dir = Path(tempfile.mkdtemp(prefix=f".{product_id}-", dir=final_dir.parent))
    prepared: list[PreparedPhoto] = []
    fingerprints: list[int] = []
    hashes: set[str] = set()

    try:
        for index, (source, raw) in enumerate(base.download_candidate_images(session, ordered, max_candidates=70)):
            if index >= 48:
                break
            try:
                encoded, width, height, fingerprint, view_score, sharpness, room_scene = encode_photo(
                    raw, max_side, max_kb
                )
            except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError):
                continue
            digest = hashlib.sha256(encoded).hexdigest()
            if digest in hashes or any(base.hamming_distance(fingerprint, previous) <= 3 for previous in fingerprints):
                continue
            label_score, supplier_interior = source_score(source)
            if supplier_interior or room_scene:
                continue
            score = view_score + label_score + min(18.0, sharpness / 65.0)
            if min(width, height) < 700:
                score -= 35
            prepared.append(PreparedPhoto(source, encoded, width, height, fingerprint, score, sharpness))
            hashes.add(digest)
            fingerprints.append(fingerprint)

        if not prepared:
            return base.ProductResult(
                product_id, [], len(ordered),
                "После повторного поиска не найдено пригодных товарных фото. Требуется ручной выбор.",
            )

        prepared.sort(key=lambda photo: (photo.score, photo.sharpness, photo.width * photo.height), reverse=True)
        primary = prepared[0]
        if primary.score < 18 or min(primary.width, primary.height) < 700:
            return base.ProductResult(
                product_id, [], len(ordered),
                f"Нет уверенного общего вида после повторного поиска "
                f"(оценка {primary.score:.1f}, {primary.width}×{primary.height}). Требуется ручной выбор.",
            )

        selected = prepared[:photo_limit(product, max_photos)]
        paths: list[str] = []
        for number, photo in enumerate(selected, start=1):
            filename = f"{number:02d}.webp"
            (temp_dir / filename).write_bytes(photo.data)
            paths.append((assets_dir / str(product_id) / filename).as_posix())
            base.log(
                f"    ✓ {filename}: {photo.width}×{photo.height}, {len(photo.data) // 1024} КБ, "
                f"оценка общего вида {photo.score:.1f}"
            )

        if final_dir.exists():
            shutil.rmtree(final_dir)
        temp_dir.replace(final_dir)
        return base.ProductResult(product_id, paths, len(ordered))
    finally:
        if temp_dir.exists():
            shutil.rmtree(temp_dir, ignore_errors=True)


base.process_product = curated_process_product

if __name__ == "__main__":
    raise SystemExit(base.main())
