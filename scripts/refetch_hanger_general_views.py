#!/usr/bin/env python3
"""Repeat supplier search for hanger photos and make a full-product view first.

The script is intentionally limited to the source list in
``data/hanger-photo-sources.json``. It downloads the supplier photo ZIP again,
selects a portrait image where the product spans almost the full frame, writes
up to two sharp WebP product photos, and updates ``catalog-source.html``.
Interior visualisations are not touched; ``catalog-loader.js`` appends them last.
"""

from __future__ import annotations

import io
import json
import re
import shutil
import tempfile
import zipfile
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import numpy as np
import requests
from PIL import Image, ImageOps, UnidentifiedImageError

ROOT = Path(__file__).resolve().parents[1]
CATALOG = ROOT / "catalog-source.html"
SOURCES = ROOT / "data/hanger-photo-sources.json"
REPORT = ROOT / "data/hanger-refetch-report.json"
ASSETS = ROOT / "assets/products"
USER_AGENT = "Mozilla/5.0 FORMA-HOME-General-View-Refetch/1.0"
VALID_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tif", ".tiff", ".avif"}


@dataclass
class Candidate:
    filename: str
    width: int
    height: int
    bbox: tuple[int, int, int, int]
    vertical_coverage: float
    horizontal_coverage: float
    object_aspect: float
    top_gap: float
    bottom_gap: float
    sharpness: float
    score: float
    confident_general_view: bool
    image: Image.Image


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def good_id(source: dict) -> str:
    return (parse_qs(urlparse(source["photoBank"]).query).get("good_id") or [""])[0]


def download_zip(session: requests.Session, product_code: str) -> bytes:
    url = f"https://price.tetchair.ru/download_photo/?id={product_code}"
    response = session.get(url, timeout=(20, 120), headers={"Referer": "https://tetchair.ru/"})
    response.raise_for_status()
    data = response.content
    if not zipfile.is_zipfile(io.BytesIO(data)):
        raise ValueError(f"Supplier response for {product_code} is not a ZIP")
    return data


def iter_images(zip_data: bytes):
    with zipfile.ZipFile(io.BytesIO(zip_data)) as archive:
        members = [m for m in archive.infolist() if not m.is_dir() and Path(m.filename).suffix.lower() in VALID_EXTENSIONS]
        members.sort(key=lambda m: m.filename.lower())
        for member in members[:100]:
            if member.file_size > 50 * 1024 * 1024:
                continue
            try:
                yield member.filename, archive.read(member)
            except (OSError, RuntimeError, zipfile.BadZipFile):
                continue


def analyse_image(filename: str, raw: bytes) -> Candidate | None:
    try:
        with Image.open(io.BytesIO(raw)) as source:
            source.load()
            image = ImageOps.exif_transpose(source).convert("RGBA")
    except (UnidentifiedImageError, OSError, ValueError):
        return None

    if image.width < 500 or image.height < 500:
        return None

    # Composite transparency over white, then estimate the real background from corners.
    white = Image.new("RGBA", image.size, (255, 255, 255, 255))
    rgb = Image.alpha_composite(white, image).convert("RGB")
    arr = np.asarray(rgb, dtype=np.int16)
    h, w = arr.shape[:2]
    patch = max(4, min(h, w) // 30)
    corners = np.concatenate(
        [
            arr[:patch, :patch].reshape(-1, 3),
            arr[:patch, -patch:].reshape(-1, 3),
            arr[-patch:, :patch].reshape(-1, 3),
            arr[-patch:, -patch:].reshape(-1, 3),
        ],
        axis=0,
    )
    background = np.median(corners, axis=0)
    distance = np.sqrt(np.sum((arr - background) ** 2, axis=2))
    mask = distance > 38

    # Ignore sparse compression noise in rows and columns.
    row_has_object = mask.sum(axis=1) >= max(3, int(w * 0.006))
    col_has_object = mask.sum(axis=0) >= max(3, int(h * 0.006))
    ys = np.flatnonzero(row_has_object)
    xs = np.flatnonzero(col_has_object)
    if len(xs) == 0 or len(ys) == 0:
        return None

    x0, x1 = int(xs[0]), int(xs[-1])
    y0, y1 = int(ys[0]), int(ys[-1])
    box_w = max(1, x1 - x0 + 1)
    box_h = max(1, y1 - y0 + 1)
    vertical = box_h / h
    horizontal = box_w / w
    aspect = box_h / box_w
    top_gap = y0 / h
    bottom_gap = (h - 1 - y1) / h

    gray = np.asarray(rgb.resize((min(w, 1000), min(h, 1000))).convert("L"), dtype=np.float32)
    if gray.shape[0] > 2 and gray.shape[1] > 2:
        lap = (-4 * gray[1:-1, 1:-1] + gray[:-2, 1:-1] + gray[2:, 1:-1] + gray[1:-1, :-2] + gray[1:-1, 2:])
        sharpness = float(np.var(lap))
    else:
        sharpness = 0.0

    confident = vertical >= 0.70 and aspect >= 1.35 and top_gap <= 0.20 and bottom_gap <= 0.20
    score = (
        vertical * 5.0
        + min(aspect, 4.0) * 0.65
        + (1.0 if top_gap <= 0.15 else 0.0)
        + (1.2 if bottom_gap <= 0.15 else 0.0)
        + min(sharpness / 5000.0, 1.0) * 0.35
        - (1.4 if horizontal >= 0.82 else 0.0)
        - (1.4 if aspect < 1.2 else 0.0)
    )

    return Candidate(
        filename=filename,
        width=w,
        height=h,
        bbox=(x0, y0, x1, y1),
        vertical_coverage=round(vertical, 4),
        horizontal_coverage=round(horizontal, 4),
        object_aspect=round(aspect, 4),
        top_gap=round(top_gap, 4),
        bottom_gap=round(bottom_gap, 4),
        sharpness=round(sharpness, 1),
        score=round(score, 4),
        confident_general_view=confident,
        image=rgb,
    )


def save_webp(image: Image.Image, destination: Path) -> dict:
    working = image.copy()
    working.thumbnail((1800, 1800), Image.Resampling.LANCZOS)
    destination.parent.mkdir(parents=True, exist_ok=True)
    temp = destination.with_suffix(".tmp.webp")
    working.save(temp, "WEBP", quality=90, method=6, exact=True)
    temp.replace(destination)
    return {"path": destination.relative_to(ROOT).as_posix(), "size": f"{working.width}x{working.height}", "bytes": destination.stat().st_size}


def image_signature(image: Image.Image) -> np.ndarray:
    return np.asarray(image.convert("L").resize((32, 32), Image.Resampling.LANCZOS), dtype=np.float32)


def choose_secondary(candidates: list[Candidate], primary: Candidate) -> Candidate | None:
    primary_signature = image_signature(primary.image)
    for candidate in candidates:
        if candidate is primary:
            continue
        difference = float(np.mean(np.abs(image_signature(candidate.image) - primary_signature)))
        if difference >= 7.0:
            return candidate
    return None


def load_products(html: str):
    marker = "    const PRODUCTS = "
    start = html.index(marker) + len(marker)
    end = html.index(";\n", start)
    return json.loads(html[start:end]), start, end


def main() -> int:
    sources = json.loads(SOURCES.read_text(encoding="utf-8"))
    html = CATALOG.read_text(encoding="utf-8")
    products, start, end = load_products(html)
    by_id = {int(product["id"]): product for product in products}

    session = requests.Session()
    session.headers.update({"User-Agent": USER_AGENT, "Accept": "*/*"})
    report = {"updated_at": utc_now(), "processed": [], "manual_review": []}

    for source in sources:
        product_id = int(source["id"])
        code = good_id(source)
        entry = {"id": product_id, "name": source["name"], "supplier_code": code}
        try:
            zip_data = download_zip(session, code)
            candidates = []
            for filename, raw in iter_images(zip_data):
                candidate = analyse_image(filename, raw)
                if candidate is not None:
                    candidates.append(candidate)
            candidates.sort(key=lambda item: item.score, reverse=True)
            confident = [candidate for candidate in candidates if candidate.confident_general_view]
            if not confident:
                entry["reason"] = "Повторный поиск выполнен, но уверенный общий вид не найден. Требуется ручной выбор."
                entry["candidates"] = [{key: value for key, value in asdict(item).items() if key != "image"} for item in candidates[:8]]
                report["manual_review"].append(entry)
                continue

            primary = confident[0]
            secondary = choose_secondary(candidates, primary)
            product_dir = ASSETS / str(product_id)
            product_dir.mkdir(parents=True, exist_ok=True)
            saved = [save_webp(primary.image, product_dir / "01.webp")]
            if secondary is not None:
                saved.append(save_webp(secondary.image, product_dir / "02.webp"))

            # Keep unreferenced legacy files as a safety backup; only the gallery array changes.
            paths = [item["path"] for item in saved]
            product = by_id[product_id]
            product["images"] = paths
            product["directImage"] = paths[0]
            entry.update(
                {
                    "status": "updated",
                    "primary_source": primary.filename,
                    "primary_metrics": {key: value for key, value in asdict(primary).items() if key != "image"},
                    "saved": saved,
                }
            )
            report["processed"].append(entry)
        except Exception as exc:
            entry["reason"] = f"Повторный поиск завершился ошибкой: {exc}"
            report["manual_review"].append(entry)

    product_json = json.dumps(products, ensure_ascii=False, separators=(",", ":"))
    updated_html = html[:start] + product_json + html[end:]
    temp_catalog = CATALOG.with_suffix(".tmp.html")
    temp_catalog.write_text(updated_html, encoding="utf-8")
    temp_catalog.replace(CATALOG)
    REPORT.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print(f"Updated: {len(report['processed'])}; manual review: {len(report['manual_review'])}")
    if report["manual_review"]:
        for item in report["manual_review"]:
            print(f"MANUAL {item['id']}: {item['reason']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
