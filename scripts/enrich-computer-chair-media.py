#!/usr/bin/env python3
import argparse, json, re, time, unicodedata
from pathlib import Path
from urllib.parse import urljoin
import requests
from bs4 import BeautifulSoup
from difflib import SequenceMatcher

ROOT=Path(__file__).resolve().parents[1]
DETAIL_DIR=ROOT/'data'/'details'
AUDIT_PATH=ROOT/'data'/'computer-chair-photo-audit.json'
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
}
MATERIAL_WORDS={'флок','ткань','велюр','букле','экокожа','кожзам','сетка','вельвет','рогожка','иск','кожа','пластик','металл','хром'}

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
    for x in tokens(s):
        if x in set(COLOR_MAP.values()): out.add(x)
    n=norm(s)
    if 'светло коричнев' in n: out.add('светло-коричневый')
    if 'темно сер' in n: out.add('темно-серый')
    if 'светло сер' in n: out.add('светло-серый')
    return out

def distinctive_codes(s):
    n=norm(s); found=set()
    for m in re.finditer(r'\b(?:tw|hyp|kub|hlr|c)\s*\d+[a-zа-я0-9-]*\b',n): found.add(re.sub(r'\s+','',m.group(0)))
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
    else: aliases.append(norm(re.sub(r'\([^)]*\).*','',n)))
    aliases += [norm(x) for x in re.findall(r'[A-Za-z][A-Za-z0-9-]{2,}',n)]
    aliases=[a for a in aliases if len(a)>=3 and a!='new']
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
            time.sleep(.08)
    for entry in entries.values():
        if entry.get('code') and entry.get('title'): continue
        try:
            r=session.get(entry['url'],headers=HEADERS,timeout=30); soup=BeautifulSoup(r.text,'html.parser'); text=soup.get_text(' ',strip=True)
            m=re.search(r'Код\s*:\s*(\d+)',text,re.I); h=soup.find('h1') or soup.find('h2')
            entry['code']=entry.get('code') or (m.group(1) if m else None); entry['title']=entry.get('title') or (' '.join(h.stripped_strings) if h else '')
        except Exception: pass
        time.sleep(.08)
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
            if best[0]>=11 and margin>=1.4 and color_ok: status='matched'; reason='high confidence'
            elif best[0]>=9.5 and margin>=2.4 and color_ok and (exact_code_overlap or unique_model): status='matched'; reason='confident unique/spec match'
            else: status='review'; reason=f'best={best[0]:.2f}, margin={margin:.2f}, color_ok={color_ok}'
        row={k:v for k,v in repo.items() if k!='aliases'}; row['aliases']=repo['aliases']; row['status']=status; row['reason']=reason
        row['match']=({'score':best[0],**best[1]} if best else None); row['runnerUp']=({'score':second[0],**second[1]} if second else None); results.append(row)
    return results

def main():
    argparse.ArgumentParser().parse_args(); session=requests.Session(); repo=load_repo_variants(); supplier=scrape_supplier(session); matches=match_variants(repo,supplier)
    summary={'repoVariants':len(repo),'supplierEntries':len(supplier),'matched':sum(x['status']=='matched' for x in matches),'review':sum(x['status']=='review' for x in matches),'unmatched':sum(x['status']=='unmatched' for x in matches),'existingImages':sum(x['existingImageCount'] for x in matches)}
    payload={'generatedAt':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'summary':summary,'variants':matches}
    AUDIT_PATH.write_text(json.dumps(payload,ensure_ascii=False,indent=2),encoding='utf-8'); print(json.dumps(summary,ensure_ascii=False))

if __name__=='__main__': main()
