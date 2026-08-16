from pathlib import Path
p=Path('card-polish.css')
s=p.read_text(encoding='utf-8')
old='.category-row{margin-inline:-16px;padding-inline:16px}'
new='.category-row{margin-inline:0;padding-inline:0}'
if old not in s:
    raise SystemExit('mobile category-row rule not found')
s=s.replace(old,new,1)
p.write_text(s,encoding='utf-8')
