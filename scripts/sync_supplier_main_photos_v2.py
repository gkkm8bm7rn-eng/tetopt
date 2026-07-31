#!/usr/bin/env python3
"""Set supplier-designated main photos as storefront cover images.

The source catalog intentionally no longer contains supplier URLs, therefore
`data/supplier-good-ids.json` is used to map stable catalog IDs to TetChair
`good_id` values. The mapping is an active-only allowlist prepared from
`hidden-products.json`; products absent from it are never downloaded or changed.
Existing gallery images are preserved; an official main image is reused when it
already exists locally, or saved as an optimized `00-main.webp` otherwise.
"""
from __future__ import annotations

import argparse
import concurrent.futures
import hashlib
import io
import json
import random
import re
import threading
import time
import zipfile
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

import requests
from PIL import Image, ImageOps, UnidentifiedImageError
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

Image.MAX_IMAGE_PIXELS = 100_000_000
_PRINT_LOCK = threading.Lock()


def log(message: str) -> None:
    with _PRINT_LOCK:
        print(message, flush=True)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--index", default="catalog-source.html")
    parser.add_argument("--mapping", default="data/supplier-good-ids.json")
    parser.add_argument("--assets-dir", default="assets/products")
    parser.add_argument("--report", default="data/supplier-main-photo-report.json")
    parser.add_argument("--workers", type=int, default=4)
    parser.add_argument("--max-side", type=int, default=1600)
    parser.add_argument("--max-kb", type=int, default=320)
    return parser.parse_args()


def make_session() -> requests.Session:
    session = requests.Session()
    retry = Retry(
        total=5,
        connect=5,
        read=5,
        status=5,
        backoff_factor=1.2,
        status_forcelist=(408, 425, 429, 500, 502, 503, 504),
        allowed_methods=frozenset({"GET"}),
        respect_retry_after_header=True,
    )
    adapter = HTTPAdapter(max_retries=retry, pool_connections=2, pool_maxsize=2)
    session.mount("https://", adapter)
    session.headers.update({"User-Agent": "Mozilla/5.0 FORMA-HOME-main-photo-sync/2.0"})
    return session


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
        raise ValueError("PRODUCTS должен быть JSON-массивом")
    return html, products, start, start + consumed


def write_products(path: Path, html: str, products: list[dict[str, Any]], start: int, end: int) -> None:
    payload = json.dumps(products, ensure_ascii=False, separators=(",", ":"))
    updated = html[:start] + payload + html[end:]
    temp = path.with_suffix(path.suffix + ".tmp")
    temp.write_text(updated, encoding="utf-8")
    temp.replace(path)


def main_name_score(name: str) -> int:
    low = Path(name).name.casefold()
    score = 0
    if "основ" in low:
        score += 120
    if "главн" in low:
        score += 105
    if "main" in low:
        score += 100
    if "primary" in low:
        score += 95
    if "hero" in low:
        score += 80
    if "доп" in low or "detail" in low or "интерьер" in low:
        score -= 90
    return score


def image_dhash(image: Image.Image) -> int:
    gray = image.convert("L").resize((9, 8), Image.Resampling.LANCZOS)
    pixels = list(gray.getdata())
    value = 0
    for row in range(8):
        for col in range(8):
            left = pixels[row * 9 + col]
            right = pixels[row * 9 + col + 1]
            value = (value << 1) | int(left > right)
    return value


def hamming(left: int, right: int) -> int:
    return (left ^ right).bit_count()


def open_source_image(data: bytes) -> tuple[Image.Image, int, int, int]:
    with Image.open(io.BytesIO(data)) as source:
        source.load()
        image = ImageOps.exif_transpose(source).convert("RGB")
    width, height = image.size
    if width < 350 or height < 350:
        raise ValueError(f"слишком маленькое основное фото: {width}×{height}")
    return image, width, height, image_dhash(image)


def encode_webp(image: Image.Image, max_side: int, max_kb: int) -> bytes:
    working = image.copy()
    working.thumbnail((max_side, max_side), Image.Resampling.LANCZOS)
    target = max_kb * 1024
    best: bytes | None = None
    for _ in range(5):
        for quality in (86, 82, 78, 74, 70, 66, 62, 58):
            output = io.BytesIO()
            working.save(output, format="WEBP", quality=quality, method=6, exact=True)
            encoded = output.getvalue()
            if best is None or len(encoded) < len(best):
                best = encoded
            if len(encoded) <= target:
                return encoded
        if max(working.size) <= 850:
            break
        working = working.resize(
            (max(1, int(working.width * 0.86)), max(1, int(working.height * 0.86))),
            Image.Resampling.LANCZOS,
        )
    assert best is not None
    return best


def local_hash(path: Path) -> int | None:
    try:
        with Image.open(path) as source:
            source.load()
            image = ImageOps.exif_transpose(source).convert("RGB")
        return image_dhash(image)
    except (UnidentifiedImageError, OSError, ValueError):
        return None


@dataclass
class SyncResult:
    product_id: int
    name: str
    good_id: str
    status: str
    selected_path: str | None = None
    archive_name: str | None = None
    source_width: int | None = None
    source_height: int | None = None
    matched_existing: bool = False
    closest_distance: int | None = None
    added_file: bool = False
    error: str | None = None


def process_product(
    product: dict[str, Any],
    good_id: str,
    root: Path,
    assets_dir: Path,
    max_side: int,
    max_kb: int,
) -> SyncResult:
    product_id = int(product["id"])
    name = str(product.get("name") or "")
    session = make_session()
    try:
        response = session.get(
            f"https://price.tetchair.ru/download_photo/?id={good_id}",
            timeout=(20, 120),
        )
        response.raise_for_status()
        if not zipfile.is_zipfile(io.BytesIO(response.content)):
            raise ValueError("ответ поставщика не является ZIP-архивом")

        candidates: list[tuple[int, int, str, int, int, int, Image.Image]] = []
        with zipfile.ZipFile(io.BytesIO(response.content)) as archive:
            for info in archive.infolist():
                if info.is_dir() or not info.filename.lower().endswith((".jpg", ".jpeg", ".png", ".webp")):
                    continue
                score = main_name_score(info.filename)
                if score <= 0:
                    continue
                try:
                    image, width, height, fingerprint = open_source_image(archive.read(info))
                except Exception:
                    continue
                candidates.append((score, width * height, info.filename, width, height, fingerprint, image))

        if not candidates:
            return SyncResult(product_id, name, good_id, "no_designated_main", error="в архиве нет файла «Основное фото»")

        candidates.sort(key=lambda row: (row[0], row[1]), reverse=True)
        _, _, archive_name, width, height, fingerprint, main_image = candidates[0]

        images = [value for value in product.get("images", []) if isinstance(value, str) and value]
        local_product_images = [value for value in images if not value.startswith("assets/interiors/")]
        distances: list[tuple[int, str]] = []
        for relative in local_product_images:
            clean = relative.split("?", 1)[0]
            path = root / clean
            if not path.is_file():
                continue
            fingerprint_local = local_hash(path)
            if fingerprint_local is not None:
                distances.append((hamming(fingerprint, fingerprint_local), relative))

        distances.sort(key=lambda row: row[0])
        closest_distance = distances[0][0] if distances else None
        if distances and distances[0][0] <= 9:
            selected = distances[0][1]
            return SyncResult(
                product_id, name, good_id, "matched_existing", selected,
                Path(archive_name).name, width, height, True, closest_distance, False,
            )

        encoded = encode_webp(main_image, max_side=max_side, max_kb=max_kb)
        relative = (assets_dir / str(product_id) / "00-main.webp").as_posix()
        output = root / relative
        output.parent.mkdir(parents=True, exist_ok=True)
        digest = hashlib.sha256(encoded).digest()
        if not output.exists() or hashlib.sha256(output.read_bytes()).digest() != digest:
            temp = output.with_suffix(output.suffix + ".tmp")
            temp.write_bytes(encoded)
            temp.replace(output)
        return SyncResult(
            product_id, name, good_id, "added_main", relative,
            Path(archive_name).name, width, height, False, closest_distance, True,
        )
    except Exception as exc:
        time.sleep(random.uniform(0.08, 0.30))
        return SyncResult(product_id, name, good_id, "error", error=f"{type(exc).__name__}: {exc}")


def update_asset_version(path: Path) -> None:
    text = path.read_text(encoding="utf-8")
    updated, count = re.subn(
        r'const assetVersion="[^"]+";',
        'const assetVersion="20260731-supplier-main-v3";',
        text,
        count=1,
    )
    if count != 1:
        raise ValueError("В catalog-loader.js не найдена версия ассетов")
    if updated != text:
        path.write_text(updated, encoding="utf-8")


def main() -> int:
    args = parse_args()
    if not 1 <= args.workers <= 10:
        raise ValueError("workers должен быть от 1 до 10")

    index_path = Path(args.index).resolve()
    root = index_path.parent
    mapping_path = root / args.mapping
    mapping = json.loads(mapping_path.read_text(encoding="utf-8"))
    if not isinstance(mapping, dict):
        raise ValueError("supplier-good-ids.json должен быть объектом ID → good_id")
    if len(mapping) != 1362:
        raise ValueError(f"Активная таблица должна содержать 1362 ID, получено {len(mapping)}")

    html, products, start, end = read_products(index_path)
    catalog_ids = {str(product["id"]) for product in products}
    unknown_mapping = sorted(set(mapping) - catalog_ids, key=int)
    if unknown_mapping:
        raise ValueError(f"В активной таблице есть неизвестные ID: {unknown_mapping[:20]}")
    visible = [product for product in products if str(product["id"]) in mapping]
    if len(visible) != 1362:
        raise ValueError(f"В каталоге найдено {len(visible)} активных товаров вместо 1362")

    assets_dir = Path(args.assets_dir)
    results: list[SyncResult] = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as executor:
        future_map = {
            executor.submit(
                process_product,
                product,
                str(mapping[str(product["id"])]),
                root,
                assets_dir,
                args.max_side,
                args.max_kb,
            ): product
            for product in visible
        }
        for completed, future in enumerate(concurrent.futures.as_completed(future_map), 1):
            result = future.result()
            results.append(result)
            marker = "✓" if result.selected_path else "✗"
            log(f"{marker} {completed}/{len(visible)} ID {result.product_id}: {result.status}")

    by_id = {result.product_id: result for result in results}
    changed = matched = added = unresolved = 0
    for product in products:
        result = by_id.get(int(product["id"]))
        if result is None:
            continue
        if not result.selected_path:
            unresolved += 1
            continue
        images = [value for value in product.get("images", []) if isinstance(value, str) and value]
        interiors = [value for value in images if value.startswith("assets/interiors/")]
        product_images = [value for value in images if not value.startswith("assets/interiors/")]
        selected_clean = result.selected_path.split("?", 1)[0]
        reordered = [result.selected_path] + [
            value for value in product_images if value.split("?", 1)[0] != selected_clean
        ] + interiors
        direct_clean = str(product.get("directImage") or "").split("?", 1)[0]
        if reordered != images or direct_clean != selected_clean:
            product["images"] = reordered
            product["directImage"] = result.selected_path
            changed += 1
        matched += int(result.matched_existing)
        added += int(result.added_file)

    write_products(index_path, html, products, start, end)
    update_asset_version(root / "catalog-loader.js")

    results.sort(key=lambda item: item.product_id)
    report = {
        "version": 3,
        "rule": "supplier_designated_main_photo_first_active_only",
        "total_products": len(products),
        "visible_products": len(visible),
        "processed_products": len(results),
        "resolved_products": sum(1 for result in results if result.selected_path),
        "changed_galleries": changed,
        "matched_existing": matched,
        "added_new_main_files": added,
        "unresolved_products": unresolved,
        "results": [asdict(result) for result in results],
    }
    report_path = root / args.report
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    log("\nИтог:")
    for key in (
        "visible_products", "resolved_products", "matched_existing",
        "added_new_main_files", "changed_galleries", "unresolved_products",
    ):
        log(f"  {key}: {report[key]}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
