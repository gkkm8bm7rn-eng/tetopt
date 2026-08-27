#!/usr/bin/env python3
import json, os, re, sys, time, urllib.request
from pathlib import Path
from urllib.parse import urlparse

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'audit-report.json'
SHOTS=ROOT/'audit-screens'; SHOTS.mkdir(exist_ok=True)
WORKER='https://tetopt.m78m6cfc2v.workers.dev/'
PAGES='https://gkkm8bm7rn-eng.github.io/tetopt/'


def load(path): return json.loads((ROOT/path).read_text(encoding='utf-8'))

def repo_asset_tree():
    req=urllib.request.Request('https://api.github.com/repos/gkkm8bm7rn-eng/tetopt/git/trees/main?recursive=1',headers={'Accept':'application/vnd.github+json','User-Agent':'tetopt-audit'})
    token=os.environ.get('GITHUB_TOKEN')
    if token: req.add_header('Authorization',f'Bearer {token}')
    with urllib.request.urlopen(req,timeout=60) as response: data=json.load(response)
    if data.get('truncated'): raise RuntimeError('GitHub recursive tree was truncated')
    return {x['path']:x.get('size',0) for x in data.get('tree',[]) if x.get('type')=='blob' and x.get('path','').startswith('assets/products/')}

def folder(path):
    m=re.match(r'^assets/products/([^/]+)/',str(path or '').lstrip('/'))
    return m.group(1) if m else None

def source_audit():
    errors=[]; warnings=[]
    assets=repo_asset_tree()
    index=load('data/catalog-index.json'); assignments=load('data/category-assignments.json')
    shards={}
    all_details={}
    for p in sorted((ROOT/'data/details').glob('*.json')):
        d=json.loads(p.read_text(encoding='utf-8')); key=f'details/{p.name}'; shards[key]=d
        for pid,product in (d.get('products') or {}).items():
            if pid in all_details: errors.append(f'duplicate detail product {pid}')
            all_details[pid]=product
    products=index.get('products') or []
    seen_sources={}; primary_sizes=[]; cross=[]; undeclared=[]; primary_not_gallery=[]
    missing_primary=[]; missing_gallery=[]; wrong_primary=[]; no_own=[]; mismatch=[]; bad_prices=[]
    for product in products:
        pid=product.get('id'); rel=product.get('detailShard'); detail=(shards.get(rel,{}).get('products') or {}).get(pid)
        if not pid: errors.append('catalog product without id'); continue
        if not detail: errors.append(f'{pid}: missing detail in {rel}'); continue
        cvs=product.get('variants') or []; dvs=detail.get('variants') or []
        if product.get('variantCount')!=len(cvs): errors.append(f'{pid}: catalog variantCount mismatch')
        if detail.get('variantCount')!=len(dvs): errors.append(f'{pid}: detail variantCount mismatch')
        by={str(v.get('sourceId')):v for v in dvs if v.get('sourceId') is not None}
        for cv in cvs:
            sid=str(cv.get('sourceId'))
            if sid=='None': errors.append(f'{pid}: sourceId missing'); continue
            if sid in seen_sources and seen_sources[sid]!=pid: errors.append(f'sourceId {sid} duplicated across models')
            seen_sources[sid]=pid
            dv=by.get(sid)
            if not dv: mismatch.append(f'{pid}/{sid}: missing detail variant'); continue
            for field in ('specs','wholesalePrice','retailPrice','primaryImage','axes'):
                if cv.get(field)!=dv.get(field): mismatch.append(f'{pid}/{sid}:{field}')
            for field in ('wholesalePrice','retailPrice'):
                v=cv.get(field)
                if not isinstance(v,(int,float)) or v<0: bad_prices.append(f'{pid}/{sid}:{field}')
            primary=cv.get('primaryImage')
            if not primary or primary not in assets: missing_primary.append(f'{pid}/{sid}:{primary}')
            else: primary_sizes.append((assets[primary],pid,sid,primary))
            if folder(primary) and folder(primary)!=sid: wrong_primary.append(f'{pid}/{sid}:{primary}')
            images=dv.get('images') or []; merged={str(x) for x in dv.get('mergedDuplicateSourceIds',[])}; own=[]
            if images and primary not in images: primary_not_gallery.append(f'{pid}/{sid}')
            for image in images:
                if image not in assets: missing_gallery.append(f'{pid}/{sid}:{image}')
                fid=folder(image)
                if fid==sid: own.append(image)
                elif fid:
                    cross.append(f'{pid}/{sid}:{fid}:{image}')
                    if fid not in merged: undeclared.append(f'{pid}/{sid}:{fid}:{image}')
            if images and not own: no_own.append(f'{pid}/{sid}')
    assignment_map=assignments.get('assignments') or {}
    unknown_assign=sorted(set(assignment_map)-set(seen_sources))
    valid_codes={str(i) for i in range(1,19)}
    bad_codes=sorted({str(c) for codes in assignment_map.values() if isinstance(codes,list) for c in codes if str(c) not in valid_codes})
    stats=index.get('stats') or {}; variants=sum(len(p.get('variants') or []) for p in products); dual=sum(1 for p in products for v in p.get('variants',[]) if (v.get('axes') or {}).get('soft') and (v.get('axes') or {}).get('hard'))
    if stats.get('models')!=len(products): errors.append(f"stats.models {stats.get('models')} != {len(products)}")
    if stats.get('variants')!=variants: errors.append(f"stats.variants {stats.get('variants')} != {variants}")
    if stats.get('dualAxisVariants')!=dual: errors.append(f"stats.dualAxisVariants {stats.get('dualAxisVariants')} != {dual}")
    groups={'missing_primary':missing_primary,'missing_gallery':missing_gallery,'wrong_primary_source':wrong_primary,'variant_without_own_media':no_own,'index_detail_mismatch':mismatch,'invalid_prices':bad_prices,'unknown_category_assignment_source':unknown_assign,'invalid_category_codes':bad_codes}
    for name,vals in groups.items():
        if vals: errors.append(f'{name}: {len(vals)}')
    if undeclared: warnings.append(f'undeclared cross-source gallery refs: {len(undeclared)}')
    if primary_not_gallery: warnings.append(f'primary not included in detail gallery: {len(primary_not_gallery)}')
    primary_sizes.sort(reverse=True)
    over300=[x for x in primary_sizes if x[0]>300000]; over500=[x for x in primary_sizes if x[0]>500000]
    if over300: warnings.append(f'primary images >300KB: {len(over300)}')
    app=(ROOT/'app.js').read_text(encoding='utf-8'); media=(ROOT/'media-policy.js').read_text(encoding='utf-8'); sw=(ROOT/'sw.js').read_text(encoding='utf-8'); feedback=(ROOT/'cart-feedback.js').read_text(encoding='utf-8'); html=(ROOT/'index.html').read_text(encoding='utf-8')
    architecture={
      'compact_index':"catalog-index.json" in app,
      'detail_fallback':'raw.githubusercontent.com' in media,
      'gallery_source_isolation':'mediaSourceId(path)===sourceId' in media,
      'stable_image_cache':"IMAGE_CACHE='forma-images-v1'" in sw,
      'cache_first_images':'async function imageCacheFirst' in sw and 'if(cached)return cached' in sw,
      'same_origin_runtime_rewrite':'localAssetUrl' in feedback,
      'service_worker_registered':"navigator.serviceWorker.register('./sw.js'" in feedback,
      'app_emits_github_asset_urls':"ASSET_BASE='https://gkkm8bm7rn-eng.github.io/tetopt/'" in app,
    }
    for k,v in architecture.items():
        if k!='app_emits_github_asset_urls' and not v: errors.append(f'architecture failed: {k}')
    if architecture['app_emits_github_asset_urls']: warnings.append('app.js still creates GitHub Pages image src before runtime same-origin rewrite; live audit must verify no request race')
    ids=['productGrid','resultCount','catalogTitle','categoryRow','pagination','emptyState','productDetail','productDialog','cartDialog','cartItems','cartFooter','toast','favoritesToolbar','shareFavorites','searchForm','searchInput','sortSelect','priceMin','priceMax','multiVariant','filterToggle','clearFilters','emptyReset','cartButton','favoritesButton','recentSection','recentRow']
    missing_ids=[x for x in ids if f'id="{x}"' not in html]
    if missing_ids: errors.append('missing DOM ids: '+','.join(missing_ids))
    shell=['index.html','styles.css','enhancements.css','axes.css','ui.css','media-policy.js','variants.js','app.js','search-fallback.js','cart-feedback.js','data/catalog-index.json','data/category-assignments.json']
    return {'errors':errors,'warnings':warnings,'metrics':{'models':len(products),'variants':variants,'detail_products':len(all_details),'tracked_product_images':len(assets),'cross_gallery_refs':len(cross),'undeclared_cross_gallery_refs':len(undeclared),'primary_over_300kb':len(over300),'primary_over_500kb':len(over500),'largest_primary_images':[{'bytes':s,'product':p,'sourceId':sid,'path':path} for s,p,sid,path in primary_sizes[:15]],'shell_bytes':sum((ROOT/x).stat().st_size for x in shell)},'architecture':architecture,'samples':{'undeclared_cross':undeclared[:20],'primary_not_gallery':primary_not_gallery[:20]}}

def waitfn(page,expr,arg=None,timeout=30000):
    if arg is None: return page.wait_for_function(expr,timeout=timeout)
    return page.wait_for_function(expr,arg=arg,timeout=timeout)

def browser_case(pw,url,label,engine='chromium',device=None,slow=False,smoke=True):
    browser=getattr(pw,engine).launch(headless=True)
    if device:
        opts=dict(pw.devices[device]);
        if engine=='webkit': opts.pop('user_agent',None)
        context=browser.new_context(**opts)
    else: context=browser.new_context(viewport={'width':1440,'height':900})
    page=context.new_page(); console=[]; errors=[]; failed=[]
    page.on('console',lambda m: console.append(m.text) if m.type=='error' else None)
    page.on('pageerror',lambda e: errors.append(str(e)))
    page.on('requestfailed',lambda r: failed.append(f'{r.method} {r.url}: {r.failure}'))
    session=None
    if slow and engine=='chromium':
        session=context.new_cdp_session(page); session.send('Network.enable'); session.send('Network.setCacheDisabled',{'cacheDisabled':True}); session.send('Network.emulateNetworkConditions',{'offline':False,'latency':400,'downloadThroughput':50*1024,'uploadThroughput':50*1024,'connectionType':'cellular3g'})
    checks={}; timings={}; t=time.perf_counter()
    try:
        page.goto(url,wait_until='domcontentloaded',timeout=90000); waitfn(page,"document.querySelectorAll('#productGrid .product-card').length>0",timeout=90000); timings['catalog_ms']=round((time.perf_counter()-t)*1000)
        count=2 if device else 3
        try: waitfn(page,"n=>{const a=[...document.querySelectorAll('#productGrid .product-image-stage img')].slice(0,n);return a.length===n&&a.every(x=>x.complete&&x.naturalWidth>0)}",count,90000); checks['first_visible_images']=True
        except Exception: checks['first_visible_images']=False
        timings['first_images_ms']=round((time.perf_counter()-t)*1000)
        cards=page.locator('#productGrid .product-card').count(); checks['catalog_cards']=1<=cards<=24; checks['catalog_available']='Каталог временно недоступен' not in page.locator('body').inner_text(); checks['no_horizontal_overflow']=bool(page.evaluate('document.documentElement.scrollWidth<=innerWidth+3'))
        img=page.locator('#productGrid .product-image-stage img').first; src=img.get_attribute('src') or ''; checks['first_image_decoded']=bool(img.evaluate('x=>x.naturalWidth>0')); checks['first_image_same_origin']=urlparse(src).hostname==urlparse(url).hostname
        priorities=page.locator('#productGrid .product-image-stage img').evaluate_all("xs=>xs.slice(0,8).map(x=>({loading:x.loading,priority:x.getAttribute('fetchpriority'),src:x.src}))")
        sid=page.locator('#productGrid .quick-add').first.get_attribute('data-source')
        if smoke:
            fb=int(page.locator('#favoritesCount').inner_text()); page.locator('#productGrid .favorite').first.click(); waitfn(page,"n=>Number(document.querySelector('#favoritesCount').textContent)>n",fb,10000); checks['favorite']=True
            cb=int(page.locator('#cartCount').inner_text()); add=page.locator('#productGrid .quick-add').first
            if add.is_visible(): add.click()
            else: page.locator("#productGrid [data-card-cart-delta='1']").first.click()
            waitfn(page,"n=>Number(document.querySelector('#cartCount').textContent)>n",cb,10000); checks['add_cart']=True
            page.locator('#cartButton').click(); waitfn(page,"document.querySelector('#cartDialog').open",timeout=10000); checks['cart_drawer']=page.locator('#cartItems .cart-item').count()>0; page.locator('[data-close-cart]').click(); waitfn(page,"!document.querySelector('#cartDialog').open",timeout=10000)
            alt=page.locator("#productGrid .card-swatch:not(.active):not([disabled]),#productGrid .axis-swatch:not(.active):not([disabled]),#productGrid .variant-text:not(.active):not([disabled])")
            checks['variant_selector']='not_on_first_page'
            if alt.count(): alt.first.click(); page.wait_for_timeout(250); checks['variant_selector']=True
            page.locator('#productGrid .product-image-stage').first.click(); waitfn(page,"document.querySelector('#productDialog').open&&document.querySelector('#productDetail .detail')",timeout=30000); checks['detail']=True
            try: waitfn(page,"document.querySelector('#galleryMain')?.complete&&document.querySelector('#galleryMain')?.naturalWidth>0",timeout=30000); checks['detail_image']=True
            except Exception: checks['detail_image']=False
            nav=page.locator("#productDetail [data-gallery-photo='1']")
            if nav.count(): old=page.locator('#galleryMain').get_attribute('src'); nav.click(); waitfn(page,"old=>document.querySelector('#galleryMain')?.src!==old",old,10000); checks['gallery_nav']=True
            else: checks['gallery_nav']='single_image'
            page.locator('[data-close-dialog]').click(); waitfn(page,"!document.querySelector('#productDialog').open",timeout=15000); checks['recent']=page.locator('#recentSection:not([hidden]) .recent-card').count()>0
            page.locator(".category-primary [data-main-category='office']").click(); waitfn(page,"document.querySelector('#catalogTitle').textContent.includes('Офис')",timeout=10000); checks['category']=page.locator('#productGrid .product-card').count()>0
            page.locator('#searchInput').fill(str(sid)); page.locator('#searchForm .search-submit').click(); waitfn(page,"document.querySelector('#catalogTitle').textContent.startsWith('Поиск:')",timeout=10000); checks['article_search']=page.locator('#productGrid .product-card').count()>0
            page.locator('#searchInput').fill(''); page.locator('#searchForm .search-submit').click(); page.wait_for_timeout(200); p2=page.locator("#pagination [data-page='2']")
            if p2.count(): p2.click(); waitfn(page,"location.hash.includes('page=2')",timeout=10000); checks['pagination']=True
            else: checks['pagination']='not_applicable'
            page.locator('#favoritesButton').click(); waitfn(page,"document.querySelector('#catalogTitle').textContent==='Избранное'",timeout=10000); checks['favorites_view']=page.locator('#productGrid .product-card').count()>0
        page.screenshot(path=str(SHOTS/f'{label}.png'),full_page=False)
        if slow and session:
            session.send('Network.setCacheDisabled',{'cacheDisabled':False}); t2=time.perf_counter(); page.goto(url,wait_until='domcontentloaded',timeout=90000); waitfn(page,"document.querySelectorAll('#productGrid .product-card').length>0",timeout=90000)
            try: waitfn(page,"n=>{const a=[...document.querySelectorAll('#productGrid .product-image-stage img')].slice(0,n);return a.length===n&&a.every(x=>x.complete&&x.naturalWidth>0)}",count,90000); checks['repeat_visible_images']=True
            except Exception: checks['repeat_visible_images']=False
            timings['repeat_first_images_ms']=round((time.perf_counter()-t2)*1000); checks['sw_controls_repeat']=bool(page.evaluate('!!navigator.serviceWorker?.controller')); checks['image_cache_repeat']=bool(page.evaluate("caches.keys().then(xs=>xs.some(x=>x.startsWith('forma-images')))"))
        false=[k for k,v in checks.items() if v is False]
        return {'label':label,'url':url,'engine':engine,'device':device or 'desktop','slow3g':slow,'timings':timings,'checks':checks,'critical_false':false,'first_image_src':src,'priorities':priorities,'console_errors':console[:15],'page_errors':errors[:15],'request_failures':failed[:20]}
    except Exception as e:
        try: page.screenshot(path=str(SHOTS/f'{label}-failure.png'),full_page=False)
        except Exception: pass
        return {'label':label,'url':url,'engine':engine,'device':device or 'desktop','slow3g':slow,'fatal':repr(e),'checks':checks,'timings':timings,'console_errors':console[:15],'page_errors':errors[:15],'request_failures':failed[:20]}
    finally: context.close(); browser.close()

def live_audit():
    from playwright.sync_api import sync_playwright
    out=[]
    with sync_playwright() as pw:
        for url,prefix in ((WORKER,'worker'),(PAGES,'pages')):
            out.append(browser_case(pw,url,prefix+'-desktop','chromium',None,False,True)); out.append(browser_case(pw,url,prefix+'-android','chromium','Pixel 5',False,True)); out.append(browser_case(pw,url,prefix+'-iphone','webkit','iPhone 13',False,True))
        out.append(browser_case(pw,WORKER,'worker-android-slow3g','chromium','Pixel 5',True,False)); out.append(browser_case(pw,WORKER,'worker-desktop-slow3g','chromium',None,True,False)); out.append(browser_case(pw,PAGES,'pages-android-slow3g','chromium','Pixel 5',True,False))
    return out

def main():
    report={'catalog':source_audit(),'live':[]}
    try: report['live']=live_audit()
    except Exception as e: report['live_fatal']=repr(e)
    OUT.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8'); print(json.dumps(report,ensure_ascii=False,indent=2))
    live_fail=[]
    for c in report.get('live',[]):
        if c.get('fatal'): live_fail.append(c['label']+': fatal '+c['fatal'])
        elif c.get('critical_false'): live_fail.append(c['label']+': '+str(c['critical_false']))
        if c.get('page_errors'): live_fail.append(c['label']+': page errors '+str(c['page_errors']))
    print('\nSUMMARY source_errors=',len(report['catalog']['errors']),'warnings=',len(report['catalog']['warnings']),'live_cases=',len(report.get('live',[])),'live_failures=',len(live_fail))
    for x in report['catalog']['errors'][:40]: print('SOURCE ERROR:',x)
    for x in live_fail[:40]: print('LIVE FAILURE:',x)
    return 1 if report['catalog']['errors'] or live_fail or report.get('live_fatal') else 0
if __name__=='__main__': sys.exit(main())
