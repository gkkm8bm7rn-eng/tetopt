#!/usr/bin/env python3
from __future__ import annotations
import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
INDEX = ROOT / "data" / "catalog-index.json"
DETAILS = ROOT / "data" / "details"


def load_main_prices():
    text = subprocess.check_output(
        ["git", "show", "origin/main:catalog-source.html"],
        cwd=ROOT,
        text=True,
        encoding="utf-8",
    )
    token = "const PRODUCTS = "
    start = text.index(token) + len(token)
    products, _ = json.JSONDecoder().raw_decode(text[start:])
    prices = {}
    for p in products:
        sid = int(p["id"])
        prices[sid] = int(p.get("wholesalePrice") or 0)
    return prices


def projection(obj):
    if isinstance(obj, dict):
        return {k: projection(v) for k, v in obj.items() if k != "wholesalePrice"}
    if isinstance(obj, list):
        return [projection(v) for v in obj]
    return obj


def update_variants(obj, price_by_source, changes):
    count = 0
    missing = []
    if isinstance(obj, dict):
        if "sourceId" in obj and "wholesalePrice" in obj:
            sid = int(obj["sourceId"])
            if sid not in price_by_source:
                missing.append(sid)
            else:
                count += 1
                old = int(obj.get("wholesalePrice") or 0)
                new = int(price_by_source[sid])
                if old != new:
                    changes.append((sid, old, new))
                    obj["wholesalePrice"] = new
        for v in obj.values():
            c, m = update_variants(v, price_by_source, changes)
            count += c
            missing.extend(m)
    elif isinstance(obj, list):
        for v in obj:
            c, m = update_variants(v, price_by_source, changes)
            count += c
            missing.extend(m)
    return count, missing


def update_file(path, price_by_source):
    original_text = path.read_text(encoding="utf-8")
    data = json.loads(original_text)
    before_projection = projection(data)
    before_retail = []

    def collect_retail(x):
        if isinstance(x, dict):
            if "sourceId" in x and "retailPrice" in x:
                before_retail.append((int(x["sourceId"]), x.get("retailPrice")))
            for v in x.values(): collect_retail(v)
        elif isinstance(x, list):
            for v in x: collect_retail(v)
    collect_retail(data)

    changes = []
    count, missing = update_variants(data, price_by_source, changes)
    assert not missing, f"{path}: sourceIds absent in main: {sorted(set(missing))[:20]}"
    assert projection(data) == before_projection, f"{path}: non-wholesale data changed"

    after_retail = []
    def collect_retail_after(x):
        if isinstance(x, dict):
            if "sourceId" in x and "retailPrice" in x:
                after_retail.append((int(x["sourceId"]), x.get("retailPrice")))
            for v in x.values(): collect_retail_after(v)
        elif isinstance(x, list):
            for v in x: collect_retail_after(v)
    collect_retail_after(data)
    assert after_retail == before_retail, f"{path}: retail prices changed"

    if changes:
        path.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    return count, changes


def main():
    price_by_source = load_main_prices()
    files = [INDEX] + sorted(DETAILS.glob("*.json"))
    total_occurrences = 0
    all_changes = []
    changed_files = []
    for path in files:
        count, changes = update_file(path, price_by_source)
        total_occurrences += count
        if changes:
            changed_files.append(str(path.relative_to(ROOT)))
            all_changes.extend((str(path.relative_to(ROOT)), *c) for c in changes)

    index = json.loads(INDEX.read_text(encoding="utf-8"))
    index_prices = {}
    for product in index["products"]:
        for v in product["variants"]:
            index_prices[int(v["sourceId"])] = int(v["wholesalePrice"])
    detail_prices = {}
    for path in sorted(DETAILS.glob("*.json")):
        shard = json.loads(path.read_text(encoding="utf-8"))
        for product in shard["products"].values():
            for v in product["variants"]:
                detail_prices[int(v["sourceId"])] = int(v["wholesalePrice"])

    assert len(index_prices) == int(index["stats"]["variants"]), "catalog-index variant count mismatch"
    assert set(index_prices) == set(detail_prices), "index/detail sourceId sets differ"
    assert index_prices == detail_prices, "index/detail wholesale prices differ"
    assert all(index_prices[sid] == price_by_source[sid] for sid in index_prices), "Atelier price differs from approved main price"

    report = {
        "mainPriceRecords": len(price_by_source),
        "atelierVariants": len(index_prices),
        "variantOccurrencesChecked": total_occurrences,
        "uniqueChangedVariants": len({c[1] for c in all_changes}),
        "changedOccurrences": len(all_changes),
        "changedFiles": changed_files,
        "retailPricesUnchanged": True,
        "onlyWholesaleFieldsChanged": True,
        "indexAndDetailsConsistent": True,
        "allAtelierPricesEqualApprovedMain": True,
    }
    print(json.dumps(report, ensure_ascii=False, indent=2))
    for row in all_changes[:40]:
        print(f"CHANGE {row[0]} sourceId={row[1]}: {row[2]} -> {row[3]}")


if __name__ == "__main__":
    main()
