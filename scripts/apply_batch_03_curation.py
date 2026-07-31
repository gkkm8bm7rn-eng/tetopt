#!/usr/bin/env python3
from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path

BATCH_IDS = [67,69,70,71,72,73,74,75,77,78,79,80,81,87,88,89,90,91,93,94]
AUDIT_PATH = Path('data/photo-audit-batch-03.json')
REPORT_PATH = Path('data/batch-03-curation-report.json')
CATALOG_PATH = Path('catalog-source.html')
LOADER_PATH = Path('catalog-loader.js')
INDEX_PATH = Path('index.html')
PROGRESS_PATH = Path('photo-processing-progress.json')
MARKER = '    const PRODUCTS = '


def clean(value: str | None) -> str:
    return str(value or '').split('?', 1)[0].split('#', 1)[0]


def read_products() -> tuple[str, list[dict], int, int]:
    html = CATALOG_PATH.read_text(encoding='utf-8')
    start = html.index(MARKER) + len(MARKER)
    end = html.index(';\n', start)
    return html, json.loads(html[start:end]), start, end


def reject_reason(candidate: dict) -> str | None:
    if candidate.get('missing'):
        return 'missing'
    if candidate.get('error'):
        return 'invalid'
    sharpness = float(candidate.get('sharpness', 0))
    touches = int(candidate.get('edge_touches', 4))
    score = float(candidate.get('general_score', -99))
    if sharpness < 12:
        return 'too_blurry'
    if touches >= 2 and score < 0.10:
        return 'cropped_or_detail'
    return None


def bump_versions() -> str:
    now = datetime.now(timezone.utc)
    asset_version = now.strftime('%Y%m%d-%H%M-b03-curated')
    loader = LOADER_PATH.read_text(encoding='utf-8')
    loader, count = re.subn(r'const assetVersion="[^"]+";', f'const assetVersion="{asset_version}";', loader, count=1)
    if count != 1:
        raise RuntimeError('Не удалось обновить assetVersion')
    LOADER_PATH.write_text(loader, encoding='utf-8')

    index = INDEX_PATH.read_text(encoding='utf-8')
    match = re.search(r'catalog-loader\.js\?v=(\d+)', index)
    if not match:
        raise RuntimeError('Не найдена версия catalog-loader.js в index.html')
    new_version = int(match.group(1)) + 1
    index = index[:match.start(1)] + str(new_version) + index[match.end(1):]
    INDEX_PATH.write_text(index, encoding='utf-8')
    return asset_version


def update_progress(unresolved: list[int], now: str) -> None:
    data = json.loads(PROGRESS_PATH.read_text(encoding='utf-8'))
    data['version'] = int(data.get('version', 0)) + 1
    data['updatedAt'] = now
    data['reviewedIds'] = sorted(set(map(int, data.get('reviewedIds', []))) | set(BATCH_IDS))
    data['inProgressBatch'] = 3
    data['inProgressBatchIds'] = BATCH_IDS
    data['unresolvedIds'] = unresolved
    data['lastBatchStatus'] = 'batch_03_curated_pending_live_verification'
    PROGRESS_PATH.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')


def main() -> int:
    audit = json.loads(AUDIT_PATH.read_text(encoding='utf-8'))
    audited = {int(item['id']): item for item in audit.get('products', [])}
    html, products, start, end = read_products()
    by_id = {int(item['id']): item for item in products}

    changed = []
    unresolved: list[int] = []
    for product_id in BATCH_IDS:
        product = by_id.get(product_id)
        item = audited.get(product_id)
        if not product or not item:
            unresolved.append(product_id)
            continue

        candidates = {clean(c.get('path')): c for c in item.get('candidates', []) if c.get('path')}
        recommended = clean(item.get('recommended_first'))
        current = []
        for raw in list(product.get('images') or []) + [product.get('directImage')]:
            path = clean(raw)
            if path and path not in current and 'assets/interiors/' not in path:
                current.append(path)

        if recommended not in candidates or reject_reason(candidates[recommended]):
            unresolved.append(product_id)
            continue

        kept = [recommended]
        removed = []
        for path in current:
            if path == recommended or path in kept:
                continue
            candidate = candidates.get(path)
            if candidate is None:
                removed.append({'path': path, 'reason': 'not_in_audit'})
                continue
            reason = reject_reason(candidate)
            if reason:
                removed.append({'path': path, 'reason': reason})
                continue
            kept.append(path)
            if len(kept) >= 3:
                break

        before = list(product.get('images') or [])
        product['images'] = kept
        product['directImage'] = kept[0]
        changed.append({
            'id': product_id,
            'name': product.get('name'),
            'before': before,
            'after': kept,
            'recommendedFirst': recommended,
            'confidence': item.get('confidence'),
            'removed': removed,
        })

    CATALOG_PATH.write_text(
        html[:start] + json.dumps(products, ensure_ascii=False, separators=(',', ':')) + html[end:],
        encoding='utf-8',
    )
    asset_version = bump_versions()
    now = datetime.now(timezone.utc).isoformat()
    update_progress(unresolved, now)
    report = {
        'batch': 3,
        'processedIds': BATCH_IDS,
        'changedCount': len(changed),
        'unresolvedIds': unresolved,
        'assetVersion': asset_version,
        'status': 'curated_pending_live_verification' if not unresolved else 'curated_with_unresolved',
        'products': changed,
        'updatedAt': now,
    }
    REPORT_PATH.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({'changed': len(changed), 'unresolved': unresolved, 'assetVersion': asset_version}, ensure_ascii=False))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
