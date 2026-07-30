#!/usr/bin/env python3
from __future__ import annotations

import argparse
import io
import json
import zipfile
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from PIL import Image, ImageOps

from import_photos import discover_candidates, fetch_bytes, fetch_html, make_session


def dimensions(data: bytes) -> tuple[int, int] | None:
    try:
        with Image.open(io.BytesIO(data)) as source:
            source.load()
            image = ImageOps.exif_transpose(source)
            return image.size
    except Exception:
        return None


def supplier_code(product: dict) -> str:
    try:
        return (parse_qs(urlparse(str(product.get("photoBank") or "")).query).get("good_id") or [""])[0]
    except Exception:
        return ""


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", required=True)
    parser.add_argument("--id", required=True, type=int)
    parser.add_argument("--out", required=True)
    parser.add_argument("--limit", type=int, default=35)
    args = parser.parse_args()

    products = json.loads(Path(args.source).read_text(encoding="utf-8"))
    product = next(item for item in products if int(item["id"]) == args.id)
    code = supplier_code(product)
    session = make_session()
    all_candidates = {}
    page_info = []
    for page_url in [product.get("photoBank"), product.get("productUrl")]:
        if not page_url:
            continue
        try:
            text, final_url = fetch_html(session, page_url)
            candidates = discover_candidates(text, final_url, product)
            page_info.append({"requested": page_url, "final": final_url, "candidateCount": len(candidates)})
            for candidate in candidates:
                low = candidate.url.lower()
                relevant = (
                    candidate.kind == "zip"
                    or (code and code in low)
                    or "/netcat_files/" in low
                    or "/multifile/" in low
                    or candidate.score >= 750
                )
                if not relevant:
                    continue
                key = (candidate.kind, candidate.url)
                previous = all_candidates.get(key)
                if previous is None or candidate.score > previous.score:
                    all_candidates[key] = candidate
        except Exception as exc:
            page_info.append({"requested": page_url, "error": str(exc)})

    ordered = sorted(all_candidates.values(), key=lambda item: item.score, reverse=True)
    inspected = []
    for candidate in ordered[: args.limit]:
        item = {"kind": candidate.kind, "score": candidate.score, "url": candidate.url, "referer": candidate.referer, "path": urlparse(candidate.url).path}
        try:
            data, content_type, final_url = fetch_bytes(
                session,
                candidate.url,
                referer=candidate.referer,
                timeout=(10, 25),
                max_bytes=130 * 1024 * 1024 if candidate.kind == "zip" else 40 * 1024 * 1024,
            )
            item["finalUrl"] = final_url
            item["contentType"] = content_type
            item["bytes"] = len(data)
            if zipfile.is_zipfile(io.BytesIO(data)):
                members = []
                with zipfile.ZipFile(io.BytesIO(data)) as archive:
                    for member in archive.infolist():
                        if member.is_dir() or member.file_size > 50 * 1024 * 1024:
                            continue
                        try:
                            raw = archive.read(member)
                        except Exception:
                            continue
                        size = dimensions(raw)
                        if size:
                            members.append({"name": member.filename, "width": size[0], "height": size[1], "bytes": member.file_size})
                item["zipMembers"] = members
            else:
                size = dimensions(data)
                if size:
                    item["width"], item["height"] = size
        except Exception as exc:
            item["error"] = str(exc)
        inspected.append(item)

    report = {"id": args.id, "name": product.get("name"), "supplierCode": code, "photoBank": product.get("photoBank"), "productUrl": product.get("productUrl"), "pages": page_info, "candidates": inspected}
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")

    text_lines = [f"ID {args.id} — {product.get('name')}", f"Код поставщика: {code}", "=" * 72, ""]
    for number, item in enumerate(inspected, 1):
        dims = f"{item.get('width')}×{item.get('height')}" if item.get("width") else ""
        text_lines.append(f"[{number}] {item['kind']} score={item['score']} {dims} bytes={item.get('bytes', '')}")
        text_lines.append(f"    {item['url']}")
        if item.get("finalUrl") and item["finalUrl"] != item["url"]:
            text_lines.append(f"    final: {item['finalUrl']}")
        if item.get("error"):
            text_lines.append(f"    ERROR: {item['error']}")
        for member in item.get("zipMembers", []):
            text_lines.append(f"      ZIP {member['width']}×{member['height']} {member['bytes']} — {member['name']}")
        text_lines.append("")
    out.with_suffix(".txt").write_text("\n".join(text_lines), encoding="utf-8")
    print(f"Inspected {len(inspected)} relevant candidates")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
