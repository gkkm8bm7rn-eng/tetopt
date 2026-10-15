/* Generated with build-release.py. Cache ownership is the full registration
   scope, never a shared origin-wide prefix. */
const SHELL_VERSION="20261015-cache-isolation-92ce0fb2e3";
const RESOURCES=[
  {
    "url": "index.html?release=20261015-cache-isolation-92ce0fb2e3",
    "key": "index.html",
    "sha256": "e6dc2ef9699b7e830a346465334756e041dccdd2aa9422bf759ea6866b62fa52"
  },
  {
    "url": "storefront.css?v=20261015-cache-isolation-92ce0fb2e3",
    "sha256": "308a03ce12bcf7de2d4b01c6b404a6fd64a17c96625a479b4e6b12df9d9d1063"
  },
  {
    "url": "media-policy.js?v=20261015-cache-isolation-92ce0fb2e3",
    "sha256": "a1e20ccc4317eac8b3513d59729dad499f2f4b04f6c829d2c2aa4f49e6a67a21"
  },
  {
    "url": "variants.js?v=20261015-cache-isolation-92ce0fb2e3",
    "sha256": "59dfcb3a415e3fb8bd76e0095b98d395f9e87d4761e4f6dd578729b3b06f2e52"
  },
  {
    "url": "app.js?v=20261015-cache-isolation-92ce0fb2e3",
    "sha256": "eba135b2ff7caacd57517b6050036b3bc6ab6e78ce1efa2d369159253c591142"
  },
  {
    "url": "search-fallback.js?v=20261015-cache-isolation-92ce0fb2e3",
    "sha256": "4cc7168e260f63ebe0ecfa67ac2c16016bbb8049bb3c19d8d44b6db8a73f236e"
  },
  {
    "url": "cart-feedback.js?v=20261015-cache-isolation-92ce0fb2e3",
    "sha256": "a32a6186b0708cfdcff6cf7028ea50e41df9148c36e7753fc308a5cf10a5fd28"
  }
];
const SCOPE=self.registration.scope;
const PREFIX=`storefront:${SCOPE}:`;
const SHELL_CACHE=`${PREFIX}shell:${SHELL_VERSION}`;
const DATA_CACHE=`${PREFIX}data:v1`;
const IMAGE_CACHE=`${PREFIX}images:v1`;
const INDEX=new URL('index.html',SCOPE).href;
const MAX_IMAGES=80;
const FALLBACK_AFTER_MS=2500;
const NETWORK_TIMEOUT_MS=30000;
const absolute=value=>new URL(typeof value==='string'?value:value.url,SCOPE).href;
const owned=url=>url.origin===new URL(SCOPE).origin&&url.pathname.startsWith(new URL(SCOPE).pathname);

async function timedFetch(request,options={}){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),NETWORK_TIMEOUT_MS);
  try{return await fetch(request,{...options,signal:controller.signal})}
  finally{clearTimeout(timer)}
}
async function safePut(cache,key,response){
  try{await cache.put(key,response.clone())}catch{/* Storage pressure must not fail a successful network response. */}
}
function keepAlive(event,promise){event.waitUntil(promise.catch(()=>{}))}

self.addEventListener('install',event=>event.waitUntil((async()=>{
  // Validate all bytes BEFORE writing the candidate cache. A failed deployment
  // or interrupted download leaves the currently active release intact.
  try{
    const downloaded=await Promise.all(RESOURCES.map(async asset=>{
      const response=await timedFetch(absolute(asset.url),{cache:'reload'});
      if(!response.ok)throw Error(`Incomplete release: ${asset.url}`);
      const bytes=await response.clone().arrayBuffer();
      const digest=await crypto.subtle.digest('SHA-256',bytes);
      const hex=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
      if(hex!==asset.sha256)throw Error(`Release checksum mismatch: ${asset.url}`);
      return [absolute(asset.key||asset.url),response];
    }));
    const cache=await caches.open(SHELL_CACHE);
    for(const [key,response] of downloaded)await cache.put(key,response);
    // Existing documents keep running; the complete new shell is used on their
    // next navigation. Retain the previous release for old resource requests.
    await self.skipWaiting();
  }catch(error){await caches.delete(SHELL_CACHE);throw error}
})()));

self.addEventListener('activate',event=>event.waitUntil((async()=>{
  const names=await caches.keys();
  const older=names.filter(name=>name.startsWith(`${PREFIX}shell:`)&&name!==SHELL_CACHE);
  // Delete only our own obsolete releases. Data and photos survive CSS updates.
  await Promise.all(older.slice(0,-1).map(name=>caches.delete(name)));
  await self.clients.claim();
  // The first page can load its catalog before this worker takes control.
  // Warm the two small entry datasets from the HTTP cache when available.
  const data=await caches.open(DATA_CACHE);
  await Promise.all(['data/catalog-index.json','data/category-assignments.json'].map(async path=>{
    const key=absolute(path);
    if(await data.match(key))return;
    try{
      const response=await timedFetch(key,{cache:'force-cache'});
      if(response.ok){await response.clone().json();await safePut(data,key,response)}
    }catch{/* A first-ever offline visit cannot download uncached data. */}
  }));
})()));

async function shellResource(request){
  const url=absolute(request),current=await caches.open(SHELL_CACHE);
  const cached=await current.match(url);
  if(cached)return cached;
  const names=await caches.keys();
  for(const name of names.filter(n=>n.startsWith(`${PREFIX}shell:`)&&n!==SHELL_CACHE).reverse()){
    const prior=await (await caches.open(name)).match(url);
    if(prior)return prior;
  }
  // Never ignore a CSS/JS version query and substitute a different release.
  return timedFetch(request);
}

async function savedData(request){
  const cache=await caches.open(DATA_CACHE);
  let cached=await cache.match(request,{ignoreSearch:true});
  if(cached)return cached;
  // Upgrade from the old shared caches by copying only this site's exact URLs.
  // Leave those caches intact: another site or an old tab may still need them.
  for(const name of (await caches.keys()).filter(n=>/^forma-(data|shell)-/.test(n))){
    cached=await (await caches.open(name)).match(request,{ignoreSearch:true});
    if(cached){await safePut(cache,request,cached);return cached}
  }
}

async function dataResponse(event,background=false){
  const request=event.request,cache=await caches.open(DATA_CACHE);
  const cached=await savedData(request);
  const network=(async()=>{
    try{
      const response=await timedFetch(request,{cache:'no-cache'});
      if(!response.ok)throw Error(`HTTP ${response.status}`);
      // Do not overwrite usable JSON with a partial body or an HTML error page.
      await response.clone().json();
      await safePut(cache,request,response);
      return response;
    }catch(error){if(cached)return cached;throw error}
  })();
  keepAlive(event,network);
  if(!cached)return network;
  if(background)return cached;
  let timer;
  try{return await Promise.race([network,new Promise(resolve=>{timer=setTimeout(()=>resolve(cached),FALLBACK_AFTER_MS)})])}
  finally{clearTimeout(timer)}
}

async function imageResponse(event){
  const request=event.request,cache=await caches.open(IMAGE_CACHE);
  let cached=await cache.match(request,{ignoreSearch:true});
  if(!cached&&(await caches.keys()).includes('forma-images-v1')){
    cached=await (await caches.open('forma-images-v1')).match(request,{ignoreSearch:true});
    if(cached)await safePut(cache,request,cached);
  }
  if(cached)return cached;
  const response=await timedFetch(request);
  if(response.ok){
    await safePut(cache,request,response);
    keepAlive(event,(async()=>{
      const keys=await cache.keys();
      await Promise.all(keys.slice(0,Math.max(0,keys.length-MAX_IMAGES)).map(key=>cache.delete(key)));
    })());
  }
  return response;
}

self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.method!=='GET')return;
  const url=new URL(request.url);
  if(!owned(url))return;
  if(request.mode==='navigate'){
    // Only the storefront entry point is an app-shell route; don't replace
    // arbitrary HTML pages in this repository with the catalog.
    if(url.pathname===new URL(SCOPE).pathname||url.pathname===new URL(INDEX).pathname){
      event.respondWith((async()=>await (await caches.open(SHELL_CACHE)).match(INDEX)||timedFetch(request))());
    }
    return;
  }
  if(['style','script','font'].includes(request.destination)){event.respondWith(shellResource(request));return}
  if(url.pathname.startsWith(new URL('assets/',SCOPE).pathname)&&request.destination==='image'){
    event.respondWith(imageResponse(event));return;
  }
  if(url.pathname===new URL('data/catalog-index.json',SCOPE).pathname||url.pathname===new URL('data/category-assignments.json',SCOPE).pathname){
    event.respondWith(dataResponse(event));return;
  }
  if(url.pathname.startsWith(new URL('data/details/',SCOPE).pathname)&&url.pathname.endsWith('.json')){
    event.respondWith(dataResponse(event,true));
  }
});
