import re
from pathlib import Path

# Remove the obsolete hand-drawn favorite layer from enhancements.css.
ep=Path('enhancements.css')
enh=ep.read_text(encoding='utf-8')
marker='\n:root{--fav-outline:'
if marker in enh:
    enh=enh.split(marker,1)[0].rstrip()+'\n'
ep.write_text(enh,encoding='utf-8')

# card-polish.css is the visual component layer loaded last. Keep one definitive
# favorite/cart implementation here and remove the old icon drawings first.
cp=Path('card-polish.css')
css=cp.read_text(encoding='utf-8')
start='/* FORMA FAVORITE ICON SYSTEM — exact reference assets */'
if start in css:
    css=css.split(start,1)[0].rstrip()+'\n'
for pat in [
    r'\.product-visual-controls \.favorite(?:\.active)?\{[^}]*\}',
    r'\.recent-favorite(?:\.active)?\{[^}]*\}',
    r'\.site-header \.action-icon\{[^}]*\}',
    r'\.site-header \.cart-icon\{[^}]*\}',
    r'\.site-header \.cart-icon::before\{[^}]*\}',
    r'\.site-header \.cart-icon::after\{[^}]*\}',
]:
    css=re.sub(pat,'',css)

component=r'''/* FORMA FAVORITE ICON SYSTEM — exact reference assets */
:root{
  --favorite-inactive-image:url("assets/ui/favorite-inactive.png");
  --favorite-active-image:url("assets/ui/favorite-active.png");
  --cart-trolley-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Cpath d='M7 11h8l6 30h28l7-21H20' fill='none' stroke='%2320201d' stroke-width='4' stroke-linecap='round' stroke-linejoin='round'/%3E%3Cpath d='M24 49h25' fill='none' stroke='%2320201d' stroke-width='4' stroke-linecap='round'/%3E%3Ccircle cx='27' cy='55' r='3.6' fill='%2320201d'/%3E%3Ccircle cx='48' cy='55' r='3.6' fill='%2320201d'/%3E%3C/svg%3E");
}
button[data-favorite]{
  --favorite-image:var(--favorite-inactive-image);--favorite-width:46px;
  position:relative!important;width:54px!important;height:58px!important;min-width:54px!important;min-height:58px!important;
  padding:0!important;border:0!important;border-radius:0!important;background:transparent!important;box-shadow:none!important;backdrop-filter:none!important;
  color:transparent!important;font-size:0!important;line-height:0!important;text-shadow:none!important;-webkit-text-stroke:0!important;-webkit-text-fill-color:transparent!important;
  overflow:visible!important;opacity:1!important;
}
button[data-favorite].active{--favorite-image:var(--favorite-active-image);background:transparent!important;color:transparent!important}
button[data-favorite]::before{content:""!important;position:absolute!important;z-index:1;left:50%;top:50%;width:var(--favorite-width);height:62px;transform:translate(-50%,-50%);background:var(--favorite-image) center/var(--favorite-width) auto no-repeat!important;pointer-events:none}
button[data-favorite]::after{content:none!important;display:none!important}
.product-visual-controls .favorite{right:5px!important;top:4px!important;--favorite-width:46px}
.recent-favorite{top:4px!important;right:4px!important;z-index:2!important;--favorite-width:40px;width:46px!important;height:50px!important;min-width:46px!important;min-height:50px!important}
.detail-favorite{--favorite-width:50px;width:58px!important;height:62px!important;min-width:58px!important;min-height:62px!important}
.site-header,.site-header .header-actions{overflow:visible!important}
.site-header .favorites-button{position:relative!important;display:flex!important;align-items:center!important;justify-content:center!important;width:auto!important;min-width:154px!important;height:50px!important;min-height:50px!important;padding:0 16px 0 58px!important;border:1px solid #d7dfd3!important;border-radius:15px!important;background:#fff!important;color:#20201d!important;box-shadow:0 6px 18px rgba(49,77,50,.08)!important;overflow:visible!important;font-weight:750!important}
.site-header .favorites-button .action-icon{display:none!important}
.site-header .favorites-button::before{content:""!important;position:absolute!important;left:-7px;top:50%;width:70px;height:78px;transform:translateY(-50%);background:var(--favorite-active-image) center/64px auto no-repeat!important;pointer-events:none!important}
.site-header .favorites-button::after{content:"Избранное"!important;font-size:14px;font-weight:750;line-height:1;color:#20201d}
.site-header .favorites-button:hover{background:#f7f5f0!important}
.site-header .cart-button{position:relative!important;display:grid!important;place-items:center!important;width:50px!important;min-width:50px!important;height:50px!important;min-height:50px!important;padding:0!important;border:1px solid #d7dfd3!important;border-radius:15px!important;background:#fff!important;color:#20201d!important;box-shadow:0 6px 18px rgba(49,77,50,.08)!important}
.site-header .cart-button:hover{background:#f7f5f0!important}
.site-header .cart-icon{display:block!important;width:30px!important;height:30px!important;background:var(--cart-trolley-image) center/contain no-repeat!important;font-size:0!important;-webkit-text-stroke:0!important}
.site-header .cart-icon::before,.site-header .cart-icon::after{content:none!important;display:none!important;border:0!important;box-shadow:none!important}
.site-header .action-count{z-index:4!important;top:-6px!important;right:-6px!important;background:#435d41!important;color:#fff!important;border:2px solid #f7f5f0!important}
@media(max-width:640px){
  button[data-favorite]{--favorite-width:42px;width:50px!important;height:54px!important;min-width:50px!important;min-height:54px!important}
  .recent-favorite{--favorite-width:36px;width:42px!important;height:46px!important;min-width:42px!important;min-height:46px!important}
  .detail-favorite{--favorite-width:46px;width:54px!important;height:58px!important;min-width:54px!important;min-height:58px!important}
  .site-header .favorites-button{min-width:132px!important;height:46px!important;min-height:46px!important;padding-left:50px!important;padding-right:10px!important}
  .site-header .favorites-button::before{left:-7px;width:64px;height:72px;background-size:58px auto!important}
  .site-header .favorites-button::after{font-size:12px}
  .site-header .cart-button{width:46px!important;min-width:46px!important;height:46px!important;min-height:46px!important}
  .site-header .cart-icon{width:28px!important;height:28px!important}
}
'''
cp.write_text(css.rstrip()+'\n'+component,encoding='utf-8')

# Remove legacy visible glyphs from markup/templates. Classes, data attributes,
# aria labels and click behavior stay untouched.
ip=Path('index.html')
html=ip.read_text(encoding='utf-8')
html=html.replace('<span class="action-icon" aria-hidden="true">♡</span>','<span class="action-icon" aria-hidden="true"></span>')
ip.write_text(html,encoding='utf-8')

ap=Path('app.js')
app=ap.read_text(encoding='utf-8')
app=app.replace("${favorite?'♥':'♡'}",'')
ap.write_text(app,encoding='utf-8')
