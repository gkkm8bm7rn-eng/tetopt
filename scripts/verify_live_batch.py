#!/usr/bin/env python3
from __future__ import annotations

import argparse
import asyncio
import json
from datetime import datetime, timezone
from pathlib import Path

from playwright.async_api import async_playwright

EXPECTED = {
    12: ("/assets/products/12/01.webp", 3),
    13: ("/assets/products/13/03.webp", 3),
    14: ("/assets/products/14/01.webp", 2),
    15: ("/assets/products/15/01.webp", 2),
    16: ("/assets/products/16/02.webp", 3),
    17: ("/assets/products/17/02.webp", 3),
    18: ("/assets/products/18/02.webp", 3),
    19: ("/assets/products/19/01.webp", 3),
    20: ("/assets/products/20/01.webp", 3),
}


async def verify_url(browser, url: str) -> dict:
    page = await browser.new_page(viewport={"width": 390, "height": 844}, device_scale_factor=2)
    errors: list[str] = []
    console_errors: list[str] = []
    page.on("console", lambda msg: console_errors.append(msg.text) if msg.type == "error" else None)
    response_status = None
    deployed = False

    for attempt in range(12):
        try:
            response = await page.goto(url, wait_until="domcontentloaded", timeout=45000)
            response_status = response.status if response else None
            await page.wait_for_selector('#grid [data-product="12"]', timeout=45000)
            result_text = await page.locator("#resultCount").inner_text()
            if "1 362" in result_text or "1362" in result_text.replace(" ", ""):
                deployed = True
                break
        except Exception as exc:
            errors.append(f"attempt {attempt + 1}: {exc}")
        await page.wait_for_timeout(15000)

    checks = []
    if deployed:
        tag_count = await page.locator(".collection-tag").count()
        visible_tag_count = await page.locator(".collection-tag:visible").count()
        checks.append({"name": "collection_tags_hidden", "ok": visible_tag_count == 0, "total": tag_count, "visible": visible_tag_count})
        result_text = await page.locator("#resultCount").inner_text()
        checks.append({"name": "active_count_1362", "ok": "1362" in result_text.replace(" ", ""), "value": result_text})

        for product_id, (path_fragment, expected_count) in EXPECTED.items():
            visual = page.locator(f'[data-product="{product_id}"] .visual')
            img = visual.locator(".js-product-image")
            await visual.scroll_into_view_if_needed()
            try:
                await img.wait_for(state="visible", timeout=15000)
                await page.wait_for_function(
                    "id => { const img=document.querySelector(`[data-product=\"${id}\"] .js-product-image`); return img && img.complete && img.naturalWidth>0; }",
                    arg=product_id,
                    timeout=15000,
                )
            except Exception as exc:
                errors.append(f"ID {product_id}: image wait failed: {exc}")
            data = await img.evaluate("img => ({src:img.currentSrc||img.src,width:img.naturalWidth,height:img.naturalHeight,loaded:img.classList.contains('loaded'),failed:img.classList.contains('failed')})")
            count = int(await visual.get_attribute("data-photo-count") or "0")
            ok = (
                path_fragment in data["src"]
                and data["width"] >= 700
                and data["height"] >= 700
                and data["loaded"]
                and not data["failed"]
                and count == expected_count
            )
            checks.append({"name": f"product_{product_id}_first_photo", "ok": ok, "expected": path_fragment, "expectedCount": expected_count, "actualCount": count, **data})

        failed_visible = await page.locator(".product-photo.failed:visible").count()
        checks.append({"name": "no_visible_broken_product_photos", "ok": failed_visible == 0, "count": failed_visible})

    await page.close()
    return {
        "url": url,
        "httpStatus": response_status,
        "deployed": deployed,
        "checks": checks,
        "errors": errors[-5:],
        "consoleErrors": console_errors[-10:],
        "ok": deployed and all(item.get("ok") for item in checks),
    }


async def main_async(urls: list[str], out: Path) -> int:
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch()
        results = []
        for url in urls:
            results.append(await verify_url(browser, url))
        await browser.close()
    report = {
        "verifiedAt": datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
        "batch": 1,
        "scope": "completed products 1-20; live checks for curated products 12-20",
        "results": results,
        "ok": all(item["ok"] for item in results),
    }
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False))
    return 0 if report["ok"] else 1


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", default="data/live-verification-batch-01.json")
    parser.add_argument("urls", nargs="+")
    args = parser.parse_args()
    return asyncio.run(main_async(args.urls, Path(args.out)))


if __name__ == "__main__":
    raise SystemExit(main())
