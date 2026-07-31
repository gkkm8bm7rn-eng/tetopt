#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import io
import json
import re
import zipfile
from datetime import datetime, timezone
from pathlib import Path

import requests
from PIL import Image, ImageChops, ImageFilter, ImageOps, ImageStat

PRODUCT_ID = 107
SUPPLIER_CODE = 19729
MAX_SIDE = 1800
MAX_PHOTOS = 3
WEBP_QUALITY = 90
CATALOG = Path("catalog-source.html")
LOADER = Path("catalog-loader.js")
INDEX = Path("index.html")
PROGRESS = Path("photo-processing-progress.json")
REPORT = Path("data/batch-04-exact-manzana-107-report.json")
MARKER = "    const PRODUCTS = "
SKIP_WORDS = ("инструк", "схем", "размер", "габарит", "упаков", "маркиров", "этикет", "паспорт", "сертифик", "инфограф")


def safe_image(data: bytes) -> Image.Image | None:
    try:
        with Image.open(io.BytesIO(data)) as source:
            source.load()
            return ImageOps.exif_transpose(source).convert("RGB")
    except Exception:
        return None


def allowed(name: str) -> bool:
    low = name.lower().replace("ё", "е")
    return low.endswith((".jpg", ".jpeg", ".png", ".webp")) and not any(word in low for word in SKIP_WORDS)


def priority(name: str) -> tuple[int, str]:
    low = name.lower().replace("ё", "е")
    if "основ" in low or "main" in low:
        return (0, low)
    if "доп" in low or "extra" in low:
        return (1, low)
    return (2, low)


def sharpness(image: Image.Image) -> float:
    gray = image.convert("L")
    gray.thumbnail((900, 900), Image.Resampling.LANCZOS)
    residual = ImageChops.difference(gray, gray.filter(ImageFilter.GaussianBlur(radius=1.2)))
    return round(float(ImageStat.Stat(residual).var[0]), 2)


def dhash(image: Image.Image) -> int:
    gray = image.convert("L").resize((9, 8), Image.Resampling.LANCZOS)
    pixels = list(gray.getdata())
    value = 0
    for row in range(8):
        for col in range(8):
            value = (value << 1) | int(pixels[row * 9 + col] > pixels[row * 9 + col + 1])
    return value


def whole_score(image: Image.Image) -> float:
    preview = image.copy()
    preview.thumbnail((700, 700), Image.Resampling.LANCZOS)
    width, height = preview.size
    pixels = preview.load()
    points = []
    for y in range(height):
        for x in range(width):
            r, g, b = pixels[x, y]
            if min(r, g, b) < 238 or max(r, g, b) - min(r, g, b) > 12:
                points.append((x, y))
    if not points:
        return -100.0
    xs = [p[0] for p in points]
    ys = [p[1] for p in points]
    left, right, top, bottom = min(xs), max(xs), min(ys), max(ys)
    ratio = ((right - left + 1) * (bottom - top + 1)) / max(1, width * height)
    margin = min(left, width - 1 - right, top, height - 1 - bottom) / max(width, height)
    touches = sum(v <= 2 for v in (left, width - 1 - right, top, height - 1 - bottom))
    return round((1.0 - abs(ratio - 0.58)) * 100 + margin * 140 - touches * 30, 2)


def fetch_archive() -> bytes:
    url = f"https://price.tetchair.ru/download_photo/?id={SUPPLIER_CODE}"
    session = requests.Session()
    session.headers.update({"User-Agent": "Mozilla/5.0 FORMA-HOME-photo-import/4", "Accept-Language": "ru-RU,ru;q=0.9"})
    response = session.get(url, timeout=90, allow_redirects=True)
    response.raise_for_status()
    if not response.content.startswith(b"PK"):
        raise RuntimeError(f"Поставщик вернул не ZIP: {response.headers.get('content-type')}")
    return response.content


def select(archive_bytes: bytes) -> list[dict]:
    candidates = []
    with zipfile.ZipFile(io.BytesIO(archive_bytes)) as archive:
        for member in archive.infolist():
            if member.is_dir() or not allowed(member.filename) or member.file_size > 50 * 1024 * 1024:
                continue
            raw = archive.read(member)
            image = safe_image(raw)
            if image is None or min(image.size) < 700:
                continue
            candidates.append({
                "member": member.filename,
                "image": image,
                "priority": priority(member.filename),
                "wholeScore": whole_score(image),
                "sharpness": sharpness(image),
                "hash": dhash(image),
                "sourceWidth": image.width,
                "sourceHeight": image.height,
                "sourceBytes": len(raw),
            })
    if not candidates:
        raise RuntimeError("В архиве поставщика нет подходящих фотографий")

    mains = sorted((c for c in candidates if c["priority"][0] == 0), key=lambda c: (-c["wholeScore"], -c["sharpness"], c["priority"][1]))
    others = sorted((c for c in candidates if c["priority"][0] != 0), key=lambda c: (-c["wholeScore"], -c["sharpness"], c["priority"][0], c["priority"][1]))
    ordered = mains + others if mains else sorted(candidates, key=lambda c: (-c["wholeScore"], -c["sharpness"], c["priority"]))

    selected = []
    for candidate in ordered:
        if candidate["sharpness"] < 12:
            continue
        if selected and min((candidate["hash"] ^ item["hash"]).bit_count() for item in selected) < 8:
            continue
        selected.append(candidate)
        if len(selected) >= MAX_PHOTOS:
            break
    if not selected:
        raise RuntimeError("Все найденные фотографии недостаточно резкие")
    return selected


def update_catalog(paths: list[str]) -> dict:
    html = CATALOG.read_text(encoding="utf-8")
    start = html.index(MARKER) + len(MARKER)
    end = html.index(";\n", start)
    products = json.loads(html[start:end])
    product = next((item for item in products if int(item.get("id", 0)) == PRODUCT_ID), None)
    if product is None:
        raise RuntimeError("Товар ID 107 не найден")
    if "manzana" not in str(product.get("name", "")).lower():
        raise RuntimeError(f"ID 107 не является Manzana: {product.get('name')}")
    before = {"images": product.get("images"), "directImage": product.get("directImage"), "specs": product.get("specs")}
    product["images"] = paths
    product["directImage"] = paths[0]
    CATALOG.write_text(html[:start] + json.dumps(products, ensure_ascii=False, separators=(",", ":")) + html[end:], encoding="utf-8")
    return before


def bump_versions() -> str:
    now = datetime.now(timezone.utc)
    asset_version = now.strftime("%Y%m%d-%H%M-b04-manzana-exact")
    loader = LOADER.read_text(encoding="utf-8")
    loader, count = re.subn(r'const assetVersion="[^"]+";', f'const assetVersion="{asset_version}";', loader, count=1)
    if count != 1:
        raise RuntimeError("Не удалось обновить assetVersion")
    LOADER.write_text(loader, encoding="utf-8")
    index = INDEX.read_text(encoding="utf-8")
    match = re.search(r'catalog-loader\.js\?v=(\d+)', index)
    if not match:
        raise RuntimeError("Не найдена версия загрузчика")
    index = index[:match.start(1)] + str(int(match.group(1)) + 1) + index[match.end(1):]
    INDEX.write_text(index, encoding="utf-8")
    return asset_version


def main() -> int:
    archive_bytes = fetch_archive()
    selected = select(archive_bytes)
    target_dir = Path("assets/products") / str(PRODUCT_ID)
    target_dir.mkdir(parents=True, exist_ok=True)
    for old in target_dir.glob("*.webp"):
        old.unlink()

    paths = []
    selected_report = []
    for number, candidate in enumerate(selected, 1):
        image = candidate["image"].copy()
        image.thumbnail((MAX_SIDE, MAX_SIDE), Image.Resampling.LANCZOS)
        target = target_dir / f"{number:02d}.webp"
        image.save(target, format="WEBP", quality=WEBP_QUALITY, method=6)
        raw = target.read_bytes()
        paths.append(target.as_posix())
        selected_report.append({
            "slot": number,
            "path": target.as_posix(),
            "sourceMember": candidate["member"],
            "sourceSize": [candidate["sourceWidth"], candidate["sourceHeight"]],
            "sourceBytes": candidate["sourceBytes"],
            "wholeObjectScore": candidate["wholeScore"],
            "sharpness": candidate["sharpness"],
            "publishedSize": [image.width, image.height],
            "publishedBytes": len(raw),
            "sha256": hashlib.sha256(raw).hexdigest(),
        })

    before = update_catalog(paths)
    asset_version = bump_versions()
    now = datetime.now(timezone.utc).isoformat()
    progress = json.loads(PROGRESS.read_text(encoding="utf-8"))
    progress["version"] = int(progress.get("version", 0)) + 1
    progress["updatedAt"] = now
    progress["unresolvedIds"] = sorted(set(map(int, progress.get("unresolvedIds", []))) - {PRODUCT_ID})
    progress["lastBatchStatus"] = "batch_04_exact_manzana_applied_pending_curation"
    PROGRESS.write_text(json.dumps(progress, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    report = {
        "batch": 4,
        "id": PRODUCT_ID,
        "supplierCode": SUPPLIER_CODE,
        "officialVariant": "ЛДСП/HPL/металл, 100-130х100х75см, мрамор светлый/белый",
        "archiveBytes": len(archive_bytes),
        "before": before,
        "selected": selected_report,
        "assetVersion": asset_version,
        "status": "exact_supplier_photos_applied_pending_curation",
        "updatedAt": now,
    }
    REPORT.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"id": PRODUCT_ID, "supplierCode": SUPPLIER_CODE, "photos": len(paths), "assetVersion": asset_version}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
