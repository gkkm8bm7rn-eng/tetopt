#!/usr/bin/env python3
import io,json,re,time,zipfile
from pathlib import Path
import requests
from PIL import Image,ImageOps
ROOT=Path(__file__).resolve().parents[1]; DETAIL=ROOT/'data'/'details'; INDEX=ROOT/'data'/'catalog-index.json'; ASSETS=ROOT/'assets'/'products'; REPORT=ROOT/'data'/'october-photo-import-report.json'
GOOD_IDS=[26189,14122,21217,13068,15854,14265,20575,15181,15182,15173,14120,20576,14119,20500,14105,19705,20068,10469,21175,26349,25165,25162,25163,25159,19729,20617,20618,19730,20622,21852,25453,21859,26161,26162,26158,26159,26160,26362,26363,26364,15095,15090,26178,26180,26181,12827,20121,21281,20654,20666,20668,24400,24415,24403,20573,25895,25967,25753,25754,25971,25978,25979,25980,25981,25406,25805,25213,25988,26151,26152,26153,26154,15556,19232,19234,19939,19185,19336,19337,24672,21206,21215,24343,24344,24349,17252,21254,21255,21250,24991,24992,24993,24994,24995,24996,24997,24998,26190,11724,12654,11464,19827,19828,19829,21263,21264,24821,19258,19259,24284,20186,20187,20100,25185,25913,25914,25966,26224,26225,26227,25117,25181,25127,24945,21616,25084,25917,25918,26006,26007,25507,26335,26336,25720,25182,25183,25515,25148,25702,25931,13912,19377,19290,19293,19269,25902,25904,25906,25656,25715,25848,25909,26038,26039,15056,25036,25049,13375,13566,15330,14440,25815,13859,26106,26107,26220,2271,24729,20194,25772,24855,24856,24857,25711,24852,21801,24858,24859,26264,26243,26244,26239,26242,26245,26246,21231,21885,20602,25727,25728,20536,24245,21447,20535,21417,21298,21452,21453,21454,21456,26210,26211,26212,5774,6803,8194,11971,10522,5773,13746,13747,13748,13749,13750,13751,13752,13753,25871,25872,25873,25874,25747,14367,14368,25746,26149,26150,24831,25636,5489,5418,7190,5791,5509,9894,13537,13535,14148,10270,10318,10271,10265,10557,11202,10263,10264,11158,11190]
HEADERS={'User-Agent':'Mozilla/5.0 (compatible; TETOpt-october-media/1.0)'}; EXT={'.jpg','.jpeg','.png','.webp','.bmp','.tif','.tiff'}
def dhash(im,size=8):
 g=im.convert('L').resize((size+1,size),Image.Resampling.LANCZOS); p=list(g.getdata()); v=0
 for y in range(size):
  for x in range(size): v=(v<<1)|(p[y*(size+1)+x]>p[y*(size+1)+x+1])
 return int(v)
def ham(a,b): return (a^b).bit_count()
def open_img(b):
 im=Image.open(io.BytesIO(b)); im=ImageOps.exif_transpose(im); im.load(); return im
def save_webp(im,path):
 im=im.copy(); im.thumbnail((1500,1500),Image.Resampling.LANCZOS)
 if im.mode not in {'RGB','RGBA'}: im=im.convert('RGBA' if 'A' in im.getbands() else 'RGB')
 path.parent.mkdir(parents=True,exist_ok=True); im.save(path,'WEBP',quality=83,method=6)
def get_zip(s,good):
 u=f'https://price.tetchair.ru/download_photo/?id={good}'
 for n in range(3):
  try:
   r=s.get(u,headers=HEADERS,timeout=90); r.raise_for_status(); return zipfile.ZipFile(io.BytesIO(r.content)),u
  except Exception:
   if n==2: raise
   time.sleep(2*(n+1))
def members(z):
 a=[m for m in z.infolist() if not m.is_dir() and Path(m.filename).suffix.lower() in EXT and m.file_size<=40*1024*1024]
 def key(m):
  n=Path(m.filename).stem.lower(); main=0 if re.search(r'основн|main|front|фасад',n) else 1; q=re.search(r'(\d+)',n); return (main,int(q.group(1)) if q else 999,n)
 return sorted(a,key=key)
def target_count(name,category):
 t=(name+' '+category).lower()
 if any(x in t for x in ['офисн','компьютер','кресло','диван','кровать']): return 7
 if any(x in t for x in ['стол раздвиж','раздвижной','качалка','мамасан','папасан']): return 5
 return 3
def main():
 assert len(GOOD_IDS)==248
 shards={}; loc={}
 for p in sorted(DETAIL.glob('*.json')):
  d=json.loads(p.read_text(encoding='utf-8')); shards[p.name]=d
  for product in d.get('products',{}).values():
   for v in product.get('variants',[]): loc[int(v['sourceId'])]=(p.name,product,v)
 before_old={sid:json.dumps(v,ensure_ascii=False,sort_keys=True) for sid,(_,_,v) in loc.items() if sid<1724}
 idx=json.loads(INDEX.read_text(encoding='utf-8')); idxv={int(v['sourceId']):v for p in idx['products'] for v in p['variants']}
 s=requests.Session(); results=[]
 for pos,(sid,good) in enumerate(zip(range(1724,1972),GOOD_IDS),1):
  if sid not in loc: raise RuntimeError(f'missing sourceId {sid}')
  shard,product,v=loc[sid]; current=v.get('primaryImage') or ((v.get('images') or [None])[0]); cover_hash=None
  if current:
   try:
    rr=s.get(current,headers=HEADERS,timeout=45); rr.raise_for_status(); cover_hash=dhash(open_img(rr.content))
   except Exception: pass
  try: z,url=get_zip(s,good)
  except Exception as e:
   results.append({'sourceId':sid,'goodId':good,'status':'needs-photo-search','error':str(e),'count':0,'files':[]})
   print(f'{pos}/248 sourceId={sid} goodId={good} needs-photo-search: {e}',flush=True)
   continue
  candidates=[]
  for m in members(z):
   try:
    raw=z.read(m); im=open_img(raw)
    if min(im.size)<250: continue
    candidates.append((m.filename,im,dhash(im)))
   except Exception: continue
  if not candidates:
   results.append({'sourceId':sid,'goodId':good,'status':'needs-photo-search','error':'no usable photos','count':0,'files':[]}); continue
  if cover_hash is not None: candidates.sort(key=lambda x:ham(cover_hash,x[2]))
  chosen=[]; hashes=[]; limit=target_count(product.get('name',''),v.get('category',''))
  for item in candidates:
   if any(ham(item[2],h)<=4 for h in hashes): continue
   chosen.append(item); hashes.append(item[2])
   if len(chosen)>=limit: break
  if not chosen:
   results.append({'sourceId':sid,'goodId':good,'status':'needs-photo-search','error':'no unique photos','count':0,'files':[]}); continue
  folder=ASSETS/str(sid); folder.mkdir(parents=True,exist_ok=True)
  for old in folder.glob('oct-*.webp'): old.unlink()
  paths=[]
  for i,item in enumerate(chosen):
   fn='oct-00-main.webp' if i==0 else f'oct-{i:02d}.webp'; out=folder/fn; save_webp(item[1],out); paths.append(out.relative_to(ROOT).as_posix())
  v['images']=paths; v['primaryImage']=paths[0]; v['localImageCount']=len(paths); v['primaryImageVerified']=True; v['primaryImageSourceId']=sid; v['primaryImageManifest']='supplier-photo-bank-2026-10-local'; v['primaryImageStatus']='verified-supplier-photobank-local'; v['photoBankCode']=good; v['photoBankSource']=url; v['photoBankEnrichedAt']=time.strftime('%Y-%m-%d',time.gmtime())
  idxv[sid]['primaryImage']=paths[0]
  results.append({'sourceId':sid,'goodId':good,'count':len(paths),'coverMatchDistance':None if cover_hash is None else ham(cover_hash,chosen[0][2]),'files':paths})
  print(f'{pos}/248 sourceId={sid} goodId={good} photos={len(paths)}',flush=True)
 after_old={sid:json.dumps(v,ensure_ascii=False,sort_keys=True) for sid,(_,_,v) in loc.items() if sid<1724}
 if before_old!=after_old: raise RuntimeError('old variants changed')
 if len(results)!=248 or len({r['sourceId'] for r in results})!=248: raise RuntimeError('incomplete results')
 for name,d in shards.items(): (DETAIL/name).write_text(json.dumps(d,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
 INDEX.write_text(json.dumps(idx,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
 REPORT.write_text(json.dumps({'generatedAt':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'count':248,'results':results},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
 print(json.dumps({'ok':True,'processed':248,'photosReady':sum(r['count']>0 for r in results),'needsReview':sum(r['count']==0 for r in results),'files':sum(r['count'] for r in results)},ensure_ascii=False))
if __name__=='__main__': main()
