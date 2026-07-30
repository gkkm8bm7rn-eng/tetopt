#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import io
import json
import re
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urljoin

import requests
from PIL import Image, ImageOps

ROOTS = {
    "github-pages": "https://gkkm8bm7rn-eng.github.io/tetopt/",
    "cloudflare": "https://tetopt.m78m6cfc2v.workers.dev/",
}
BATCH_IDS = [21, 28, 29, 30, 31, 32, 33, 34, 36, 41, 45, 50, 51, 52, 56, 57, 62, 63, 64, 65]
REPORT = Path("data/batch-02-final-verification.json")
ERROR = Path("data/batch-02-final-verification-error.json")


def clean(value: str | None) -> str:
    return str(value or "").split("#", 1)[0].split("?", 1)[0]


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def read_products() -> list[dict]:
    html = Path("catalog-source.html").read_text(encoding="utf-8")
    marker = "    const PRODUCTS = "
    start = html.index(marker) + len(marker)
    end = html.index(";\n", start)
    return json.loads(html[start:end])


def asset_version() -> str:
    text = Path("catalog-loader.js").read_text(encoding="utf-8")
    match = re.search(r'const assetVersion="([^"]+)";', text)
    if not match:
        raise RuntimeError("assetVersion не найден")
    return match.group(1)


def image_info(data: bytes) -> dict:
    with Image.open(io.BytesIO(data)) as source:
        source.verify()
    with Image.open(io.BytesIO(data)) as source:
        image = ImageOps.exif_transpose(source)
        width, height = image.size
        fmt = image.format
    if width < 300 or height < 300:
        raise RuntimeError(f"слишком маленькое изображение {width}×{height}")
    return {"width": width, "height": height, "format": fmt}


def check_javascript() -> None:
    subprocess.run(["node", "--check", "catalog-loader.js"], check=True, capture_output=True, text=True)
    html = Path("catalog-source.html").read_text(encoding="utf-8")
    scripts = re.findall(r"<script>([\s\S]*?)</script>", html)
    if not scripts:
        raise RuntimeError("в catalog-source.html не найден встроенный скрипт")
    temp = Path("data/.catalog-inline-check.js")
    temp.write_text("\n".join(scripts), encoding="utf-8")
    try:
        subprocess.run(["node", "--check", str(temp)], check=True, capture_output=True, text=True)
    finally:
        temp.unlink(missing_ok=True)


def mark_complete() -> int:
    now = datetime.now(timezone.utc).isoformat()
    path = Path("photo-processing-progress.json")
    progress = json.loads(path.read_text(encoding="utf-8"))
    progress["version"] = int(progress.get("version", 0)) + 1
    progress["updatedAt"] = now
    progress["reviewedIds"] = sorted(set(map(int, progress.get("reviewedIds", []))) | set(BATCH_IDS))
    progress["completedIds"] = sorted(set(map(int, progress.get("completedIds", []))) | set(BATCH_IDS))
    progress["manualReviewIds"] = sorted(set(map(int, progress.get("manualReviewIds", []))) - set(BATCH_IDS))
    progress["lastBatch"] = 2
    progress["lastBatchIds"] = BATCH_IDS
    progress["lastBatchStatus"] = "completed_final_verified"
    progress["completedCount"] = len(progress["completedIds"])
    path.write_text(json.dumps(progress, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    apply_path = Path("data/batch-02-exact-apply-report.json")
    if apply_path.exists():
        applied = json.loads(apply_path.read_text(encoding="utf-8"))
        applied["status"] = "completed_final_verified"
        applied["verifiedAt"] = now
        applied["verifiedSites"] = list(ROOTS)
        apply_path.write_text(json.dumps(applied, ensure_ascii=False, indent=2), encoding="utf-8")
    return len(progress["completedIds"])


def main() -> int:
    check_javascript()
    products = read_products()
    by_id = {int(item["id"]): item for item in products}
    version = asset_version()
    local_catalog = Path("catalog-source.html").read_bytes()
    local_loader = Path("catalog-loader.js").read_bytes()
    local_index = Path("index.html").read_bytes()

    loader_text = local_loader.decode("utf-8")
    required_loader_guards = [
        "const verifiedInteriorImages=new Map([]);",
        "currentImages.filter(image=>!isInteriorImage(image))",
        'html=html.replace(/\\s*<div class="collection-tag">',
        ".collection-tag{display:none!important}",
    ]
    missing_guards = [item for item in required_loader_guards if item not in loader_text]
    if missing_guards:
        raise RuntimeError(f"в загрузчике отсутствуют защитные правила: {missing_guards}")

    product_report = []
    for product_id in BATCH_IDS:
        product = by_id.get(product_id)
        if not product:
            raise RuntimeError(f"ID {product_id}: товар отсутствует")
        images = [clean(item) for item in product.get("images", []) if item]
        if not images:
            raise RuntimeError(f"ID {product_id}: галерея пуста")
        if clean(product.get("directImage")) != images[0]:
            raise RuntimeError(f"ID {product_id}: directImage не равен первому фото")
        if len(images) != len(set(images)):
            raise RuntimeError(f"ID {product_id}: дубли в галерее")
        if any("assets/interiors/" in item for item in images):
            raise RuntimeError(f"ID {product_id}: опубликована непроверенная интерьерная визуализация")
        local_images = []
        for image_path in images:
            if not image_path.startswith(f"assets/products/{product_id}/"):
                raise RuntimeError(f"ID {product_id}: посторонний путь {image_path}")
            path = Path(image_path)
            if not path.exists():
                raise RuntimeError(f"ID {product_id}: файл отсутствует {image_path}")
            data = path.read_bytes()
            local_images.append({"path": image_path, "bytes": len(data), "sha256": digest(data), **image_info(data)})
        product_report.append({
            "id": product_id,
            "name": product.get("name"),
            "directImage": images[0],
            "imageCount": len(images),
            "images": local_images,
            "localStatus": "passed",
        })

    session = requests.Session()
    session.headers.update({"User-Agent": "FORMA-HOME-final-verification/2"})
    sites = {}
    for key, root in ROOTS.items():
        root_checks = {}
        for name, local_data in (("index.html", local_index), ("catalog-loader.js", local_loader), ("catalog-source.html", local_catalog)):
            url = urljoin(root, f"{name}?final-check={datetime.now(timezone.utc).timestamp()}")
            response = session.get(url, timeout=45, headers={"Cache-Control": "no-cache"})
            if response.status_code != 200:
                raise RuntimeError(f"{key}: {name} HTTP {response.status_code}")
            if digest(response.content) != digest(local_data):
                raise RuntimeError(f"{key}: опубликованный {name} отличается от main")
            root_checks[name] = {"http": 200, "bytes": len(response.content), "sha256": digest(response.content)}
        if f'const assetVersion="{version}";' not in session.get(urljoin(root, f"catalog-loader.js?v={version}"), timeout=45).text:
            raise RuntimeError(f"{key}: опубликована другая версия assetVersion")

        live_products = []
        for product in product_report:
            live_images = []
            for image in product["images"]:
                url = urljoin(root, f"{image['path']}?v={version}&final-check=1")
                response = session.get(url, timeout=45, headers={"Cache-Control": "no-cache"})
                if response.status_code != 200:
                    raise RuntimeError(f"{key} ID {product['id']}: {image['path']} HTTP {response.status_code}")
                content_type = response.headers.get("Content-Type", "")
                if not content_type.startswith("image/"):
                    raise RuntimeError(f"{key} ID {product['id']}: неверный Content-Type {content_type}")
                if digest(response.content) != image["sha256"]:
                    raise RuntimeError(f"{key} ID {product['id']}: удалённый файл отличается {image['path']}")
                remote_info = image_info(response.content)
                if remote_info["width"] != image["width"] or remote_info["height"] != image["height"]:
                    raise RuntimeError(f"{key} ID {product['id']}: размеры удалённого файла отличаются")
                live_images.append({"path": image["path"], "http": 200, "contentType": content_type, "bytes": len(response.content), "sha256": digest(response.content), **remote_info})
            live_products.append({"id": product["id"], "first": product["directImage"], "imageCount": product["imageCount"], "images": live_images, "status": "passed"})
        sites[key] = {"root": root, "files": root_checks, "products": live_products, "status": "passed"}

    completed_total = mark_complete()
    payload = {
        "batch": 2,
        "checkedAt": datetime.now(timezone.utc).isoformat(),
        "assetVersion": version,
        "activeTarget": 1362,
        "batchIds": BATCH_IDS,
        "completedCount": len(BATCH_IDS),
        "completedTotal": completed_total,
        "checks": {
            "javascriptSyntax": "passed",
            "catalogOrderAndDirectImage": "passed",
            "noDuplicateImages": "passed",
            "noUnverifiedInteriors": "passed",
            "localImageDecode": "passed",
            "liveCoreFilesMatchMain": "passed",
            "liveImageHttpContentAndHash": "passed",
            "sites": list(ROOTS),
        },
        "products": product_report,
        "sites": sites,
        "status": "passed",
        "summary": "Окончательная проверка второй партии пройдена: 20/20 товаров, обе версии сайта публикуют текущие файлы main; все изображения доступны, декодируются и побайтно совпадают с репозиторием; порядок галерей корректен, непроверенных интерьерных визуализаций и дублей нет.",
    }
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    ERROR.unlink(missing_ok=True)
    print(json.dumps({"status": "passed", "batch": 2, "completed": 20, "completedTotal": completed_total}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        ERROR.parent.mkdir(parents=True, exist_ok=True)
        ERROR.write_text(json.dumps({"batch": 2, "status": "failed", "checkedAt": datetime.now(timezone.utc).isoformat(), "error": str(exc)}, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"FINAL CHECK FAILED: {exc}")
        raise
