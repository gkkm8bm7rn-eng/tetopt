import json
import math
import os
import re
import textwrap
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
query = os.environ.get("MODEL_QUERY", "Амура").strip()
slug = os.environ.get("MODEL_SLUG", "amura").strip()
html = (ROOT / "catalog-source.html").read_text(encoding="utf-8")
match = re.search(r"const PRODUCTS\s*=\s*(\[.*?\]);\s*\n\s*const ", html, re.S)
if not match:
    raise SystemExit("PRODUCTS array not found")
products = json.loads(match.group(1))

def norm(value):
    return re.sub(r"\s+", " ", re.sub(r"[^a-zа-я0-9]+", " ", str(value or "").lower().replace("ё", "е"))).strip()

terms = [norm(term) for term in re.split(r"[|,/]+", query) if norm(term)]
selected = []
for p in products:
    hay = " ".join([norm(p.get("name")), norm(p.get("collection")), norm(p.get("specs"))])
    if any(term in hay for term in terms):
        selected.append(p)
selected.sort(key=lambda p: int(p.get("id", 0)))
if not selected:
    raise SystemExit(f"No products found for {query}")

cols = 4 if len(selected) > 6 else 3
card_w, card_h, gap, top = 470, 510, 24, 120
width = gap + cols * (card_w + gap)
rows = math.ceil(len(selected) / cols)
height = top + gap + rows * (card_h + gap)
canvas = Image.new("RGB", (width, height), "#f5f2ec")
draw = ImageDraw.Draw(canvas)
regular = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
bold = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
fonts = {
    "title": ImageFont.truetype(bold, 34),
    "number": ImageFont.truetype(bold, 30),
    "name": ImageFont.truetype(bold, 20),
    "text": ImageFont.truetype(regular, 16),
    "small": ImageFont.truetype(regular, 14),
}
draw.text((30, 26), f"Все варианты модели: {query}", font=fonts["title"], fill="#201f1b")
draw.text((30, 74), "Сравните конструкцию, цвет, комплектацию, цену и отметьте дубли.", font=fonts["text"], fill="#706d65")

mapping = []
for number, p in enumerate(selected, 1):
    row, col = divmod(number - 1, cols)
    x = gap + col * (card_w + gap)
    y = top + gap + row * (card_h + gap)
    draw.rounded_rectangle((x, y, x + card_w, y + card_h), radius=22, fill="white", outline="#ded8cc", width=2)
    draw.ellipse((x + 16, y + 16, x + 62, y + 62), fill="#201f1b")
    bbox = draw.textbbox((0,0), str(number), font=fonts["number"])
    draw.text((x + 39 - (bbox[2]-bbox[0])/2, y + 37 - (bbox[3]-bbox[1])/2), str(number), font=fonts["number"], fill="white")
    image_path = p.get("directImage") or (p.get("images") or [""])[0]
    image_path = re.sub(r"[?#].*$", "", image_path or "")
    local = ROOT / image_path
    if local.exists():
        try:
            image = Image.open(local).convert("RGB")
            image.thumbnail((340, 260), Image.Resampling.LANCZOS)
            canvas.paste(image, (x + (card_w-image.width)//2, y + 18 + (260-image.height)//2))
        except Exception:
            draw.text((x + 130, y + 140), "Фото не открылось", font=fonts["text"], fill="#a34036")
    else:
        draw.text((x + 145, y + 140), "Фото отсутствует", font=fonts["text"], fill="#a34036")
    ty = y + 305
    for line in textwrap.wrap(f"ID {p.get('id')} · {p.get('name','')}", width=38)[:3]:
        draw.text((x + 18, ty), line, font=fonts["name"], fill="#201f1b")
        ty += 27
    for line in textwrap.wrap(str(p.get("specs", "")), width=52)[:3]:
        draw.text((x + 18, ty + 4), line, font=fonts["small"], fill="#706d65")
        ty += 19
    price = p.get("wholesalePrice") or p.get("price") or ""
    draw.text((x + 18, y + card_h - 32), f"Оптовая цена: {price} ₽", font=fonts["text"], fill="#201f1b")
    mapping.append({"number": number, "id": p.get("id"), "name": p.get("name"), "specs": p.get("specs"), "price": price, "image": image_path})

out = ROOT / "review-output"
out.mkdir(exist_ok=True)
canvas.save(out / f"{slug}-all-variants.png", quality=95)
(out / f"{slug}-all-variants.json").write_text(json.dumps({"query": query, "products": mapping}, ensure_ascii=False, indent=2), encoding="utf-8")
print(json.dumps({"query": query, "count": len(mapping), "ids": [p['id'] for p in mapping]}, ensure_ascii=False))
