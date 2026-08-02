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

confirmed = {1,2,3,4,5,6,7,8,10,11,19,20,21,22,23,24,25,26,27,30,31,32,33,51,52,63,64,69,70,71,72}
hidden = set(json.loads((ROOT / "hidden-products.json").read_text(encoding="utf-8")).get("ids", []))
colors = {"белый","белая","черный","черная","чёрный","чёрная","серый","серая","бежевый","бежевая","зеленый","зеленая","зелёный","зелёная","синий","синяя","голубой","голубая","розовый","розовая","коричневый","коричневая","графит","антрацит","оливковый","оливковая","горчичный","горчичная","красный","красная","оранжевый","оранжевая","молочный","молочная","кремовый","кремовая","натуральный","натуральная","орех","венге","золото","золотой","хром","серебро","серебристый"}

def norm(value):
    return re.sub(r"\s+", " ", re.sub(r"[^a-zа-я0-9]+", " ", str(value or "").lower().replace("ё", "е"))).strip()

def family_key(product):
    words = [word for word in norm(product.get("name")).split() if word not in colors]
    return norm(product.get("category")), norm(product.get("collection")), " ".join(words)

groups = {}
for product in products:
    pid = int(product.get("id", 0))
    if pid in confirmed or pid in hidden:
        continue
    groups.setdefault(family_key(product), []).append(product)

candidates = []
for key, items in groups.items():
    if 2 <= len(items) <= 8 and len({norm(item.get("specs")) for item in items}) >= 2:
        candidates.append((min(int(item["id"]) for item in items), key, sorted(items, key=lambda item: int(item["id"]))))
candidates.sort(key=lambda row: row[0])

chosen = []
suggested = []
for _, key, items in candidates:
    room = 12 - len(chosen)
    if room < 2:
        break
    picked = items[:room]
    if len(picked) < 2:
        continue
    start = len(chosen) + 1
    chosen.extend(picked)
    suggested.append({"suggested_numbers": list(range(start, start + len(picked))), "key": key})
if len(chosen) < 2:
    raise SystemExit("Not enough candidates")

width, card_w, card_h, cols, gap, top = 1800, 570, 520, 3, 30, 110
rows = (len(chosen) + cols - 1) // cols
height = top + rows * card_h + (rows + 1) * gap
canvas = Image.new("RGB", (width, height), "#f5f2ec")
draw = ImageDraw.Draw(canvas)
regular = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
bold = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
fonts = {
    "title": ImageFont.truetype(bold, 34),
    "number": ImageFont.truetype(bold, 34),
    "name": ImageFont.truetype(bold, 22),
    "text": ImageFont.truetype(regular, 17),
    "small": ImageFont.truetype(regular, 15),
}
draw.text((30, 28), "Проверка цветовых вариантов — партия 2", font=fonts["title"], fill="#201f1b")
draw.text((30, 72), "Напишите номера, относящиеся к одной модели. Разные конструкции не объединяем.", font=fonts["text"], fill="#706d65")

mapping = []
for number, product in enumerate(chosen, 1):
    row, col = divmod(number - 1, cols)
    x = gap + col * (card_w + gap)
    y = top + gap + row * (card_h + gap)
    draw.rounded_rectangle((x, y, x + card_w, y + card_h), radius=22, fill="white", outline="#ded8cc", width=2)
    draw.ellipse((x + 18, y + 18, x + 68, y + 68), fill="#201f1b")
    box = draw.textbbox((0, 0), str(number), font=fonts["number"])
    draw.text((x + 43 - (box[2]-box[0])/2, y + 40 - (box[3]-box[1])/2), str(number), font=fonts["number"], fill="white")

    image_path = product.get("directImage") or (product.get("images") or [""])[0]
    image_path = re.sub(r"[?#].*$", "", image_path or "")
    local = ROOT / image_path
    if local.exists():
        try:
            image = Image.open(local).convert("RGB")
            image.thumbnail((450, 280), Image.Resampling.LANCZOS)
            canvas.paste(image, (x + 85 + (467-image.width)//2, y + 18 + (282-image.height)//2))
        except Exception:
            draw.text((x + 160, y + 145), "Фото не открылось", font=fonts["text"], fill="#a34036")
    else:
        draw.text((x + 160, y + 145), "Фото отсутствует", font=fonts["text"], fill="#a34036")

    ty = y + 318
    for line in textwrap.wrap(f"ID {product['id']} · {product.get('name','')}", width=43)[:3]:
        draw.text((x + 20, ty), line, font=fonts["name"], fill="#201f1b")
        ty += 29
    for line in textwrap.wrap(str(product.get("specs", "")), width=60)[:3]:
        draw.text((x + 20, ty + 4), line, font=fonts["small"], fill="#706d65")
        ty += 21
    price = product.get("wholesalePrice") or product.get("price") or ""
    draw.text((x + 20, y + card_h - 34), f"Оптовая цена: {price} ₽", font=fonts["text"], fill="#201f1b")
    mapping.append({"number": number, "id": product["id"], "name": product.get("name"), "specs": product.get("specs"), "price": price, "image": image_path})

out = ROOT / "review-output"
out.mkdir(exist_ok=True)
canvas.save(out / "color-review-batch-02.png", quality=95)
(out / "color-review-batch-02.json").write_text(json.dumps({"products": mapping, "suggested_groups": suggested}, ensure_ascii=False, indent=2), encoding="utf-8")
print(json.dumps({"count": len(mapping), "groups": suggested}, ensure_ascii=False))
