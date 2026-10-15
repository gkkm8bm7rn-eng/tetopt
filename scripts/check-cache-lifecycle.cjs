const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),crypto=require('crypto').webcrypto;
const path=require('path');
const root=path.resolve(__dirname,'..');
const stores=new Map();
const cacheAPI={async keys(){return [...stores.keys()]},async delete(n){return stores.delete(n)},async open(n){if(!stores.has(n))stores.set(n,new Map());const map=stores.get(n);const key=r=>typeof r==='string'?r:r.url;return{async put(k,r){map.set(key(k),r.clone())},async match(k,opt={}){const target=new URL(key(k));for(const [u,r]of map){const a=new URL(u);if(opt.ignoreSearch?a.origin+a.pathname===target.origin+target.pathname:u===key(k))return r.clone()}},async keys(){return [...map.keys()].map(url=>({url}))},async delete(k){return map.delete(key(k))}}}};
function make(repo,revision=''){
 const scope='https://example.test/'+repo+'/',handlers={},control={mode:'normal',calls:0},ctx={URL,Request,Response,AbortController,crypto,Uint8Array,setTimeout,clearTimeout,caches:cacheAPI,self:{registration:{scope},clients:{claim:async()=>{}},skipWaiting:async()=>{},addEventListener:(t,fn)=>handlers[t]=fn},fetch:async(req,opt={})=>{
  control.calls++;const u=new URL(typeof req==='string'?req:req.url),name=u.pathname.slice(new URL(scope).pathname.length);
  if(control.mode==='offline')throw Error('offline');
  if(control.mode==='hang')return new Promise((resolve,reject)=>opt.signal.addEventListener('abort',()=>reject(Error('timeout'))));
  if(control.mode==='500')return new Response('server error',{status:500});
  if(control.mode==='badjson'&&name.endsWith('.json'))return new Response('{broken');
  if(control.mode==='tamper'&&name==='app.js')return new Response('different release');
  return new Response(fs.readFileSync(path.join(root,name)));
 }};
 let source=fs.readFileSync(path.join(root,'sw.js'),'utf8').replace('const FALLBACK_AFTER_MS=2500','const FALLBACK_AFTER_MS=15').replace('const NETWORK_TIMEOUT_MS=30000','const NETWORK_TIMEOUT_MS=75');
 if(revision)source=source.replace(/const SHELL_VERSION="([^"]+)"/,(_,v)=>'const SHELL_VERSION="'+v+revision+'"');vm.createContext(ctx);vm.runInContext(source,ctx);
 const value=expr=>vm.runInContext(expr,ctx);
 async function lifecycle(type){const ps=[];handlers[type]({waitUntil:p=>ps.push(p)});await Promise.all(ps)}
 async function request(path,destination='',mode='cors'){
  const background=[];let reply;handlers.fetch({request:{url:new URL(path,scope).href,method:'GET',destination,mode},respondWith:p=>reply=p,waitUntil:p=>background.push(p)});return {response:reply?await reply:undefined,settle:()=>Promise.all(background)};
 }
 return {scope,control,value,lifecycle,request};
}
(async()=>{
 stores.set('unrelated-cache',new Map());stores.set('forma-shell-legacy',new Map());
 for(const repo of ['tetopt','forma-designer-private']){
  const w=make(repo);await w.lifecycle('install');await w.lifecycle('activate');const current=w.value('SHELL_CACHE'),data=w.value('DATA_CACHE');
  assert(stores.has('unrelated-cache'));assert(stores.has('forma-shell-legacy'));
  const catalog=await (await cacheAPI.open(data)).match(w.scope+'data/catalog-index.json');assert(catalog,'First online activation must save catalog');
  const baseline=await catalog.text();w.control.mode='offline';
  const nav=await w.request('./','document','navigate');assert((await nav.response.text()).includes('storefront.css?v='));
  for(const asset of w.value('RESOURCES').slice(1)){const r=await w.request(asset.url,asset.url.startsWith('storefront')?'style':'script');assert.equal(r.response.status,200)}
  let r=await w.request('data/catalog-index.json');assert.equal(await r.response.text(),baseline);await r.settle();
  for(const mode of ['500','badjson','hang']){w.control.mode=mode;const start=Date.now();r=await w.request('data/catalog-index.json');assert.equal(await r.response.text(),baseline);if(mode==='hang')assert(Date.now()-start<65,'Cached fallback waited for full timeout');await r.settle();assert.equal(await (await (await cacheAPI.open(data)).match(w.scope+'data/catalog-index.json')).text(),baseline)}
  w.control.mode='offline';await assert.rejects(()=>w.request('storefront.css?v=nonexistent','style'));
  assert.equal((await w.request('../other-site/app.js','script')).response,undefined);
  const bad=make(repo,'-failed');bad.control.mode='tamper';await assert.rejects(()=>bad.lifecycle('install'));assert(stores.has(current));assert(!stores.has(bad.value('SHELL_CACHE')));
  const next=make(repo,'-next');await next.lifecycle('install');await next.lifecycle('activate');assert(stores.has(current),'Previous release must survive');assert(stores.has(data),'Catalog must survive release');
  console.log(repo+': PASS offline HTML/CSS/JS/catalog, 500, malformed JSON, slow timeout fallback, exact versions, interrupted install, persistent data and scoped cleanup');
 }
 const names=[...stores.keys()];assert(names.some(n=>n.includes('/tetopt/:shell:'))&&names.some(n=>n.includes('/forma-designer-private/:shell:')));
 console.log('PASS: both sites coexist without deleting each other or shared legacy caches');
})().catch(e=>{console.error(e);process.exitCode=1});
