from pathlib import Path
p=Path('card-polish.css')
s=p.read_text(encoding='utf-8')
old='@media(max-width:640px){.product-card{border-radius:18px}.product-card .product-info{padding:13px 13px 15px!important}.product-card .product-bottom{margin-top:11px}}'
new='@media(max-width:640px){.product-card{border-radius:18px}.product-card .product-info{padding:13px 13px 15px!important}.product-card .product-bottom{display:grid;grid-template-columns:minmax(0,1fr);gap:8px;margin-top:11px}.product-card .quick-add{width:100%;min-width:0;min-height:38px;padding:0 8px;font-size:11px;line-height:1.15;white-space:normal}}'
if old not in s:
    raise SystemExit('mobile product-bottom rule not found')
s=s.replace(old,new,1)
p.write_text(s,encoding='utf-8')
