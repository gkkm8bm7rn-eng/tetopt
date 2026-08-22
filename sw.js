/* FORMA HOME storefront service worker.
 * Keeps the buying flow usable on slow/intermittent connections without
 * allowing a cached HTML document to outlive its matching CSS/JS shell.
 */
const CACHE_VERSION='20260822-1';
const SHELL_CACHE=`forma-shell-${CACHE_VERSION}`;
const CACHE_PREFIX='forma-';

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
  './cart-feedback.js'
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
    const names=await caches.keys();
    await Promise.all(names.map(name=>name.startsWith(CACHE_PREFIX)&&name!==SHELL_CACHE?caches.delete(name):Promise.resolve(false)));
    await self.clients.claim();
  })());
});

function isSameOrigin(url){return url.origin===self.location.origin;}

async function networkFirst(request,fallbackKey){
  const cache=await caches.open(SHELL_CACHE);
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

async function cacheFirstWithRefresh(request){
  const cache=await caches.open(SHELL_CACHE);
  const cached=await cache.match(request,{ignoreSearch:true});
  if(cached){
    fetch(request).then(response=>{if(response.ok)return cache.put(request,response.clone());}).catch(()=>{});
    return cached;
  }
  const response=await fetch(request);
  if(response.ok)await cache.put(request,response.clone());
  return response;
}

self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.method!=='GET')return;
  const url=new URL(request.url);
  if(!isSameOrigin(url))return;

  if(request.mode==='navigate'){
    event.respondWith(networkFirst(request,'./index.html').catch(()=>caches.match('./index.html')));
    return;
  }

  if(['style','script','font'].includes(request.destination)){
    event.respondWith(cacheFirstWithRefresh(request));
  }
});
