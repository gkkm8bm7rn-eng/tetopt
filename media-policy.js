const MEDIA_POLICY={requiredHero:'front-three-quarter',sourceIsolation:true,limits:{simple:3,standard:4,computer:10}};

// Product detail data is split into JSON shards. On some connections GitHub Pages
// can stall on an individual shard, leaving the product dialog waiting and then
// failing. Keep the normal Pages request, but give detail shards a fast fallback
// to the same production branch on raw.githubusercontent.com.
const nativeFetch=window.fetch.bind(window);
window.fetch=function(resource,options){
  const url=typeof resource==='string'?resource:resource?.url||'';
  if(!/(?:^|\/)data\/details\/\d+\.json(?:[?#].*)?$/.test(url))return nativeFetch(resource,options);
  const shard=url.match(/data\/details\/(\d+\.json)/)?.[1];
  if(!shard)return nativeFetch(resource,options);
  const fallback=`https://raw.githubusercontent.com/gkkm8bm7rn-eng/tetopt/main/data/details/${shard}`;
  return new Promise((resolve,reject)=>{
    let settled=false,primaryError=null,fallbackStarted=false;
    const finish=response=>{if(settled)return;if(response?.ok){settled=true;resolve(response)}else{primaryError=primaryError||new Error(`HTTP ${response?.status||'error'}`)}};
    const fail=error=>{primaryError=primaryError||error;if(fallbackStarted&&!settled){settled=true;reject(primaryError)}};
    nativeFetch(resource,options).then(finish).catch(error=>{primaryError=error;startFallback()});
    const startFallback=()=>{if(fallbackStarted||settled)return;fallbackStarted=true;nativeFetch(fallback,{cache:'force-cache'}).then(response=>{if(response.ok){settled=true;resolve(response)}else fail(new Error(`Fallback HTTP ${response.status}`))}).catch(fail)};
    setTimeout(startFallback,1200);
  });
};

function mediaSourceId(path=''){
  return String(path).match(/assets\/products\/(\d+)\//)?.[1]||'';
}

function mediaComplexity(product,variant){
  // Computer chairs may use up to ten source-isolated images: front 3/4 first,
  // then useful alternate views, mechanisms and dimension drawings when present.
  if(isComputerChair(product))return'computer';
  const text=`${product.category||''} ${product.name||''}`.toLocaleLowerCase('ru-RU');
  if(/диван|кровать|шкаф|витрин|комод|гарнитур|комплект|остров|библиотек/.test(text)||variant.wholesalePrice>=30000)return'complex';
  if(/стул|кресло|вешалк|табурет|пуф|декор|подставк|стакан|тарелк/.test(text)&&variant.wholesalePrice<15000)return'simple';
  return'standard';
}

function mediaRank(path,primary){
  const name=String(path).split('/').pop().toLocaleLowerCase('ru-RU');
  if(/00-front|front-?3|three-quarter|3q/.test(name))return 0;
  if(/00-main/.test(name))return 1;
  if(path===primary)return 2;
  if(/(^|\/)01\./.test(path))return 3;
  if(/(^|\/)02\./.test(path))return 4;
  return 5;
}

function curateGallery(product,variant){
  const sourceId=String(variant.sourceId),all=(variant.images?.length?variant.images:[variant.primaryImage]).filter(Boolean);
  const own=all.filter(path=>mediaSourceId(path)===sourceId);
  const isolated=own.length?own:all;
  const unique=[...new Set(isolated)];
  unique.sort((a,b)=>mediaRank(a,variant.primaryImage)-mediaRank(b,variant.primaryImage));
  const complexity=mediaComplexity(product,variant);
  // Technical drawings in a complex product's source folder must never be
  // cut off by a gallery limit. Computer chairs use their dedicated limit above.
  return complexity==='complex'?unique:unique.slice(0,MEDIA_POLICY.limits[complexity]);
}

/* Presentation-only startup veil.
   It watches the existing catalog DOM and never changes catalog/cart/filter state.
   The safety timeout guarantees it can never trap the page if data is slow or unavailable. */
(function(){
  if(document.getElementById('siteLoader'))return;
  const loader=document.createElement('div');
  loader.id='siteLoader';
  loader.className='site-loader';
  loader.setAttribute('aria-hidden','true');
  loader.innerHTML='<div class="site-loader-inner"><div class="site-loader-brand"><span>FORMA</span> <span class="home">HOME</span><span class="slash"> / </span><span>ФОРМА</span> <span class="home">ХОУМ</span></div><div class="site-loader-track"></div><div class="site-loader-caption">Мебель для продуманного интерьера</div></div>';
  document.body.appendChild(loader);

  let observer=null,timer=null,finished=false;
  const ready=()=>{
    const grid=document.getElementById('productGrid');
    const empty=document.getElementById('emptyState');
    const count=document.getElementById('resultCount');
    const countReady=!!(count&&!count.hidden&&!/загружаем/i.test(count.textContent||''));
    return !!(grid?.children.length||empty&&!empty.hidden||countReady);
  };
  const finish=()=>{
    if(finished)return;
    finished=true;
    observer?.disconnect();
    if(timer)clearTimeout(timer);
    loader.classList.add('is-done');
    window.setTimeout(()=>loader.remove(),420);
  };

  if(ready()){finish();return}
  const catalog=document.getElementById('catalog');
  if(catalog&&'MutationObserver'in window){
    observer=new MutationObserver(()=>{if(ready())finish()});
    observer.observe(catalog,{subtree:true,childList:true,attributes:true,characterData:true});
  }
  timer=window.setTimeout(finish,2600);
})();
