#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import io
import json
from pathlib import Path

import requests
from PIL import Image, ImageOps

from audit_product_photos import image_metrics

BASE = "https://cdn.vseinstrumenti.ru/images/goods/tovary-dlya-ofisa-i-doma/mebel/15246466/{size}/{image}.jpg"
IMAGE_IDS = ["174733918", "174733924", "174733930", "174733936", "174733942", "174733948", "185060777", "185060783"]
SIZES = ["2000x2000", "1600x1600", "1200x1200", "1000x1000", "800x800", "1200x800", "1000x800", "800x600", "600x600", "400x400", "68x60"]


def main() -> int:
    root = Path("data/retailer/20")
    root.mkdir(parents=True, exist_ok=True)
    session = requests.Session()
    session.headers.update({"User-Agent": "Mozilla/5.0", "Referer": "https://www.vseinstrumenti.ru/"})
    hashes = set()
    candidates = []
    attempts = []

    for image_id in IMAGE_IDS:
        best = None
        for size in SIZES:
            url = BASE.format(size=size, image=image_id)
            try:
                response = session.get(url, timeout=30)
                attempt = {"imageId": image_id, "sizePath": size, "url": url, "status": response.status_code, "bytes": len(response.content)}
                if response.status_code != 200:
                    attempts.append(attempt)
                    continue
                with Image.open(io.BytesIO(response.content)) as source:
                    source.load()
                    image = ImageOps.exif_transpose(source).convert("RGB")
                width, height = image.size
                attempt.update({"width": width, "height": height})
                attempts.append(attempt)
                if min(width, height) < 300:
                    continue
                area = width * height
                if best is None or area > best[0]:
                    best = (area, url, image.copy())
            except Exception as exc:
                attempts.append({"imageId": image_id, "sizePath": size, "url": url, "error": str(exc)})

        if best is None:
            continue
        _, source_url, image = best
        buffer = io.BytesIO()
        image.save(buffer, format="WEBP", quality=88, method=6)
        data = buffer.getvalue()
        digest = hashlib.sha256(data).hexdigest()
        if digest in hashes:
            continue
        hashes.add(digest)
        path = root / f"{len(candidates)+1:02d}.webp"
        path.write_bytes(data)
        metrics = image_metrics(path)
        candidates.append({"path": path.as_posix(), "sourceUrl": source_url, **metrics})

    candidates.sort(key=lambda item: item.get("general_score", -99), reverse=True)
    report = {"productId": 20, "sourceProductCode": "21794", "sourcePageProductId": "15246466", "candidates": candidates, "attempts": attempts}
    (root / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")

    lines = ["Товар 20 — высококачественные фото точной модели 21794", "=" * 72, ""]
    for number, item in enumerate(candidates, 1):
        lines.append(f"[{number}] {item['path']} score={item['general_score']} {item['width']}×{item['height']} sharp={item['sharpness']} bbox={item['bbox_ratio']} margin={item['min_margin']} touches={item['edge_touches']}")
        lines.append(f"    source: {item['sourceUrl']}")
        lines.extend("    |" + row + "|" for row in item["preview"])
        lines.append("")
    (root / "report.txt").write_text("\n".join(lines), encoding="utf-8")
    print(f"Saved {len(candidates)} high-resolution candidates")
    return 0 if candidates else 1


if __name__ == "__main__":
    raise SystemExit(main())
