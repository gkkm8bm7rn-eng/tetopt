from pathlib import Path
import subprocess
import sys

root = Path(__file__).resolve().parents[1]
source_path = root / "tools" / "build_color_review_sheet.py"
source = source_path.read_text(encoding="utf-8")
source = source.replace(
    "confirmed = {1,2,3,4,5,6,7,8,10,11,19,20,21,22,23,24,25,26,27,30,31,32,33,51,52,63,64,69,70,71,72}",
    "confirmed = {1,2,3,4,5,6,7,8,10,11,19,20,21,22,23,24,25,26,27,30,31,32,33,51,52,63,64,69,70,71,72,74,75,77,78,79,80,81,87,88,89,90}",
)
source = source.replace("партия 2", "партия 3")
source = source.replace("color-review-batch-02", "color-review-batch-03")
generated = root / "tools" / ".build_color_review_sheet_batch03.py"
generated.write_text(source, encoding="utf-8")
subprocess.run([sys.executable, str(generated)], check=True, cwd=root)
