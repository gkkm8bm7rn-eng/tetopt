(()=>{
  'use strict';

  const KEY='__formaPerformanceBootstrapV1';
  if(window[KEY])return;

  const CATALOG_VERSION='20260804-1';
  const nativeFetch=window.fetch.bind(window);

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

  window[KEY]={catalogVersion:CATALOG_VERSION};
})();
