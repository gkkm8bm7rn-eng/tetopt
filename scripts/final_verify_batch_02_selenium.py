#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import json
import os
import re
import shutil
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urljoin

import requests
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.support.ui import WebDriverWait

ROOTS = {
    "github": "https://gkkm8bm7rn-eng.github.io/tetopt/",
    "cloudflare": "https://tetopt.m78m6cfc2v.workers.dev/",
}
BATCH_IDS = [21, 28, 29, 30, 31, 32, 33, 34, 36, 41, 45, 50, 51, 52, 56, 57, 62, 63, 64, 65]
SCREENSHOT_IDS = {28, 41, 51, 52, 57, 65}
REPORT_PATH = Path("data/batch-02-final-verification.json")
ERROR_PATH = Path("data/batch-02-final-verification-error.json")
SCREEN_DIR = Path("data/live-review-batch-02")


def clean_asset(value: str | None) -> str:
    return str(value or "").split("#", 1)[0].split("?", 1)[0]


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def read_products() -> list[dict]:
    html = Path("catalog-source.html").read_text(encoding="utf-8")
    marker = "    const PRODUCTS = "
    start = html.index(marker) + len(marker)
    end = html.index(";\n", start)
    return json.loads(html[start:end])


def read_asset_version() -> str:
    text = Path("catalog-loader.js").read_text(encoding="utf-8")
    match = re.search(r'const assetVersion="([^"]+)";', text)
    if not match:
        raise RuntimeError("assetVersion не найден")
    return match.group(1)


def wait_live_version(session: requests.Session, root: str, version: str) -> None:
    deadline = time.time() + 300
    last = ""
    while time.time() < deadline:
        try:
            response = session.get(urljoin(root, f"catalog-loader.js?verify={time.time_ns()}"), timeout=30)
            last = f"HTTP {response.status_code}"
            if response.ok and f'const assetVersion="{version}";' in response.text:
                return
            if response.ok:
                last = "старая версия загрузчика"
        except Exception as exc:
            last = str(exc)
        time.sleep(10)
    raise RuntimeError(f"{root}: версия {version} не опубликована ({last})")


def make_driver() -> webdriver.Chrome:
    options = Options()
    options.add_argument("--headless=new")
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    options.add_argument("--disable-gpu")
    options.add_argument("--window-size=390,844")
    options.add_argument("--force-device-scale-factor=1")
    options.add_argument("--disable-cache")
    binary = shutil.which("google-chrome") or shutil.which("google-chrome-stable") or shutil.which("chromium") or shutil.which("chromium-browser")
    if binary:
        options.binary_location = binary
    return webdriver.Chrome(options=options)


def mark_progress_complete(batch_ids: list[int]) -> None:
    now = datetime.now(timezone.utc).isoformat()
    progress_path = Path("photo-processing-progress.json")
    progress = json.loads(progress_path.read_text(encoding="utf-8"))
    progress["version"] = int(progress.get("version", 0)) + 1
    progress["updatedAt"] = now
    progress["reviewedIds"] = sorted(set(map(int, progress.get("reviewedIds", []))) | set(batch_ids))
    progress["completedIds"] = sorted(set(map(int, progress.get("completedIds", []))) | set(batch_ids))
    progress["manualReviewIds"] = sorted(set(map(int, progress.get("manualReviewIds", []))) - set(batch_ids))
    progress["lastBatch"] = 2
    progress["lastBatchIds"] = batch_ids
    progress["lastBatchStatus"] = "completed_live_verified"
    progress["completedCount"] = len(progress["completedIds"])
    progress_path.write_text(json.dumps(progress, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    apply_path = Path("data/batch-02-exact-apply-report.json")
    if apply_path.exists():
        applied = json.loads(apply_path.read_text(encoding="utf-8"))
        applied["status"] = "completed_live_verified"
        applied["verifiedAt"] = now
        applied["verifiedSites"] = ["github-pages", "cloudflare"]
        apply_path.write_text(json.dumps(applied, ensure_ascii=False, indent=2), encoding="utf-8")


def main() -> int:
    products = read_products()
    local_by_id = {int(item["id"]): item for item in products}
    version = read_asset_version()
    for product_id in BATCH_IDS:
        product = local_by_id.get(product_id)
        if not product:
            raise RuntimeError(f"ID {product_id}: отсутствует в каталоге")
        images = [clean_asset(x) for x in product.get("images", []) if x]
        if not images:
            raise RuntimeError(f"ID {product_id}: нет фотографий")
        if clean_asset(product.get("directImage")) != images[0]:
            raise RuntimeError(f"ID {product_id}: directImage не совпадает с первым фото")
        if any("assets/interiors/" in item for item in images):
            raise RuntimeError(f"ID {product_id}: есть непроверенная интерьерная визуализация")
        if len(images) != len(set(images)):
            raise RuntimeError(f"ID {product_id}: дубли в галерее")
        for item in images:
            if not item.startswith(f"assets/products/{product_id}/") or not Path(item).exists():
                raise RuntimeError(f"ID {product_id}: отсутствует локальный файл {item}")

    session = requests.Session()
    session.headers.update({"User-Agent": "Mozilla/5.0 final-verification"})
    SCREEN_DIR.mkdir(parents=True, exist_ok=True)
    for old in SCREEN_DIR.glob("*.png"):
        old.unlink()

    report = {
        "batch": 2,
        "checkedAt": datetime.now(timezone.utc).isoformat(),
        "assetVersion": version,
        "activeTarget": 1362,
        "batchIds": BATCH_IDS,
        "sites": {},
        "status": "running",
    }

    for site_key, root in ROOTS.items():
        wait_live_version(session, root, version)
        driver = make_driver()
        wait = WebDriverWait(driver, 45)
        site_report = {"root": root, "products": []}
        try:
            driver.get(f"{root}?final-check={time.time_ns()}#catalog")
            wait.until(lambda d: d.execute_script("return !!document.querySelector('#grid .card')"))
            wait.until(lambda d: "1 362" in (d.execute_script("return document.querySelector('#resultCount')?.textContent || ''") or ""))
            live_count = driver.execute_script("return PRODUCTS.length")
            if live_count != 1362:
                raise RuntimeError(f"{site_key}: найдено {live_count} товаров вместо 1362")
            site_report["liveCount"] = live_count

            for product_id in BATCH_IDS:
                local = local_by_id[product_id]
                expected = [clean_asset(x) for x in local["images"]]
                live = driver.execute_script(
                    "const p=PRODUCTS.find(x=>Number(x.id)===Number(arguments[0])); return p?{name:p.name,directImage:p.directImage,images:p.images}:null;",
                    product_id,
                )
                if not live:
                    raise RuntimeError(f"{site_key} ID {product_id}: товар не найден в браузере")
                live_images = [clean_asset(x) for x in live.get("images", [])]
                if live_images != expected:
                    raise RuntimeError(f"{site_key} ID {product_id}: галерея отличается {live_images} != {expected}")
                if clean_asset(live.get("directImage")) != expected[0]:
                    raise RuntimeError(f"{site_key} ID {product_id}: неверный directImage")

                assets = []
                for asset in expected:
                    local_data = Path(asset).read_bytes()
                    response = session.get(urljoin(root, f"{asset}?v={version}&final-check={time.time_ns()}"), timeout=30)
                    if response.status_code != 200 or not response.headers.get("content-type", "").startswith("image/"):
                        raise RuntimeError(f"{site_key} ID {product_id}: {asset} HTTP {response.status_code} {response.headers.get('content-type')}")
                    if sha256(local_data) != sha256(response.content):
                        raise RuntimeError(f"{site_key} ID {product_id}: опубликованный файл отличается {asset}")
                    assets.append({"asset": asset, "bytes": len(response.content), "sha256": sha256(response.content)})

                driver.execute_script(
                    "const p=PRODUCTS.find(x=>Number(x.id)===Number(arguments[0])); const grid=document.querySelector('#grid'); grid.innerHTML=cardHtml(p); observeProductImages(grid); queueProductPhoto(grid.querySelector('.js-product-image'));",
                    product_id,
                )
                card_selector = f'[data-product="{product_id}"] .js-product-image'
                wait.until(lambda d: d.execute_script(
                    "const i=document.querySelector(arguments[0]); return !!i && i.classList.contains('loaded') && i.naturalWidth>80 && i.naturalHeight>80;",
                    card_selector,
                ))
                card = driver.execute_script(
                    "const c=document.querySelector(arguments[0]); const i=c.querySelector('.js-product-image'); const t=c.querySelector('.collection-tag'); return {src:i.getAttribute('src')||'',naturalWidth:i.naturalWidth,naturalHeight:i.naturalHeight,failed:i.classList.contains('failed'),tagVisible:!!t&&getComputedStyle(t).display!=='none'};",
                    f'[data-product="{product_id}"]',
                )
                if expected[0] not in clean_asset(card["src"]) or card["failed"] or card["tagVisible"]:
                    raise RuntimeError(f"{site_key} ID {product_id}: карточка показывает неверное/битое фото или верхнюю плашку")

                driver.execute_script("openProduct(arguments[0]);", product_id)
                wait.until(lambda d: d.execute_script(
                    "const i=document.querySelector('#galleryMainImage'); const s=document.querySelector('#galleryStatus'); return document.querySelector('#modal')?.classList.contains('show') && i?.classList.contains('loaded') && i.naturalWidth>80 && i.naturalHeight>80 && s?.hidden===true;"
                ))
                thumbs = driver.execute_script("return document.querySelectorAll('#galleryThumbs .gallery-thumb').length")
                if thumbs != len(expected):
                    raise RuntimeError(f"{site_key} ID {product_id}: миниатюр {thumbs}, ожидалось {len(expected)}")
                gallery = []
                for index, expected_path in enumerate(expected):
                    driver.execute_script("selectGalleryPhoto(arguments[0]);", index)
                    wait.until(lambda d, p=expected_path: d.execute_script(
                        "const i=document.querySelector('#galleryMainImage'); return i?.classList.contains('loaded') && i.naturalWidth>80 && i.naturalHeight>80 && i.src.includes(arguments[0]);",
                        p,
                    ))
                    gallery.append(driver.execute_script(
                        "const i=document.querySelector('#galleryMainImage'); return {src:i.getAttribute('src')||'',naturalWidth:i.naturalWidth,naturalHeight:i.naturalHeight};"
                    ))
                if product_id in SCREENSHOT_IDS:
                    driver.save_screenshot(str(SCREEN_DIR / f"{site_key}-{product_id}.png"))
                driver.execute_script("closeAll();")
                site_report["products"].append({
                    "id": product_id,
                    "name": live["name"],
                    "first": expected[0],
                    "imageCount": len(expected),
                    "card": card,
                    "gallery": gallery,
                    "assets": assets,
                    "status": "passed",
                })
        finally:
            driver.quit()
        report["sites"][site_key] = site_report

    report["status"] = "passed"
    report["completedCount"] = len(BATCH_IDS)
    report["summary"] = "Вторая партия проверена на GitHub Pages и Cloudflare: 20/20 карточек, все файлы совпадают с репозиторием, загружаются в карточках и во всех позициях модальных галерей; битых изображений и непроверенных интерьерных визуализаций нет."
    REPORT_PATH.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    ERROR_PATH.unlink(missing_ok=True)
    mark_progress_complete(BATCH_IDS)
    print(json.dumps({"status": "passed", "completed": len(BATCH_IDS), "assetVersion": version}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        ERROR_PATH.parent.mkdir(parents=True, exist_ok=True)
        ERROR_PATH.write_text(json.dumps({
            "batch": 2,
            "status": "failed",
            "checkedAt": datetime.now(timezone.utc).isoformat(),
            "error": str(exc),
        }, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"FINAL VERIFY ERROR: {exc}", flush=True)
        raise
