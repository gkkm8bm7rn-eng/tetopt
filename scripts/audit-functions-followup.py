#!/usr/bin/env python3
import json, sys
from pathlib import Path
from playwright.sync_api import sync_playwright

OUT=Path('function-audit.json')
SITES=[('worker','https://tetopt.m78m6cfc2v.workers.dev/'),('pages','https://gkkm8bm7rn-eng.github.io/tetopt/')]
DEVICES=[('desktop','chromium',None),('android','chromium','Pixel 5'),('iphone','webkit','iPhone 13')]

def wait(page,expr,arg=None,timeout=20000):
    return page.wait_for_function(expr,arg=arg,timeout=timeout) if arg is not None else page.wait_for_function(expr,timeout=timeout)

def visible_prices(page):
    return page.locator('#productGrid .product-price').evaluate_all("xs=>xs.map(x=>Number(x.textContent.replace(/\\D/g,'')))")

def state_min_prices(page):
    return page.evaluate("state.filtered.slice(0,24).map(p=>minPrice(p))")

def run_case(pw,label,url,engine,device):
    browser=getattr(pw,engine).launch(headless=True)
    opts={} if not device else dict(pw.devices[device])
    if engine=='webkit': opts.pop('user_agent',None)
    if not device: opts['viewport']={'width':1440,'height':900}
    context=browser.new_context(**opts)
    page=context.new_page(); errors=[]; console=[]; checks={}; evidence={}
    page.on('pageerror',lambda e: errors.append(str(e)))
    page.on('console',lambda m: console.append(m.text) if m.type=='error' else None)
    try:
        page.goto(url,wait_until='domcontentloaded',timeout=60000)
        wait(page,"document.querySelectorAll('#productGrid .product-card').length>0",timeout=60000)
        checks['initial_catalog']=page.locator('#productGrid .product-card').count()==24

        # Sort controls: validate the internal sort order and separately record
        # whether prices shown on cards visually follow that order.
        page.locator('#sortSelect').select_option('price-asc'); page.wait_for_timeout(180)
        mins=state_min_prices(page); shown=visible_prices(page)
        checks['sort_price_asc_model_min']=mins==sorted(mins)
        checks['sort_price_asc_visible']=shown==sorted(shown)
        if not checks['sort_price_asc_visible']:
            evidence['price_asc_first_12']={'modelMin':mins[:12],'shown':shown[:12]}
        page.locator('#sortSelect').select_option('price-desc'); page.wait_for_timeout(180)
        mins2=state_min_prices(page); shown2=visible_prices(page)
        checks['sort_price_desc_model_min']=mins2==sorted(mins2,reverse=True)
        checks['sort_price_desc_visible']=shown2==sorted(shown2,reverse=True)
        if not checks['sort_price_desc_visible']:
            evidence['price_desc_first_12']={'modelMin':mins2[:12],'shown':shown2[:12]}
        page.locator('#sortSelect').select_option('featured'); page.wait_for_timeout(100)

        # Filters are intentionally collapsed until the user taps the filter button.
        if not page.locator('#priceMin').is_visible():
            page.locator('#filterToggle').click(); page.wait_for_timeout(120)
        checks['filter_panel_opens']=page.locator('#priceMin').is_visible()
        page.locator('#priceMin').fill('10000'); page.wait_for_timeout(180)
        state_mins=state_min_prices(page)
        checks['price_filter']=bool(state_mins) and min(state_mins)>=10000
        page.locator('#clearFilters').click(); page.wait_for_timeout(180)
        checks['filter_reset']=page.locator('#priceMin').input_value()==''

        page.locator('#multiVariant').check(); page.wait_for_timeout(180)
        checks['multi_variant_filter']=page.evaluate("state.filtered.length>0 && state.filtered.every(p=>p.variants.length>1)")
        page.locator('#multiVariant').uncheck(); page.wait_for_timeout(100)

        # Category and subcategory navigation.
        page.locator(".category-primary [data-main-category='interior']").click(); page.wait_for_timeout(120)
        page.locator("[data-category-code='1']").first.click(); page.wait_for_timeout(180)
        checks['subcategory']=page.locator('#catalogTitle').inner_text().strip()=='Стулья'

        # Article search.
        page.locator(".category-primary [data-main-category='all']").click(); page.wait_for_timeout(120)
        sid=page.locator('#productGrid .quick-add').first.get_attribute('data-source')
        page.locator('#searchInput').fill(sid); page.locator('#searchForm .search-submit').click(); page.wait_for_timeout(180)
        checks['article_search']=page.locator('#productGrid .product-card').count()>=1
        page.locator('#searchInput').fill(''); page.locator('#searchForm .search-submit').click(); page.wait_for_timeout(180)

        # Pagination.
        p2=page.locator("#pagination .page-button:not(.page-arrow)[data-page='2']")
        checks['pagination_button_unique']=p2.count()==1
        p2.click(); wait(page,"location.hash.includes('page=2')",timeout=10000)
        checks['pagination']=True
        page.locator("#pagination .page-button:not(.page-arrow)[data-page='1']").click(); page.wait_for_timeout(180)

        # Favorite + favorites view + share control.
        fav=page.locator('#productGrid .favorite').first; fav.click(); page.wait_for_timeout(120)
        checks['favorite_count']=int(page.locator('#favoritesCount').inner_text())>=1
        page.locator('#favoritesButton').click(); wait(page,"document.querySelector('#catalogTitle').textContent==='Избранное'",timeout=10000)
        checks['favorites_view']=page.locator('#productGrid .product-card').count()>=1
        checks['share_favorites_active']=page.locator('#shareFavorites:not([hidden])').count()==1

        # Return all and test cart quantity controls + checkout links.
        page.locator(".category-primary [data-main-category='all']").click(); page.wait_for_timeout(180)
        add=page.locator('#productGrid .quick-add').first; add.click(); page.wait_for_timeout(180)
        checks['cart_count']=int(page.locator('#cartCount').inner_text())>=1
        qty_plus=page.locator("#productGrid [data-card-cart-delta='1']").first
        if qty_plus.count():
            before=int(page.locator('#cartCount').inner_text()); qty_plus.click(); page.wait_for_timeout(120); checks['card_cart_plus']=int(page.locator('#cartCount').inner_text())==before+1
        else: checks['card_cart_plus']=False
        page.locator('#cartButton').click(); wait(page,"document.querySelector('#cartDialog').open",timeout=10000)
        checks['checkout_whatsapp']=page.locator("#cartFooter a[href^='https://wa.me/']").count()==1
        checks['checkout_telegram']=page.locator("#cartFooter a[href^='https://t.me/share/']").count()==1
        checks['checkout_email']=page.locator("#cartFooter a[href^='mailto:']").count()==1
        checks['share_cart']=page.locator('#cartFooter [data-share-cart]').count()==1
        before_remove=int(page.locator('#cartCount').inner_text())
        page.locator('#cartItems [data-remove]').first.click(); page.wait_for_timeout(180)
        checks['cart_remove']=int(page.locator('#cartCount').inner_text())<before_remove
        page.locator('[data-close-cart]').click(); wait(page,"!document.querySelector('#cartDialog').open",timeout=10000)

        # Detail, variant and gallery.
        page.locator('#productGrid .product-image-stage').first.click(); wait(page,"document.querySelector('#productDialog').open&&document.querySelector('#productDetail .detail')",timeout=30000)
        checks['detail_open']=True
        checks['detail_add_active']=page.locator('#productDetail [data-add]').count()==1
        alt=page.locator("#productDetail [data-variant]:not(.active):not([disabled]),#productDetail .axis-swatch:not(.active):not([disabled])")
        if alt.count(): alt.first.click(); page.wait_for_timeout(280); checks['detail_variant']=True
        else: checks['detail_variant']='not_applicable'
        nav=page.locator("#productDetail [data-gallery-photo='1']")
        if nav.count():
            old=page.locator('#galleryMain').get_attribute('src'); nav.click(); wait(page,"old=>document.querySelector('#galleryMain').src!==old",old,10000); checks['gallery_next']=True
        else: checks['gallery_next']='single_image'
        page.locator('[data-close-dialog]').click(); wait(page,"!document.querySelector('#productDialog').open",timeout=15000)
        checks['recent_visible']=page.locator('#recentSection:not([hidden]) .recent-card').count()>=1

        checks['no_horizontal_overflow']=bool(page.evaluate('document.documentElement.scrollWidth<=window.innerWidth+3'))
        checks['no_page_errors']=not errors
        checks['no_console_errors']=not console
        return {'label':label,'checks':checks,'false':[k for k,v in checks.items() if v is False],'evidence':evidence,'page_errors':errors,'console_errors':console[:10]}
    except Exception as e:
        return {'label':label,'fatal':repr(e),'checks':checks,'evidence':evidence,'page_errors':errors,'console_errors':console[:10]}
    finally:
        context.close(); browser.close()

def main():
    results=[]
    with sync_playwright() as pw:
        for site,url in SITES:
            for dev,engine,device in DEVICES:
                results.append(run_case(pw,f'{site}-{dev}',url,engine,device))
    OUT.write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(results,ensure_ascii=False,indent=2))
    bad=[x for x in results if x.get('fatal') or x.get('false')]
    print('BAD_CASES',len(bad))
    return 1 if bad else 0
if __name__=='__main__': sys.exit(main())
