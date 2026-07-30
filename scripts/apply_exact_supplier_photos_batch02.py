#!/usr/bin/env python3
from __future__ import annotations

import io
import json
import re
import shutil
import zipfile
from datetime import datetime, timezone
from pathlib import Path

import requests
from PIL import Image, ImageOps, ImageStat


ITEMS = {
    28: 26186,
    41: 13067,
    51: 15186,
    52: 15187,
    57: 20501,
    65: 10468,
}

MAX_SIDE = 1800
WEBP_QUALITY = 90
MAX_PHOTOS = 3
SKIP_WORDS = (
    "инструк", "схем", "размер", "габарит", "упаков", "маркиров",
    "этикет", "паспорт", "сертифик", "инфограф", "interior", "интерьер",
)


def safe_image(data: bytes) -> Image.Image | None:
    try:
        with Image.open(io.BytesIO(data)) as source:
            source.load()
            return ImageOps.exif_transpose(source).convert("RGB")
    except Exception:
        return None


def normalize_name(value: str) -> str:
    return value.lower().replace("ё", "е")


def is_allowed_member(name: str) -> bool:
    low = normalize_name(name)
    if any(word in low for word in SKIP_WORDS):
        return False
    return low.endswith((".jpg", ".jpeg", ".png", ".webp"))


def member_priority(name: str) -> tuple[int, str]:
    low = normalize_name(name)
    if "основ" in low or "main" in low:
        return (0, low)
    if "доп" in low or "extra" in low:
        return (1, low)
    return (2, low)


def resize_for_site(image: Image.Image) -> Image.Image:
    result = image.copy()
    result.thumbnail((MAX_SIDE, MAX_SIDE), Image.Resampling.LANCZOS)
    return result


def sharpness_score(image: Image.Image) -> float:
    # Простая безвредная оценка резкости по дисперсии высокочастотного остатка.
    gray = image.convert("L").resize((min(image.width, 900), min(image.height, 900)))
    blurred = gray.filter(__import__("PIL.ImageFilter", fromlist=["ImageFilter"]).GaussianBlur(radius=1.2))
    diff = ImageStat.Stat(ImageOps.autocontrast(ImageChops.difference(gray, blurred)))
    return round(float(diff.var[0]), 2)


def dhash(image: Image.Image) -> int:
    gray = image.convert("L").resize((9, 8), Image.Resampling.LANCZOS)
    pixels = list(gray.getdata())
    value = 0
    for row in range(8):
        for col in range(8):
            value = (value << 1) | int(pixels[row * 9 + col] > pixels[row * 9 + col + 1])
    return value


def hamming(a: int, b: int) -> int:
    return (a ^ b).bit_count()


def whole_object_score(image: Image.Image) -> float:
    # Светлый фон типичен для исходников поставщика. Оцениваем поля вокруг объекта,
    # чтобы не ставить крупный фрагмент первым.
    preview = image.copy()
    preview.thumbnail((700, 700), Image.Resampling.LANCZOS)
    rgb = preview.convert("RGB")
    width, height = rgb.size
    px = rgb.load()
    points = []
    for y in range(height):
        for x in range(width):
            r, g, b = px[x, y]
            if min(r, g, b) < 238 or max(r, g, b) - min(r, g, b) > 12:
                points.append((x, y))
    if not points:
        return -100.0
    xs = [p[0] for p in points]
    ys = [p[1] for p in points]
    left, right, top, bottom = min(xs), max(xs), min(ys), max(ys)
    bbox_w = max(1, right - left + 1)
    bbox_h = max(1, bottom - top + 1)
    bbox_ratio = (bbox_w * bbox_h) / max(1, width * height)
    min_margin = min(left, width - 1 - right, top, height - 1 - bottom) / max(width, height)
    touches = sum(v <= 2 for v in (left, width - 1 - right, top, height - 1 - bottom))
    # Общий вид обычно занимает большую часть кадра, но оставляет поля и не касается краев.
    return round((1.0 - abs(bbox_ratio - 0.58)) * 100 + min_margin * 140 - touches * 30, 2)


def fetch_zip(session: requests.Session, supplier_code: int) -> bytes:
    url = f"https://price.tetchair.ru/download_photo/?id={supplier_code}"
    response = session.get(url, timeout=60, allow_redirects=True)
    response.raise_for_status()
    if not response.content.startswith(b"PK"):
        raise RuntimeError(f"Поставщик вернул не ZIP для кода {supplier_code}: {response.headers.get('content-type')}")
    return response.content


def select_members(archive: zipfile.ZipFile) -> list[dict]:
    candidates = []
    for member in archive.infolist():
        if member.is_dir() or not is_allowed_member(member.filename):
            continue
        data = archive.read(member)
        image = safe_image(data)
        if image is None or min(image.size) < 700:
            continue
        candidates.append({
            "member": member.filename,
            "image": image,
            "priority": member_priority(member.filename),
            "wholeScore": whole_object_score(image),
            "hash": dhash(image),
        })
    if not candidates:
        return []

    mains = sorted((c for c in candidates if c["priority"][0] == 0), key=lambda c: (-c["wholeScore"], c["priority"][1]))
    others = sorted((c for c in candidates if c["priority"][0] != 0), key=lambda c: (-c["wholeScore"], c["priority"][0], c["priority"][1]))
    ordered = mains + others if mains else sorted(candidates, key=lambda c: (-c["wholeScore"], c["priority"]))

    selected = []
    for candidate in ordered:
        if selected and min(hamming(candidate["hash"], item["hash"]) for item in selected) < 8:
            continue
        selected.append(candidate)
        if len(selected) >= MAX_PHOTOS:
            break
    if not selected:
        selected.append(ordered[0])
    return selected


def update_catalog(product_photos: dict[int, list[str]]) -> None:
    path = Path("catalog-source.html")
    html = path.read_text(encoding="utf-8")
    marker = "    const PRODUCTS = "
    start = html.index(marker) + len(marker)
    end = html.index(";\n", start)
    products = json.loads(html[start:end])
    seen = set()
    for product in products:
        product_id = int(product.get("id", 0))
        if product_id not in product_photos:
            continue
        images = product_photos[product_id]
        product["images"] = images
        product["directImage"] = images[0] if images else None
        seen.add(product_id)
    missing = set(product_photos) - seen
    if missing:
        raise RuntimeError(f"Не найдены товары в каталоге: {sorted(missing)}")
    path.write_text(html[:start] + json.dumps(products, ensure_ascii=False, separators=(",", ":")) + html[end:], encoding="utf-8")


def bump_loader() -> str:
    path = Path("catalog-loader.js")
    text = path.read_text(encoding="utf-8")
    version = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M-b02-exact")
    text, count = re.subn(r'const assetVersion="[^"]+";', f'const assetVersion="{version}";', text, count=1)
    if count != 1:
        raise RuntimeError("Не удалось обновить assetVersion")
    path.write_text(text, encoding="utf-8")

    index = Path("index.html")
    index_text = index.read_text(encoding="utf-8")
    index_text, count = re.subn(r'catalog-loader\.js\?v=\d+', 'catalog-loader.js?v=10', index_text, count=1)
    if count != 1:
        raise RuntimeError("Не удалось обновить версию загрузчика в index.html")
    index.write_text(index_text, encoding="utf-8")
    return version


def main() -> int:
    session = requests.Session()
    session.headers.update({
        "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/126 Safari/537.36",
        "Accept-Language": "ru-RU,ru;q=0.9,en;q=0.7",
    })
    report = {"batch": 2, "processed": [], "errors": []}
    catalog_images: dict[int, list[str]] = {}

    for product_id, supplier_code in ITEMS.items():
        try:
            payload = fetch_zip(session, supplier_code)
            with zipfile.ZipFile(io.BytesIO(payload)) as archive:
                selected = select_members(archive)
            if not selected:
                raise RuntimeError("В архиве нет подходящих изображений")

            product_dir = Path("assets/products") / str(product_id)
            product_dir.mkdir(parents=True, exist_ok=True)
            for old in product_dir.glob("*.webp"):
                old.unlink()

            selected_report = []
            urls = []
            for index, candidate in enumerate(selected, 1):
                image = resize_for_site(candidate["image"])
                target = product_dir / f"{index:02d}.webp"
                image.save(target, format="WEBP", quality=WEBP_QUALITY, method=6)
                urls.append(target.as_posix())
                selected_report.append({
                    "slot": index,
                    "sourceMember": candidate["member"],
                    "width": image.width,
                    "height": image.height,
                    "bytes": target.stat().st_size,
                    "wholeObjectScore": candidate["wholeScore"],
                })

            catalog_images[product_id] = urls
            report["processed"].append({
                "id": product_id,
                "supplierCode": supplier_code,
                "zipBytes": len(payload),
                "selected": selected_report,
            })
        except Exception as exc:
            report["errors"].append({"id": product_id, "supplierCode": supplier_code, "error": str(exc)})

    if report["errors"]:
        Path("data/batch-02-exact-apply-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
        raise RuntimeError(f"Не обработаны товары: {[item['id'] for item in report['errors']]}")

    update_catalog(catalog_images)
    report["assetVersion"] = bump_loader()
    report["completedCount"] = len(report["processed"])
    report["status"] = "assets_applied_pending_live_review"
    Path("data/batch-02-exact-apply-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"processed": len(report["processed"]), "ids": sorted(catalog_images)}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    from PIL import ImageChops
    raise SystemExit(main())
