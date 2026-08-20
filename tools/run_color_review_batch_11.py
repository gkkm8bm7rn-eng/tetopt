from pathlib import Path
import subprocess
import sys

root = Path(__file__).resolve().parents[1]
source_path = root / "tools" / "build_color_review_sheet.py"
source = source_path.read_text(encoding="utf-8")
source = source.replace(
    "confirmed = {1,2,3,4,5,6,7,8,10,11,19,20,21,22,23,24,25,26,27,30,31,32,33,51,52,63,64,69,70,71,72}",
    "confirmed = {1,2,3,4,5,6,7,8,10,11,19,20,21,22,23,24,25,26,27,30,31,32,33,51,52,63,64,69,70,71,72,74,75,77,78,79,80,81,87,88,89,90,91,93,97,99,101,102,103,118,119,123,124,125,127,128,129,130,131,132,133,134,135,136,137,138,139,140,141,142,147,148,149,150,151,152,153,154,157,158,159,160,161,162,176,177,181,182,184,185,186,187,188,191,192,193,194,195,197,198,199,200,201,202,203,204,222,223,224,225,226,227,231,233,239,240,241,242,244,245,246,247,248,249,250,251,252,257,258,259,260,261,262,264,265,266,267,268,269,270,271,273,275,276,277,278,279,280,281,282,283,286,287,288,290,291,292,293,294,295,296}",
)
source = source.replace("12 - len(chosen)", "20 - len(chosen)")
source = source.replace("width, card_w, card_h, cols, gap, top = 1800, 570, 520, 3, 30, 110", "width, card_w, card_h, cols, gap, top = 2000, 470, 500, 4, 24, 110")
source = source.replace("image.thumbnail((450, 280)", "image.thumbnail((350, 260)")
source = source.replace("x + 85 + (467-image.width)//2", "x + 70 + (365-image.width)//2")
source = source.replace("y + 18 + (282-image.height)//2", "y + 18 + (262-image.height)//2")
source = source.replace("width=43", "width=35")
source = source.replace("width=60", "width=50")
source = source.replace("партия 2", "партия 11 — 20 товаров")
source = source.replace("color-review-batch-02", "color-review-batch-11")
generated = root / "tools" / ".build_color_review_sheet_batch11.py"
generated.write_text(source, encoding="utf-8")
subprocess.run([sys.executable, str(generated)], check=True, cwd=root)
