#!/usr/bin/env python3
import argparse
import json
import re
import sys
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]
DATA_ROOT = ROOT / "data"
INDEX_PATH = DATA_ROOT / "catalog-index.json"
DETAIL_ROOT = DATA_ROOT / "details"

EXPECTED_INDEX_SCHEMA = 3
EXPECTED_DETAIL_SCHEMA = 2
COMPARE_FIELDS = ("specs", "wholesalePrice", "retailPrice", "primaryImage", "axes")
MEDIA_SOURCE_RE = re.compile(r"^assets/products/([^/]+)/")
MAX_SAMPLES = 20


def load_json(path, errors):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        errors.append(f"Missing JSON file: {path.relative_to(ROOT)}")
    except json.JSONDecodeError as exc:
        errors.append(
            f"Invalid JSON in {path.relative_to(ROOT)}: line {exc.lineno}, column {exc.colno}: {exc.msg}"
        )
    return None


def is_remote(value):
    return isinstance(value, str) and urlparse(value).scheme in {"http", "https"}


def local_asset_exists(value):
    if not isinstance(value, str) or not value or is_remote(value):
        return True
    return (ROOT / value.lstrip("/")).is_file()


def media_source_id(value):
    if not isinstance(value, str) or is_remote(value):
        return None
    match = MEDIA_SOURCE_RE.match(value.lstrip("/"))
    return match.group(1) if match else None


def source_key(variant):
    value = variant.get("sourceId")
    return None if value is None else str(value)


def value_equal(left, right):
    if isinstance(left, (int, float)) and isinstance(right, (int, float)):
        return float(left) == float(right)
    return left == right


def sample(bucket, value):
    if len(bucket) < MAX_SAMPLES:
        bucket.append(value)


def new_media_audit():
    return {
        "crossGalleryRefs": 0,
        "legacyMergedRefs": 0,
        "undeclaredCrossRefs": 0,
        "crossPrimaryImages": 0,
        "affectedProducts": set(),
        "affectedVariants": set(),
        "legacyVariants": set(),
        "undeclaredVariants": set(),
        "variantsWithoutOwnMedia": set(),
        "foreignSourceIds": set(),
        "legacySamples": [],
        "undeclaredSamples": [],
        "noOwnMediaSamples": [],
        "crossPrimarySamples": [],
    }


def validate_detail_media(product_id, variant, errors, warnings, media_audit):
    source_id = source_key(variant)
    if source_id is None:
        return

    primary = variant.get("primaryImage")
    if not primary:
        errors.append(f"{product_id}/{source_id}: missing detail primaryImage.")
    elif not local_asset_exists(primary):
        errors.append(f"{product_id}/{source_id}: missing detail primary image file {primary}.")

    primary_source = media_source_id(primary)
    if primary_source and primary_source != source_id:
        media_audit["crossPrimaryImages"] += 1
        media_audit["affectedProducts"].add(product_id)
        media_audit["affectedVariants"].add(f"{product_id}/{source_id}")
        sample(media_audit["crossPrimarySamples"], f"{product_id}/{source_id}: {primary}")
        errors.append(
            f"{product_id}/{source_id}: primaryImage points to source {primary_source}: {primary}."
        )

    images = variant.get("images")
    if images is None:
        warnings.append(f"{product_id}/{source_id}: detail images list is missing.")
        return
    if not isinstance(images, list):
        errors.append(f"{product_id}/{source_id}: images must be an array.")
        return

    if variant.get("localImageCount") is not None and variant.get("localImageCount") != len(images):
        errors.append(
            f"{product_id}/{source_id}: localImageCount={variant.get('localImageCount')!r}, actual={len(images)}."
        )

    merged_ids = {str(value) for value in variant.get("mergedDuplicateSourceIds", []) if value is not None}
    own_images = []
    cross_images = []
    seen_images = set()

    for image in images:
        if not isinstance(image, str) or not image:
            errors.append(f"{product_id}/{source_id}: invalid image path {image!r}.")
            continue
        if image in seen_images:
            warnings.append(f"{product_id}/{source_id}: duplicate gallery image {image}.")
        seen_images.add(image)
        if not local_asset_exists(image):
            errors.append(f"{product_id}/{source_id}: missing gallery image file {image}.")

        folder_source = media_source_id(image)
        if folder_source == source_id:
            own_images.append(image)
        elif folder_source:
            cross_images.append((image, folder_source))

    if primary and images and primary not in images:
        warnings.append(f"{product_id}/{source_id}: primaryImage is not present in images.")

    if not cross_images:
        return

    variant_key = f"{product_id}/{source_id}"
    media_audit["affectedProducts"].add(product_id)
    media_audit["affectedVariants"].add(variant_key)

    if not own_images:
        media_audit["variantsWithoutOwnMedia"].add(variant_key)
        sample(
            media_audit["noOwnMediaSamples"],
            f"{variant_key}: {len(cross_images)} foreign image(s), no own-source image",
        )
        errors.append(
            f"{variant_key}: gallery has cross-source images but no images from its own source folder."
        )

    for image, folder_source in cross_images:
        media_audit["crossGalleryRefs"] += 1
        media_audit["foreignSourceIds"].add(folder_source)
        entry = f"{variant_key}: source {folder_source} -> {image}"
        if folder_source in merged_ids:
            media_audit["legacyMergedRefs"] += 1
            media_audit["legacyVariants"].add(variant_key)
            sample(media_audit["legacySamples"], entry)
        else:
            media_audit["undeclaredCrossRefs"] += 1
            media_audit["undeclaredVariants"].add(variant_key)
            sample(media_audit["undeclaredSamples"], entry)
            warnings.append(
                f"{variant_key}: gallery references undeclared source {folder_source}: {image}."
            )


def main():
    parser = argparse.ArgumentParser(description="Validate storefront catalog/index/detail integrity.")
    parser.add_argument(
        "--strict-warnings",
        action="store_true",
        help="Treat warnings as validation failures.",
    )
    args = parser.parse_args()

    errors = []
    warnings = []
    media_audit = new_media_audit()
    index = load_json(INDEX_PATH, errors)
    if index is None:
        print_report(errors, warnings, {}, media_audit)
        return 1

    if not isinstance(index, dict):
        errors.append("data/catalog-index.json must be a JSON object.")
        print_report(errors, warnings, {}, media_audit)
        return 1

    if index.get("schemaVersion") != EXPECTED_INDEX_SCHEMA:
        errors.append(
            f"catalog-index schemaVersion must be {EXPECTED_INDEX_SCHEMA}, got {index.get('schemaVersion')!r}."
        )

    products = index.get("products")
    if not isinstance(products, list):
        errors.append("catalog-index products must be an array.")
        print_report(errors, warnings, {}, media_audit)
        return 1

    index_product_ids = set()
    global_index_sources = {}
    referenced_shards = set()
    index_variants = 0
    index_dual_axis_variants = 0

    for position, product in enumerate(products):
        ctx = f"catalog-index product #{position + 1}"
        if not isinstance(product, dict):
            errors.append(f"{ctx} must be an object.")
            continue
        product_id = product.get("id")
        if not isinstance(product_id, str) or not product_id:
            errors.append(f"{ctx} has invalid id: {product_id!r}.")
            continue
        if product_id in index_product_ids:
            errors.append(f"Duplicate product id in catalog-index: {product_id}.")
        index_product_ids.add(product_id)

        variants = product.get("variants")
        if not isinstance(variants, list):
            errors.append(f"{product_id}: variants must be an array.")
            continue
        index_variants += len(variants)
        if product.get("variantCount") != len(variants):
            errors.append(
                f"{product_id}: variantCount={product.get('variantCount')!r}, actual={len(variants)}."
            )

        shard_rel = product.get("detailShard")
        if not isinstance(shard_rel, str) or not shard_rel:
            errors.append(f"{product_id}: missing detailShard.")
            continue
        shard_path = DATA_ROOT / shard_rel
        try:
            shard_path.relative_to(DETAIL_ROOT)
        except ValueError:
            errors.append(f"{product_id}: detailShard escapes data/details: {shard_rel!r}.")
            continue
        referenced_shards.add(shard_path)

        product_sources = set()
        for variant in variants:
            if not isinstance(variant, dict):
                errors.append(f"{product_id}: variant entry must be an object.")
                continue
            source_id = source_key(variant)
            if source_id is None:
                errors.append(f"{product_id}: variant without sourceId.")
                continue
            if source_id in product_sources:
                errors.append(f"{product_id}: duplicate sourceId {source_id} inside product.")
            product_sources.add(source_id)
            previous = global_index_sources.get(source_id)
            if previous and previous != product_id:
                errors.append(
                    f"sourceId {source_id} appears in multiple catalog products: {previous}, {product_id}."
                )
            global_index_sources[source_id] = product_id

            axes = variant.get("axes") or {}
            if isinstance(axes, dict) and axes.get("soft") and axes.get("hard"):
                index_dual_axis_variants += 1

            primary = variant.get("primaryImage")
            if not primary:
                errors.append(f"{product_id}/{source_id}: missing primaryImage in catalog-index.")
            elif not local_asset_exists(primary):
                errors.append(f"{product_id}/{source_id}: missing primary image file {primary}.")
            primary_source = media_source_id(primary)
            if primary_source and primary_source != source_id:
                errors.append(
                    f"{product_id}/{source_id}: catalog primaryImage points to source {primary_source}: {primary}."
                )

            for price_field in ("wholesalePrice", "retailPrice"):
                price = variant.get(price_field)
                if not isinstance(price, (int, float)) or price < 0:
                    errors.append(f"{product_id}/{source_id}: invalid {price_field}={price!r}.")

    stats = index.get("stats")
    if isinstance(stats, dict):
        expected_stats = {
            "models": len(products),
            "variants": index_variants,
            "dualAxisVariants": index_dual_axis_variants,
        }
        for key, expected in expected_stats.items():
            if key in stats and stats.get(key) != expected:
                errors.append(f"catalog-index stats.{key}={stats.get(key)!r}, actual={expected}.")
    else:
        warnings.append("catalog-index stats object is missing.")

    shard_cache = {}
    detail_product_locations = {}
    global_detail_sources = {}

    for shard_path in sorted(DETAIL_ROOT.glob("*.json")):
        shard = load_json(shard_path, errors)
        if shard is None:
            continue
        shard_cache[shard_path] = shard
        if not isinstance(shard, dict):
            errors.append(f"{shard_path.relative_to(ROOT)} must be a JSON object.")
            continue
        if shard.get("schemaVersion") != EXPECTED_DETAIL_SCHEMA:
            errors.append(
                f"{shard_path.relative_to(ROOT)} schemaVersion must be {EXPECTED_DETAIL_SCHEMA}, "
                f"got {shard.get('schemaVersion')!r}."
            )
        shard_products = shard.get("products")
        if not isinstance(shard_products, dict):
            errors.append(f"{shard_path.relative_to(ROOT)} products must be an object keyed by product id.")
            continue

        for key, product in shard_products.items():
            if not isinstance(product, dict):
                errors.append(f"{shard_path.relative_to(ROOT)} product {key!r} must be an object.")
                continue
            product_id = product.get("id")
            if product_id != key:
                errors.append(
                    f"{shard_path.relative_to(ROOT)} product key {key!r} does not match id {product_id!r}."
                )
            if isinstance(product_id, str):
                previous = detail_product_locations.get(product_id)
                if previous and previous != shard_path:
                    errors.append(
                        f"Detail product {product_id} appears in multiple shards: "
                        f"{previous.relative_to(ROOT)}, {shard_path.relative_to(ROOT)}."
                    )
                detail_product_locations[product_id] = shard_path

            variants = product.get("variants")
            if not isinstance(variants, list):
                errors.append(f"{product_id or key}: detail variants must be an array.")
                continue
            if product.get("variantCount") != len(variants):
                errors.append(
                    f"{product_id or key}: detail variantCount={product.get('variantCount')!r}, actual={len(variants)}."
                )

            product_sources = set()
            for variant in variants:
                if not isinstance(variant, dict):
                    errors.append(f"{product_id or key}: detail variant entry must be an object.")
                    continue
                source_id = source_key(variant)
                if source_id is None:
                    errors.append(f"{product_id or key}: detail variant without sourceId.")
                    continue
                if source_id in product_sources:
                    errors.append(f"{product_id or key}: duplicate detail sourceId {source_id}.")
                product_sources.add(source_id)
                previous = global_detail_sources.get(source_id)
                if previous and previous != (product_id or key):
                    errors.append(
                        f"sourceId {source_id} appears in multiple detail products: {previous}, {product_id or key}."
                    )
                global_detail_sources[source_id] = product_id or key
                validate_detail_media(product_id or key, variant, errors, warnings, media_audit)

    for shard_path in referenced_shards:
        if shard_path not in shard_cache:
            errors.append(f"Referenced detail shard does not exist or is invalid: {shard_path.relative_to(ROOT)}.")

    for product in products:
        if not isinstance(product, dict) or not isinstance(product.get("id"), str):
            continue
        product_id = product["id"]
        shard_rel = product.get("detailShard")
        if not isinstance(shard_rel, str):
            continue
        shard_path = DATA_ROOT / shard_rel
        shard = shard_cache.get(shard_path)
        if not shard or not isinstance(shard.get("products"), dict):
            continue
        detail = shard["products"].get(product_id)
        if not isinstance(detail, dict):
            actual = detail_product_locations.get(product_id)
            if actual:
                errors.append(
                    f"{product_id}: catalog-index points to {shard_rel}, but detail product is in "
                    f"{actual.relative_to(DATA_ROOT)}."
                )
            else:
                errors.append(f"{product_id}: missing from referenced detail shard {shard_rel}.")
            continue

        compact_by_source = {
            source_key(v): v
            for v in product.get("variants", [])
            if isinstance(v, dict) and source_key(v) is not None
        }
        full_by_source = {
            source_key(v): v
            for v in detail.get("variants", [])
            if isinstance(v, dict) and source_key(v) is not None
        }
        index_sources = set(compact_by_source)
        detail_sources = set(full_by_source)
        if index_sources != detail_sources:
            missing_detail = sorted(index_sources - detail_sources)
            missing_index = sorted(detail_sources - index_sources)
            if missing_detail:
                errors.append(f"{product_id}: sourceIds missing from detail: {', '.join(missing_detail)}.")
            if missing_index:
                errors.append(f"{product_id}: sourceIds missing from catalog-index: {', '.join(missing_index)}.")

        for source_id in sorted(index_sources & detail_sources):
            compact = compact_by_source[source_id]
            full = full_by_source[source_id]
            for field in COMPARE_FIELDS:
                if field not in compact and field not in full:
                    continue
                if not value_equal(compact.get(field), full.get(field)):
                    errors.append(
                        f"{product_id}/{source_id}: {field} differs between catalog-index and detail "
                        f"({compact.get(field)!r} != {full.get(field)!r})."
                    )

    orphan_details = sorted(set(detail_product_locations) - index_product_ids)
    if orphan_details:
        warnings.append(
            f"{len(orphan_details)} detail product(s) are not present in catalog-index: "
            + ", ".join(orphan_details[:12])
            + (" ..." if len(orphan_details) > 12 else "")
        )

    summary = {
        "models": len(products),
        "indexVariants": index_variants,
        "detailProducts": len(detail_product_locations),
        "detailVariants": len(global_detail_sources),
        "referencedShards": len(referenced_shards),
        "errors": len(errors),
        "warnings": len(warnings),
    }
    print_report(errors, warnings, summary, media_audit)
    return 1 if errors or (args.strict_warnings and warnings) else 0


def printable_media_audit(audit):
    return {
        "crossGalleryRefs": audit["crossGalleryRefs"],
        "legacyMergedRefs": audit["legacyMergedRefs"],
        "undeclaredCrossRefs": audit["undeclaredCrossRefs"],
        "crossPrimaryImages": audit["crossPrimaryImages"],
        "affectedProducts": len(audit["affectedProducts"]),
        "affectedVariants": len(audit["affectedVariants"]),
        "legacyVariants": len(audit["legacyVariants"]),
        "undeclaredVariants": len(audit["undeclaredVariants"]),
        "variantsWithoutOwnMedia": len(audit["variantsWithoutOwnMedia"]),
        "foreignSourceIds": len(audit["foreignSourceIds"]),
    }


def print_samples(title, values):
    if not values:
        return
    print(f"\n{title} (up to {MAX_SAMPLES}):")
    for value in values:
        print(f"- {value}")


def print_report(errors, warnings, summary, media_audit):
    print("Catalog integrity validation")
    if summary:
        print(json.dumps(summary, ensure_ascii=False, sort_keys=True))
    print("Media cross-source classification")
    print(json.dumps(printable_media_audit(media_audit), ensure_ascii=False, sort_keys=True))

    if errors:
        print("\nERRORS:")
        for item in errors:
            print(f"- {item}")
    if warnings:
        print("\nWARNINGS:")
        for item in warnings[:100]:
            print(f"- {item}")
        if len(warnings) > 100:
            print(f"- ... {len(warnings) - 100} more warning(s) omitted")

    print_samples("LEGACY MERGED MEDIA", media_audit["legacySamples"])
    print_samples("UNDECLARED CROSS-SOURCE MEDIA", media_audit["undeclaredSamples"])
    print_samples("CROSS-SOURCE VARIANTS WITHOUT OWN MEDIA", media_audit["noOwnMediaSamples"])
    print_samples("CROSS-SOURCE PRIMARY IMAGES", media_audit["crossPrimarySamples"])

    if not errors and not warnings:
        print("\nOK: no blocking or suspicious integrity issues found.")
    elif not errors:
        print("\nOK: no blocking integrity errors found.")


if __name__ == "__main__":
    sys.exit(main())
