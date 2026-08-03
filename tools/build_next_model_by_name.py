import json
import re
import textwrap
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
html = (ROOT / "catalog-source.html").read_text(encoding="utf-8")
match = re.search(r"const PRODUCTS\s*=\s*(\[.*?\]);\s*\n\s*const ", html, re.S)
if not match:
    raise SystemExit("PRODUCTS array not found")
products = json.loads(match.group(1))

processed_ids = {
    325,326,327,328,329,330,331,332,333,334,335,336,337,338,339,340,341,342,343,344,345,
    490,491,492,493,494,495,496,497,498,499,500,501,622,
}
registry = ROOT / "review-confirmations" / "color-and-duplicate-registry.json"
if registry.exists():
    data = json.loads(registry.read_text(encoding="utf-8"))
    for group in data.get("color_groups", []):
        processed_ids.update(int(x) for x in group.get("ids", []))
        processed_ids.update(int(x) for x in group.get("duplicate_ids_excluded", []))
    for row in data.get("duplicates", []):
        processed_ids.add(int(row.get("keep_id", 0)))
        processed_ids.add(int(row.get("remove_id", 0)))
    for row in data.get("manual_removals", []):
        processed_ids.add(int(row.get("keep_id", 0)))
        processed_ids.add(int(row.get("remove_id", 0)))

hidden_path = ROOT / "hidden-products.json"
hidden = set()
if hidden_path.exists():
    hidden = {int(x) for x in json.loads(hidden_path.read_text(encoding="utf-8")).get("ids", [])}

PACK_RE = re.compile(r"\s*\([^)]*шт\.?\s*в\s*упаковке[^)]*\)", re.I)
GENERIC = re.compile(r"^(стул|кресло)\s+(обеденный\s+|барный\s+|полубарный\s+|офисный\s+|компьютерный\s+|с\s+подлокотниками\s+)*", re.I)

def clean_name(name):
    return re.sub(r"\s+", " ", PACK_RE.sub("", str(name or ""))).strip()

def model_key(name):
    name = clean_name(name)
    left = name.split("/", 1)[0].strip()
    left = GENERIC.sub("", left).strip()
    left = re.sub(r"\([^)]*\)", "", left).strip()
    left = re.sub(r"\b(мягкое|жесткое|жёсткое)\s+сиденье\b", "", left, flags=re.I).strip()
    return re.sub(r"\s+", " ", left).lower().replace("ё", "е")

groups = {}
for product in products:
    pid = int(product.get("id", 0))
    name = str(product.get("name", ""))
    if pid in processed_ids or pid in hidden:
        continue
    if "стул" not in name.lower():
        continue
    key = model_key(name)
    if not key:
        continue
    groups.setdefault(key, []).append(product)

candidates = []
for key, items in groups.items():
    if len(items) >= 2:
        items = sorted(items, key=lambda p: int(p.get("id", 0)))
        candidates.append((min(int(p["id"]) for p in items), key, items))

if not candidates:
    raise SystemExit("No unprocessed multi-card chair models found")

candidates.sort(key=lambda row: row[0])
_, key, chosen = candidates[0]
model_title = clean_name(chosen[0].get("name", ""))

cols = 4
card_w, card_h, gap, top = 470, 500, 24, 120
width = 2000
rows = (len(chosen) + cols - 1) // cols
height = top + rows * card_h + (rows + 1) * gap
canvas = Image.new("RGB", (width, height), "#f5f2ec")
draw = ImageDraw.Draw(canvas)
regular = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
bold = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
fonts = {
    "title": ImageFont.truetype(bold, 34),
    "number": ImageFont.truetype(bold, 32),
    "name": ImageFont.truetype(bold, 21),
    "text": ImageFont.truetype(regular, 17),
    "small": ImageFont.truetype(regular, 15),
}
draw.text((30, 24), f"Все варианты модели: {model_title}", font=fonts["title"], fill="#201f1b")
draw.text((30, 70), "Отметьте цветовые группы, дубли и разные конструкции.", font=fonts["text"], fill="#706d65")

mapping = []
for number, product in enumerate(chosen, 1):
    row, col = divmod(number - 1, cols)
    x = gap + col * (card_w + gap)
    y = top + gap + row * (card_h + gap)
    draw.rounded_rectangle((x, y, x + card_w, y + card_h), radius=22, fill="white", outline="#ded8cc", width=2)
    draw.ellipse((x + 18, y + 18, x + 66, y + 66), fill="#201f1b")
    box = draw.textbbox((0, 0), str(number), font=fonts["number"])
    draw.text((x + 42 - (box[2]-box[0])/2, y + 39 - (box[3]-box[1])/2), str(number), font=fonts["number"], fill="white")

    image_path = product.get("directImage") or (product.get("images") or [""])[0]
    image_path = re.sub(r"[?#].*$", "", image_path or "")
    local = ROOT / image_path
    if local.exists():
        try:
            image = Image.open(local).convert("RGB")
            image.thumbnail((350, 260), Image.Resampling.LANCZOS)
            canvas.paste(image, (x + 60 + (350-image.width)//2, y + 20 + (260-image.height)//2))
        except Exception:
            draw.text((x + 145, y + 145), "Фото не открылось", font=fonts["text"], fill="#a34036")
    else:
        draw.text((x + 145, y + 145), "Фото отсутствует", font=fonts["text"], fill="#a34036")

    ty = y + 310
    display_name = clean_name(product.get("name", ""))
    for line in textwrap.wrap(f"ID {product['id']} · {display_name}", width=38)[:3]:
        draw.text((x + 18, ty), line, font=fonts["name"], fill="#201f1b")
        ty += 27
    for line in textwrap.wrap(str(product.get("specs", "")), width=52)[:3]:
        draw.text((x + 18, ty + 4), line, font=fonts["small"], fill="#706d65")
        ty += 20
    price = product.get("wholesalePrice") or product.get("price") or ""
    draw.text((x + 18, y + card_h - 34), f"Оптовая цена: {price} ₽", font=fonts["text"], fill="#201f1b")
    mapping.append({
        "number": number,
        "id": product["id"],
        "name": display_name,
        "specs": product.get("specs"),
        "price": price,
        "image": image_path,
    })

out = ROOT / "review-output"
out.mkdir(exist_ok=True)
slug = re.sub(r"[^a-z0-9]+", "-", key.lower()).strip("-") or "next-model"
canvas.save(out / "next-model-by-name.png", quality=95)
(out / "next-model-by-name.json").write_text(json.dumps({"model": model_title, "key": key, "products": mapping}, ensure_ascii=False, indent=2), encoding="utf-8")
print(json.dumps({"model": model_title, "count": len(mapping), "min_id": min(int(p["id"]) for p in chosen)}, ensure_ascii=False))
