import json
import re
import textwrap
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
REVIEW = ROOT / "data" / "catalog-primary-photo-review.json"
SOURCE = ROOT / "catalog-source.html"
OUT = ROOT / "review-output" / "primary-photo-audit"
OUT.mkdir(parents=True, exist_ok=True)

regular = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
bold = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
F = {
    "title": ImageFont.truetype(bold, 30),
    "name": ImageFont.truetype(bold, 18),
    "text": ImageFont.truetype(regular, 15),
    "small": ImageFont.truetype(regular, 12),
    "num": ImageFont.truetype(bold, 22),
}

def fit_image(path, max_w, max_h):
    img = Image.open(path).convert("RGB")
    img.thumbnail((max_w, max_h), Image.Resampling.LANCZOS)
    return img


def draw_variant_row(canvas, draw, item, y, row_h=330, width=2200):
    x0 = 20
    draw.rounded_rectangle((x0, y, width-20, y+row_h-10), radius=18, fill="white", outline="#d8d2c8", width=2)
    info_w = 520
    draw.text((40, y+20), f"ID {item['sourceId']} · {item.get('modelId','')}", font=F["name"], fill="#1f1e1b")
    ty = y+50
    for line in textwrap.wrap(item.get("variantName") or item.get("modelName") or "", width=48)[:3]:
        draw.text((40, ty), line, font=F["name"], fill="#1f1e1b")
        ty += 23
    for line in textwrap.wrap(str(item.get("specs") or ""), width=62)[:4]:
        draw.text((40, ty+4), line, font=F["small"], fill="#67645e")
        ty += 17
    draw.text((40, y+row_h-45), "Выбрать: четкий товар целиком, фронт или 3/4", font=F["text"], fill="#7b342c")

    images = item.get("galleryImages") or []
    available_w = width - info_w - 50
    thumb_w = 245
    thumb_h = 235
    gap = 12
    max_images = max(1, int((available_w + gap) // (thumb_w + gap)))
    images = images[:max_images]
    for idx, rel in enumerate(images, 1):
        x = info_w + 25 + (idx-1)*(thumb_w+gap)
        draw.rounded_rectangle((x, y+20, x+thumb_w, y+285), radius=12, fill="#f6f4ef", outline="#ddd7ce")
        path = ROOT / re.sub(r"[?#].*$", "", rel)
        if path.exists():
            try:
                img = fit_image(path, thumb_w-16, thumb_h-12)
                canvas.paste(img, (x+(thumb_w-img.width)//2, y+28+(thumb_h-img.height)//2))
            except Exception:
                draw.text((x+25, y+120), "Ошибка фото", font=F["text"], fill="#a33")
        else:
            draw.text((x+25, y+120), "Нет файла", font=F["text"], fill="#a33")
        badge = "ТЕКУЩЕЕ" if rel == item.get("primaryImage") else str(idx)
        draw.rounded_rectangle((x+8, y+244, x+thumb_w-8, y+278), radius=8, fill="#262521")
        box=draw.textbbox((0,0), badge, font=F["text"])
        draw.text((x+thumb_w/2-(box[2]-box[0])/2, y+252), badge, font=F["text"], fill="white")


def build_photo_sheets():
    data = json.loads(REVIEW.read_text(encoding="utf-8"))
    items = data.get("variants", [])
    per_sheet = 8
    manifest = []
    for sheet_no, start in enumerate(range(0, len(items), per_sheet), 1):
        batch = items[start:start+per_sheet]
        width, top, row_h = 2200, 100, 330
        height = top + len(batch)*row_h + 20
        canvas = Image.new("RGB", (width,height), "#efece5")
        draw = ImageDraw.Draw(canvas)
        draw.text((25,22), f"Главные фото — лист {sheet_no:02d} · варианты {start+1}–{start+len(batch)} из {len(items)}", font=F["title"], fill="#1f1e1b")
        draw.text((25,62), "Для каждого ID выберите номер лучшего общего вида. Если подходящего нет — NONE.", font=F["text"], fill="#67645e")
        for i,item in enumerate(batch):
            draw_variant_row(canvas, draw, item, top+i*row_h, row_h=row_h, width=width)
            manifest.append({"sheet":sheet_no,"position":start+i+1,"sourceId":item["sourceId"],"images":item.get("galleryImages") or [],"currentPrimary":item.get("primaryImage")})
        canvas.save(OUT / f"primary-photo-review-{sheet_no:02d}.jpg", quality=91, optimize=True)
    (OUT / "primary-photo-sheet-manifest.json").write_text(json.dumps({"count":len(items),"items":manifest},ensure_ascii=False,indent=2),encoding="utf-8")
    return len(items), (len(items)+per_sheet-1)//per_sheet


def load_source_products():
    text=SOURCE.read_text(encoding="utf-8")
    match=re.search(r"const PRODUCTS\s*=\s*(\[.*?\]);\s*\n\s*const ",text,re.S)
    if not match:
        raise SystemExit("PRODUCTS array not found")
    return json.loads(match.group(1))


def build_fluffy_sheet():
    ids={294,295,296,1005,1006,1007,1008,1009,1010}
    rows=[p for p in load_source_products() if int(p.get("id",0) or 0) in ids]
    rows.sort(key=lambda p:int(p["id"]))
    width, card_w, card_h, cols, gap, top = 2200, 700, 600, 3, 25, 100
    nrows=(len(rows)+cols-1)//cols
    canvas=Image.new("RGB",(width,top+nrows*(card_h+gap)+gap),"#efece5")
    draw=ImageDraw.Draw(canvas)
    draw.text((25,22),"Fluffy — проверка, одна модель или несколько конструкций",font=F["title"],fill="#1f1e1b")
    draw.text((25,62),"Сравниваем внешний вид, характеристики, цену и исходную коллекцию.",font=F["text"],fill="#67645e")
    exported=[]
    for idx,p in enumerate(rows):
        r,c=divmod(idx,cols); x=gap+c*(card_w+gap); y=top+r*(card_h+gap)
        draw.rounded_rectangle((x,y,x+card_w,y+card_h),radius=18,fill="white",outline="#d8d2c8",width=2)
        draw.text((x+18,y+14),f"ID {p['id']}",font=F["num"],fill="#1f1e1b")
        ims=[]
        for rel in [p.get("directImage"),*(p.get("images") or [])]:
            rel=re.sub(r"[?#].*$","",str(rel or ""))
            if rel.startswith("assets/") and rel not in ims and (ROOT/rel).exists(): ims.append(rel)
        if ims:
            img=fit_image(ROOT/ims[0],620,300)
            canvas.paste(img,(x+(card_w-img.width)//2,y+55+(300-img.height)//2))
        ty=y+370
        for line in textwrap.wrap(str(p.get("name") or ""),width=58)[:2]:
            draw.text((x+18,ty),line,font=F["name"],fill="#1f1e1b"); ty+=23
        for label,val in [("Коллекция",p.get("collection")),("Характеристики",p.get("specs")),("Опт",p.get("wholesalePrice")),("Розница",p.get("retailPrice"))]:
            text=f"{label}: {val}"
            for line in textwrap.wrap(text,width=78)[:2]:
                draw.text((x+18,ty+3),line,font=F["small"],fill="#67645e"); ty+=16
        exported.append({k:p.get(k) for k in ["id","name","category","collection","specs","wholesalePrice","retailPrice","directImage","images"]})
    canvas.save(OUT/"fluffy-review.jpg",quality=93,optimize=True)
    (OUT/"fluffy-review.json").write_text(json.dumps({"products":exported},ensure_ascii=False,indent=2),encoding="utf-8")
    return len(rows)

if __name__ == "__main__":
    count,sheets=build_photo_sheets()
    fluffy=build_fluffy_sheet()
    print(json.dumps({"photoVariants":count,"photoSheets":sheets,"fluffyRows":fluffy},ensure_ascii=False))
