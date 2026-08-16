from pathlib import Path

# Simplify favorites to standard heart glyphs and remove image-hydration logic.
app_path=Path('app.js')
app=app_path.read_text(encoding='utf-8')
start="const FAVORITE_ICON_INACTIVE='assets/ui/favorite-inactive.png',FAVORITE_ICON_ACTIVE='assets/ui/favorite-active.png';"
end="function cartRows()"
if start in app:
    a=app.index(start)
    b=app.index(end,a)
    replacement="function syncFavoriteButtons(id=null){document.querySelectorAll('[data-favorite]').forEach(button=>{if(id!==null&&String(button.dataset.favorite)!==String(id))return;const active=state.favorites.includes(button.dataset.favorite);button.classList.toggle('active',active);button.setAttribute('aria-label',active?'Убрать из избранного':'Добавить в избранное')})}\nfunction toggleFavorite(id){const active=!state.favorites.includes(id);state.favorites=active?[...state.favorites,id]:state.favorites.filter(x=>x!==id);storage.write('forma:favorites',state.favorites);updateCounters();if(state.view==='favorites')applyFilters();else syncFavoriteButtons(id);renderRecent();syncFavoriteButtons();toast(active?'Добавили в избранное':'Убрали из избранного')}\n"
    app=app[:a]+replacement+app[b:]
# Remove hydration calls that were only needed for img injection.
app=app.replace("els.grid.innerHTML=list.map(cardTemplate).join('');syncFavoriteButtons();els.empty.hidden=!!list.length;renderPagination()","els.grid.innerHTML=list.map(cardTemplate).join('');els.empty.hidden=!!list.length;renderPagination()")
app=app.replace("els.detail.innerHTML=detailTemplate(p,currentVariant(p,p._selected));syncFavoriteButtons();renderRecent()","els.detail.innerHTML=detailTemplate(p,currentVariant(p,p._selected));renderRecent()")
app=app.replace("els.detail.innerHTML=detailTemplate(p,currentVariant(p,sourceId));syncFavoriteButtons()","els.detail.innerHTML=detailTemplate(p,currentVariant(p,sourceId))")
app=app.replace("$('#recentRow').innerHTML=p.map(recentCardTemplate).join('');syncFavoriteButtons()","$('#recentRow').innerHTML=p.map(recentCardTemplate).join('')")
app_path.write_text(app,encoding='utf-8')

css_path=Path('card-polish.css')
css=css_path.read_text(encoding='utf-8')
for marker in ['/* FORMA FAVORITE ICON SYSTEM — exact reference assets as real image elements */','/* FORMA FAVORITE ICON SYSTEM — exact reference assets, direct rendering */']:
    if marker in css:
        css=css.split(marker,1)[0].rstrip()+'\n'
        break
component='''/* FORMA FAVORITE CONTROLS — simple native hearts, no image layers */
button[data-favorite]{position:relative;display:grid;place-items:center;padding:0;border:0;background:transparent;box-shadow:none;color:#b74736;cursor:pointer;line-height:1;overflow:visible;z-index:8}
button[data-favorite]::before{content:"♡";display:block;font-family:Arial,Helvetica,sans-serif;font-size:39px;font-weight:400;line-height:1;color:#b74736}
button[data-favorite].active::before{content:"♥";color:#b74736}
button[data-favorite]::after{content:none!important;display:none!important}
.product-visual-controls .favorite{position:absolute!important;right:11px!important;left:auto!important;top:10px!important;width:46px!important;height:46px!important;min-width:46px!important;min-height:46px!important}
.recent-favorite{position:absolute!important;right:8px!important;left:auto!important;top:8px!important;width:42px!important;height:42px!important;min-width:42px!important;min-height:42px!important}.recent-favorite::before{font-size:34px}
.detail-favorite{width:50px!important;height:50px!important;min-width:50px!important;min-height:50px!important}.detail-favorite::before{font-size:40px}
.site-header,.site-header .header-actions{overflow:visible!important}
.site-header .favorites-button{position:relative!important;display:flex!important;align-items:center!important;gap:8px!important;min-width:138px!important;height:50px!important;padding:0 13px!important;border:1px solid #d7dfd3!important;border-radius:15px!important;background:#fff!important;color:#20201d!important;box-shadow:0 6px 18px rgba(49,77,50,.08)!important;font-weight:750!important}
.site-header .favorites-button .action-icon{display:grid!important;place-items:center!important;width:34px!important;height:34px!important;flex:0 0 34px!important;color:#b74736!important;font-size:0!important;-webkit-text-stroke:0!important}
.site-header .favorites-button .action-icon::before{content:"♥";font-family:Arial,Helvetica,sans-serif;font-size:32px;line-height:1;color:#b74736}
.site-header .favorites-button::before{content:none!important}.site-header .favorites-button::after{content:"Избранное"!important;font-size:14px;font-weight:750;line-height:1;color:#20201d}
.site-header .cart-button{position:relative!important;display:grid!important;place-items:center!important;width:50px!important;min-width:50px!important;height:50px!important;min-height:50px!important;padding:0!important;border:1px solid #d7dfd3!important;border-radius:15px!important;background:#fff!important;color:#20201d!important;box-shadow:0 6px 18px rgba(49,77,50,.08)!important}
.site-header .cart-icon{display:block!important;width:30px!important;height:30px!important;background:none!important;font-size:0!important;-webkit-text-stroke:0!important}
.site-header .cart-icon::before{content:""!important;display:block!important;position:absolute;left:10px;top:11px;width:23px;height:14px;border:2px solid #20201d;border-top:0;transform:skewX(-7deg)}
.site-header .cart-icon::after{content:"●  ●"!important;display:block!important;position:absolute;left:10px;top:25px;font-size:10px;letter-spacing:8px;color:#20201d;white-space:nowrap}
.site-header .action-count{z-index:9!important;top:-6px!important;right:-6px!important;background:#435d41!important;color:#fff!important;border:2px solid #f7f5f0!important}
@media(max-width:640px){.product-visual-controls .favorite{right:8px!important;top:8px!important;width:42px!important;height:42px!important;min-width:42px!important;min-height:42px!important}.product-visual-controls .favorite::before{font-size:35px}.recent-favorite{width:38px!important;height:38px!important;min-width:38px!important;min-height:38px!important}.recent-favorite::before{font-size:31px}.site-header .favorites-button{min-width:124px!important;height:46px!important}.site-header .favorites-button .action-icon{width:30px!important;height:30px!important;flex-basis:30px!important}.site-header .favorites-button .action-icon::before{font-size:28px}.site-header .favorites-button::after{font-size:12px}.site-header .cart-button{width:46px!important;min-width:46px!important;height:46px!important;min-height:46px!important}}
'''
css_path.write_text(css+component,encoding='utf-8')
