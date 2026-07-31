#!/usr/bin/env python3
"""Publish only visually confirmed cover photos and enable swipeable zoom."""
from __future__ import annotations

import json
import re
import subprocess
from pathlib import Path

CATALOG = Path("catalog-source.html")
LOADER = Path("catalog-loader.js")
HIDDEN = Path("hidden-products.json")
SOURCE_REF = "origin/agent/front-three-quarter-and-image-zoom"

# Every ID below was checked on the generated contact sheets.
CONFIDENT_IDS = {
    1, 33, 70, 90, 136, 189, 240, 298, 307, 371, 443, 493, 497,
    518, 647, 656, 815, 843, 863, 885, 893, 894, 896, 899, 908,
    1143, 1182, 1477,
}

# The supplier-designated image was side/rear for these products; the already
# verified front image is safer than that candidate.
COVER_OVERRIDES = {
    136: "assets/products/136/00-front.webp",
    298: "assets/products/298/00-front.webp",
    493: "assets/products/493/00-front.webp",
    1182: "assets/products/1182/00-front.webp",
}


def git_show(spec: str, *, binary: bool = False):
    result = subprocess.run(
        ["git", "show", spec], check=True, capture_output=True,
        text=not binary, encoding=None if binary else "utf-8",
    )
    return result.stdout


def read_products(text: str):
    marker = "const PRODUCTS ="
    start = text.index(marker) + len(marker)
    while text[start].isspace():
        start += 1
    products, consumed = json.JSONDecoder().raw_decode(text[start:])
    return products, start, start + consumed


def write_products(text: str, products, start: int, end: int) -> str:
    payload = json.dumps(products, ensure_ascii=False, separators=(",", ":"))
    return text[:start] + payload + text[end:]


def clean(value: str | None) -> str:
    return str(value or "").split("?", 1)[0].split("#", 1)[0]


def ensure_file_from_source(relative: str) -> bool:
    path = Path(clean(relative))
    if path.is_file():
        return False
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(git_show(f"{SOURCE_REF}:{path.as_posix()}", binary=True))
    return True


def main() -> int:
    current_text = CATALOG.read_text(encoding="utf-8")
    current_products, start, end = read_products(current_text)
    source_text = git_show(f"{SOURCE_REF}:catalog-source.html")
    source_products, _, _ = read_products(source_text)

    hidden_data = json.loads(HIDDEN.read_text(encoding="utf-8"))
    hidden_ids = {int(value) for value in hidden_data.get("ids", [])}
    if len(hidden_ids) != 361:
        raise SystemExit(f"Ожидалось 361 архивный товар, получено {len(hidden_ids)}")
    if CONFIDENT_IDS & hidden_ids:
        raise SystemExit(f"В список публикации попали архивные ID: {sorted(CONFIDENT_IDS & hidden_ids)}")

    current_by_id = {int(product["id"]): product for product in current_products}
    source_by_id = {int(product["id"]): product for product in source_products}
    missing = sorted(CONFIDENT_IDS - current_by_id.keys())
    if missing:
        raise SystemExit(f"В каталоге отсутствуют ID: {missing}")

    before_archived = {pid: json.dumps(current_by_id[pid], ensure_ascii=False, sort_keys=True) for pid in hidden_ids}
    report_rows = []
    copied_files = 0

    for product_id in sorted(CONFIDENT_IDS):
        current = current_by_id[product_id]
        source = source_by_id.get(product_id)
        if source is None:
            raise SystemExit(f"Нет исходной проверенной карточки ID {product_id}")
        cover = COVER_OVERRIDES.get(product_id) or clean(source.get("images", [None])[0])
        if not cover or cover.startswith("assets/interiors/"):
            raise SystemExit(f"Недопустимое первое фото ID {product_id}: {cover}")
        copied_files += int(ensure_file_from_source(cover))

        images = [value for value in current.get("images", []) if isinstance(value, str) and value]
        interiors = [value for value in images if clean(value).startswith("assets/interiors/")]
        product_images = [value for value in images if not clean(value).startswith("assets/interiors/")]
        cover_clean = clean(cover)
        reordered = [cover] + [value for value in product_images if clean(value) != cover_clean] + interiors
        current["images"] = reordered
        current["directImage"] = cover
        report_rows.append({
            "product_id": product_id,
            "name": current.get("name", ""),
            "cover": cover,
            "gallery_size": len(reordered),
            "source": "manual_front_override" if product_id in COVER_OVERRIDES else "visually_confirmed_supplier_main",
        })

    after_archived = {pid: json.dumps(current_by_id[pid], ensure_ascii=False, sort_keys=True) for pid in hidden_ids}
    changed_archived = sorted(pid for pid in hidden_ids if before_archived[pid] != after_archived[pid])
    if changed_archived:
        raise SystemExit(f"Изменены архивные товары: {changed_archived[:20]}")

    updated_text = write_products(current_text, current_products, start, end)
    zoom_tag = '<script src="image-zoom.js?v=3"></script>'
    zoom_re = re.compile(r'<script src="image-zoom\.js\?v=\d+"></script>')
    if zoom_re.search(updated_text):
        updated_text = zoom_re.sub(zoom_tag, updated_text, count=1)
    else:
        updated_text = updated_text.replace("</body>", f"  {zoom_tag}\n</body>", 1)
    CATALOG.write_text(updated_text, encoding="utf-8")

    loader = LOADER.read_text(encoding="utf-8")
    loader, count = re.subn(
        r'const assetVersion="[^"]+";',
        'const assetVersion="20260801-confident-swipe-v1";',
        loader,
        count=1,
    )
    if count != 1:
        raise SystemExit("Не найдена версия ассетов в catalog-loader.js")
    LOADER.write_text(loader, encoding="utf-8")

    report = {
        "version": 1,
        "rule": "publish_visually_confirmed_only",
        "published_products": len(report_rows),
        "published_ids": [row["product_id"] for row in report_rows],
        "copied_new_cover_files": copied_files,
        "archived_products": len(hidden_ids),
        "archived_products_changed": 0,
        "zoom_gallery": {
            "click_to_open": True,
            "swipe_left_right": True,
            "arrow_buttons": True,
            "keyboard_arrows": True,
        },
        "products": report_rows,
    }
    Path("data/confident-photo-release.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(f"Подготовлено к публикации: {len(report_rows)} подтверждённых товаров")
    print(f"Новых файлов обложек: {copied_files}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
