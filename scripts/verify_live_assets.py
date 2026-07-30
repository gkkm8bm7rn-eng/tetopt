#!/usr/bin/env python3
from __future__ import annotations

import argparse
import io
import json
import re
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urljoin

import requests
from PIL import Image

EXPECTED = {
    12: ["assets/products/12/01.webp", "assets/products/12/03.webp", "assets/products/12/02.webp"],
    13: ["assets/products/13/03.webp", "assets/products/13/02.webp", "assets/products/13/01.webp"],
    14: ["assets/products/14/01.webp", "assets/products/14/02.webp"],
    15: ["assets/products/15/01.webp", "assets/products/15/02.webp"],
    16: ["assets/products/16/02.webp", "assets/products/16/01.webp", "assets/products/16/03.webp"],
    17: ["assets/products/17/02.webp", "assets/products/17/01.webp", "assets/products/17/03.webp"],
    18: ["assets/products/18/02.webp", "assets/products/18/01.webp", "assets/products/18/03.webp"],
    19: ["assets/products/19/01.webp", "assets/products/19/03.webp", "assets/products/19/02.webp"],
    20: ["assets/products/20/01.webp", "assets/products/20/02.webp", "assets/products/20/03.webp"],
}
MARKER = "    const PRODUCTS = "


def get(session: requests.Session, url: str, attempts: int = 18) -> requests.Response:
    last = None
    for _ in range(attempts):
        try:
            response = session.get(url, timeout=40, headers={"Cache-Control": "no-cache"})
            last = response
            if response.status_code == 200:
                return response
        except Exception as exc:
            last = exc
        time.sleep(10)
    if isinstance(last, Exception):
        raise last
    raise RuntimeError(f"HTTP {last.status_code if last else 'unknown'}: {url}")


def parse_products(html: str) -> list[dict]:
    start = html.index(MARKER) + len(MARKER)
    end = html.index(";\n", start)
    return json.loads(html[start:end])


def verify(base: str) -> dict:
    session = requests.Session()
    session.headers.update({"User-Agent": "Mozilla/5.0 FORMA-HOME-verifier"})
    checks = []
    errors = []
    try:
        index = get(session, base).text
        checks.append({"name": "index_loader_v12", "ok": "catalog-loader.js?v=12" in index})
        loader = get(session, urljoin(base, "catalog-loader.js?v=12")).text
        checks.append({"name": "asset_cache_version", "ok": 'assetVersion="20260730-1935"' in loader})
        checks.append({"name": "collection_tag_removed", "ok": "collection-tag" in loader and "display:none!important" in loader})
        checks.append({"name": "unverified_interiors_disabled", "ok": "verifiedInteriorImages=new Map([])" in loader})

        catalog = get(session, urljoin(base, f"catalog-source.html?v={time.time_ns()}")).text
        products = {int(item["id"]): item for item in parse_products(catalog)}
        for product_id, expected in EXPECTED.items():
            product = products[product_id]
            actual = product.get("images") or []
            checks.append({"name": f"product_{product_id}_catalog_order", "ok": actual == expected and product.get("directImage") == expected[0], "expected": expected, "actual": actual, "directImage": product.get("directImage")})
            for index_no, rel in enumerate(expected, 1):
                response = get(session, urljoin(base, rel + f"?verify={time.time_ns()}"), attempts=8)
                try:
                    with Image.open(io.BytesIO(response.content)) as image:
                        width, height = image.size
                    ok = response.status_code == 200 and min(width, height) >= 700
                    checks.append({"name": f"product_{product_id}_image_{index_no}", "ok": ok, "path": rel, "status": response.status_code, "width": width, "height": height, "bytes": len(response.content)})
                except Exception as exc:
                    checks.append({"name": f"product_{product_id}_image_{index_no}", "ok": False, "path": rel, "error": str(exc)})
    except Exception as exc:
        errors.append(str(exc))
    return {"url": base, "checks": checks, "errors": errors, "ok": not errors and all(check.get("ok") for check in checks)}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", required=True)
    parser.add_argument("urls", nargs="+")
    args = parser.parse_args()
    results = [verify(url) for url in args.urls]
    report = {
        "verifiedAt": datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
        "batch": 1,
        "method": "published index, loader, catalog order and image-byte verification",
        "results": results,
        "ok": all(item["ok"] for item in results),
    }
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False))
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
