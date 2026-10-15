"""Apply the supplied October 15 XLSX; skip packaging and ambiguous matches."""
import argparse
import collections
import hashlib
import json
from pathlib import Path
import re
import xml.etree.ElementTree as ET
import zipfile

ROOT = Path(__file__).resolve().parents[1]
NS = {'m': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}

def norm(value):
    return re.sub(r'\s+', '', value.lower().replace('ё', 'е'))

def packed(value):
    return bool(re.search(r'упаков|\d+\s*шт\.?\s*[/в(]?\s*уп', value, re.I))

def read_rows(path):
    with zipfile.ZipFile(path) as z:
        shared = [''.join(x.itertext()) for x in ET.fromstring(z.read('xl/sharedStrings.xml')).findall('m:si', NS)]
        rows = []
        for row in ET.fromstring(z.read('xl/worksheets/sheet1.xml')).findall('.//m:sheetData/m:row', NS):
            cells = {}
            for cell in row:
                v = cell.find('m:v', NS)
                if v is not None:
                    cells[re.sub(r'\d', '', cell.get('r'))] = shared[int(v.text)] if cell.get('t') == 's' else v.text
            if cells.get('C') and cells['C'] != 'Оптовая цена' and float(cells['C']) > 0:
                rows.append(dict(row=int(row.get('r')), name=cells['A'], specs=cells.get('B', ''), price=float(cells['C'])))
        return rows

def variants(document):
    products = document['products']
    for product in products.values() if isinstance(products, dict) else products:
        for variant in product['variants']:
            yield product, variant

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('xlsx', type=Path)
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    rows = read_rows(args.xlsx)
    lookup = collections.defaultdict(list)
    excluded = []
    for row in rows:
        if packed(row['name'] + ' ' + row['specs']):
            excluded.append(row)
        else:
            lookup[norm(row['name']), norm(row['specs'])].append(row)
    # Reviewed color-code aliases: same model, material, dimensions and color.
    # Only supplier color-code omission/repeated color words are normalized.
    color_aliases = {772: ('черный 3010', 'черный'), 778: ('белый С0057', 'белый'),
                     781: ('желтый Y-01', 'желтый'), 782: ('желтый желтый Y-01', 'желтый'),
                     646: ('белый C0057', 'белый'), 648: ('черный черный 3010', 'черный'),
                     650: ('темно-серый NX-GR-20', 'темно-серый')}
    index = json.loads((ROOT / 'data/catalog-index.json').read_text())
    matched, skipped = {}, []
    for product, variant in variants(index):
        name = product['name'].split(' — ')[0]
        specs = variant['specs']
        reason = 'exact name/specs; whitespace and ё normalized'
        if variant['sourceId'] in color_aliases:
            old, new = color_aliases[variant['sourceId']]
            assert old in specs
            specs = specs.replace(old, new)
            reason = 'reviewed color-code alias; same dimensions, material and color'
        candidates = lookup[norm(name), norm(specs)] if not packed(name + ' ' + specs) else []
        if candidates and len({r['price'] for r in candidates}) == 1:
            matched[variant['sourceId']] = dict(price=int(candidates[0]['price']), rows=[r['row'] for r in candidates], reason=reason)
        else:
            skipped.append(dict(sourceId=variant['sourceId'], name=product['name'], specs=variant['specs'],
                                reason='conflicting source prices' if candidates else 'no unambiguous non-packaged match',
                                candidates=candidates))
    changes = []
    files = [ROOT / 'data/catalog-index.json', ROOT / 'catalog.json', *sorted((ROOT / 'data/details').glob('*.json'))]
    for path in files:
        original = path.read_text()
        doc = json.loads(original)
        file_changes = []
        for _, variant in variants(doc):
            match = matched.get(variant['sourceId'])
            if match and variant['wholesalePrice'] != match['price']:
                file_changes.append(dict(file=str(path.relative_to(ROOT)), sourceId=variant['sourceId'],
                                         old=variant['wholesalePrice'], new=match['price'], rows=match['rows']))
                variant['wholesalePrice'] = match['price']
        if file_changes and args.apply:
            # Verify that only wholesalePrice fields on approved IDs changed.
            old_doc = json.loads(original)
            for (_, before), (_, after) in zip(variants(old_doc), variants(doc)):
                if before != after:
                    assert before['sourceId'] in matched
                    before['wholesalePrice'] = after['wholesalePrice']
                    assert before == after
            assert old_doc == doc
            pretty = original.startswith('{\n')
            path.write_text(json.dumps(doc, ensure_ascii=False, indent=2 if pretty else None,
                                       separators=None if pretty else (',', ':')) + ('\n' if original.endswith('\n') else ''))
        changes.extend(file_changes)
    report = dict(source=args.xlsx.name, sha256=hashlib.sha256(args.xlsx.read_bytes()).hexdigest(),
                  excludedPackagingRows=len(excluded), matchedVariants=len(matched), skippedVariants=len(skipped),
                  changes=changes, matches=matched, skipped=skipped, excludedRows=excluded)
    if args.apply:
        (ROOT / 'data/price-audit-2026-10-15.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps(dict(matched=len(matched), skipped=len(skipped), excluded=len(excluded),
                          changesByFile=dict(collections.Counter(c['file'] for c in changes))), ensure_ascii=False))

if __name__ == '__main__':
    main()
