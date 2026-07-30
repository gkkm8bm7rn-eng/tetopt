#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import io
import json
import re
from pathlib import Path
from urllib.parse import unquote, urlparse

import requests
from PIL import Image, ImageOps

from audit_product_photos import image_metrics

URL_RE = re.compile(
    r"https?:(?:\\/|/){2}cdn(?:\\?\.)vseinstrumenti(?:\\?\.)ru(?:\\?/|/)+images(?:\\?/|/)+goods(?:\\?/|/)+[^\"'<>\s]+?",
    re.IGNORECASE,
)
SIZE_RE = re.compile(r"/(\d{2,4}x\d{2,4})/([^/?#]+\.(?:jpe?g|png|webp))(?:[?#].*)?$", re.IGNORECASE)
TRY_SIZES = ["2400x2400", "2000x2000", "1800x1800", "1600x1600", "1400x1400", "1200x1200", "1000x1000", "800x800"]


def normalize_url(raw: str) -> str:
    value = raw.replace("\\u002F", "/").replace("\\/", "/").replace("&amp;", "&")
    value = value.replace("https:\/\/", "https://").replace("http:\/\/", "http://")
    value = unquote(value).rstrip("\\,;)]}")
    return value


def open_image(data: bytes) -> Image.Image | None:
    try:
        with Image.open(io.BytesIO(data)) as source:
            source.load()
            return ImageOps.exif_transpose(source).convert("RGB")
    except Exception:
        return None


def discover(session: requests.Session, page_url: str) -> tuple[str, list[str], str]:
    response = session.get(page_url, timeout=30, allow_redirects=True)
    response.raise_for_status()
    final_page = response.url
    text = response.text
    page_id_match = re.search(r"-(\d{6,})/?(?:[?#].*)?$", urlparse(final_page).path)
    page_id = page_id_match.group(1) if page_id_match else ""
    urls: list[str] = []
    seen: set[str] = set()
    for variant in (text, text.replace("\\u002F", "/"), text.replace("\\/", "/")):
        for match in URL_RE.finditer(variant):
            url = normalize_url(match.group(0))
            # End the match at a supported image extension.
            ext = re.search(r"\.(?:jpe?g|png|webp)(?:[?#][^\"'<>\s]*)?", url, re.IGNORECASE)
            if not ext:
                continue
            url = url[: ext.end()]
            if page_id and f"/{page_id}/" not in url:
                continue
            if SIZE_RE.search(url) and url not in seen:
                seen.add(url)
                urls.append(url)
    return final_page, urls, page_id


def variants_for(url: str) -> list[str]:
    match = SIZE_RE.search(url)
    if not match:
        return [url]
    variants: list[str] = []
    for size in TRY_SIZES:
        candidate = url[: match.start(1)] + size + url[match.end(1) :]
        if candidate not in variants:
            variants.append(candidate)
    if url not in variants:
        variants.append(url)
    return variants


def fetch_best(session: requests.Session, urls: list[str], referer: str, min_side: int) -> tuple[bytes, str, str, int, int] | None:
    tried: set[str] = set()
    best: tuple[bytes, str, str, int, int] | None = None
    best_area = 0
    for source in urls:
        for candidate in variants_for(source):
            if candidate in tried:
                continue
            tried.add(candidate)
            try:
                response = session.get(candidate, timeout=12, allow_redirects=True, headers={"Referer": referer})
            except Exception:
                continue
            if response.status_code != 200 or len(response.content) < 2500:
                continue
            image = open_image(response.content)
            if image is None:
                continue
            width, height = image.size
            area = width * height
            if area > best_area:
                buffer = io.BytesIO()
                image.save(buffer, format="WEBP", quality=90, method=6)
                best = (buffer.getvalue(), response.url, candidate, width, height)
                best_area = area
            if min(width, height) >= 1600:
                return best
        if best and min(best[3], best[4]) >= min_side:
            break
    return best if best and min(best[3], best[4]) >= min_side else None


def process_product(session: requests.Session, item: dict, out_root: Path, min_side: int) -> dict:
    product_id = int(item["id"])
    final_page, discovered, page_id = discover(session, str(item["url"]))
    groups: dict[str, list[str]] = {}
    for url in discovered:
        match = SIZE_RE.search(url)
        if match:
            groups.setdefault(match.group(2), []).append(url)
    product_dir = out_root / str(product_id)
    product_dir.mkdir(parents=True, exist_ok=True)
    saved: list[dict] = []
    hashes: set[str] = set()
    for key, urls in list(groups.items())[:24]:
        result = fetch_best(session, urls, final_page, min_side)
        if result is None:
            continue
        data, source_url, requested_url, width, height = result
        digest = hashlib.sha256(data).hexdigest()
        if digest in hashes:
            continue
        hashes.add(digest)
        path = product_dir / f"tmp-{len(saved)+1:02d}.webp"
        path.write_bytes(data)
        saved.append({"path": path.as_posix(), "sourceUrl": source_url, "requestedUrl": requested_url, "sourceKey": key, **image_metrics(path)})
    saved.sort(key=lambda entry: entry.get("general_score", -99), reverse=True)
    ranked: list[dict] = []
    payloads = [(Path(entry["path"]).read_bytes(), entry) for entry in saved]
    for entry in saved:
        Path(entry["path"]).unlink(missing_ok=True)
    for index, (data, entry) in enumerate(payloads, 1):
        path = product_dir / f"{index:02d}.webp"
        path.write_bytes(data)
        entry["path"] = path.as_posix()
        ranked.append(entry)
    return {"id": product_id, "code": item.get("code"), "page": item.get("url"), "finalPage": final_page, "pageId": page_id, "discoveredUrls": len(discovered), "sourceGroups": len(groups), "candidates": ranked}


def write_text(report: dict, path: Path) -> None:
    lines = ["FORMA HOME — точные фото поставщика, партия 02", "=" * 72, ""]
    for product in report["products"]:
        lines.extend([f"ID {product['id']} — код {product.get('code')}", f"Страница: {product.get('finalPage', product.get('page'))}", f"ID страницы: {product.get('pageId','')}; URL: {product.get('discoveredUrls',0)}; групп: {product.get('sourceGroups',0)}; сохранено: {len(product.get('candidates',[]))}", ""])
        if product.get("error"):
            lines.append(f"ОШИБКА: {product['error']}")
        for number, candidate in enumerate(product.get("candidates", []), 1):
            lines.append(f"[{number}] {candidate['path']} score={candidate['general_score']} {candidate['width']}×{candidate['height']} sharp={candidate['sharpness']} bbox={candidate['bbox_ratio']} margin={candidate['min_margin']} touches={candidate['edge_touches']}")
            lines.append(f"    source: {candidate['sourceUrl']}")
            lines.extend("    |" + row + "|" for row in candidate["preview"])
            lines.append("")
        lines.extend(["-" * 72, ""])
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
    session.headers.update({"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/126 Safari/537.36", "Accept-Language": "ru-RU,ru;q=0.9,en;q=0.7"})
    products = []
    for item in items:
        try:
            products.append(process_product(session, item, out_root, args.min_side))
        except Exception as exc:
            products.append({"id": int(item["id"]), "code": item.get("code"), "page": item.get("url"), "error": str(exc), "candidates": []})
    report = {"source": args.source, "minSide": args.min_side, "products": products}
    (out_root / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    write_text(report, out_root / "report.txt")
    summary = {str(product["id"]): len(product.get("candidates", [])) for product in products}
    print(json.dumps(summary, ensure_ascii=False))
    return 0 if any(summary.values()) else 1


if __name__ == "__main__":
    raise SystemExit(main())
