/* FORMA HOME storefront service worker.
 * Goal: a complete, consistent buying shell on weak/intermittent connections.
 * New shell versions activate only after every critical file is available.
 */
const CACHE_VERSION='20260825-1';
const SHELL_CACHE=`forma-shell-${CACHE_VERSION}`;
const DATA_CACHE=`forma-data-${CACHE_VERSION}`;
const IMAGE_CACHE=`forma-images-${CACHE_VERSION}`;
const CACHE_PREFIX='forma-';
const MAX_CACHED_IMAGES=80;

const SHELL_ASSETS=[
  './',
  './index.html',
  './styles.css',
  './enhancements.css',
  './axes.css',
  './ui.css',
  './media-policy.js',
  './variants.js',
  './app.js',
  './search-fallback.js',
  './cart-feedback.js',
  './data/catalog-index.json',
  './data/category-assignments.json'
];

self.addEventListener('install',event=>{
  event.waitUntil((async()=>{
    const cache=await caches.open(SHELL_CACHE);
    const responses=await Promise.all(SHELL_ASSETS.map(asset=>fetch(asset,{cache:'reload'})));
    if(responses.some(response=>!response.ok))throw new Error('Storefront shell is incomplete');
    await Promise.all(responses.map((response,index)=>cache.put(SHELL_ASSETS[index],response)));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    const keep=new Set([SHELL_CACHE,DATA_CACHE,IMAGE_CACHE]);
    const names=await caches.keys();
    await Promise.all(names.map(name=>name.startsWith(CACHE_PREFIX)&&!keep.has(name)?caches.delete(name):Promise.resolve(false)));
    await self.clients.claim();
  })());
});

function isSameOrigin(url){return url.origin===self.location.origin;}

async function networkFirst(request,cacheName,fallbackKey){
  const cache=await caches.open(cacheName);
  try{
    const response=await fetch(request);
    if(response.ok)await cache.put(fallbackKey||request,response.clone());
    return response;
  }catch(error){
    const cached=await cache.match(fallbackKey||request,{ignoreSearch:true});
    if(cached)return cached;
    throw error;
  }
}

async function staleWhileRevalidate(request,cacheName){
  const cache=await caches.open(cacheName);
  const cached=await cache.match(request,{ignoreSearch:true});
  const refresh=fetch(request).then(async response=>{
    if(response.ok)await cache.put(request,response.clone());
    return response;
  }).catch(()=>null);
  if(cached){refresh.catch(()=>{});return cached;}
  const response=await refresh;
  if(response)return response;
  throw new Error('Network unavailable and no cached response');
}

async function trimImages(cache){
  const keys=await cache.keys();
  if(keys.length<=MAX_CACHED_IMAGES)return;
  await Promise.all(keys.slice(0,keys.length-MAX_CACHED_IMAGES).map(key=>cache.delete(key)));
}

async function imageCacheFirst(request){
  const cache=await caches.open(IMAGE_CACHE);
  const cached=await cache.match(request,{ignoreSearch:true});
  if(cached)return cached;
  const response=await fetch(request);
  if(response.ok||response.type==='opaque'){
    await cache.put(request,response.clone());
    trimImages(cache).catch(()=>{});
  }
  return response;
}

self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.method!=='GET')return;
  const url=new URL(request.url);

  if(request.mode==='navigate'&&isSameOrigin(url)){
    event.respondWith(networkFirst(request,SHELL_CACHE,'./index.html').catch(()=>caches.match('./index.html')));
    return;
  }

  if(request.destination==='image'){
    event.respondWith(imageCacheFirst(request).catch(()=>fetch(request)));
    return;
  }

  if(!isSameOrigin(url))return;

  if(['style','script','font'].includes(request.destination)){
    event.respondWith(staleWhileRevalidate(request,SHELL_CACHE));
    return;
  }

  if(url.pathname.endsWith('/data/catalog-index.json')||url.pathname.endsWith('/data/category-assignments.json')){
    event.respondWith(staleWhileRevalidate(request,SHELL_CACHE));
    return;
  }

  if(/\/data\/details\/\d+\.json$/.test(url.pathname)){
    event.respondWith(staleWhileRevalidate(request,DATA_CACHE));
  }
});
