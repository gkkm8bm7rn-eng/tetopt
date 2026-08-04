/* FORMA HOME service worker: resilient loading for slow and intermittent connections. */
const CACHE_VERSION='20260804-1';
const SHELL_CACHE=`forma-shell-${CACHE_VERSION}`;
const DATA_CACHE=`forma-data-${CACHE_VERSION}`;
const IMAGE_CACHE=`forma-images-${CACHE_VERSION}`;
const CACHE_PREFIX='forma-';
const CATALOG_VERSION='20260804-1';

const CORE_ASSETS=[
  './',
  './index.html',
  './offline.html',
  './performance-bootstrap.js?v=2'
];

self.addEventListener('install',event=>{
  event.waitUntil((async()=>{
    const cache=await caches.open(SHELL_CACHE);
    await Promise.allSettled(CORE_ASSETS.map(async asset=>{
      const response=await fetch(asset,{cache:'reload'});
      if(response.ok)await cache.put(asset,response);
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    const keep=new Set([SHELL_CACHE,DATA_CACHE,IMAGE_CACHE]);
    const names=await caches.keys();
    await Promise.all(names.map(name=>{
      if(name.startsWith(CACHE_PREFIX)&&!keep.has(name))return caches.delete(name);
      return Promise.resolve(false);
    }));
    await self.clients.claim();
  })());
});

function sameOrigin(url){
  return url.origin===self.location.origin;
}

function canonicalDataRequest(request){
  const url=new URL(request.url);
  if(!sameOrigin(url))return null;
  if(!/\/(?:catalog-source\.html|hidden-products\.json)$/.test(url.pathname))return null;
  url.search='';
  url.searchParams.set('v',CATALOG_VERSION);
  return new Request(url.toString(),{method:'GET',headers:request.headers,credentials:'same-origin'});
}

async function cacheFirst(request,cacheName){
  const cache=await caches.open(cacheName);
  const cached=await cache.match(request);
  if(cached)return cached;
  const response=await fetch(request);
  if(response.ok)await cache.put(request,response.clone());
  return response;
}

async function staleWhileRevalidate(request,cacheName){
  const cache=await caches.open(cacheName);
  const cached=await cache.match(request);
  const networkPromise=fetch(request).then(async response=>{
    if(response.ok)await cache.put(request,response.clone());
    return response;
  }).catch(()=>null);
  if(cached){
    networkPromise.catch(()=>null);
    return cached;
  }
  const network=await networkPromise;
  if(network)return network;
  throw new Error('Network unavailable and no cached response');
}

async function navigationResponse(request){
  const shell=await caches.open(SHELL_CACHE);
  try{
    const response=await Promise.race([
      fetch(request),
      new Promise((_,reject)=>setTimeout(()=>reject(new Error('navigation timeout')),6000))
    ]);
    if(response&&response.ok)await shell.put('./index.html',response.clone());
    return response;
  }catch{
    return (await shell.match('./index.html'))||
      (await shell.match('./'))||
      (await shell.match('./offline.html'))||
      Response.error();
  }
}

self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.method!=='GET')return;

  const url=new URL(request.url);
  if(request.mode==='navigate'){
    event.respondWith(navigationResponse(request));
    return;
  }
  if(!sameOrigin(url))return;

  const dataRequest=canonicalDataRequest(request);
  if(dataRequest){
    event.respondWith(staleWhileRevalidate(dataRequest,DATA_CACHE).catch(()=>caches.match('./offline.html')));
    return;
  }

  if(request.destination==='image'){
    event.respondWith(cacheFirst(request,IMAGE_CACHE).catch(()=>fetch(request)));
    return;
  }

  if(['script','style','font'].includes(request.destination)){
    event.respondWith(staleWhileRevalidate(request,SHELL_CACHE).catch(()=>caches.match(request)));
  }
});
