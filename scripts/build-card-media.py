#!/usr/bin/env python3
import json
import os
import shutil
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
INDEX = ROOT / 'data' / 'catalog-index.json'
DETAILS = ROOT / 'data' / 'details'
MIN_SOURCE_BYTES = 70 * 1024
MAX_EDGE = 720
QUALITY = 78
MIN_SAVING_RATIO = 0.85


def find_tool(*names):
    for name in names:
        path = shutil.which(name)
        if path:
            return path
    raise RuntimeError(f"Missing image tool: one of {', '.join(names)}")


def image_command(tool, source, target):
    if Path(tool).name == 'magick':
        return [tool, str(source), '-auto-orient', '-strip', '-resize', f'{MAX_EDGE}x{MAX_EDGE}>', '-quality', str(QUALITY), str(target)]
    return [tool, str(source), '-auto-orient', '-strip', '-resize', f'{MAX_EDGE}x{MAX_EDGE}>', '-quality', str(QUALITY), str(target)]


def main():
    tool = find_tool('magick', 'convert')
    index = json.loads(INDEX.read_text('utf-8'))

    full_by_source = {}
    for detail_path in sorted(DETAILS.glob('*.json')):
        shard = json.loads(detail_path.read_text('utf-8'))
        for product in shard.get('products', {}).values():
            for variant in product.get('variants', []):
                full_by_source[str(variant.get('sourceId'))] = variant

    generated = 0
    reused_original = 0
    missing = []
    original_total = 0
    card_total = 0
    changed_variants = 0

    for product in index.get('products', []):
        for variant in product.get('variants', []):
            sid = str(variant.get('sourceId'))
            full = full_by_source.get(sid, {})
            source_rel = full.get('primaryImage') or variant.get('primaryImage')
            if not source_rel:
                missing.append(f'{sid}: no primary image')
                continue
            source = ROOT / str(source_rel).lstrip('/')
            if not source.exists():
                missing.append(f'{sid}: {source_rel}')
                continue

            original_size = source.stat().st_size
            original_total += original_size
            card_rel = source_rel
            card_size = original_size

            if original_size > MIN_SOURCE_BYTES:
                target = ROOT / 'assets' / 'products' / sid / 'card.webp'
                target.parent.mkdir(parents=True, exist_ok=True)
                subprocess.run(image_command(tool, source, target), check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                optimized_size = target.stat().st_size
                if optimized_size < original_size * MIN_SAVING_RATIO:
                    card_rel = target.relative_to(ROOT).as_posix()
                    card_size = optimized_size
                    generated += 1
                else:
                    target.unlink(missing_ok=True)
                    reused_original += 1
            else:
                reused_original += 1

            if variant.get('primaryImage') != card_rel:
                variant['primaryImage'] = card_rel
                changed_variants += 1
            card_total += card_size

    INDEX.write_text(json.dumps(index, ensure_ascii=False, separators=(',', ':')), 'utf-8')
    savings = original_total - card_total
    print(json.dumps({
        'variants': sum(len(p.get('variants', [])) for p in index.get('products', [])),
        'generated_card_images': generated,
        'reused_originals': reused_original,
        'changed_variant_paths': changed_variants,
        'missing': missing[:20],
        'missing_count': len(missing),
        'original_primary_mb': round(original_total / 1024 / 1024, 2),
        'catalog_primary_mb': round(card_total / 1024 / 1024, 2),
        'saved_mb': round(savings / 1024 / 1024, 2),
        'saved_percent': round((savings / original_total * 100) if original_total else 0, 1),
        'max_edge': MAX_EDGE,
        'quality': QUALITY,
    }, ensure_ascii=False, indent=2))

    if missing:
        raise SystemExit(f'Missing {len(missing)} primary images; refusing to continue')


if __name__ == '__main__':
    main()
