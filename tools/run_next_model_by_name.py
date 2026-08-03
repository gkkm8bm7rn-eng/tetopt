from pathlib import Path

root = Path(__file__).resolve().parents[1]
source_path = root / "tools" / "build_next_model_by_name.py"
source = source_path.read_text(encoding="utf-8")
source = source.replace(
    'if "стул" not in name.lower():\n        continue',
    'if not re.match(r"^\\s*стул\\b", name, re.I):\n        continue',
)
exec(compile(source, str(source_path), "exec"), {"__name__": "__main__", "__file__": str(source_path)})
