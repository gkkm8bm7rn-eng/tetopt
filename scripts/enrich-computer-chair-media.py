#!/usr/bin/env python3
import argparse, io, json, re, time, unicodedata, zipfile
from pathlib import Path
from urllib.parse import urljoin
from difflib import SequenceMatcher

import requests
from bs4 import BeautifulSoup

ROOT=Path(__file__).resolve().parents[1]
DETAIL_DIR=ROOT/'data'/'details'
AUDIT_PATH=ROOT/'data'/'computer-chair-photo-audit.json'
ASSET_ROOT=ROOT/'assets'/'products'
HEADERS={'User-Agent':'Mozilla/5.0 (compatible; FORMA-HOME-media-audit/1.0; +https://gkkm8bm7rn-eng.github.io/tetopt/)'}
COLLECTION_URLS=[
    'https://tetchair.ru/kollekcii/kresla-tetchair/',
    'https://tetchair.ru/kollekcii/kresla-tetchair-import/',
]
OLD_URLS=[
    'https://tetchair.ru/catalog_old/kompyuternye-kresla/geymerskie-kresla/',
    'https://tetchair.ru/catalog_old/kompyuternye-kresla/kresla-dlya-rukovoditeley/',
    'https://tetchair.ru/catalog_old/kompyuternye-kresla/kresla-dlya-personala/',
    'https://tetchair.ru/catalog_old/kompyuternye-kresla/detskie-kresla/',
    'https://tetchair.ru/catalog_old/kompyuternye-kresla/ofisnye-kresla/',
]
STOPWORDS={'кресло','chair','new','newnew','новинка','импорт','tetchair','шт','упаковке','упаковка','опора','мод','mod','на','полозьях','металбл'}
COLOR_MAP={
 'black':'черный','черная':'черный','черное':'черный','чёрный':'черный','чёрная':'черный','чёрное':'черный',
 'grey':'серый','gray':'серый','cерый':'серый','серая':'серый','серое':'серый','графит':'графит',
 'beige':'бежевый','бежевая':'бежевый','беж':'бежевый','brown':'коричневый','коричневая':'коричневый',
 'blue':'синий','синяя':'синий','red':'красный','красная':'красный','pink':'розовый','розовая':'розовый',
 'orange':'оранжевый','оранжевая':'оранжевый','green':'зеленый','зелёный':'зеленый','зеленая':'зеленый',
 'olive':'оливковый','олива':'оливковый','лаванда':'лаванда','lavender':'лаванда','white':'белый','белая':'белый',
 'metallic':'металлик','металлический':'металлик','bronze':'бронза','бронзовый':'бронза','бронзовая':'бронза',
 'св':'светло','светло-коричневый':'светло-коричневый','молочный':'молочный','milk':'молочный',
 'голубой':'голубой','бирюзовый':'бирюзовый','бордовый':'бордовый','горчичный':'горчичный',
}
MATERIAL_WORDS={'флок','ткань','велюр','букле','экокожа','кожзам','сетка','вельвет','рогожка','иск','кожа','пластик','металл','хром'}
IMAGE_EXTENSIONS={'.jpg','.jpeg','.png','.webp','.bmp','.tif','.tiff'}
PHOTO_TARGET=7
GALLERY_MAX=10
INFO_MAX=2


def norm(s):
    s=unicodedata.normalize('NFKC',str(s or '')).lower().replace('ё','е')
    s=s.replace('кож/зам','кожзам').replace('кож.зам','кожзам').replace('искусственная кожа','экокожа')
    s=re.sub(r'\bnew\b',' ',s)
    s=re.sub(r'[^a-zа-я0-9]+',' ',s)
    return re.sub(r'\s+',' ',s).strip()


def raw_tokens(s):
    return [x for x in norm(s).split() if len(x)>1 and x not in STOPWORDS]


def canon_token(t): return COLOR_MAP.get(t,t)
def tokens(s): return [canon_token(x) for x in raw_tokens(s)]


def colors(s):
    out=set()
    known=set(COLOR_MAP.values())
    for x in tokens(s):
        if x in known: out.add(x)
    n=norm(s)
    if 'светло коричнев' in n or 'св коричнев' in n: out.add('светло-коричневый')
    if 'темно сер' in n: out.add('темно-серый')
    if 'светло сер' in n: out.add('светло-серый')
    return out


def distinctive_codes(s):
    n=norm(s); found=set()
    for m in re.finditer(r'\b(?:tw|hyp|kub|hlr|c|w|f)\s*[-]?\s*\d+[a-zа-я0-9-]*\b',n): found.add(re.sub(r'\s+','',m.group(0)))
    for m in re.finditer(r'\b\d{1,3}-\d{1,3}\b',n): found.add(m.group(0))
    for m in re.finditer(r'(?<!\d)\d{1,3}(?!\d)',n):
        value=m.group(0)
        if value not in {'22','24','26','360','120','125','130','140','150','160','180','200'}: found.add(value)
    return found


def model_aliases(name):
    n=str(name or ''); n=re.sub(r'^\s*кресло\s+','',n,flags=re.I); aliases=[]
    if '/' in n:
        left,right=n.split('/',1); aliases.append(norm(re.sub(r'\([^)]*\).*','',left)))
        right0=re.split(r'\s+(?:хром|опора|на\s+полозьях|металбл|metalbl)\b',right,1,flags=re.I)[0]
        aliases.append(norm(re.sub(r'\([^)]*\).*','',right0)))
    else:
        plain=re.sub(r'\([^)]*\).*','',n)
        plain=re.sub(r'\s+(?:хром|опора|на\s+полозьях|металбл|metalbl)\b.*$','',plain,flags=re.I)
        aliases.append(norm(plain))
    aliases += [norm(x) for x in re.findall(r'[A-Za-z][A-Za-z0-9-]{2,}',n)]
    aliases=[a for a in aliases if len(a)>=3 and a not in {'new','хром','metalbl'}]
    return list(dict.fromkeys(aliases))


def load_repo_variants():
    out=[]
    for path in sorted(DETAIL_DIR.glob('*.json')):
        data=json.loads(path.read_text(encoding='utf-8'))
        for product in data.get('products',{}).values():
            if not re.match(r'^Кресла\s+TETCHAIR',product.get('collection',''),flags=re.I): continue
            for variant in product.get('variants',[]):
                out.append({'shard':path.name,'productId':product['id'],'name':product['name'],'collection':product.get('collection',''),'sourceId':str(variant['sourceId']),'specs':variant.get('specs',''),'primaryImage':variant.get('primaryImage',''),'existingImages':list(variant.get('images') or []),'existingImageCount':len(variant.get('images') or []),'aliases':model_aliases(product['name'])})
    return out


def scrape_supplier(session):
    entries={}
    for base in COLLECTION_URLS+OLD_URLS:
        empty=0
        for pos in range(0,240,12):
            url=base if pos==0 else f'{base}?curPos={pos}'
            try:
                r=session.get(url,headers=HEADERS,timeout=30)
                if r.status_code!=200: break
            except Exception: break
            soup=BeautifulSoup(r.text,'html.parser'); found=0
            for a in soup.find_all('a',href=True):
                href=urljoin(url,a['href'])
                if '/products/' not in href or not href.endswith('.html'): continue
                text=' '.join(a.stripped_strings)
                if not text: continue
                m=re.search(r'Код\s*:\s*(\d+)',text,re.I)
                title=re.split(r'\s+Код\s*:',text,maxsplit=1,flags=re.I)[0]
                title=re.sub(r'^\s*НОВИНКА\s*','',title,flags=re.I).strip(); code=m.group(1) if m else None
                key=href.split('?',1)[0]; prev=entries.get(key,{})
                entries[key]={'url':key,'title':title or prev.get('title',''),'code':code or prev.get('code'),'sourcePage':base}; found+=1
            if found==0:
                empty+=1
                if empty>=2: break
            else: empty=0
            time.sleep(.05)
    for entry in entries.values():
        if entry.get('code') and entry.get('title'): continue
        try:
            r=session.get(entry['url'],headers=HEADERS,timeout=30); soup=BeautifulSoup(r.text,'html.parser'); text=soup.get_text(' ',strip=True)
            m=re.search(r'Код\s*:\s*(\d+)',text,re.I); h=soup.find('h1') or soup.find('h2')
            entry['code']=entry.get('code') or (m.group(1) if m else None); entry['title']=entry.get('title') or (' '.join(h.stripped_strings) if h else '')
        except Exception: pass
        time.sleep(.05)
    return [e for e in entries.values() if e.get('title') and e.get('code')]


def candidate_score(repo,supplier):
    title=supplier['title']; ntitle=norm(title); aliases=repo['aliases']
    matched_alias=[a for a in aliases if a and (a in ntitle or ntitle.find(a.replace(' ',''))>=0)]
    alias_tokens={t for a in aliases for t in a.split() if len(t)>=3}; supplier_tokens=set(tokens(title))
    if not matched_alias and not (alias_tokens & supplier_tokens): return None
    repo_text=f"{repo['name']} {repo['specs']}"; rt=set(tokens(repo_text)); st=supplier_tokens; common=rt&st
    score=4.0+min(5.0,len(common)*.45)
    rc=colors(repo['specs']); sc=colors(title)
    if rc and sc:
        overlap=rc&sc; score += (4.0+min(2.0,len(overlap)*.5)) if overlap else -5.5
    rcodes=distinctive_codes(repo['specs']); scodes=distinctive_codes(title); score+=min(7.0,len(rcodes&scodes)*2.25)
    rm={t for t in rt if t in MATERIAL_WORDS}; sm={t for t in st if t in MATERIAL_WORDS}; score+=min(2.0,len(rm&sm)*.5)
    score+=SequenceMatcher(None,norm(repo_text),ntitle).ratio()*3.0
    rn=norm(repo['name'])
    for marker in ['хром','полозьях','24','26','22','metalbl','металбл']:
        if marker in rn: score += 1.2 if marker in ntitle else -1.2
    return round(score,3)


def match_variants(repo_variants,supplier_entries):
    results=[]
    for repo in repo_variants:
        scored=[]
        for sup in supplier_entries:
            score=candidate_score(repo,sup)
            if score is not None: scored.append((score,sup))
        scored.sort(key=lambda x:x[0],reverse=True); best=scored[0] if scored else None; second=scored[1] if len(scored)>1 else None
        status='unmatched'; reason='no model candidate'
        if best:
            margin=best[0]-(second[0] if second else 0); rc=colors(repo['specs']); bc=colors(best[1]['title']); color_ok=not rc or not bc or bool(rc&bc)
            exact_code_overlap=bool(distinctive_codes(repo['specs'])&distinctive_codes(best[1]['title'])); unique_model=len(scored)==1
            exact_title=norm(repo['specs']) and all(token in set(tokens(best[1]['title'])) for token in set(tokens(repo['specs'])) if len(token)>=3 and token not in MATERIAL_WORDS)
            if best[0]>=11 and margin>=1.4 and color_ok: status='matched'; reason='high confidence'
            elif best[0]>=10 and color_ok and exact_title: status='matched'; reason='exact salient spec match'
            elif best[0]>=9.5 and margin>=2.4 and color_ok and (exact_code_overlap or unique_model): status='matched'; reason='confident unique/spec match'
            else: status='review'; reason=f'best={best[0]:.2f}, margin={margin:.2f}, color_ok={color_ok}'
        row={k:v for k,v in repo.items() if k!='aliases'}; row['aliases']=repo['aliases']; row['status']=status; row['reason']=reason
        row['match']=({'score':best[0],**best[1]} if best else None); row['runnerUp']=({'score':second[0],**second[1]} if second else None); results.append(row)
    return results


def audit():
    session=requests.Session(); repo=load_repo_variants(); supplier=scrape_supplier(session); matches=match_variants(repo,supplier)
    summary={'repoVariants':len(repo),'supplierEntries':len(supplier),'matched':sum(x['status']=='matched' for x in matches),'review':sum(x['status']=='review' for x in matches),'unmatched':sum(x['status']=='unmatched' for x in matches),'existingImages':sum(x['existingImageCount'] for x in matches)}
    payload={'generatedAt':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'summary':summary,'variants':matches}
    AUDIT_PATH.write_text(json.dumps(payload,ensure_ascii=False,indent=2),encoding='utf-8'); print(json.dumps(summary,ensure_ascii=False))


def download_zip(session,code,mode='photo'):
    suffix='' if mode=='photo' else '&only_info=1'
    url=f'https://price.tetchair.ru/download_photo/?id={code}{suffix}'
    for attempt in range(3):
        try:
            r=session.get(url,headers=HEADERS,timeout=75)
            r.raise_for_status()
            return zipfile.ZipFile(io.BytesIO(r.content)),url
        except Exception:
            if attempt==2: raise
            time.sleep(1.5*(attempt+1))


def image_members(archive,info=False):
    members=[item for item in archive.infolist() if not item.is_dir() and Path(item.filename).suffix.lower() in IMAGE_EXTENSIONS]
    def key(item):
        name=norm(Path(item.filename).stem)
        if info:
            preferred=0 if re.search(r'размер|габарит|схем|инфограф',name) else 1
            num=int(re.search(r'(\d+)',name).group(1)) if re.search(r'(\d+)',name) else 999
            return preferred,num,name
        main=0 if re.search(r'основн|main|front|фасад',name) else 1
        num=int(re.search(r'(\d+)',name).group(1)) if re.search(r'(\d+)',name) else 0
        return main,num,name
    return sorted(members,key=key)


def open_image(data):
    from PIL import Image,ImageOps
    img=Image.open(io.BytesIO(data)); img=ImageOps.exif_transpose(img); img.load()
    return img


def dhash(img,size=8):
    from PIL import Image
    gray=img.convert('L').resize((size+1,size),Image.Resampling.LANCZOS)
    px=list(gray.getdata()); value=0
    for y in range(size):
        row=y*(size+1)
        for x in range(size): value=(value<<1)|(1 if px[row+x]>px[row+x+1] else 0)
    return value


def hamming(a,b): return (a^b).bit_count()


def existing_hashes(paths):
    hashes=[]
    from PIL import Image
    for rel in paths:
        path=ROOT/rel
        if not path.exists(): continue
        try:
            with Image.open(path) as img: hashes.append(dhash(img))
        except Exception: pass
    return hashes


def save_webp(img,path,info=False):
    from PIL import Image
    limit=1800 if info else 1500
    img=img.copy(); img.thumbnail((limit,limit),Image.Resampling.LANCZOS)
    if img.mode not in {'RGB','RGBA'}: img=img.convert('RGBA' if 'A' in img.getbands() else 'RGB')
    path.parent.mkdir(parents=True,exist_ok=True)
    img.save(path,'WEBP',quality=88 if info else 83,method=6)


def next_media_path(folder,kind,index):
    while True:
        path=folder/f'pb-{kind}-{index:02d}.webp'
        if not path.exists(): return path,index
        index+=1


def get_variant(shard_data,product_id,source_id):
    product=shard_data.get('products',{}).get(product_id)
    if not product: return None
    return next((v for v in product.get('variants',[]) if str(v.get('sourceId'))==str(source_id)),None)


def enrich_one(session,row,shards):
    match=row.get('match') or {}; code=str(match.get('code') or '')
    if not code: return {'sourceId':row['sourceId'],'status':'error','error':'supplier code missing'}
    shard_name=row['shard']; shard=shards.setdefault(shard_name,json.loads((DETAIL_DIR/shard_name).read_text(encoding='utf-8')))
    variant=get_variant(shard,row['productId'],row['sourceId'])
    if not variant: return {'sourceId':row['sourceId'],'status':'error','error':'variant missing in shard'}
    source_id=str(row['sourceId']); folder=ASSET_ROOT/source_id; folder.mkdir(parents=True,exist_ok=True)
    images=list(dict.fromkeys(variant.get('images') or ([variant.get('primaryImage')] if variant.get('primaryImage') else [])))
    # Never mix another variant's folder into a computer-chair gallery.
    own=[p for p in images if re.search(rf'(?:^|/)assets/products/{re.escape(source_id)}/',p)]
    if own: images=own
    hashes=existing_hashes(images)
    added=[]; photo_added=0; info_added=0
    try:
        photo_zip,photo_url=download_zip(session,code,'photo')
        photo_index=1
        for member in image_members(photo_zip,False):
            if len(images)>=PHOTO_TARGET: break
            try: img=open_image(photo_zip.read(member))
            except Exception: continue
            fingerprint=dhash(img)
            if any(hamming(fingerprint,h)<=4 for h in hashes): continue
            out_path,photo_index=next_media_path(folder,'photo',photo_index); photo_index+=1
            save_webp(img,out_path,False); rel=out_path.relative_to(ROOT).as_posix(); images.append(rel); added.append(rel); hashes.append(fingerprint); photo_added+=1
    except Exception as exc:
        return {'sourceId':source_id,'status':'error','error':f'photo download: {exc}'}
    info_url=None
    if len(images)<GALLERY_MAX:
        try:
            info_zip,info_url=download_zip(session,code,'info'); info_index=1
            for member in image_members(info_zip,True):
                if len(images)>=GALLERY_MAX or info_added>=INFO_MAX: break
                try: img=open_image(info_zip.read(member))
                except Exception: continue
                fingerprint=dhash(img)
                if any(hamming(fingerprint,h)<=4 for h in hashes): continue
                out_path,info_index=next_media_path(folder,'info',info_index); info_index+=1
                save_webp(img,out_path,True); rel=out_path.relative_to(ROOT).as_posix(); images.append(rel); added.append(rel); hashes.append(fingerprint); info_added+=1
        except Exception:
            pass
    variant['images']=images[:GALLERY_MAX]; variant['localImageCount']=len(variant['images'])
    variant['photoBankCode']=int(code) if code.isdigit() else code
    variant['photoBankSource']=match.get('url') or photo_url
    variant['photoBankEnrichedAt']=time.strftime('%Y-%m-%d',time.gmtime())
    variant['photoBankImageCount']=len([p for p in variant['images'] if f'assets/products/{source_id}/pb-' in p])
    return {'sourceId':source_id,'productId':row['productId'],'name':row['name'],'supplierCode':code,'status':'updated' if added else 'unchanged','before':row.get('existingImageCount',0),'after':len(variant['images']),'photoAdded':photo_added,'infoAdded':info_added,'files':added,'photoUrl':photo_url,'infoUrl':info_url}


def apply_batch(batch_index,batch_size):
    if not AUDIT_PATH.exists(): raise SystemExit('Audit file is missing; run audit first.')
    audit_data=json.loads(AUDIT_PATH.read_text(encoding='utf-8'))
    eligible=[row for row in audit_data.get('variants',[]) if row.get('status')=='matched' and row.get('match',{}).get('code')]
    eligible.sort(key=lambda r:(r['shard'],int(r['sourceId']) if str(r['sourceId']).isdigit() else str(r['sourceId'])))
    start=batch_index*batch_size; batch=eligible[start:start+batch_size]
    if not batch:
        print(json.dumps({'batchIndex':batch_index,'batchSize':batch_size,'eligible':len(eligible),'processed':0,'done':True},ensure_ascii=False)); return
    session=requests.Session(); shards={}; results=[]
    for position,row in enumerate(batch,1):
        result=enrich_one(session,row,shards); results.append(result); print(json.dumps({'position':position,'of':len(batch),**result},ensure_ascii=False),flush=True)
    for name,data in shards.items(): (DETAIL_DIR/name).write_text(json.dumps(data,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
    audit_data.setdefault('applyRuns',[]).append({'at':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'batchIndex':batch_index,'batchSize':batch_size,'start':start,'end':start+len(batch),'results':results})
    audit_data['applySummary']={'eligible':len(eligible),'lastBatch':batch_index,'updatedThisBatch':sum(r['status']=='updated' for r in results),'unchangedThisBatch':sum(r['status']=='unchanged' for r in results),'errorsThisBatch':sum(r['status']=='error' for r in results)}
    AUDIT_PATH.write_text(json.dumps(audit_data,ensure_ascii=False,indent=2),encoding='utf-8')
    if any(r['status']=='error' for r in results): raise SystemExit('One or more supplier downloads failed; batch data and errors were recorded.')
    print(json.dumps({'batchIndex':batch_index,'batchSize':batch_size,'eligible':len(eligible),'processed':len(batch),'updated':sum(r['status']=='updated' for r in results),'addedFiles':sum(len(r.get('files',[])) for r in results)},ensure_ascii=False))


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--audit',action='store_true',help='Refresh supplier matching audit')
    parser.add_argument('--apply',action='store_true',help='Apply one high-confidence audit batch')
    parser.add_argument('--batch-index',type=int,default=0)
    parser.add_argument('--batch-size',type=int,default=12)
    args=parser.parse_args()
    if args.apply: apply_batch(args.batch_index,args.batch_size)
    else: audit()


if __name__=='__main__': main()
