from __future__ import annotations

import base64
import gzip
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "catalog-source.html"
BLUEPRINT = ROOT / "tools" / "catalog-grouping-blueprint.b64"
OUT = ROOT / "review-output"


def load_products():
    text = SOURCE.read_text(encoding="utf-8")
    match = re.search(r"const PRODUCTS\s*=\s*(\[.*?\]);\s*\n\s*const ", text, re.S)
    if not match:
        raise SystemExit("PRODUCTS array not found")
    return json.loads(match.group(1))


def load_blueprint():
    packed = base64.b64decode(BLUEPRINT.read_text(encoding="utf-8").strip())
    return json.loads(gzip.decompress(packed).decode("utf-8"))


def clean_asset(value):
    if not isinstance(value, str):
        return None
    value = re.sub(r"[?#].*$", "", value.strip())
    return value if value.startswith("assets/") else None


def unique_existing(paths):
    out = []
    seen = set()
    for value in paths:
        path = clean_asset(value)
        if not path or path in seen:
            continue
        if not (ROOT / path).exists():
            continue
        seen.add(path)
        out.append(path)
    return out


def confirmed_covers():
    result = {}
    for path in sorted((ROOT / "data").glob("confirmed-photo-release-batch-*.json")):
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            continue
        for row in data.get("products", []):
            pid = int(row.get("product_id", 0) or 0)
            cover = clean_asset(row.get("cover"))
            if pid and cover and (ROOT / cover).exists():
                result[pid] = {"cover": cover, "manifest": str(path.relative_to(ROOT))}
    return result


def color_label(specs):
    text = str(specs or "")
    # Keep the commercial wording from specs rather than inventing a new color name.
    head = text.split(",")[:3]
    return " / ".join(part.strip() for part in head if part.strip()) or "Вариант"


def main():
    products = load_products()
    by_id = {int(p.get("id", 0)): p for p in products if int(p.get("id", 0) or 0)}
    blueprint = load_blueprint()
    cover_map = confirmed_covers()
    duplicate_map = {}
    duplicates_by_kept = {}
    for removed, kept in blueprint.get("dups", []):
        removed = int(removed)
        kept = int(kept)
        duplicate_map[removed] = kept
        duplicates_by_kept.setdefault(kept, []).append(removed)

    result_models = []
    seen_variant_ids = set()
    verified_primary_count = 0
    variants_with_extra_photos = 0
    local_photo_count = 0

    for model_index, source_ids in enumerate(blueprint.get("models", []), 1):
        source_ids = [int(x) for x in source_ids]
        rows = [by_id[x] for x in source_ids if x in by_id]
        if not rows:
            continue
        first = rows[0]
        variants = []
        for source_id in source_ids:
            product = by_id.get(source_id)
            if not product:
                raise SystemExit(f"Blueprint source ID missing from current catalog-source.html: {source_id}")
            if source_id in seen_variant_ids:
                raise SystemExit(f"Duplicate variant source ID in blueprint: {source_id}")
            seen_variant_ids.add(source_id)

            merged_ids = [source_id, *duplicates_by_kept.get(source_id, [])]
            verified_candidates = []
            for candidate_id in merged_ids:
                info = cover_map.get(candidate_id)
                if info:
                    verified_candidates.append((candidate_id, info))

            current_local = unique_existing([
                product.get("directImage"),
                *(product.get("images") or []),
            ])
            merged_local = list(current_local)
            for duplicate_id in duplicates_by_kept.get(source_id, []):
                duplicate = by_id.get(duplicate_id)
                if not duplicate:
                    continue
                merged_local.extend(unique_existing([
                    duplicate.get("directImage"),
                    *(duplicate.get("images") or []),
                ]))
            merged_local = unique_existing(merged_local)

            primary = None
            primary_verified = False
            primary_source_id = source_id
            primary_manifest = None
            if verified_candidates:
                # Prefer the surviving card's own verified cover; otherwise a verified cover
                # from an exact duplicate is safe because the duplicate represents the same item.
                verified_candidates.sort(key=lambda pair: (pair[0] != source_id, pair[0]))
                primary_source_id, info = verified_candidates[0]
                primary = info["cover"]
                primary_manifest = info["manifest"]
                primary_verified = True
            elif current_local:
                primary = current_local[0]

            if primary:
                merged_local = [primary, *[x for x in merged_local if x != primary]]
            if primary_verified:
                verified_primary_count += 1
            if len(merged_local) > len(current_local):
                variants_with_extra_photos += 1
            local_photo_count += len(merged_local)

            variants.append({
                "sourceId": source_id,
                "name": product.get("name"),
                "category": product.get("category"),
                "collection": product.get("collection"),
                "specs": product.get("specs"),
                "wholesalePrice": product.get("wholesalePrice"),
                "retailPrice": product.get("retailPrice"),
                "primaryImage": primary,
                "primaryImageVerified": primary_verified,
                "primaryImageSourceId": primary_source_id,
                "primaryImageManifest": primary_manifest,
                "images": merged_local,
                "localImageCount": len(merged_local),
                "mergedDuplicateSourceIds": duplicates_by_kept.get(source_id, []),
            })

        result_models.append({
            "id": f"model-{model_index}",
            "name": first.get("name"),
            "category": first.get("category"),
            "collection": first.get("collection"),
            "variantCount": len(variants),
            "variants": variants,
        })

    expected_models = len(blueprint.get("models", []))
    expected_variants = sum(len(x) for x in blueprint.get("models", []))
    if len(result_models) != expected_models:
        raise SystemExit(f"Model count mismatch: {len(result_models)} != {expected_models}")
    if len(seen_variant_ids) != expected_variants:
        raise SystemExit(f"Variant count mismatch: {len(seen_variant_ids)} != {expected_variants}")

    payload = {
        "schemaVersion": 2,
        "source": "catalog-source.html + current local assets + verified cover manifests",
        "imagePolicy": {
            "primary": "verified clear full-product front or front-three-quarter cover when available",
            "fallback": "current local gallery order from catalog-source.html",
            "extraPhotos": "exact-duplicate local galleries are merged into the surviving variant",
            "localOnly": True,
        },
        "stats": {
            "models": len(result_models),
            "variants": len(seen_variant_ids),
            "duplicateRowsReusedForExtraPhotos": sum(len(v) for v in duplicates_by_kept.values()),
            "variantsWithExtraPhotosFromDuplicates": variants_with_extra_photos,
            "verifiedPrimaryImages": verified_primary_count,
            "unverifiedPrimaryImages": len(seen_variant_ids) - verified_primary_count,
            "localPhotoReferences": local_photo_count,
        },
        "validation": {
            "allSourceIdsUnique": len(seen_variant_ids) == expected_variants,
            "allImagePathsLocal": True,
            "allReferencedImagesExist": True,
            "modelCountMatchesBlueprint": len(result_models) == expected_models,
            "variantCountMatchesBlueprint": len(seen_variant_ids) == expected_variants,
        },
        "products": result_models,
    }

    OUT.mkdir(exist_ok=True)
    target = OUT / "catalog-local-photos.json"
    target.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    (OUT / "catalog-local-photos-audit.json").write_text(
        json.dumps({"stats": payload["stats"], "validation": payload["validation"]}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(json.dumps(payload["stats"], ensure_ascii=False))


if __name__ == "__main__":
    main()
