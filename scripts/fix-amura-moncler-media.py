#!/usr/bin/env python3
import io, json, zipfile
from pathlib import Path
import requests
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
DETAIL = ROOT / 'data' / 'details' / '001.json'
INDEX = ROOT / 'data' / 'catalog-index.json'
AMURA_DIR = ROOT / 'assets' / 'products' / '495'
AMURA_CODE = '26025'  # exact non-swivel brown Amura
PHOTO_URL = f'https://price.tetchair.ru/download_photo/?id={AMURA_CODE}'
FALLBACK_URL = 'https://xn--90ahbybfhq7i.xn--p1ai/stulya-i-kresla/kresla-dlya-doma/image/cache/catalog/image/cache/catalog/stulya-i-kresla/9/cat_files-284-300-27998v17970_00-350x250_0.webp'
HEADERS = {'User-Agent': 'Mozilla/5.0 (compatible; FORMA-HOME-media-fix/1.1)'}
IMAGE_EXT = {'.jpg', '.jpeg', '.png', '.webp', '.bmp', '.tif', '.tiff'}


def find_variant(data, product_id, source_id):
    product = data.get('products', {}).get(product_id)
    if not product:
        return None
    return next((v for v in product.get('variants', []) if str(v.get('sourceId')) == str(source_id)), None)


def save_image(blob, out):
    img = Image.open(io.BytesIO(blob)); img.load()
    if img.mode not in ('RGB', 'RGBA'): img = img.convert('RGB')
    if img.mode == 'RGBA':
        bg = Image.new('RGB', img.size, 'white'); bg.paste(img, mask=img.getchannel('A')); img = bg
    img.thumbnail((1800, 1800), Image.Resampling.LANCZOS)
    img.save(out, 'WEBP', quality=88, method=6)


def download_amura():
    AMURA_DIR.mkdir(parents=True, exist_ok=True)
    for old in AMURA_DIR.glob('photobank-*.webp'): old.unlink()
    saved = []
    try:
        r = requests.get(PHOTO_URL, headers=HEADERS, timeout=90); r.raise_for_status()
        archive = zipfile.ZipFile(io.BytesIO(r.content))
        members = [m for m in archive.infolist() if not m.is_dir() and Path(m.filename).suffix.lower() in IMAGE_EXT]
        for member in members[:6]:
            try:
                out = AMURA_DIR / f'photobank-{len(saved)+1:02d}.webp'
                save_image(archive.read(member), out); saved.append(out)
            except Exception:
                continue
    except Exception as exc:
        print(f'Primary photobank download failed: {exc}')
    if not saved:
        r = requests.get(FALLBACK_URL, headers=HEADERS, timeout=60); r.raise_for_status()
        out = AMURA_DIR / 'photobank-01.webp'; save_image(r.content, out); saved.append(out)
    return saved


def patch_variant_data(data):
    moncler = find_variant(data, 'model-116', 307)
    if moncler:
        moncler['images'] = ['assets/products/307/01.webp','assets/products/307/02.webp','assets/products/307/03.webp']
        moncler['localImageCount'] = 3
    amura = find_variant(data, 'model-141', 495)
    if amura:
        rel = [p.relative_to(ROOT).as_posix() for p in sorted(AMURA_DIR.glob('photobank-*.webp'))]
        if not rel: raise RuntimeError('Correct Amura media missing')
        amura.update({
            'primaryImage': rel[0], 'primaryImageVerified': True, 'primaryImageSourceId': 495,
            'primaryImageManifest': None, 'primaryImageStatus': 'supplier-photobank-corrected',
            'images': rel, 'localImageCount': len(rel), 'photoBankCode': int(AMURA_CODE),
            'photoBankSource': PHOTO_URL
        })


def update_json(path):
    data = json.loads(path.read_text(encoding='utf-8'))
    patch_variant_data(data)
    path.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')


def main():
    saved = download_amura()
    update_json(DETAIL); update_json(INDEX)
    print(json.dumps({'amuraPhotos': len(saved), 'monclerPhotos': 3, 'amuraCode': AMURA_CODE}, ensure_ascii=False))


if __name__ == '__main__': main()
