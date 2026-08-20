#!/usr/bin/env python3
import io, json, zipfile
from pathlib import Path
import requests
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
DETAIL = ROOT / 'data' / 'details' / '001.json'
INDEX = ROOT / 'data' / 'catalog-index.json'
AMURA_DIR = ROOT / 'assets' / 'products' / '495'
AMURA_CODE = '26025'  # exact non-swivel brown Amura photobank code
PHOTO_URL = f'https://price.tetchair.ru/download_photo/?id={AMURA_CODE}'
HEADERS = {'User-Agent': 'Mozilla/5.0 (compatible; FORMA-HOME-media-fix/1.0)'}
IMAGE_EXT = {'.jpg', '.jpeg', '.png', '.webp', '.bmp', '.tif', '.tiff'}


def find_variant(data, product_id, source_id):
    product = data.get('products', {}).get(product_id)
    if not product:
        return None
    for variant in product.get('variants', []):
        if str(variant.get('sourceId')) == str(source_id):
            return variant
    return None


def patch_variant_data(data):
    moncler = find_variant(data, 'model-116', 307)
    if moncler:
        moncler['images'] = [
            'assets/products/307/01.webp',
            'assets/products/307/02.webp',
            'assets/products/307/03.webp',
        ]
        moncler['localImageCount'] = 3

    amura = find_variant(data, 'model-141', 495)
    if amura:
        photos = sorted(AMURA_DIR.glob('photobank-*.webp'))
        rel = [p.relative_to(ROOT).as_posix() for p in photos]
        if not rel:
            raise RuntimeError('Correct Amura photobank photos are missing')
        amura['primaryImage'] = rel[0]
        amura['primaryImageVerified'] = True
        amura['primaryImageSourceId'] = 495
        amura['primaryImageManifest'] = None
        amura['primaryImageStatus'] = 'supplier-photobank-corrected'
        amura['images'] = rel
        amura['localImageCount'] = len(rel)
        amura['photoBankCode'] = int(AMURA_CODE)
        amura['photoBankSource'] = PHOTO_URL


def download_amura():
    r = requests.get(PHOTO_URL, headers=HEADERS, timeout=90)
    r.raise_for_status()
    archive = zipfile.ZipFile(io.BytesIO(r.content))
    members = [m for m in archive.infolist() if not m.is_dir() and Path(m.filename).suffix.lower() in IMAGE_EXT]
    if not members:
        raise RuntimeError('Amura photobank archive has no images')

    AMURA_DIR.mkdir(parents=True, exist_ok=True)
    for old in AMURA_DIR.glob('photobank-*.webp'):
        old.unlink()

    saved = []
    for member in members[:6]:
        try:
            img = Image.open(io.BytesIO(archive.read(member)))
            img.load()
        except Exception:
            continue
        if img.mode not in ('RGB', 'RGBA'):
            img = img.convert('RGB')
        if img.mode == 'RGBA':
            bg = Image.new('RGB', img.size, 'white')
            bg.paste(img, mask=img.getchannel('A'))
            img = bg
        out = AMURA_DIR / f'photobank-{len(saved)+1:02d}.webp'
        img.thumbnail((1800, 1800), Image.Resampling.LANCZOS)
        img.save(out, 'WEBP', quality=88, method=6)
        saved.append(out)
    if len(saved) < 2:
        raise RuntimeError(f'Expected at least 2 valid Amura photos, got {len(saved)}')
    return saved


def update_json(path):
    data = json.loads(path.read_text(encoding='utf-8'))
    patch_variant_data(data)
    path.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')


def main():
    saved = download_amura()
    update_json(DETAIL)
    update_json(INDEX)
    print(json.dumps({'amuraPhotos': len(saved), 'monclerPhotos': 3, 'amuraCode': AMURA_CODE}, ensure_ascii=False))


if __name__ == '__main__':
    main()
