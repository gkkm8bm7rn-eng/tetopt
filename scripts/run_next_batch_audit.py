#!/usr/bin/env python3
from __future__ import annotations

import json
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

CATALOG = Path("catalog-source.html")
HIDDEN = Path("hidden-products.json")
PROGRESS = Path("photo-processing-progress.json")
MARKER = "    const PRODUCTS = "
BATCH_SIZE = 20


def read_products() -> list[dict]:
    html = CATALOG.read_text(encoding="utf-8")
    start = html.index(MARKER) + len(MARKER)
    end = html.index(";\n", start)
    return json.loads(html[start:end])


def main() -> int:
    products = read_products()
    hidden = set(map(int, json.loads(HIDDEN.read_text(encoding="utf-8")).get("ids", [])))
    progress = json.loads(PROGRESS.read_text(encoding="utf-8"))
    completed = set(map(int, progress.get("completedIds", [])))
    active = [item for item in products if int(item.get("id", 0)) not in hidden]
    remaining = [item for item in sorted(active, key=lambda x: int(x.get("id", 0))) if int(item.get("id", 0)) not in completed]
    selected = remaining[:BATCH_SIZE]
    if not selected:
        raise RuntimeError("Все активные товары уже обработаны")

    batch = int(progress.get("lastCompletedBatch") or progress.get("lastBatch") or 0) + 1
    ids = [int(item["id"]) for item in selected]
    stem = f"batch-{batch:02d}"
    audit_json = Path(f"data/photo-audit-{stem}.json")
    audit_txt = Path(f"data/photo-audit-{stem}.txt")
    selection_path = Path(f"data/selection-{stem}.json")

    subprocess.run([
        sys.executable,
        "scripts/audit_product_photos.py",
        "--ids", ",".join(map(str, ids)),
        "--json", str(audit_json),
        "--text", str(audit_txt),
    ], check=True)

    audit = json.loads(audit_json.read_text(encoding="utf-8"))
    manual = [int(item["id"]) for item in audit.get("products", []) if item.get("manual_review")]
    now = datetime.now(timezone.utc).isoformat()
    selection = {
        "batch": batch,
        "selectedAt": now,
        "activeTarget": len(active),
        "completedBefore": len(completed),
        "ids": ids,
        "products": [
            {"id": int(item["id"]), "name": item.get("name"), "category": item.get("category"), "collection": item.get("collection")}
            for item in selected
        ],
        "auditJson": str(audit_json),
        "auditText": str(audit_txt),
        "manualReviewIds": manual,
        "status": "audit_completed_pending_curation",
    }
    selection_path.write_text(json.dumps(selection, ensure_ascii=False, indent=2), encoding="utf-8")

    progress["version"] = int(progress.get("version", 0)) + 1
    progress["updatedAt"] = now
    progress["reviewedIds"] = sorted(set(map(int, progress.get("reviewedIds", []))) | set(ids))
    progress["inProgressBatch"] = batch
    progress["inProgressBatchIds"] = ids
    progress["unresolvedIds"] = manual
    progress["lastBatchStatus"] = f"batch_{batch:02d}_audit_completed_pending_curation"
    PROGRESS.write_text(json.dumps(progress, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    print(json.dumps({"batch": batch, "ids": ids, "manualReviewIds": manual}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
