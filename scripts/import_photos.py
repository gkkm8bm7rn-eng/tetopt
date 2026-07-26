#!/usr/bin/env python3
"""Download product photos once and make the storefront use local WebP files.

Designed for the FORMA HOME single-file storefront where products are stored in
`const PRODUCTS = [...]` inside index.html.

Typical GitHub Actions usage:
    python scripts/import_photos.py --index index.html --batch-size 100 --max-photos 3

The script is incremental and safe to run repeatedly. It keeps progress in
`data/photo-import-state.json`, stores images under `assets/products/<id>/`,
and updates each product with an `images` array and local `directImage`.
"""

from __future__ import annotations

import argparse
import concurrent.futures
import dataclasses
import hashlib
import html as html_lib
import io
import json
import os
import random
import re
import shutil
import sys
import tempfile
import threading
import time
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable
from urllib.parse import parse_qs, unquote, urljoin, urlparse

import requests
from bs4 import BeautifulSoup
from PIL import Image, ImageOps, UnidentifiedImageError
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

Image.MAX_IMAGE_PIXELS = 80_000_000

USER_AGENT = (
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/126.0 Safari/537.36 FORMA-HOME-Photo-Importer/1.0"
)
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".avif", ".bmp", ".tif", ".tiff"}
BAD_URL_WORDS = re.compile(
    r"(?:logo|favicon|sprite|icon|captcha|counter|pixel|banner|youtube|yandex|"
    r"placeholder|loader|preloader|social|telegram|whatsapp|map|marker|payment)",
    re.IGNORECASE,
)
URL_IMAGE_RE = re.compile(
    r"https?://[^\s\"'<>()[\]\\]+?\.(?:jpe?g|png|webp|avif|bmp|tiff?)(?:\?[^\s\"'<>()[\]\\]*)?",
    re.IGNORECASE,
)
URL_ZIP_RE = re.compile(r"https?://[^\s\"'<>()[\]\\]+?\.zip(?:\?[^\s\"'<>()[\]\\]*)?", re.IGNORECASE)

_print_lock = threading.Lock()


def log(message: str) -> None:
    with _print_lock:
        print(message, flush=True)


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def make_session() -> requests.Session:
    session = requests.Session()
    retry = Retry(
        total=3,
        connect=3,
        read=3,
        status=3,
        backoff_factor=0.8,
        status_forcelist=(408, 425, 429, 500, 502, 503, 504),
        allowed_methods=frozenset({"GET", "HEAD"}),
        respect_retry_after_header=True,
    )
    adapter = HTTPAdapter(max_retries=retry, pool_connections=8, pool_maxsize=8)
    session.mount("https://", adapter)
    session.mount("http://", adapter)
    session.headers.update(
        {
            "User-Agent": USER_AGENT,
            "Accept-Language": "ru-RU,ru;q=0.9,en;q=0.7",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        }
    )
    return session


def fetch_bytes(
    session: requests.Session,
    url: str,
    *,
    referer: str | None = None,
    timeout: tuple[int, int] = (15, 45),
    max_bytes: int = 100 * 1024 * 1024,
) -> tuple[bytes, str, str]:
    headers = {"Referer": referer} if referer else None
    with session.get(url, headers=headers, timeout=timeout, stream=True, allow_redirects=True) as response:
        response.raise_for_status()
        content_type = response.headers.get("content-type", "").split(";", 1)[0].strip().lower()
        chunks: list[bytes] = []
        total = 0
        for chunk in response.iter_content(chunk_size=128 * 1024):
            if not chunk:
                continue
            total += len(chunk)
            if total > max_bytes:
                raise ValueError(f"Файл больше допустимого лимита {max_bytes // (1024 * 1024)} МБ")
            chunks.append(chunk)
        return b"".join(chunks), content_type, response.url


def fetch_html(session: requests.Session, url: str) -> tuple[str, str]:
    data, content_type, final_url = fetch_bytes(session, url, max_bytes=12 * 1024 * 1024)
    if "html" not in content_type and "text" not in content_type and not data.lstrip().startswith(b"<"):
        raise ValueError(f"Ожидалась HTML-страница, получено {content_type or 'неизвестно'}")
    # requests' apparent encoding is unavailable because we streamed bytes. Try common encodings.
    for encoding in ("utf-8", "windows-1251", "cp1251"):
        try:
            return data.decode(encoding), final_url
        except UnicodeDecodeError:
            pass
    return data.decode("utf-8", errors="replace"), final_url


def normalize_url(raw: str | None, base_url: str) -> str | None:
    if not raw:
        return None
    value = html_lib.unescape(raw.strip())
    value = value.replace("\\/", "/")
    if value.startswith("data:") or value.startswith("blob:") or value.startswith("javascript:"):
        return None
    try:
        return urljoin(base_url, value)
    except ValueError:
        return None


def product_words(product: dict[str, Any]) -> list[str]:
    text = f"{product.get('name', '')} {product.get('specs', '')}".lower()
    return [word for word in re.split(r"[^a-zа-яё0-9]+", text) if len(word) >= 4][:12]


def supplier_code(product: dict[str, Any]) -> str:
    photo_bank = str(product.get("photoBank") or "")
    try:
        return (parse_qs(urlparse(photo_bank).query).get("good_id") or [""])[0]
    except Exception:
        return ""


@dataclasses.dataclass(frozen=True)
class Candidate:
    url: str
    score: int
    kind: str  # image or zip
    referer: str


def discover_candidates(page_text: str, page_url: str, product: dict[str, Any]) -> list[Candidate]:
    soup = BeautifulSoup(page_text, "html.parser")
    words = product_words(product)
    code = supplier_code(product)
    candidates: dict[tuple[str, str], Candidate] = {}
    order = 0

    def add(raw: str | None, context: str = "", kind_hint: str | None = None, base_score: int = 0) -> None:
        nonlocal order
        url = normalize_url(raw, page_url)
        if not url:
            return
        low_url = unquote(url).lower()
        parsed = urlparse(url)
        ext = Path(parsed.path).suffix.lower()
        kind = kind_hint
        if kind is None:
            if ext == ".zip" or ".zip?" in low_url:
                kind = "zip"
            elif ext in IMAGE_EXTENSIONS:
                kind = "image"
            else:
                # URLs from <img> may not have an extension. Keep them as image candidates.
                kind = "image"
        if kind == "image" and BAD_URL_WORDS.search(low_url):
            return
        context_low = html_lib.unescape(context).lower()
        score = base_score - min(order, 500)
        order += 1
        if kind == "zip":
            score += 1000
        if "/netcat_files/" in low_url:
            score += 700
        if "/multifile/" in low_url or "multifile" in low_url:
            score += 250
        if "original" in low_url or "full" in low_url or "large" in low_url:
            score += 100
        if code and (code in low_url or code in context_low):
            score += 500
        score += sum(35 for word in words if word in context_low)
        if kind == "zip" and ("скач" in context_low or "download" in context_low or "фото" in context_low):
            score += 250
        if kind == "image" and ext in {".jpg", ".jpeg", ".webp", ".png"}:
            score += 60
        key = (kind, url)
        current = candidates.get(key)
        candidate = Candidate(url=url, score=score, kind=kind, referer=page_url)
        if current is None or candidate.score > current.score:
            candidates[key] = candidate

    for meta in soup.select(
        'meta[property="og:image"], meta[property="og:image:secure_url"], '
        'meta[name="twitter:image"], link[rel="image_src"]'
    ):
        add(meta.get("content") or meta.get("href"), "meta product image", "image", 500)

    for tag in soup.find_all(["img", "source", "a"]):
        context_parts = [
            tag.get("alt"),
            tag.get("title"),
            tag.get("aria-label"),
            tag.get_text(" ", strip=True),
        ]
        parent = tag.parent
        if parent is not None:
            context_parts.append(parent.get_text(" ", strip=True)[:500])
        context = " ".join(part for part in context_parts if part)

        if tag.name == "a":
            href = tag.get("href")
            href_low = str(href or "").lower()
            kind = "zip" if ".zip" in href_low else None
            add(href, context, kind, 250 if kind == "zip" else 0)
        else:
            for attr in ("src", "data-src", "data-original", "data-lazy", "data-zoom-image"):
                add(tag.get(attr), context, "image", 300)
            for attr in ("srcset", "data-srcset"):
                srcset = tag.get(attr)
                if srcset:
                    for part in srcset.split(","):
                        add(part.strip().split()[0], context, "image", 250)

    # Some galleries keep URLs only in scripts or JSON blobs.
    unescaped_text = html_lib.unescape(page_text).replace("\\/", "/")
    for match in URL_ZIP_RE.finditer(unescaped_text):
        add(match.group(0), "script zip", "zip", 150)
    for match in URL_IMAGE_RE.finditer(unescaped_text):
        add(match.group(0), "script image", "image", 100)

    return sorted(candidates.values(), key=lambda candidate: candidate.score, reverse=True)


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


def hamming_distance(a: int, b: int) -> int:
    return (a ^ b).bit_count()


def prepare_image(data: bytes, max_side: int, max_kb: int) -> tuple[bytes, int, int, int]:
    with Image.open(io.BytesIO(data)) as source:
        source.load()
        image = ImageOps.exif_transpose(source)
        if getattr(image, "n_frames", 1) > 1:
            image.seek(0)
        width, height = image.size
        if width < 250 or height < 250:
            raise ValueError(f"слишком маленькое изображение: {width}×{height}")
        if image.mode not in ("RGB", "RGBA"):
            image = image.convert("RGBA" if "transparency" in image.info else "RGB")
        image.thumbnail((max_side, max_side), Image.Resampling.LANCZOS)
        fingerprint = image_dhash(image)

        working = image
        quality = 78
        target_bytes = max_kb * 1024
        best: bytes | None = None
        for shrink_round in range(4):
            for current_quality in (quality, 72, 66, 60, 54):
                output = io.BytesIO()
                working.save(
                    output,
                    format="WEBP",
                    quality=current_quality,
                    method=6,
                    exact=True,
                )
                encoded = output.getvalue()
                if best is None or len(encoded) < len(best):
                    best = encoded
                if len(encoded) <= target_bytes:
                    return encoded, working.width, working.height, fingerprint
            if max(working.size) <= 700:
                break
            new_size = (max(1, int(working.width * 0.84)), max(1, int(working.height * 0.84)))
            working = working.resize(new_size, Image.Resampling.LANCZOS)
        assert best is not None
        return best, working.width, working.height, fingerprint


def iter_zip_images(data: bytes) -> Iterable[tuple[str, bytes]]:
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        members = [member for member in archive.infolist() if not member.is_dir()]
        members.sort(key=lambda member: member.filename.lower())
        for member in members[:80]:
            ext = Path(member.filename).suffix.lower()
            if ext not in IMAGE_EXTENSIONS:
                continue
            if member.file_size > 40 * 1024 * 1024:
                continue
            try:
                yield member.filename, archive.read(member)
            except (RuntimeError, OSError, zipfile.BadZipFile):
                continue


def download_candidate_images(
    session: requests.Session,
    candidates: list[Candidate],
    max_candidates: int = 35,
) -> Iterable[tuple[str, bytes]]:
    zip_candidates = [candidate for candidate in candidates if candidate.kind == "zip"][:4]
    image_candidates = [candidate for candidate in candidates if candidate.kind == "image"][:max_candidates]

    for candidate in zip_candidates:
        try:
            data, content_type, final_url = fetch_bytes(
                session,
                candidate.url,
                referer=candidate.referer,
                max_bytes=120 * 1024 * 1024,
            )
            if not zipfile.is_zipfile(io.BytesIO(data)):
                log(f"    ⚠ Не ZIP: {final_url} ({content_type})")
                continue
            for filename, image_data in iter_zip_images(data):
                yield f"{final_url}#{filename}", image_data
        except Exception as exc:
            log(f"    ⚠ ZIP не скачан: {candidate.url} — {exc}")

    for candidate in image_candidates:
        try:
            data, content_type, final_url = fetch_bytes(
                session,
                candidate.url,
                referer=candidate.referer,
                max_bytes=35 * 1024 * 1024,
            )
            if content_type and not content_type.startswith("image/"):
                # Some servers use application/octet-stream; PIL validation below is authoritative.
                if content_type not in {"application/octet-stream", "binary/octet-stream"}:
                    continue
            yield final_url, data
        except Exception:
            continue


@dataclasses.dataclass
class ProductResult:
    product_id: int
    images: list[str]
    discovered: int
    error: str | None = None


def process_product(
    product: dict[str, Any],
    repository_root: Path,
    assets_dir: Path,
    max_photos: int,
    max_side: int,
    max_kb: int,
) -> ProductResult:
    product_id = int(product["id"])
    session = make_session()
    page_urls = [str(product.get("photoBank") or ""), str(product.get("productUrl") or "")]
    page_urls = [url for url in page_urls if url]
    candidates: dict[tuple[str, str], Candidate] = {}
    page_errors: list[str] = []

    for page_url in page_urls:
        try:
            page_text, final_url = fetch_html(session, page_url)
            for candidate in discover_candidates(page_text, final_url, product):
                key = (candidate.kind, candidate.url)
                current = candidates.get(key)
                if current is None or candidate.score > current.score:
                    candidates[key] = candidate
            time.sleep(random.uniform(0.15, 0.45))
        except Exception as exc:
            page_errors.append(f"{page_url}: {exc}")

    ordered = sorted(candidates.values(), key=lambda candidate: candidate.score, reverse=True)
    if not ordered:
        error = "Не найдены ссылки на изображения"
        if page_errors:
            error += "; " + " | ".join(page_errors[:2])
        return ProductResult(product_id=product_id, images=[], discovered=0, error=error)

    final_dir = repository_root / assets_dir / str(product_id)
    temp_parent = final_dir.parent
    temp_parent.mkdir(parents=True, exist_ok=True)
    temp_dir = Path(tempfile.mkdtemp(prefix=f".{product_id}-", dir=temp_parent))
    saved_paths: list[str] = []
    fingerprints: list[int] = []
    content_hashes: set[str] = set()

    try:
        for source_label, raw_data in download_candidate_images(session, ordered):
            if len(saved_paths) >= max_photos:
                break
            try:
                encoded, width, height, fingerprint = prepare_image(raw_data, max_side=max_side, max_kb=max_kb)
            except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError):
                continue
            content_hash = hashlib.sha256(encoded).hexdigest()
            if content_hash in content_hashes:
                continue
            if any(hamming_distance(fingerprint, previous) <= 3 for previous in fingerprints):
                continue
            number = len(saved_paths) + 1
            filename = f"{number:02d}.webp"
            output_path = temp_dir / filename
            output_path.write_bytes(encoded)
            relative = (assets_dir / str(product_id) / filename).as_posix()
            saved_paths.append(relative)
            fingerprints.append(fingerprint)
            content_hashes.add(content_hash)
            log(
                f"    ✓ {filename}: {width}×{height}, {len(encoded) // 1024} КБ "
                f"← {source_label[:90]}"
            )

        if not saved_paths:
            return ProductResult(
                product_id=product_id,
                images=[],
                discovered=len(ordered),
                error="Ссылки найдены, но подходящие изображения не скачались",
            )

        if final_dir.exists():
            shutil.rmtree(final_dir)
        temp_dir.replace(final_dir)
        return ProductResult(product_id=product_id, images=saved_paths, discovered=len(ordered))
    finally:
        if temp_dir.exists():
            shutil.rmtree(temp_dir, ignore_errors=True)


def load_products_from_html(index_path: Path) -> tuple[str, list[dict[str, Any]], int, int]:
    html_text = index_path.read_text(encoding="utf-8")
    marker = "const PRODUCTS ="
    marker_index = html_text.find(marker)
    if marker_index < 0:
        raise ValueError("В index.html не найдено `const PRODUCTS = [...]`")
    start = marker_index + len(marker)
    while start < len(html_text) and html_text[start].isspace():
        start += 1
    decoder = json.JSONDecoder()
    products, consumed = decoder.raw_decode(html_text[start:])
    if not isinstance(products, list):
        raise ValueError("PRODUCTS должен быть JSON-массивом")
    end = start + consumed
    return html_text, products, start, end


def patch_storefront_runtime(html_text: str, local_only: bool) -> str:
    # A single flag makes finalization idempotent and prevents old browser cache URLs
    # from reintroducing external dependencies.
    flag_line = f"    const LOCAL_IMAGES_ONLY = {'true' if local_only else 'false'};"
    if re.search(r"^\s*const LOCAL_IMAGES_ONLY\s*=.*?;\s*$", html_text, flags=re.MULTILINE):
        html_text = re.sub(
            r"^\s*const LOCAL_IMAGES_ONLY\s*=.*?;\s*$",
            flag_line,
            html_text,
            count=1,
            flags=re.MULTILINE,
        )
    else:
        insertion_marker = '    const IMAGE_CACHE_KEY = "formaResolvedPhotosV3";'
        if insertion_marker not in html_text:
            raise ValueError("Не найдено место для добавления LOCAL_IMAGES_ONLY")
        html_text = html_text.replace(insertion_marker, flag_line + "\n" + insertion_marker, 1)

    # Replace cachedFirstPhoto as a complete function because it is short and this is
    # safer than accumulating several small edits after repeated runs.
    cached_function = '''    function cachedFirstPhoto(p){
      const local=Array.isArray(p.images)?p.images.filter(Boolean):[];
      if(local.length)return local[0];
      if(LOCAL_IMAGES_ONLY)return null;
      const gallery=galleryCache[p.id];
      if(Array.isArray(gallery) && gallery.length)return gallery[0];
      const cached=imageCache[p.id];
      return Array.isArray(cached)?cached[0]:cached;
    }'''
    html_text, count = re.subn(
        r"    function cachedFirstPhoto\(p\)\{.*?\n    \}",
        cached_function,
        html_text,
        count=1,
        flags=re.DOTALL,
    )
    if count != 1:
        raise ValueError("Не удалось обновить cachedFirstPhoto()")

    html_text = html_text.replace(
        "      const cached=p.directImage||cachedFirstPhoto(p);",
        "      const cached=cachedFirstPhoto(p)||(!LOCAL_IMAGES_ONLY?p.directImage:null);",
        1,
    )

    resolve_photo_function = '''    async function resolveProductPhoto(p){
      const local=Array.isArray(p.images)?p.images.filter(Boolean):[];
      if(local.length)return local[0];
      if(p.directImage && (!LOCAL_IMAGES_ONLY || !/^https?:/i.test(p.directImage)))return p.directImage;
      if(LOCAL_IMAGES_ONLY)return null;
      if(imageCache[p.id])return imageCache[p.id];
      const pages=[p.photoBank,p.productUrl].filter(Boolean);
      for(const pageUrl of pages){
        const versions=[
          `https://api.allorigins.win/raw?url=${encodeURIComponent(pageUrl)}`,
          `https://corsproxy.io/?url=${encodeURIComponent(pageUrl)}`,
          `https://r.jina.ai/${pageUrl}`
        ];
        for(const proxyUrl of versions){
          try{
            const controller=new AbortController();
            const timer=setTimeout(()=>controller.abort(),12000);
            const response=await fetch(proxyUrl,{signal:controller.signal,headers:{"Accept":"text/html,text/plain,*/*"}});
            clearTimeout(timer);
            if(!response.ok)continue;
            const text=await response.text();
            const candidates=extractPhotoCandidates(text,pageUrl,p);
            for(const candidate of candidates){
              if(await canLoadImage(candidate,5500)){
                imageCache[p.id]=candidate;
                try{localStorage.setItem(IMAGE_CACHE_KEY,JSON.stringify(imageCache))}catch{}
                return candidate;
              }
            }
          }catch{}
        }
      }
      return null;
    }'''
    html_text, count = re.subn(
        r"    async function resolveProductPhoto\(p\)\{.*?\n    \}\n\n    function extractPhotoCandidates",
        resolve_photo_function + "\n\n    function extractPhotoCandidates",
        html_text,
        count=1,
        flags=re.DOTALL,
    )
    if count != 1:
        raise ValueError("Не удалось обновить resolveProductPhoto()")

    # Make the gallery use all local files first. In local-only mode this returns
    # before any supplier URL or proxy is touched.
    html_text = re.sub(
        r"      const saved=Array\.isArray\(galleryCache\[p\.id\]\) \? galleryCache\[p\.id\]\.filter\(Boolean\) : \[\];\n"
        r"      const photos=.*?;\n"
        r"      const seen=new Set\(photos\);\n"
        r"      const pages=\[p\.photoBank,p\.productUrl\]\.filter\(Boolean\);",
        '''      const saved=Array.isArray(galleryCache[p.id]) ? galleryCache[p.id].filter(Boolean) : [];
      const local=Array.isArray(p.images)?p.images.filter(Boolean):[];
      const photos=[...new Set([...local,p.directImage,cachedFirstPhoto(p),...saved].filter(Boolean))];
      if(LOCAL_IMAGES_ONLY)return photos;
      const seen=new Set(photos);
      const pages=[p.photoBank,p.productUrl].filter(Boolean);''',
        html_text,
        count=1,
        flags=re.DOTALL,
    )

    return html_text


def save_products_to_html(
    index_path: Path,
    original_html: str,
    products: list[dict[str, Any]],
    start: int,
    end: int,
    local_only: bool,
) -> None:
    products_json = json.dumps(products, ensure_ascii=False, separators=(",", ":"))
    html_text = original_html[:start] + products_json + original_html[end:]
    html_text = patch_storefront_runtime(html_text, local_only=local_only)
    temp_path = index_path.with_suffix(index_path.suffix + ".tmp")
    temp_path.write_text(html_text, encoding="utf-8")
    temp_path.replace(index_path)


def load_state(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {"version": 1, "products": {}, "updated_at": None}
    try:
        state = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(state, dict):
            raise ValueError
        state.setdefault("version", 1)
        state.setdefault("products", {})
        return state
    except (json.JSONDecodeError, ValueError):
        raise ValueError(f"Повреждён файл состояния: {path}")


def save_state(path: Path, state: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    state["updated_at"] = utc_now()
    temp_path = path.with_suffix(path.suffix + ".tmp")
    temp_path.write_text(json.dumps(state, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temp_path.replace(path)


def local_images_exist(repository_root: Path, product: dict[str, Any]) -> bool:
    images = product.get("images")
    if not isinstance(images, list) or not images or not all(isinstance(path, str) for path in images):
        return False
    return all((repository_root / path).is_file() for path in images)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--index", default="index.html", help="Путь к index.html")
    parser.add_argument("--assets-dir", default="assets/products", help="Каталог изображений относительно репозитория")
    parser.add_argument("--state", default="data/photo-import-state.json", help="Файл прогресса")
    parser.add_argument("--batch-size", type=int, default=100, help="Сколько товаров обрабатывать за один запуск")
    parser.add_argument("--max-photos", type=int, default=3, help="Максимум фотографий на товар")
    parser.add_argument("--workers", type=int, default=4, help="Параллельные товары")
    parser.add_argument("--max-side", type=int, default=1400, help="Максимальная сторона WebP в пикселях")
    parser.add_argument("--max-kb", type=int, default=280, help="Желаемый максимальный размер одного WebP")
    parser.add_argument("--max-attempts", type=int, default=3, help="Автоматические попытки на товар")
    parser.add_argument("--start-id", type=int, default=0, help="Обрабатывать товары начиная с этого id")
    parser.add_argument("--retry-failed", action="store_true", help="Сбросить лимит попыток для неудачных товаров")
    parser.add_argument(
        "--finalize-local-only",
        action="store_true",
        help="Запретить внешние URL и прокси; товары без фото покажут заглушку",
    )
    parser.add_argument("--validate-only", action="store_true", help="Только проверить структуру файлов")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if args.batch_size < 0:
        raise ValueError("batch-size не может быть отрицательным")
    if not 1 <= args.max_photos <= 8:
        raise ValueError("max-photos должен быть от 1 до 8")
    if not 1 <= args.workers <= 8:
        raise ValueError("workers должен быть от 1 до 8")

    index_path = Path(args.index).resolve()
    repository_root = index_path.parent
    assets_dir = Path(args.assets_dir)
    state_path = repository_root / args.state
    original_html, products, json_start, json_end = load_products_from_html(index_path)
    state = load_state(state_path)
    product_state: dict[str, Any] = state["products"]

    log(f"Найдено товаров: {len(products)}")
    imported_count = sum(1 for product in products if local_images_exist(repository_root, product))
    log(f"Уже имеют локальные фотографии: {imported_count}")

    if args.validate_only:
        patched = patch_storefront_runtime(original_html, local_only=False)
        if "const LOCAL_IMAGES_ONLY" not in patched:
            raise RuntimeError("Проверка патча не пройдена")
        log("✓ index.html и патч совместимы")
        return 0

    if args.retry_failed:
        for entry in product_state.values():
            if isinstance(entry, dict) and entry.get("status") == "failed":
                entry["attempts"] = 0

    pending: list[dict[str, Any]] = []
    for product in products:
        product_id = int(product.get("id", 0))
        if product_id < args.start_id:
            continue
        if local_images_exist(repository_root, product):
            continue
        entry = product_state.get(str(product_id), {})
        attempts = int(entry.get("attempts", 0)) if isinstance(entry, dict) else 0
        if attempts >= args.max_attempts and not args.retry_failed:
            continue
        if args.batch_size == 0:
            break
        pending.append(product)
        if len(pending) >= args.batch_size:
            break

    if pending:
        log(f"В этом запуске: {len(pending)} товаров, до {args.max_photos} фото на товар")
        by_id = {int(product["id"]): product for product in products}
        with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as executor:
            futures = {}
            for product in pending:
                product_id = int(product["id"])
                log(f"→ Товар {product_id}: {product.get('name', '')}")
                future = executor.submit(
                    process_product,
                    product,
                    repository_root,
                    assets_dir,
                    args.max_photos,
                    args.max_side,
                    args.max_kb,
                )
                futures[future] = product

            for future in concurrent.futures.as_completed(futures):
                product = futures[future]
                product_id = int(product["id"])
                entry = product_state.setdefault(str(product_id), {})
                entry["attempts"] = int(entry.get("attempts", 0)) + 1
                entry["last_attempt_at"] = utc_now()
                try:
                    result = future.result()
                except Exception as exc:  # Defensive: keep the whole batch alive.
                    result = ProductResult(product_id=product_id, images=[], discovered=0, error=str(exc))

                if result.images:
                    target = by_id[product_id]
                    target["images"] = result.images
                    target["directImage"] = result.images[0]
                    entry.update(
                        {
                            "status": "ok",
                            "images": result.images,
                            "discovered_candidates": result.discovered,
                            "error": None,
                        }
                    )
                    log(f"✓ Товар {product_id}: сохранено {len(result.images)} фото")
                else:
                    entry.update(
                        {
                            "status": "failed",
                            "images": [],
                            "discovered_candidates": result.discovered,
                            "error": result.error or "Неизвестная ошибка",
                        }
                    )
                    log(f"✗ Товар {product_id}: {entry['error']}")
    else:
        log("Нет товаров для очередной партии.")

    if args.finalize_local_only:
        missing = 0
        for product in products:
            if not local_images_exist(repository_root, product):
                missing += 1
            product.pop("productUrl", None)
            product.pop("photoBank", None)
            if product.get("images"):
                product["directImage"] = product["images"][0]
            elif isinstance(product.get("directImage"), str) and product["directImage"].startswith(("http://", "https://")):
                product["directImage"] = None
        log(f"LOCAL_IMAGES_ONLY включён. Товаров без локального фото: {missing}")

    save_products_to_html(
        index_path=index_path,
        original_html=original_html,
        products=products,
        start=json_start,
        end=json_end,
        local_only=args.finalize_local_only,
    )
    save_state(state_path, state)

    imported_after = sum(1 for product in products if local_images_exist(repository_root, product))
    failed_exhausted = sum(
        1
        for product in products
        if not local_images_exist(repository_root, product)
        and int(product_state.get(str(product.get("id")), {}).get("attempts", 0)) >= args.max_attempts
    )
    log("\nИтог:")
    log(f"  локальные фото: {imported_after}/{len(products)}")
    log(f"  исчерпали {args.max_attempts} попытки: {failed_exhausted}")
    log(f"  следующий запуск продолжит с оставшихся товаров")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        log("Остановлено пользователем")
        raise SystemExit(130)
    except Exception as exc:
        log(f"Критическая ошибка: {exc}")
        raise
