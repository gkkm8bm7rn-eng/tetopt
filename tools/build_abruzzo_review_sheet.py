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

needle = ("абруццо", "abruzzo")
chosen = [p for p in products if any(n in str(p.get("name", "")).lower() for n in needle)]
chosen.sort(key=lambda p: int(p.get("id", 0)))
if not chosen:
    raise SystemExit("No Abruzzo products found")

cols = 4
card_w, card_h, gap, top = 470, 510, 24, 120
width = gap + cols * (card_w + gap)
rows = (len(chosen) + cols - 1) // cols
height = top + gap + rows * (card_h + gap)
canvas = Image.new("RGB", (width, height), "#f5f2ec")
draw = ImageDraw.Draw(canvas)
regular = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
bold = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
fonts = {
    "title": ImageFont.truetype(bold, 36),
    "number": ImageFont.truetype(bold, 32),
    "name": ImageFont.truetype(bold, 21),
    "text": ImageFont.truetype(regular, 17),
    "small": ImageFont.truetype(regular, 15),
}
draw.text((30, 24), "Все варианты стула «Абруццо / Abruzzo»", font=fonts["title"], fill="#201f1b")
draw.text((30, 74), f"Найдено карточек: {len(chosen)}. Сравните конструкцию, модификацию, цвет, упаковку и цену.", font=fonts["text"], fill="#706d65")

mapping = []
for number, product in enumerate(chosen, 1):
    row, col = divmod(number - 1, cols)
    x = gap + col * (card_w + gap)
    y = top + gap + row * (card_h + gap)
    draw.rounded_rectangle((x, y, x + card_w, y + card_h), radius=22, fill="white", outline="#ded8cc", width=2)
    draw.ellipse((x + 16, y + 16, x + 66, y + 66), fill="#201f1b")
    box = draw.textbbox((0, 0), str(number), font=fonts["number"])
    draw.text((x + 41 - (box[2]-box[0])/2, y + 40 - (box[3]-box[1])/2), str(number), font=fonts["number"], fill="white")

    image_path = product.get("directImage") or (product.get("images") or [""])[0]
    image_path = re.sub(r"[?#].*$", "", image_path or "")
    local = ROOT / image_path
    if local.exists():
        try:
            image = Image.open(local).convert("RGB")
            image.thumbnail((350, 260), Image.Resampling.LANCZOS)
            canvas.paste(image, (x + 70 + (365-image.width)//2, y + 18 + (262-image.height)//2))
        except Exception:
            draw.text((x + 145, y + 145), "Фото не открылось", font=fonts["text"], fill="#a34036")
    else:
        draw.text((x + 145, y + 145), "Фото отсутствует", font=fonts["text"], fill="#a34036")

    ty = y + 310
    for line in textwrap.wrap(f"ID {product['id']} · {product.get('name','')}", width=35)[:3]:
        draw.text((x + 18, ty), line, font=fonts["name"], fill="#201f1b")
        ty += 28
    for line in textwrap.wrap(str(product.get("specs", "")), width=50)[:4]:
        draw.text((x + 18, ty + 3), line, font=fonts["small"], fill="#706d65")
        ty += 20
    price = product.get("wholesalePrice") or product.get("price") or ""
    draw.text((x + 18, y + card_h - 34), f"Оптовая цена: {price} ₽", font=fonts["text"], fill="#201f1b")
    mapping.append({"number": number, "id": product["id"], "name": product.get("name"), "specs": product.get("specs"), "price": price, "image": image_path})

out = ROOT / "review-output"
out.mkdir(exist_ok=True)
canvas.save(out / "abruzzo-all-variants.png", quality=95)
(out / "abruzzo-all-variants.json").write_text(json.dumps({"products": mapping}, ensure_ascii=False, indent=2), encoding="utf-8")
print(json.dumps({"count": len(mapping), "ids": [p["id"] for p in mapping]}, ensure_ascii=False))
