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
  // Cached CSS and JS can update on separate requests. If the new loader styles
  // are not present yet, remove the markup immediately instead of ever showing
  // an unstyled block to the visitor.
  if(getComputedStyle(loader).position!=='fixed'){loader.remove();return}

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

/* Delayed visual feedback for slow product images.
   It does not change pagination, product state, fetch priorities or image URLs.
   Cached/fast images never receive the effect; the class appears only after 420 ms. */
(function(){
  const grid=document.getElementById('productGrid');
  if(!grid||!('MutationObserver'in window))return;
  const DELAY=420;
  const pending=new WeakMap();

  function clearWait(img,token){
    const current=pending.get(img);
    if(token&&current!==token)return;
    if(current?.timer)clearTimeout(current.timer);
    pending.delete(img);
    img.closest('.product-image-stage')?.classList.remove('image-waiting');
  }

  function watchImage(img){
    if(!(img instanceof HTMLImageElement))return;
    const stage=img.closest('.product-image-stage');
    if(!stage)return;
    clearWait(img);
    if(img.complete)return;

    const token={timer:null};
    pending.set(img,token);
    const finish=()=>clearWait(img,token);
    img.addEventListener('load',finish,{once:true});
    img.addEventListener('error',finish,{once:true});
    token.timer=window.setTimeout(()=>{
      if(pending.get(img)!==token||img.complete||!document.contains(img))return;
      stage.classList.add('image-waiting');
    },DELAY);
  }

  function scan(root){
    if(root instanceof HTMLImageElement)watchImage(root);
    root.querySelectorAll?.('.product-image-stage img').forEach(watchImage);
  }

  scan(grid);
  new MutationObserver(records=>{
    records.forEach(record=>{
      if(record.type==='attributes')watchImage(record.target);
      record.addedNodes.forEach(node=>{if(node.nodeType===1)scan(node)});
    });
  }).observe(grid,{childList:true,subtree:true,attributes:true,attributeFilter:['src']});
})();

/* Presentation-only delivery dialog and product-close polish.
   This enhancement does not touch catalog, cart, filter, history or product data.
   The delivery control keeps #delivery as its no-script fallback, and the original
   product close button remains available whenever the enhanced close is absent. */
(function(){
  if(!document.getElementById('formaDialogPolishStyles')){
    const style=document.createElement('style');
    style.id='formaDialogPolishStyles';
    style.textContent=`
      .site-header .delivery-button{position:relative;display:grid;width:46px;min-width:46px;height:46px;min-height:46px;padding:0;place-items:center;border:1px solid #d7dfd3;border-radius:14px;background:#fff;color:#435d41;text-decoration:none;box-shadow:0 6px 18px rgba(49,77,50,.08);cursor:pointer}
      .site-header .delivery-button:hover{background:#eff4ed;border-color:#b8c9b3}
      .site-header .delivery-button:focus{outline:0}
      .site-header .delivery-button:focus-visible{border-color:#657c62;box-shadow:0 0 0 3px rgba(67,93,65,.16),0 6px 18px rgba(49,77,50,.08)}
      .delivery-truck{display:block;width:28px;height:28px;color:#20201d;overflow:visible}
      .delivery-dialog{width:min(680px,calc(100vw - 24px));max-height:min(86svh,760px);padding:0;border:0;border-radius:24px;background:#f7f5f0;color:#201f1b;box-shadow:0 28px 80px rgba(24,27,22,.24);overflow:auto}
      .delivery-dialog::backdrop{background:rgba(25,27,23,.48);backdrop-filter:blur(2px)}
      .delivery-dialog-shell{padding:26px 28px 28px;background:radial-gradient(620px 300px at 92% 0%,rgba(185,201,176,.2),rgba(185,201,176,0) 70%),#f7f5f0}
      .delivery-dialog-head{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:18px;align-items:start;padding-bottom:20px;border-bottom:1px solid rgba(67,93,65,.13)}
      .delivery-dialog-kicker{margin:0 0 8px;color:#5f7859;font:750 10px/1.2 ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif;letter-spacing:.15em;text-transform:uppercase}
      .delivery-dialog-title{margin:0;font:400 clamp(30px,5vw,42px)/1 Georgia,serif;letter-spacing:-.03em;color:#201f1b}
      .delivery-dialog-intro{max-width:520px;margin:10px 0 0;color:#686760;font:500 13px/1.55 ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif}
      .delivery-dialog-body{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:18px}
      .delivery-dialog-body section{min-width:0;padding:18px 18px 16px;border:1px solid rgba(67,93,65,.14);border-radius:17px;background:rgba(255,255,255,.72)}
      .delivery-dialog-body section:first-child{background:linear-gradient(145deg,rgba(255,255,255,.82),rgba(239,244,236,.76))}
      .delivery-dialog-body h2{margin:0 0 12px;color:#314d32;font:750 11px/1.2 ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif;letter-spacing:.11em;text-transform:uppercase}
      .delivery-dialog-body p{margin:0 0 9px;color:#54564f;font:500 13px/1.5 ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif}
      .delivery-dialog-body p:last-child{margin-bottom:0}
      .delivery-dialog-body a{color:#314d32}
      .forma-close{display:grid;width:42px;height:42px;min-width:42px;padding:0;place-items:center;border:1px solid rgba(67,93,65,.18);border-radius:999px;background:rgba(255,255,255,.86);color:#435d41;box-shadow:0 5px 16px rgba(49,77,50,.08);cursor:pointer;-webkit-tap-highlight-color:transparent}
      .forma-close svg{width:18px;height:18px;pointer-events:none}
      .forma-close:hover{background:#eff4ed;border-color:#b8c9b3}
      .forma-close:focus{outline:0}
      .forma-close:focus-visible{border-color:#435d41;box-shadow:0 0 0 3px rgba(67,93,65,.16),0 5px 16px rgba(49,77,50,.08)}
      .detail-copy{position:relative}
      .detail-inline-close{position:sticky;top:10px;z-index:9;margin:-28px 0 8px auto}
      .product-dialog>.dialog-close{border:1px solid rgba(67,93,65,.18);border-radius:999px;background:rgba(247,245,240,.94);color:#435d41;box-shadow:0 5px 16px rgba(49,77,50,.08);font-size:0;-webkit-tap-highlight-color:transparent}
      .product-dialog>.dialog-close::before,.product-dialog>.dialog-close::after{content:"";position:absolute;left:50%;top:50%;width:17px;height:1.6px;border-radius:2px;background:currentColor}
      .product-dialog>.dialog-close::before{transform:translate(-50%,-50%) rotate(45deg)}
      .product-dialog>.dialog-close::after{transform:translate(-50%,-50%) rotate(-45deg)}
      .product-dialog>.dialog-close:focus{outline:0}
      .product-dialog>.dialog-close:focus-visible{border-color:#435d41;box-shadow:0 0 0 3px rgba(67,93,65,.16),0 5px 16px rgba(49,77,50,.08)}
      @media(max-width:640px){
        .site-header .delivery-button{width:42px;min-width:42px;height:42px;min-height:42px}
        .delivery-truck{width:26px;height:26px}
        .delivery-dialog{width:calc(100vw - 20px);max-height:88svh;border-radius:21px}
        .delivery-dialog-shell{padding:22px 18px 20px}
        .delivery-dialog-head{gap:12px;padding-bottom:17px}
        .delivery-dialog-title{font-size:32px}
        .delivery-dialog-body{grid-template-columns:1fr;gap:10px;margin-top:14px}
        .delivery-dialog-body section{padding:16px;border-radius:15px}
        .detail-inline-close{top:8px;margin:-20px -4px 8px auto;width:40px;height:40px;min-width:40px}
      }
      @media(max-width:430px){
        .site-header .header-actions{gap:clamp(4px,1.5vw,7px)!important}
        .site-header .brand-line{font-size:clamp(9.6px,3vw,12px)!important;letter-spacing:.055em!important}
        .site-header .delivery-button,.site-header .favorites-button,.site-header .cart-button{width:clamp(34px,10.2vw,42px)!important;min-width:clamp(34px,10.2vw,42px)!important;height:clamp(34px,10.2vw,42px)!important;min-height:clamp(34px,10.2vw,42px)!important}
        .site-header .delivery-truck{width:clamp(22px,6.5vw,26px);height:clamp(22px,6.5vw,26px)}
        .site-header .cart-trolley{width:clamp(23px,7vw,29px)!important;height:clamp(23px,7vw,29px)!important}
        .site-header .action-icon{font-size:clamp(24px,7.2vw,30px)!important}
      }
      @media(prefers-reduced-motion:reduce){.delivery-dialog::backdrop{backdrop-filter:none}}
    `;
    document.head.appendChild(style);
  }

  const closeIcon='<svg aria-hidden="true" viewBox="0 0 24 24" fill="none"><path d="M7 7l10 10M17 7 7 17" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
  const truckIcon='<svg class="delivery-truck" aria-hidden="true" viewBox="0 0 32 32" fill="none"><path d="M4.5 8.5h14v12h-14z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M18.5 12.5h4.8l4.2 4.7v3.3h-9" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M23.3 12.5v4.8h4" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><circle cx="9" cy="22.5" r="2.2" stroke="currentColor" stroke-width="1.8"/><circle cx="23.5" cy="22.5" r="2.2" stroke="currentColor" stroke-width="1.8"/><path d="M11.2 22.5h10.1" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';

  const headerActions=document.querySelector('.site-header .header-actions');
  const footer=document.getElementById('delivery');
  if(headerActions&&footer){
    let trigger=document.getElementById('deliveryButton')||headerActions.querySelector('a[href="#delivery"],[data-delivery-dialog]');
    if(!trigger){
      trigger=document.createElement('a');
      trigger.id='deliveryButton';
      trigger.href='#delivery';
      headerActions.insertBefore(trigger,headerActions.firstElementChild);
    }
    trigger.classList.add('delivery-button');
    trigger.setAttribute('aria-label','Доставка и оплата');
    trigger.setAttribute('title','Доставка и оплата');
    trigger.setAttribute('aria-haspopup','dialog');
    trigger.setAttribute('aria-controls','deliveryDialog');
    trigger.innerHTML=truckIcon+'<span class="sr-only">Доставка и оплата</span>';

    let dialog=document.getElementById('deliveryDialog');
    if(!dialog){
      dialog=document.createElement('dialog');
      dialog.id='deliveryDialog';
      dialog.className='delivery-dialog';
      dialog.setAttribute('aria-labelledby','deliveryDialogTitle');
      dialog.innerHTML='<div class="delivery-dialog-shell"><div class="delivery-dialog-head"><div><p class="delivery-dialog-kicker">FORMA HOME</p><h2 class="delivery-dialog-title" id="deliveryDialogTitle">Доставка и оплата</h2><p class="delivery-dialog-intro">Все основные условия — в одном месте. После закрытия вы останетесь там же, где смотрели каталог.</p></div><button class="forma-close" type="button" data-close-delivery aria-label="Закрыть">'+closeIcon+'</button></div><div class="delivery-dialog-body" data-delivery-dialog-body></div></div>';
      document.body.appendChild(dialog);
    }

    const dialogBody=dialog.querySelector('[data-delivery-dialog-body]');
    const fillDialog=()=>{
      if(!dialogBody||dialogBody.childElementCount)return;
      const columns=footer.querySelector('.footer-columns');
      if(!columns)return;
      [...columns.children].forEach(section=>dialogBody.appendChild(section.cloneNode(true)));
    };
    let previousOverflow='';
    const openDialog=event=>{
      if(typeof dialog.showModal!=='function')return;
      event?.preventDefault();
      fillDialog();
      previousOverflow=document.body.style.overflow;
      if(!dialog.open)dialog.showModal();
      document.body.style.overflow='hidden';
    };
    trigger.addEventListener('click',openDialog);
    dialog.querySelector('[data-close-delivery]')?.addEventListener('click',()=>dialog.close());
    dialog.addEventListener('click',event=>{if(event.target===dialog)dialog.close()});
    dialog.addEventListener('close',()=>{
      document.body.style.overflow=previousOverflow;
      try{trigger.focus({preventScroll:true})}catch{trigger.focus()}
    });
  }

  const productDialog=document.getElementById('productDialog');
  const productDetail=document.getElementById('productDetail');
  if(productDialog&&productDetail&&'MutationObserver'in window){
    const fallback=[...productDialog.children].find(node=>node.matches?.('[data-close-dialog]'))||null;
    const installDetailClose=()=>{
      const copy=productDetail.querySelector('.detail-copy');
      if(!copy){if(fallback)fallback.hidden=false;return}
      let button=copy.querySelector('.detail-inline-close');
      if(!button){
        button=document.createElement('button');
        button.type='button';
        button.className='forma-close detail-inline-close';
        button.setAttribute('data-close-dialog','');
        button.setAttribute('aria-label','Закрыть карточку товара');
        button.innerHTML=closeIcon;
        copy.prepend(button);
      }
      if(fallback)fallback.hidden=true;
    };
    new MutationObserver(installDetailClose).observe(productDetail,{childList:true});
    productDialog.addEventListener('close',()=>{if(fallback)fallback.hidden=false});
    installDetailClose();
  }
})();
