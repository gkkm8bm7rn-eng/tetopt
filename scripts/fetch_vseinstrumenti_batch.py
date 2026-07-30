#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import io
import json
import re
from pathlib import Path
from urllib.parse import unquote

import requests
from PIL import Image, ImageOps

from audit_product_photos import image_metrics

IMAGE_RE = re.compile(
    r"https?:\\?/\\?/cdn\\?\.vseinstrumenti\\?\.ru\\?/images\\?/goods\\?/[^\"'<>\\s]+?\\?/(?:\d+x\d+)\\?/\d+\\?\.(?:jpe?g|png|webp)",
    re.IGNORECASE,
)
SIZE_RE = re.compile(r"/(\d{2,4}x\d{2,4})/([^/?#]+\.(?:jpe?g|png|webp))(?:[?#].*)?$", re.IGNORECASE)
TRY_SIZES = [
    "2400x2400",
    "2000x2000",
    "1800x1800",
    "1600x1600",
    "1400x1400",
    "1200x1200",
    "1000x1000",
    "800x800",
    "1200x800",
    "1000x800",
    "800x600",
]


def normalize_url(raw: str) -> str:
    value = raw.replace("\\/", "/").replace("\\u002F", "/").replace("&amp;", "&")
    value = value.replace("https:\\/\\/", "https://").replace("http:\\/\\/", "http://")
    value = value.replace("https:\/\/", "https://").replace("http:\/\/", "http://")
    return unquote(value)


def load_image(data: bytes) -> Image.Image | None:
    try:
        with Image.open(io.BytesIO(data)) as source:
            source.load()
            return ImageOps.exif_transpose(source).convert("RGB")
    except Exception:
        return None


def request_image(session: requests.Session, url: str, referer: str) -> tuple[bytes, str] | None:
    try:
        response = session.get(url, timeout=35, allow_redirects=True, headers={"Referer": referer})
        if response.status_code != 200 or len(response.content) < 2500:
            return None
        content_type = (response.headers.get("content-type") or "").lower()
        if "image" not in content_type and not load_image(response.content):
            return None
        return response.content, response.url
    except Exception:
        return None


def discover_image_urls(session: requests.Session, page_url: str) -> tuple[str, list[str]]:
    response = session.get(page_url, timeout=45, allow_redirects=True)
    response.raise_for_status()
    text = response.text
    variants = [text, text.replace("\\u002F", "/"), text.replace("\\/", "/")]
    found: list[str] = []
    seen: set[str] = set()
    for variant in variants:
        for match in IMAGE_RE.finditer(variant):
            url = normalize_url(match.group(0))
            if url not in seen:
                seen.add(url)
                found.append(url)
    # Fallback for HTML/JSON where URLs are not fully escaped in the same way.
    fallback = re.compile(
        r"https://cdn\.vseinstrumenti\.ru/images/goods/[^\"'<>\s]+?/(?:\d+x\d+)/\d+\.(?:jpe?g|png|webp)",
        re.IGNORECASE,
    )
    for match in fallback.finditer(text):
        url = normalize_url(match.group(0))
        if url not in seen:
            seen.add(url)
            found.append(url)
    return response.url, found


def candidate_variants(url: str) -> list[str]:
    clean = normalize_url(url)
    match = SIZE_RE.search(clean)
    if not match:
        return [clean]
    current_size = match.group(1)
    variants: list[str] = []
    for size in [current_size, *TRY_SIZES]:
        replaced = clean[: match.start(1)] + size + clean[match.end(1) :]
        if replaced not in variants:
            variants.append(replaced)
    return variants


def save_product(session: requests.Session, item: dict, out_root: Path, min_side: int) -> dict:
    product_id = int(item["id"])
    page_url = str(item["url"])
    final_page, discovered = discover_image_urls(session, page_url)
    grouped: dict[str, list[str]] = {}
    for url in discovered:
        match = SIZE_RE.search(normalize_url(url))
        key = match.group(2) if match else normalize_url(url)
        grouped.setdefault(key, []).append(url)

    product_dir = out_root / str(product_id)
    product_dir.mkdir(parents=True, exist_ok=True)
    attempts: list[dict] = []
    saved: list[dict] = []
    seen_hashes: set[str] = set()

    for key, urls in grouped.items():
        best: tuple[int, int, bytes, str, str] | None = None
        variants: list[str] = []
        for source_url in urls:
            for variant in candidate_variants(source_url):
                if variant not in variants:
                    variants.append(variant)
        for variant in variants:
            result = request_image(session, variant, final_page)
            if result is None:
                attempts.append({"key": key, "url": variant, "ok": False})
                continue
            raw, final_url = result
            image = load_image(raw)
            if image is None:
                attempts.append({"key": key, "url": variant, "ok": False, "reason": "decode"})
                continue
            width, height = image.size
            attempts.append({"key": key, "url": variant, "finalUrl": final_url, "ok": True, "width": width, "height": height, "bytes": len(raw)})
            area = width * height
            if best is None or area > best[0]:
                buffer = io.BytesIO()
                image.save(buffer, format="WEBP", quality=90, method=6)
                best = (area, min(width, height), buffer.getvalue(), final_url, variant)

        if best is None or best[1] < min_side:
            continue
        _, _, data, final_url, requested_url = best
        digest = hashlib.sha256(data).hexdigest()
        if digest in seen_hashes:
            continue
        seen_hashes.add(digest)
        path = product_dir / f"{len(saved) + 1:02d}.webp"
        path.write_bytes(data)
        metrics = image_metrics(path)
        saved.append({
            "path": path.as_posix(),
            "sourceUrl": final_url,
            "requestedUrl": requested_url,
            "sourceKey": key,
            **metrics,
        })

    saved.sort(key=lambda entry: entry.get("general_score", -99), reverse=True)
    # Rename in ranked order so report and files are stable.
    ranked: list[dict] = []
    temp_files: list[tuple[Path, bytes, dict]] = []
    for entry in saved:
        old_path = Path(entry["path"])
        temp_files.append((old_path, old_path.read_bytes(), entry))
    for old_path, _, _ in temp_files:
        old_path.unlink(missing_ok=True)
    for index, (_, data, entry) in enumerate(temp_files, 1):
        new_path = product_dir / f"{index:02d}.webp"
        new_path.write_bytes(data)
        entry["path"] = new_path.as_posix()
        ranked.append(entry)

    return {
        "id": product_id,
        "code": item.get("code"),
        "page": page_url,
        "finalPage": final_page,
        "discoveredUrls": len(discovered),
        "sourceGroups": len(grouped),
        "candidates": ranked,
        "attempts": attempts,
    }


def write_text(report: dict, path: Path) -> None:
    lines = ["FORMA HOME — точные фото поставщика, партия 02", "=" * 72, ""]
    for product in report["products"]:
        lines += [
            f"ID {product['id']} — код {product.get('code')}",
            f"Страница: {product['finalPage']}",
            f"Найдено URL: {product['discoveredUrls']}; групп изображений: {product['sourceGroups']}; сохранено: {len(product['candidates'])}",
            "",
        ]
        for number, candidate in enumerate(product["candidates"], 1):
            lines.append(
                f"[{number}] {candidate['path']} score={candidate['general_score']} "
                f"{candidate['width']}×{candidate['height']} sharp={candidate['sharpness']} "
                f"bbox={candidate['bbox_ratio']} margin={candidate['min_margin']} touches={candidate['edge_touches']}"
            )
            lines.append(f"    source: {candidate['sourceUrl']}")
            lines.extend("    |" + row + "|" for row in candidate["preview"])
            lines.append("")
        lines += ["-" * 72, ""]
    path.write_text("\n".join(lines), encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", required=True)
    parser.add_argument("--out", default="data/retailer-batch-02")
    parser.add_argument("--min-side", type=int, default=700)
    args = parser.parse_args()

    items = json.loads(Path(args.source).read_text(encoding="utf-8"))
    out_root = Path(args.out)
    out_root.mkdir(parents=True, exist_ok=True)
    session = requests.Session()
    session.headers.update({
        "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/126 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "ru-RU,ru;q=0.9,en;q=0.7",
    })

    products = []
    for item in items:
        try:
            products.append(save_product(session, item, out_root, args.min_side))
        except Exception as exc:
            products.append({"id": int(item["id"]), "code": item.get("code"), "page": item.get("url"), "error": str(exc), "candidates": []})

    report = {"source": args.source, "minSide": args.min_side, "products": products}
    (out_root / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    write_text(report, out_root / "report.txt")
    print(json.dumps({"products": len(products), "saved": {str(p['id']): len(p.get('candidates', [])) for p in products}}, ensure_ascii=False))
    return 0 if any(product.get("candidates") for product in products) else 1


if __name__ == "__main__":
    raise SystemExit(main())
