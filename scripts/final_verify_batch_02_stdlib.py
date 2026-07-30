#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import json
import re
import ssl
import subprocess
import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urljoin

ROOTS = {
    "github-pages": "https://gkkm8bm7rn-eng.github.io/tetopt/",
    "cloudflare": "https://tetopt.m78m6cfc2v.workers.dev/",
}
BATCH_IDS = [21, 28, 29, 30, 31, 32, 33, 34, 36, 41, 45, 50, 51, 52, 56, 57, 62, 63, 64, 65]
REPORT_PATH = Path("data/batch-02-final-verification.json")
ERROR_PATH = Path("data/batch-02-final-verification-error.json")
CTX = ssl.create_default_context()


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def clean(value: str | None) -> str:
    return str(value or "").split("?", 1)[0].split("#", 1)[0]


def get(url: str, timeout: int = 45) -> tuple[int, dict[str, str], bytes]:
    request = urllib.request.Request(url, headers={"User-Agent": "FORMA-HOME-final-check/2", "Cache-Control": "no-cache"})
    with urllib.request.urlopen(request, timeout=timeout, context=CTX) as response:
        return int(response.status), {k.lower(): v for k, v in response.headers.items()}, response.read()


def products() -> list[dict]:
    html = Path("catalog-source.html").read_text(encoding="utf-8")
    marker = "    const PRODUCTS = "
    start = html.index(marker) + len(marker)
    end = html.index(";\n", start)
    return json.loads(html[start:end])


def version() -> str:
    text = Path("catalog-loader.js").read_text(encoding="utf-8")
    match = re.search(r'const assetVersion="([^"]+)";', text)
    if not match:
        raise RuntimeError("assetVersion не найден")
    return match.group(1)


def update_progress(now: str) -> int:
    path = Path("photo-processing-progress.json")
    data = json.loads(path.read_text(encoding="utf-8"))
    data["version"] = int(data.get("version", 0)) + 1
    data["updatedAt"] = now
    data["reviewedIds"] = sorted(set(map(int, data.get("reviewedIds", []))) | set(BATCH_IDS))
    data["completedIds"] = sorted(set(map(int, data.get("completedIds", []))) | set(BATCH_IDS))
    data["manualReviewIds"] = sorted(set(map(int, data.get("manualReviewIds", []))) - set(BATCH_IDS))
    data["lastBatch"] = 2
    data["lastBatchIds"] = BATCH_IDS
    data["lastBatchStatus"] = "completed_final_verified"
    data["completedCount"] = len(data["completedIds"])
    path.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    return data["completedCount"]


def main() -> int:
    subprocess.run(["node", "--check", "catalog-loader.js"], check=True)
    source_html = Path("catalog-source.html").read_text(encoding="utf-8")
    inline = re.findall(r"<script>([\s\S]*?)</script>", source_html)
    if not inline:
        raise RuntimeError("В catalog-source.html отсутствует скрипт")
    temp = Path("data/.inline-final-check.js")
    temp.write_text("\n".join(inline), encoding="utf-8")
    try:
        subprocess.run(["node", "--check", str(temp)], check=True)
    finally:
        temp.unlink(missing_ok=True)

    loader_text = Path("catalog-loader.js").read_text(encoding="utf-8")
    for guard in (
        "const verifiedInteriorImages=new Map([]);",
        "currentImages.filter(image=>!isInteriorImage(image))",
        ".collection-tag{display:none!important}",
    ):
        if guard not in loader_text:
            raise RuntimeError(f"Не найдено защитное правило: {guard}")

    by_id = {int(item["id"]): item for item in products()}
    asset_version = version()
    checked_products = []
    for product_id in BATCH_IDS:
        item = by_id.get(product_id)
        if item is None:
            raise RuntimeError(f"ID {product_id}: товар отсутствует")
        images = [clean(x) for x in item.get("images", []) if x]
        if not images:
            raise RuntimeError(f"ID {product_id}: пустая галерея")
        if clean(item.get("directImage")) != images[0]:
            raise RuntimeError(f"ID {product_id}: первое фото и directImage расходятся")
        if len(images) != len(set(images)):
            raise RuntimeError(f"ID {product_id}: дубли в галерее")
        if any("assets/interiors/" in x for x in images):
            raise RuntimeError(f"ID {product_id}: непроверенная интерьерная визуализация")
        assets = []
        for image in images:
            if not image.startswith(f"assets/products/{product_id}/"):
                raise RuntimeError(f"ID {product_id}: посторонний файл {image}")
            path = Path(image)
            if not path.exists() or path.stat().st_size < 2500:
                raise RuntimeError(f"ID {product_id}: отсутствует или повреждён файл {image}")
            raw = path.read_bytes()
            if not raw.startswith(b"RIFF") or raw[8:12] != b"WEBP":
                raise RuntimeError(f"ID {product_id}: файл не является WebP {image}")
            assets.append({"path": image, "bytes": len(raw), "sha256": sha(raw)})
        checked_products.append({"id": product_id, "name": item.get("name"), "first": images[0], "imageCount": len(images), "assets": assets, "status": "passed"})

    local_files = {
        "index.html": Path("index.html").read_bytes(),
        "catalog-loader.js": Path("catalog-loader.js").read_bytes(),
        "catalog-source.html": Path("catalog-source.html").read_bytes(),
    }
    sites = {}
    for site_key, root in ROOTS.items():
        core = {}
        for filename, local_raw in local_files.items():
            status, headers, remote_raw = get(urljoin(root, f"{filename}?final-check={time.time_ns()}"))
            if status != 200:
                raise RuntimeError(f"{site_key}: {filename} HTTP {status}")
            if sha(remote_raw) != sha(local_raw):
                raise RuntimeError(f"{site_key}: {filename} не совпадает с main")
            core[filename] = {"http": status, "bytes": len(remote_raw), "sha256": sha(remote_raw)}
        if f'const assetVersion="{asset_version}";' not in local_files["catalog-loader.js"].decode("utf-8"):
            raise RuntimeError("assetVersion не зафиксирован в локальном загрузчике")

        live_products = []
        for item in checked_products:
            live_assets = []
            for asset in item["assets"]:
                status, headers, remote_raw = get(urljoin(root, f"{asset['path']}?v={asset_version}&final-check={time.time_ns()}"))
                content_type = headers.get("content-type", "")
                if status != 200 or not content_type.startswith("image/"):
                    raise RuntimeError(f"{site_key} ID {item['id']}: {asset['path']} HTTP {status}, {content_type}")
                if sha(remote_raw) != asset["sha256"]:
                    raise RuntimeError(f"{site_key} ID {item['id']}: {asset['path']} отличается от main")
                live_assets.append({"path": asset["path"], "http": status, "contentType": content_type, "bytes": len(remote_raw), "sha256": sha(remote_raw)})
            live_products.append({"id": item["id"], "first": item["first"], "imageCount": item["imageCount"], "assets": live_assets, "status": "passed"})
        sites[site_key] = {"root": root, "coreFiles": core, "products": live_products, "status": "passed"}

    now = datetime.now(timezone.utc).isoformat()
    completed_total = update_progress(now)
    apply_path = Path("data/batch-02-exact-apply-report.json")
    if apply_path.exists():
        applied = json.loads(apply_path.read_text(encoding="utf-8"))
        applied["status"] = "completed_final_verified"
        applied["verifiedAt"] = now
        applied["verifiedSites"] = list(ROOTS)
        apply_path.write_text(json.dumps(applied, ensure_ascii=False, indent=2), encoding="utf-8")

    report = {
        "batch": 2,
        "checkedAt": now,
        "assetVersion": asset_version,
        "activeTarget": 1362,
        "batchIds": BATCH_IDS,
        "completedCount": 20,
        "completedTotal": completed_total,
        "checks": {
            "javascriptSyntax": "passed",
            "firstPhotoAndGalleryOrder": "passed",
            "noDuplicates": "passed",
            "noUnverifiedInteriors": "passed",
            "localWebpIntegrity": "passed",
            "liveCoreFilesMatchMain": "passed",
            "allLiveImagesHttpContentTypeAndHash": "passed",
        },
        "products": checked_products,
        "sites": sites,
        "status": "passed",
        "summary": "Вторая партия прошла окончательную проверку: 20/20 карточек. GitHub Pages и Cloudflare публикуют текущие файлы main; все изображения доступны, имеют корректный тип и побайтно совпадают с репозиторием. Порядок галерей корректен, дублей и непроверенных интерьерных визуализаций нет.",
    }
    REPORT_PATH.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    ERROR_PATH.unlink(missing_ok=True)
    print(json.dumps({"status": "passed", "completed": 20, "completedTotal": completed_total}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        ERROR_PATH.parent.mkdir(parents=True, exist_ok=True)
        ERROR_PATH.write_text(json.dumps({"batch": 2, "status": "failed", "checkedAt": datetime.now(timezone.utc).isoformat(), "error": str(exc)}, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"FINAL VERIFY FAILED: {exc}")
        raise
