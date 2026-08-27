#!/usr/bin/env python3
import json
import re
import subprocess
import sys
import time
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]
REPORT_PATH = ROOT / "audit-report.json"
SCREEN_DIR = ROOT / "audit-screens"
SCREEN_DIR.mkdir(exist_ok=True)

WORKER_URL = "https://tetopt.m78m6cfc2v.workers.dev/"
PAGES_URL = "https://gkkm8bm7rn-eng.github.io/tetopt/"
GITHUB_ASSET_HOST = "gkkm8bm7rn-eng.github.io"
VALID_CATEGORY_CODES = {str(i) for i in range(1, 19)}


def jload(path):
    return json.loads(path.read_text(encoding="utf-8"))


def asset_tree():
    raw = subprocess.check_output(
        ["git", "ls-tree", "-rl", "HEAD", "--", "assets/products"],
        cwd=ROOT,
        text=True,
    )
    files = {}
    for line in raw.splitlines():
        # 100644 blob <sha> <size>\tassets/products/...
        match = re.match(r"^\d+\s+blob\s+[0-9a-f]+\s+(\d+)\t(.+)$", line)
        if match:
            files[match.group(2)] = int(match.group(1))
    return files


def source_folder(path):
    if not isinstance(path, str):
        return None
    match = re.match(r"^assets/products/([^/]+)/", path.lstrip("/"))
    return match.group(1) if match else None


def catalog_audit():
    errors, warnings = [], []
    assets = asset_tree()
    index = jload(ROOT / "data/catalog-index.json")
    assignments = jload(ROOT / "data/category-assignments.json")
    detail_cache = {}
    all_detail_products = {}
    for path in sorted((ROOT / "data/details").glob("*.json")):
        shard = jload(path)
        detail_cache[f"details/{path.name}"] = shard
        for pid, product in (shard.get("products") or {}).items():
            if pid in all_detail_products:
                errors.append(f"detail product duplicated across shards: {pid}")
            all_detail_products[pid] = product

    products = index.get("products") or []
    index_sources = {}
    primary_sizes = []
    referenced_images = set()
    cross_gallery = []
    undeclared_cross_gallery = []
    no_own_media = []
    missing_primary = []
    missing_gallery = []
    primary_wrong_source = []
    index_detail_mismatch = []
    invalid_prices = []
    primary_not_gallery = []
    names_with_packaging = []

    packaging_re = re.compile(r"\d+\s*(?:шт\.?|штук)\s*(?:в\s*)?(?:упаковк|уп\.)", re.I)

    for product in products:
        pid = product.get("id")
        if not pid:
            errors.append("catalog product without id")
            continue
        if packaging_re.search(product.get("name") or ""):
            names_with_packaging.append(pid)
        shard_rel = product.get("detailShard")
        shard = detail_cache.get(shard_rel)
        detail = (shard.get("products") or {}).get(pid) if shard else None
        if not detail:
            errors.append(f"missing detail product {pid} in {shard_rel}")
            continue
        compact_variants = product.get("variants") or []
        full_variants = detail.get("variants") or []
        full_by_source = {str(v.get("sourceId")): v for v in full_variants if v.get("sourceId") is not None}
        if product.get("variantCount") != len(compact_variants):
            errors.append(f"{pid}: compact variantCount mismatch")
        if detail.get("variantCount") != len(full_variants):
            errors.append(f"{pid}: detail variantCount mismatch")

        for compact in compact_variants:
            sid = str(compact.get("sourceId"))
            if sid == "None":
                errors.append(f"{pid}: compact variant without sourceId")
                continue
            if sid in index_sources and index_sources[sid] != pid:
                errors.append(f"sourceId {sid} appears in {index_sources[sid]} and {pid}")
            index_sources[sid] = pid
            full = full_by_source.get(sid)
            if not full:
                index_detail_mismatch.append(f"{pid}/{sid}")
                continue
            for field in ("specs", "wholesalePrice", "retailPrice", "primaryImage", "axes"):
                if compact.get(field) != full.get(field):
                    index_detail_mismatch.append(f"{pid}/{sid}:{field}")
            for price_field in ("wholesalePrice", "retailPrice"):
                price = compact.get(price_field)
                if not isinstance(price, (int, float)) or price < 0:
                    invalid_prices.append(f"{pid}/{sid}:{price_field}={price!r}")

            primary = compact.get("primaryImage")
            if not primary or primary not in assets:
                missing_primary.append(f"{pid}/{sid}:{primary}")
            else:
                referenced_images.add(primary)
                primary_sizes.append((assets[primary], pid, sid, primary))
            folder = source_folder(primary)
            if folder and folder != sid:
                primary_wrong_source.append(f"{pid}/{sid}:{primary}")

            images = full.get("images") or []
            merged = {str(x) for x in full.get("mergedDuplicateSourceIds", [])}
            own = []
            if images and primary not in images:
                primary_not_gallery.append(f"{pid}/{sid}")
            for image in images:
                referenced_images.add(image)
                if image not in assets:
                    missing_gallery.append(f"{pid}/{sid}:{image}")
                folder = source_folder(image)
                if folder == sid:
                    own.append(image)
                elif folder:
                    cross_gallery.append(f"{pid}/{sid}:{folder}:{image}")
                    if folder not in merged:
                        undeclared_cross_gallery.append(f"{pid}/{sid}:{folder}:{image}")
            if images and not own:
                no_own_media.append(f"{pid}/{sid}")

    detail_only = sorted(set(all_detail_products) - {p.get("id") for p in products})
    if detail_only:
        warnings.append(f"{len(detail_only)} detail products are not in catalog index")

    assignment_map = assignments.get("assignments") or {}
    unknown_assignment_sources = sorted(set(assignment_map) - set(index_sources))
    invalid_category_codes = sorted({
        str(code)
        for codes in assignment_map.values()
        for code in (codes if isinstance(codes, list) else [])
        if str(code) not in VALID_CATEGORY_CODES
    })

    stats = index.get("stats") or {}
    actual_variants = sum(len(p.get("variants") or []) for p in products)
    dual_axis = sum(
        1 for p in products for v in (p.get("variants") or [])
        if (v.get("axes") or {}).get("soft") and (v.get("axes") or {}).get("hard")
    )
    if stats.get("models") != len(products):
        errors.append(f"stats.models={stats.get('models')} actual={len(products)}")
    if stats.get("variants") != actual_variants:
        errors.append(f"stats.variants={stats.get('variants')} actual={actual_variants}")
    if stats.get("dualAxisVariants") != dual_axis:
        errors.append(f"stats.dualAxisVariants={stats.get('dualAxisVariants')} actual={dual_axis}")

    shell_files = [
        "index.html", "styles.css", "enhancements.css", "axes.css", "ui.css",
        "media-policy.js", "variants.js", "app.js", "search-fallback.js", "cart-feedback.js",
        "data/catalog-index.json", "data/category-assignments.json",
    ]
    shell_sizes = {name: (ROOT / name).stat().st_size for name in shell_files}
    shell_total = sum(shell_sizes.values())

    app_text = (ROOT / "app.js").read_text(encoding="utf-8")
    sw_text = (ROOT / "sw.js").read_text(encoding="utf-8")
    feedback_text = (ROOT / "cart-feedback.js").read_text(encoding="utf-8")
    media_text = (ROOT / "media-policy.js").read_text(encoding="utf-8")
    html_text = (ROOT / "index.html").read_text(encoding="utf-8")

    critical_ids = [
        "productGrid", "resultCount", "catalogTitle", "categoryRow", "pagination", "emptyState",
        "productDetail", "productDialog", "cartDialog", "cartItems", "cartFooter", "toast",
        "favoritesToolbar", "shareFavorites", "searchForm", "searchInput", "sortSelect", "priceMin",
        "priceMax", "multiVariant", "filterToggle", "clearFilters", "emptyReset", "cartButton",
        "favoritesButton", "recentSection", "recentRow",
    ]
    missing_dom_ids = [item for item in critical_ids if f'id="{item}"' not in html_text]
    if missing_dom_ids:
        errors.append("missing DOM ids: " + ", ".join(missing_dom_ids))

    script_order = ["media-policy.js", "variants.js", "app.js", "search-fallback.js", "cart-feedback.js"]
    positions = [html_text.find(f'src="{name}"') for name in script_order]
    if any(pos < 0 for pos in positions) or positions != sorted(positions):
        errors.append("critical scripts missing or loaded in wrong order")

    architecture = {
        "compact_index_used": "catalog-index.json" in app_text,
        "legacy_catalog_not_fetched": "fetch(DATA_BASE+'catalog.json" not in app_text and 'fetch("catalog.json' not in app_text,
        "detail_fallback_present": "raw.githubusercontent.com" in media_text and "data/details" in media_text,
        "gallery_source_isolation_present": "mediaSourceId(path)===sourceId" in media_text,
        "stable_image_cache": "IMAGE_CACHE='forma-images-v1'" in sw_text,
        "cache_first_images": "async function imageCacheFirst" in sw_text and "if(cached)return cached" in sw_text,
        "service_worker_immediate": "navigator.serviceWorker.register('./sw.js'" in feedback_text and "window.addEventListener('load'" not in feedback_text.split("navigator.serviceWorker.register('./sw.js'")[0][-400:],
        "same_origin_media_rewrite": "localAssetUrl" in feedback_text and "GITHUB_PREFIX='/tetopt/assets/'" in feedback_text,
        "app_still_emits_github_asset_urls": "ASSET_BASE='https://gkkm8bm7rn-eng.github.io/tetopt/'" in app_text,
    }
    for key, ok in architecture.items():
        if key == "app_still_emits_github_asset_urls":
            if ok:
                warnings.append("app.js still initially emits GitHub Pages image URLs; runtime rewrite must win before request starts")
        elif not ok:
            errors.append(f"architecture check failed: {key}")

    primary_sizes.sort(reverse=True)
    large_300 = [x for x in primary_sizes if x[0] > 300_000]
    large_500 = [x for x in primary_sizes if x[0] > 500_000]

    hard_error_groups = {
        "missing_primary": missing_primary,
        "primary_wrong_source": primary_wrong_source,
        "missing_gallery": missing_gallery,
        "no_own_media": no_own_media,
        "index_detail_mismatch": index_detail_mismatch,
        "invalid_prices": invalid_prices,
        "unknown_assignment_sources": unknown_assignment_sources,
        "invalid_category_codes": invalid_category_codes,
        "names_with_packaging": names_with_packaging,
    }
    for name, values in hard_error_groups.items():
        if values:
            errors.append(f"{name}: {len(values)}")

    # Cross-source refs can be historical merged media. The runtime source-isolation policy
    # prevents them from being displayed for the wrong sourceId, but undeclared refs are suspicious.
    if undeclared_cross_gallery:
        warnings.append(f"undeclared cross-source gallery refs: {len(undeclared_cross_gallery)}")
    if primary_not_gallery:
        warnings.append(f"primary image absent from full gallery list: {len(primary_not_gallery)}")
    if large_300:
        warnings.append(f"primary images >300 KB: {len(large_300)}")

    return {
        "errors": errors,
        "warnings": warnings,
        "metrics": {
            "models": len(products),
            "variants": actual_variants,
            "detail_products": len(all_detail_products),
            "tracked_product_images": len(assets),
            "referenced_gallery_images": len(referenced_images),
            "cross_gallery_refs": len(cross_gallery),
            "undeclared_cross_gallery_refs": len(undeclared_cross_gallery),
            "primary_images_over_300kb": len(large_300),
            "primary_images_over_500kb": len(large_500),
            "largest_primary_images": [
                {"bytes": size, "product": pid, "sourceId": sid, "path": path}
                for size, pid, sid, path in primary_sizes[:15]
            ],
            "shell_bytes_before_images": shell_total,
            "shell_files": shell_sizes,
        },
        "architecture": architecture,
        "samples": {
            "undeclared_cross_gallery": undeclared_cross_gallery[:20],
            "cross_gallery": cross_gallery[:20],
            "primary_not_gallery": primary_not_gallery[:20],
            "large_primary": [x[3] for x in large_300[:20]],
        },
    }


def safe_int(text):
    try:
        return int((text or "0").strip())
    except Exception:
        return 0


def wait_images(page, count, timeout_ms):
    return page.wait_for_function(
        """count => {
          const imgs=[...document.querySelectorAll('#productGrid .product-image-stage img')].slice(0,count);
          return imgs.length===count && imgs.every(img=>img.complete && img.naturalWidth>0);
        }""",
        count,
        timeout=timeout_ms,
    )


def browser_case(pw, url, label, engine="chromium", device_name=None, slow=False, full_smoke=True):
    browser_type = getattr(pw, engine)
    browser = browser_type.launch(headless=True)
    if device_name:
        kwargs = dict(pw.devices[device_name])
        # Do not let a Chromium device descriptor force Chromium's UA into WebKit.
        if engine == "webkit":
            kwargs.pop("user_agent", None)
        context = browser.new_context(**kwargs)
    else:
        context = browser.new_context(viewport={"width": 1440, "height": 900})
    page = context.new_page()
    console_errors, page_errors, request_failures = [], [], []
    page.on("console", lambda msg: console_errors.append(msg.text) if msg.type == "error" else None)
    page.on("pageerror", lambda err: page_errors.append(str(err)))
    page.on("requestfailed", lambda req: request_failures.append(f"{req.method} {req.url}: {req.failure}"))

    if slow and engine == "chromium":
        session = context.new_cdp_session(page)
        session.send("Network.enable")
        session.send("Network.setCacheDisabled", {"cacheDisabled": True})
        session.send("Network.emulateNetworkConditions", {
            "offline": False,
            "latency": 400,
            "downloadThroughput": 50 * 1024,
            "uploadThroughput": 50 * 1024,
            "connectionType": "cellular3g",
        })

    checks = {}
    timings = {}
    t0 = time.perf_counter()
    try:
        page.goto(url, wait_until="domcontentloaded", timeout=90_000)
        page.wait_for_function("document.querySelectorAll('#productGrid .product-card').length>0", timeout=90_000)
        timings["catalog_ms"] = round((time.perf_counter() - t0) * 1000)
        first_image_count = 2 if device_name else 3
        try:
            wait_images(page, first_image_count, 90_000)
            checks["first_visible_images_loaded"] = True
        except Exception:
            checks["first_visible_images_loaded"] = False
        timings["first_images_ms"] = round((time.perf_counter() - t0) * 1000)

        card_count = page.locator("#productGrid .product-card").count()
        checks["catalog_cards_rendered"] = 1 <= card_count <= 24
        checks["no_catalog_unavailable"] = "Каталог временно недоступен" not in page.locator("body").inner_text()
        checks["no_horizontal_overflow"] = bool(page.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 3"))
        checks["header_actions_present"] = page.locator("#favoritesButton").count() == 1 and page.locator("#cartButton").count() == 1
        checks["search_present"] = page.locator("#searchInput").count() == 1 and page.locator("#searchForm").count() == 1

        first_img = page.locator("#productGrid .product-image-stage img").first
        first_src = first_img.get_attribute("src") or ""
        first_host = urlparse(first_src).hostname
        expected_host = urlparse(url).hostname
        checks["first_image_same_origin"] = first_host == expected_host
        checks["first_image_decoded"] = bool(first_img.evaluate("img=>img.naturalWidth>0"))
        loading_values = page.locator("#productGrid .product-image-stage img").evaluate_all("imgs=>imgs.slice(0,8).map(x=>({loading:x.loading,priority:x.getAttribute('fetchpriority'),src:x.src}))")

        grid_columns = page.locator("#productGrid").evaluate("el=>getComputedStyle(el).gridTemplateColumns")
        checks["grid_has_columns"] = bool(grid_columns and grid_columns != "none")

        source_id = page.locator("#productGrid .quick-add").first.get_attribute("data-source")

        if full_smoke:
            # Favorite.
            fav_before = safe_int(page.locator("#favoritesCount").inner_text())
            page.locator("#productGrid .favorite").first.click(timeout=10_000)
            page.wait_for_function("n => Number(document.querySelector('#favoritesCount').textContent) > n", fav_before, timeout=10_000)
            checks["favorite_toggle"] = True

            # Add to cart and cart drawer.
            cart_before = safe_int(page.locator("#cartCount").inner_text())
            add = page.locator("#productGrid .quick-add").first
            if add.is_visible():
                add.click(timeout=10_000)
            else:
                page.locator("#productGrid [data-card-cart-delta='1']").first.click(timeout=10_000)
            page.wait_for_function("n => Number(document.querySelector('#cartCount').textContent) > n", cart_before, timeout=10_000)
            checks["add_to_cart"] = True
            page.locator("#cartButton").click(timeout=10_000)
            page.wait_for_function("document.querySelector('#cartDialog').open===true", timeout=10_000)
            checks["cart_drawer"] = page.locator("#cartItems .cart-item").count() >= 1
            page.locator("[data-close-cart]").click(timeout=10_000)
            page.wait_for_function("document.querySelector('#cartDialog').open===false", timeout=10_000)

            # Variant selection if a selectable alternative is available.
            variant_control = page.locator("#productGrid .card-swatch:not(.active):not([disabled]), #productGrid .axis-swatch:not(.active):not([disabled]), #productGrid .variant-text:not(.active):not([disabled])")
            if variant_control.count():
                variant_control.first.click(timeout=10_000)
                page.wait_for_timeout(250)
                checks["variant_selector"] = True
            else:
                checks["variant_selector"] = "not_applicable_on_page"

            # Detail card + gallery + return.
            page.locator("#productGrid .product-image-stage").first.click(timeout=10_000)
            page.wait_for_function("document.querySelector('#productDialog').open===true && !!document.querySelector('#productDetail .detail')", timeout=30_000)
            checks["product_detail"] = True
            main_img = page.locator("#galleryMain")
            try:
                page.wait_for_function("document.querySelector('#galleryMain')?.complete && document.querySelector('#galleryMain')?.naturalWidth>0", timeout=30_000)
                checks["detail_main_image_loaded"] = True
            except Exception:
                checks["detail_main_image_loaded"] = False
            nav = page.locator("#productDetail [data-gallery-photo='1']")
            if nav.count():
                old_src = main_img.get_attribute("src")
                nav.click(timeout=10_000)
                page.wait_for_function("old => document.querySelector('#galleryMain')?.src !== old", old_src, timeout=10_000)
                checks["detail_gallery_navigation"] = True
            else:
                checks["detail_gallery_navigation"] = "single_image"
            page.locator("[data-close-dialog]").click(timeout=10_000)
            page.wait_for_function("document.querySelector('#productDialog').open===false", timeout=15_000)
            checks["recent_products"] = page.locator("#recentSection:not([hidden]) .recent-card").count() >= 1

            # Category.
            page.locator(".category-primary [data-main-category='office']").click(timeout=10_000)
            page.wait_for_function("document.querySelector('#catalogTitle').textContent.includes('Офис')", timeout=10_000)
            checks["category_filter"] = page.locator("#productGrid .product-card").count() >= 1

            # Numeric article search.
            page.locator("#searchInput").fill(str(source_id))
            page.locator("#searchForm .search-submit").click(timeout=10_000)
            page.wait_for_function("document.querySelector('#catalogTitle').textContent.startsWith('Поиск:')", timeout=10_000)
            checks["article_search"] = page.locator("#productGrid .product-card").count() >= 1

            # Clear search and pagination.
            page.locator("#searchInput").fill("")
            page.locator("#searchForm .search-submit").click(timeout=10_000)
            page.wait_for_timeout(200)
            page2 = page.locator("#pagination [data-page='2']")
            if page2.count():
                page2.click(timeout=10_000)
                page.wait_for_function("location.hash.includes('page=2')", timeout=10_000)
                checks["pagination"] = True
            else:
                checks["pagination"] = "not_applicable"

            # Favorites view should contain the item saved above.
            page.locator("#favoritesButton").click(timeout=10_000)
            page.wait_for_function("document.querySelector('#catalogTitle').textContent==='Избранное'", timeout=10_000)
            checks["favorites_view"] = page.locator("#productGrid .product-card").count() >= 1

        screenshot = SCREEN_DIR / f"{label}.png"
        page.screenshot(path=str(screenshot), full_page=False)

        # Reload in the same profile under throttling: this is the repeat-visit cache test.
        if slow and engine == "chromium":
            session.send("Network.setCacheDisabled", {"cacheDisabled": False})
            t1 = time.perf_counter()
            page.goto(url, wait_until="domcontentloaded", timeout=90_000)
            page.wait_for_function("document.querySelectorAll('#productGrid .product-card').length>0", timeout=90_000)
            try:
                wait_images(page, first_image_count, 90_000)
                checks["repeat_visible_images_loaded"] = True
            except Exception:
                checks["repeat_visible_images_loaded"] = False
            timings["repeat_first_images_ms"] = round((time.perf_counter() - t1) * 1000)
            checks["service_worker_controls_repeat"] = bool(page.evaluate("!!navigator.serviceWorker?.controller"))
            checks["image_cache_exists_repeat"] = bool(page.evaluate("caches.keys().then(xs=>xs.some(x=>x.startsWith('forma-images')))"))

        critical_false = [key for key, value in checks.items() if value is False]
        return {
            "label": label,
            "url": url,
            "engine": engine,
            "device": device_name or "desktop-1440x900",
            "slow_3g": slow,
            "timings": timings,
            "checks": checks,
            "critical_false": critical_false,
            "first_image_src": first_src,
            "first_image_host": first_host,
            "expected_host": expected_host,
            "first_8_image_loading": loading_values,
            "grid_columns": grid_columns,
            "console_errors": console_errors[:20],
            "page_errors": page_errors[:20],
            "request_failures": request_failures[:30],
        }
    except Exception as exc:
        try:
            page.screenshot(path=str(SCREEN_DIR / f"{label}-failure.png"), full_page=False)
        except Exception:
            pass
        return {
            "label": label,
            "url": url,
            "engine": engine,
            "device": device_name or "desktop-1440x900",
            "slow_3g": slow,
            "fatal": repr(exc),
            "checks": checks,
            "timings": timings,
            "console_errors": console_errors[:20],
            "page_errors": page_errors[:20],
            "request_failures": request_failures[:30],
        }
    finally:
        context.close()
        browser.close()


def live_audit():
    from playwright.sync_api import sync_playwright
    cases = []
    with sync_playwright() as pw:
        # Normal network: desktop Chromium, Android-like Chromium and iPhone WebKit.
        for url, prefix in ((WORKER_URL, "worker"), (PAGES_URL, "pages")):
            cases.append(browser_case(pw, url, f"{prefix}-desktop", "chromium", None, False, True))
            cases.append(browser_case(pw, url, f"{prefix}-android", "chromium", "Pixel 5", False, True))
            cases.append(browser_case(pw, url, f"{prefix}-iphone", "webkit", "iPhone 13", False, True))
        # First-visit and repeat-visit behavior on Chrome Slow 3G.
        cases.append(browser_case(pw, WORKER_URL, "worker-android-slow3g", "chromium", "Pixel 5", True, False))
        cases.append(browser_case(pw, WORKER_URL, "worker-desktop-slow3g", "chromium", None, True, False))
        cases.append(browser_case(pw, PAGES_URL, "pages-android-slow3g", "chromium", "Pixel 5", True, False))
    return cases


def main():
    report = {
        "source_commit": subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip(),
        "catalog": catalog_audit(),
        "live": [],
    }
    try:
        report["live"] = live_audit()
    except Exception as exc:
        report["live_fatal"] = repr(exc)

    REPORT_PATH.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))

    source_errors = report["catalog"]["errors"]
    live_failures = []
    for case in report.get("live", []):
        if case.get("fatal"):
            live_failures.append(f"{case['label']}: fatal {case['fatal']}")
        elif case.get("critical_false"):
            live_failures.append(f"{case['label']}: {case['critical_false']}")
        if case.get("page_errors"):
            live_failures.append(f"{case['label']}: page errors {case['page_errors']}")
    if report.get("live_fatal"):
        live_failures.append(report["live_fatal"])

    print("\n=== AUDIT SUMMARY ===")
    print(f"Source errors: {len(source_errors)}")
    print(f"Source warnings: {len(report['catalog']['warnings'])}")
    print(f"Live cases: {len(report.get('live', []))}")
    print(f"Live failures: {len(live_failures)}")
    if source_errors:
        print("SOURCE ERRORS:")
        for item in source_errors[:50]:
            print(" -", item)
    if live_failures:
        print("LIVE FAILURES:")
        for item in live_failures[:50]:
            print(" -", item)
    return 1 if source_errors or live_failures else 0


if __name__ == "__main__":
    sys.exit(main())
