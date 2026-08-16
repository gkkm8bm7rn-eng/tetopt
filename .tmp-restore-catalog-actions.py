from pathlib import Path
import re

# Restore catalogue interactions without touching favorites logic.
variants_path=Path('variants.js')
variants=variants_path.read_text(encoding='utf-8')
old='<div class="product-info"><h3 class="product-name">${escapeHtml(stripModel(product.name))}</h3>'
new='<div class="product-info" data-open="${escapeAttr(product.id)}"><h3 class="product-name">${escapeHtml(stripModel(product.name))}</h3>'
if old not in variants:
    raise SystemExit('product-info card pattern not found')
variants=variants.replace(old,new,1)
variants=variants.replace('>В корзину</button></div></div></article>`;', '>Добавить в заказ</button></div></div></article>`;',1)
variants_path.write_text(variants,encoding='utf-8')

styles_path=Path('styles.css')
styles=styles_path.read_text(encoding='utf-8')
if '.quick-add{display:none}' not in styles:
    raise SystemExit('expected legacy mobile quick-add hide rule not found')
styles=styles.replace('.quick-add{display:none}','',1)
styles_path.write_text(styles,encoding='utf-8')

index_path=Path('index.html')
html=index_path.read_text(encoding='utf-8')
old_cart='<span class="action-icon cart-icon" aria-hidden="true"></span>'
new_cart='<svg class="cart-trolley" aria-hidden="true" viewBox="0 0 32 32" fill="none"><path d="M3.5 5.5h3.2l2.7 13.1a2 2 0 0 0 2 1.6h11.7a2 2 0 0 0 1.9-1.4l2.2-8.1H8.1" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M11 24.6h12.7" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><circle cx="12.2" cy="27" r="1.8" fill="currentColor"/><circle cx="23" cy="27" r="1.8" fill="currentColor"/></svg>'
if old_cart not in html:
    raise SystemExit('header cart span pattern not found')
html=html.replace(old_cart,new_cart,1)
html,n=re.subn(r'\s*\.site-header \.cart-icon\{[^}]*\}\n\s*\.site-header \.cart-icon::before\{[^}]*\}\n\s*\.site-header \.cart-icon::after\{[^}]*\}\n','\n',html,count=1)
if n!=1:
    raise SystemExit('old inline cart renderer not found')
anchor='    .site-header .action-icon{display:grid;width:25px;height:25px;place-items:center;font-family:Arial,sans-serif;font-size:30px;font-weight:700;line-height:1;-webkit-text-stroke:1px currentColor}\n'
if anchor not in html:
    raise SystemExit('header action-icon style anchor not found')
html=html.replace(anchor,anchor+'    .site-header .cart-trolley{display:block;width:29px;height:29px;color:#20201d;overflow:visible}\n',1)
index_path.write_text(html,encoding='utf-8')
