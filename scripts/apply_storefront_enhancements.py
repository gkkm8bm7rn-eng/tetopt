#!/usr/bin/env python3
"""Apply deterministic storefront enhancements to catalog-source.html."""
from __future__ import annotations

import re
from pathlib import Path


CATALOG = Path("catalog-source.html")
ZOOM_TAG = '<script src="image-zoom.js?v=2"></script>'
ZOOM_RE = re.compile(r'<script src="image-zoom\.js\?v=\d+"></script>')


def main() -> int:
    text = CATALOG.read_text(encoding="utf-8")
    if ZOOM_RE.search(text):
        updated = ZOOM_RE.sub(ZOOM_TAG, text, count=1)
    else:
        if "</body>" not in text:
            raise ValueError("В catalog-source.html не найден </body>")
        updated = text.replace("</body>", f"  {ZOOM_TAG}\n</body>", 1)
    if updated != text:
        temp = CATALOG.with_suffix(CATALOG.suffix + ".tmp")
        temp.write_text(updated, encoding="utf-8")
        temp.replace(CATALOG)
        print("Подключён модуль увеличения фотографий.")
    else:
        print("Модуль увеличения фотографий уже подключён.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
