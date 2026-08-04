(()=>{
  'use strict';

  const KEY='__formaPerformanceBootstrapV3';
  if(window[KEY])return;

  const CATALOG_VERSION='20260804-1';
  const nativeFetch=window.fetch.bind(window);
  let mediaObserver=null;
  let mediaTimer=0;

  function isCacheableCatalogUrl(url){
    if(url.origin!==window.location.origin)return false;
    return /\/(?:catalog-source\.html|hidden-products\.json)$/.test(url.pathname);
  }

  function normalizedCatalogUrl(rawUrl){
    const url=new URL(rawUrl,window.location.href);
    if(!isCacheableCatalogUrl(url))return null;
    url.search='';
    url.searchParams.set('v',CATALOG_VERSION);
    return url;
  }

  window.fetch=function formaCachedFetch(input,init){
    try{
      const request=input instanceof Request?input:null;
      const method=String(init?.method||request?.method||'GET').toUpperCase();
      if(method!=='GET')return nativeFetch(input,init);

      const normalized=normalizedCatalogUrl(request?.url||String(input));
      if(!normalized)return nativeFetch(input,init);

      const nextInit={...(init||{})};
      if(nextInit.cache==='no-store')delete nextInit.cache;

      if(request){
        const normalizedRequest=new Request(normalized.toString(),request);
        return nativeFetch(normalizedRequest,nextInit);
      }
      return nativeFetch(normalized.toString(),nextInit);
    }catch(error){
      console.warn('FORMA HOME: не удалось применить кэширование запроса',error);
      return nativeFetch(input,init);
    }
  };

  function registerServiceWorker(){
    if(!('serviceWorker' in navigator))return;
    const register=()=>navigator.serviceWorker
      .register('./sw.js?v=2',{scope:'./',updateViaCache:'none'})
      .then(registration=>registration.update().catch(()=>undefined))
      .catch(error=>console.warn('FORMA HOME: офлайн-кэш недоступен',error));

    if(document.readyState==='complete')setTimeout(register,0);
    else window.addEventListener('load',()=>setTimeout(register,0),{once:true});
  }

  function connection(){
    return navigator.connection||navigator.mozConnection||navigator.webkitConnection||null;
  }

  function updateNetworkMode(){
    const current=connection();
    const constrained=Boolean(current?.saveData)||/^(?:slow-2g|2g)$/.test(current?.effectiveType||'');
    const root=document.documentElement;
    if(!root)return;
    root.dataset.formaNetwork=constrained?'constrained':'normal';
    root.classList.toggle('forma-save-data',constrained);
    root.classList.toggle('forma-offline',navigator.onLine===false);
  }

  function optimizeImages(){
    const all=[...document.querySelectorAll('img')];
    const productImages=[...document.querySelectorAll('#grid .product-photo')];
    const priority=new Set(productImages.slice(0,4));

    all.forEach(image=>{
      image.decoding='async';
      if(priority.has(image)){
        image.loading='eager';
        image.fetchPriority=productImages.indexOf(image)<2?'high':'auto';
      }else{
        image.loading='lazy';
        image.fetchPriority='low';
      }
      image.dataset.formaMediaOptimized='3';
    });
  }

  function scheduleImageOptimization(){
    clearTimeout(mediaTimer);
    mediaTimer=setTimeout(optimizeImages,80);
  }

  function startMediaOptimization(){
    updateNetworkMode();
    optimizeImages();

    mediaObserver?.disconnect();
    mediaObserver=new MutationObserver(scheduleImageOptimization);
    if(document.documentElement){
      mediaObserver.observe(document.documentElement,{childList:true,subtree:true});
    }

    const current=connection();
    current?.addEventListener?.('change',updateNetworkMode);
    window.addEventListener('online',updateNetworkMode,{passive:true});
    window.addEventListener('offline',updateNetworkMode,{passive:true});
  }

  registerServiceWorker();
  window.addEventListener('forma:catalog-ready',startMediaOptimization,{passive:true});
  if(document.readyState==='complete')setTimeout(startMediaOptimization,0);

  window[KEY]={
    catalogVersion:CATALOG_VERSION,
    serviceWorkerEnabled:'serviceWorker' in navigator,
    optimizeImages,
    updateNetworkMode
  };
})();
