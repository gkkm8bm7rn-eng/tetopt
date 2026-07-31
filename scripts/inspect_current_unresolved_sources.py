#!/usr/bin/env python3
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

MARKER = "    const PRODUCTS = "


def products() -> list[dict]:
    html = Path("catalog-source.html").read_text(encoding="utf-8")
    start = html.index(MARKER) + len(MARKER)
    end = html.index(";\n", start)
    return json.loads(html[start:end])


def main() -> int:
    progress = json.loads(Path("photo-processing-progress.json").read_text(encoding="utf-8"))
    batch = int(progress.get("inProgressBatch") or 0)
    unresolved = list(map(int, progress.get("unresolvedIds", [])))
    if not batch or not unresolved:
        raise RuntimeError("Нет текущей партии со спорными товарами")

    by_id = {int(item["id"]): item for item in products()}
    selected = [by_id[item_id] for item_id in unresolved if item_id in by_id]
    if len(selected) != len(unresolved):
        missing = sorted(set(unresolved) - {int(item["id"]) for item in selected})
        raise RuntimeError(f"Не найдены товары: {missing}")

    source_path = Path(f"data/source-products-batch-{batch:02d}.json")
    out_dir = Path(f"data/photo-sources-batch-{batch:02d}")
    source_path.write_text(json.dumps(selected, ensure_ascii=False, indent=2), encoding="utf-8")
    out_dir.mkdir(parents=True, exist_ok=True)

    results = []
    for item_id in unresolved:
        out = out_dir / f"{item_id}.json"
        subprocess.run([
            sys.executable,
            "scripts/inspect_photo_sources.py",
            "--source", str(source_path),
            "--id", str(item_id),
            "--limit", "35",
            "--out", str(out),
        ], check=True)
        report = json.loads(out.read_text(encoding="utf-8"))
        results.append({
            "id": item_id,
            "name": report.get("name"),
            "supplierCode": report.get("supplierCode"),
            "candidateCount": len(report.get("candidates", [])),
            "zipCandidates": sum(1 for candidate in report.get("candidates", []) if candidate.get("zipMembers")),
        })

    summary = {"batch": batch, "unresolvedIds": unresolved, "products": results, "status": "sources_inspected"}
    (out_dir / "summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
