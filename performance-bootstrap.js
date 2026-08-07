(()=>{
  'use strict';

  const KEY='__formaPerformanceBootstrapV8';
  if(window[KEY])return;

  let mediaObserver=null;
  let mediaTimer=0;
  const RESET_KEY='forma-sw-reset-v8';

  function clearLegacyOfflineLayer(){
    if(!('serviceWorker' in navigator))return;
    Promise.resolve().then(async()=>{
      const hadController=Boolean(navigator.serviceWorker.controller);
      let changed=false;
      try{
        const registrations=await navigator.serviceWorker.getRegistrations();
        for(const registration of registrations){
          try{
            const removed=await registration.unregister();
            changed=changed||removed;
          }catch(error){
            console.warn('FORMA HOME: не удалось отключить старый service worker',error);
          }
        }
      }catch(error){
        console.warn('FORMA HOME: не удалось проверить service worker',error);
      }

      if('caches' in window){
        try{
          const names=await caches.keys();
          await Promise.all(names.filter(name=>name.indexOf('forma-')===0).map(name=>caches.delete(name)));
        }catch(error){
          console.warn('FORMA HOME: не удалось очистить старый кэш',error);
        }
      }

      if(hadController&&!sessionStorage.getItem(RESET_KEY)){
        sessionStorage.setItem(RESET_KEY,'1');
        setTimeout(()=>window.location.reload(),80);
        return;
      }
      if(changed)sessionStorage.setItem(RESET_KEY,'1');
    }).catch(error=>console.warn('FORMA HOME: очистка старого офлайн-слоя не выполнена',error));
  }

  function connection(){
    return navigator.connection||navigator.mozConnection||navigator.webkitConnection||null;
  }

  function updateNetworkMode(){
    const current=connection();
    const constrained=Boolean(current&&current.saveData)||/^(?:slow-2g|2g)$/.test((current&&current.effectiveType)||'');
    const root=document.documentElement;
    if(!root)return;
    root.dataset.formaNetwork=constrained?'constrained':'normal';
    root.classList.toggle('forma-save-data',constrained);
    root.classList.toggle('forma-offline',navigator.onLine===false);
  }

  function optimizeImages(){
    const all=Array.from(document.querySelectorAll('img'));
    const productImages=Array.from(document.querySelectorAll('#grid .product-photo'));
    const priority=new Set(productImages.slice(0,4));

    all.forEach(image=>{
      image.decoding='async';
      if(priority.has(image)){
        image.loading='eager';
        try{image.fetchPriority=productImages.indexOf(image)<2?'high':'auto';}catch(error){}
      }else{
        image.loading='lazy';
        try{image.fetchPriority='low';}catch(error){}
      }
      image.dataset.formaMediaOptimized='8';
    });
  }

  function scheduleImageOptimization(){
    clearTimeout(mediaTimer);
    mediaTimer=setTimeout(optimizeImages,80);
  }

  function startMediaOptimization(){
    updateNetworkMode();
    optimizeImages();

    if(mediaObserver)mediaObserver.disconnect();
    mediaObserver=new MutationObserver(scheduleImageOptimization);
    if(document.documentElement){
      mediaObserver.observe(document.documentElement,{childList:true,subtree:true});
    }

    const current=connection();
    if(current&&typeof current.addEventListener==='function')current.addEventListener('change',updateNetworkMode);
    window.addEventListener('online',updateNetworkMode,{passive:true});
    window.addEventListener('offline',updateNetworkMode,{passive:true});
  }

  // The previous bootstrap wrapped every catalog fetch, read the complete
  // catalog into an ArrayBuffer and created extra Response/cache copies before
  // returning it to the page. On WebKit/iOS that could keep the boot screen
  // waiting under memory pressure. V8 deliberately leaves window.fetch native.
  clearLegacyOfflineLayer();
  window.addEventListener('forma:catalog-ready',startMediaOptimization,{passive:true});
  if(document.readyState==='complete')setTimeout(startMediaOptimization,0);

  window[KEY]={
    version:8,
    fetchInterceptionDisabled:true,
    serviceWorkerDisabled:true,
    optimizeImages,
    updateNetworkMode
  };
})();