/* Persistent cart quantity feedback in product detail and catalog cards. */
(function(){
'use strict';
function qty(key){return key&&state.cart[key]?Number(state.cart[key])||0:0}
function writeQty(key,next){next=Math.max(0,next||0);if(next)state.cart[key]=next;else delete state.cart[key];storage.write('forma:cart',state.cart);updateCounters();syncAllCartFeedback()}
function detailAddButton(){return document.querySelector('#productDetail .detail-sticky-actions [data-add]')}
function syncDetail(){var add=detailAddButton(),actions=add&&add.closest('.detail-sticky-actions');if(!add||!actions)return;var key=add.dataset.source?String(add.dataset.source):'',n=qty(key),box=actions.querySelector('.detail-cart-feedback');if(!box){box=document.createElement('div');box.className='detail-cart-feedback';box.setAttribute('role','group');box.setAttribute('aria-label','Количество товара в корзине');box.innerHTML='<button type="button" data-cart-feedback-delta="-1" aria-label="Уменьшить количество">−</button><div class="detail-cart-feedback-status" aria-live="polite">В корзине: <strong>0</strong></div><button type="button" data-cart-feedback-delta="1" aria-label="Увеличить количество">+</button>';actions.appendChild(box)}box.dataset.cartKey=key;box.querySelector('strong').textContent=String(n);box.hidden=n<1;actions.classList.toggle('cart-has-quantity',n>0);add.setAttribute('aria-label',n>0?'В корзине '+n+' шт.':'Добавить в корзину')}
function syncCatalog(){document.querySelectorAll('.product-card [data-add],.recent-card [data-add]').forEach(function(add){var key=add.dataset.source?String(add.dataset.source):'',n=qty(key),wrap=add.parentElement,box=wrap&&wrap.querySelector('.card-cart-quantity');if(n>0){if(!box){box=document.createElement('div');box.className='card-cart-quantity';box.setAttribute('role','group');box.setAttribute('aria-label','Количество товара в корзине');box.innerHTML='<button type="button" data-card-cart-delta="-1" aria-label="Уменьшить количество">−</button><span aria-live="polite">В корзине: <strong>0</strong></span><button type="button" data-card-cart-delta="1" aria-label="Увеличить количество">+</button>';wrap.appendChild(box)}box.dataset.cartKey=key;box.querySelector('strong').textContent=String(n);box.hidden=false;add.hidden=true;add.style.display='none'}else{if(box)box.remove();add.hidden=false;add.style.display=''}})}
function syncAllCartFeedback(){syncDetail();syncCatalog()}
document.addEventListener('click',function(event){var detailAdd=event.target.closest&&event.target.closest('#productDetail .detail-sticky-actions [data-add]');if(detailAdd){window.setTimeout(syncAllCartFeedback,0);return}var catalogAdd=event.target.closest&&event.target.closest('.product-card [data-add],.recent-card [data-add]');if(catalogAdd){window.setTimeout(syncAllCartFeedback,0);return}var control=event.target.closest&&event.target.closest('[data-cart-feedback-delta],[data-card-cart-delta]');if(!control)return;event.preventDefault();event.stopPropagation();var box=control.closest('.detail-cart-feedback,.card-cart-quantity'),key=box&&box.dataset.cartKey;if(!key)return;var delta=Number(control.dataset.cartFeedbackDelta||control.dataset.cardCartDelta)||0,next=Math.max(0,qty(key)+delta);writeQty(key,next);toast(next?('В корзине: '+next+' шт.'):'Убрали из корзины')});
var detail=document.getElementById('productDetail'),grid=document.getElementById('productGrid'),recent=document.getElementById('recentRow');[detail,grid,recent].forEach(function(node){if(node&&window.MutationObserver)new MutationObserver(function(){window.setTimeout(syncAllCartFeedback,0)}).observe(node,{childList:true,subtree:true})});
document.addEventListener('DOMContentLoaded',syncAllCartFeedback);window.setTimeout(syncAllCartFeedback,500);
})();

/* Cross-browser hardening for storage, sharing, checkout text and dialog close. */
(function(){
'use strict';
var originalStorageWrite=storage.write;
storage.write=function(key,value){try{return originalStorageWrite(key,value)}catch(error){console.warn('[storage] write skipped',error);return false}};

orderText=function(rows,total){
  rows=rows||cartRows();
  if(total===undefined)total=rows.reduce(function(sum,row){return sum+row.variant.wholesalePrice*row.qty},0);
  return 'Здравствуйте! Хочу оформить заказ в FORMA HOME:\n'+
    rows.map(function(row){return '• '+stripModel(row.product.name)+' — '+variantLabel(row.variant)+', арт. '+row.variant.sourceId+', '+row.qty+' шт.'}).join('\n')+
    '\nИтого: '+money(total)+'\n\nОкончательное наличие и срок отгрузки подтвердит менеджер после получения заявки.';
};

cartShareUrl=function(){
  var cart=Object.entries(state.cart).filter(function(entry){return Number(entry[1])>0}).sort(function(a,b){return String(a[0]).localeCompare(String(b[0]))}).map(function(entry){return encodeURIComponent(String(entry[0]))+'.'+Math.max(1,Math.floor(Number(entry[1])||1))}).join('~');
  return baseUrl()+'#view=cart&cart='+cart;
};

sharePayload=async function(title,text,url){
  if(navigator.share){
    try{await navigator.share({title:title,text:text,url:url});return true}catch(error){if(error&&error.name==='AbortError')return false}
  }
  try{
    if(navigator.clipboard&&navigator.clipboard.writeText){
      await navigator.clipboard.writeText(url);
    }else{
      var area=document.createElement('textarea');area.value=url;area.setAttribute('readonly','');area.style.cssText='position:fixed;left:-9999px;top:0';document.body.appendChild(area);area.select();document.execCommand('copy');area.remove();
    }
    toast('Ссылка скопирована');return true;
  }catch(error){console.warn('[share] unavailable',error);toast('Не удалось скопировать ссылку');return false}
};

function normalizeCheckoutLinks(){
  if(!els.cartFooter)return;
  var rows=cartRows();if(!rows.length)return;
  var total=rows.reduce(function(sum,row){return sum+row.variant.wholesalePrice*row.qty},0),share=cartShareUrl(),order=orderText(rows,total),message=order+'\n\n'+share;
  var whatsapp=els.cartFooter.querySelector('a[href^="https://wa.me/"]');
  var telegram=els.cartFooter.querySelector('a[href^="https://t.me/"]');
  var email=els.cartFooter.querySelector('a[href^="mailto:"]');
  if(whatsapp)whatsapp.href='https://wa.me/?text='+encodeURIComponent(message);
  if(telegram)telegram.href='https://t.me/share/url?url='+encodeURIComponent(share)+'&text='+encodeURIComponent(order);
  if(email)email.href='mailto:'+ORDER_EMAIL+'?subject='+encodeURIComponent('Заказ FORMA HOME')+'&body='+encodeURIComponent(order+'\n\nСсылка на собранную корзину:\n'+share);
}
var compatibleRenderCart=renderCart;
renderCart=function(){compatibleRenderCart();normalizeCheckoutLinks()};

if(els.cartDialog){
  els.cartDialog.addEventListener('cancel',function(event){event.preventDefault();if(els.cartDialog.open)closeDialog(els.cartDialog)});
}
})();

/* Product media should come from the same Cloudflare-served origin whenever the
   storefront is not running on GitHub Pages itself. This gives a first-time
   visitor the Cloudflare edge path instead of making every browser wait on
   GitHub Pages, while the service worker keeps repeat visits fast. */
(function(){
'use strict';
var GITHUB_HOST='gkkm8bm7rn-eng.github.io',GITHUB_PREFIX='/tetopt/assets/';
function localAssetUrl(value){
  if(!value)return value;
  try{
    var url=new URL(value,location.href);
    if(url.hostname!==GITHUB_HOST||url.pathname.indexOf(GITHUB_PREFIX)!==0)return value;
    if(location.hostname===GITHUB_HOST)return value;
    return new URL(url.pathname.slice('/tetopt'.length)+url.search,location.origin).href;
  }catch{return value}
}
function localizeMedia(root){
  var scope=root&&root.querySelectorAll?root:document;
  scope.querySelectorAll('img[src]').forEach(function(img){
    var current=img.getAttribute('src'),local=localAssetUrl(current);
    if(local&&local!==current)img.setAttribute('src',local);
    if(!img.getAttribute('decoding'))img.setAttribute('decoding','async');
  });
  scope.querySelectorAll('[data-image]').forEach(function(node){
    var current=node.getAttribute('data-image'),local=localAssetUrl(current);
    if(local&&local!==current)node.setAttribute('data-image',local);
  });
}
function prioritizeImages(){
  var connection=navigator.connection||navigator.mozConnection||navigator.webkitConnection;
  var weak=!!(connection&&(connection.saveData||connection.effectiveType==='slow-2g'||connection.effectiveType==='2g'));
  var mobile=window.matchMedia&&window.matchMedia('(max-width:640px)').matches;
  var highCount=weak?(mobile?2:3):(mobile?4:6);
  document.querySelectorAll('#productGrid .product-image-stage img').forEach(function(img,index){
    var high=index<highCount;
    img.setAttribute('loading',high?'eager':'lazy');
    img.setAttribute('fetchpriority',high?'high':'low');
    img.setAttribute('decoding','async');
  });
  var main=document.getElementById('galleryMain');
  if(main){main.setAttribute('loading','eager');main.setAttribute('fetchpriority','high');main.setAttribute('decoding','async')}
  document.querySelectorAll('#productDetail .thumbnail img,#recentRow img,#cartItems img').forEach(function(img){
    img.setAttribute('loading','lazy');
    img.setAttribute('fetchpriority','low');
    img.setAttribute('decoding','async');
  });
}
function optimizeMedia(root){localizeMedia(root);prioritizeImages()}
var roots=[document.getElementById('productGrid'),document.getElementById('productDetail'),document.getElementById('recentRow'),document.getElementById('cartItems')];
roots.forEach(function(root){
  if(!root||!window.MutationObserver)return;
  new MutationObserver(function(records){
    records.forEach(function(record){record.addedNodes.forEach(function(node){if(node.nodeType===1)optimizeMedia(node)})});
    prioritizeImages();
  }).observe(root,{childList:true,subtree:true});
});
document.addEventListener('DOMContentLoaded',function(){optimizeMedia(document)});
window.setTimeout(function(){optimizeMedia(document)},0);
var resizeTimer=0;window.addEventListener('resize',function(){clearTimeout(resizeTimer);resizeTimer=window.setTimeout(prioritizeImages,120)},{passive:true});
})();

/* Shared-cart recovery is deliberately independent from app.js parsing. It
   preserves old links, accepts encoded/future source IDs, and captures the
   original hash before catalog history can replace it. */
(function(){
'use strict';
var initialHash=location.hash,params=new URLSearchParams(initialHash.replace(/^#/,'')),rawCart=params.get('cart'),openSharedCart=params.get('view')==='cart';
if(!rawCart)return;
function parseSharedCart(value){
  var cart={};
  String(value||'').split(/[~,]/).forEach(function(part){
    if(!part)return;
    var separator=part.lastIndexOf('.');
    if(separator<=0)return;
    var encodedId=part.slice(0,separator),rawQty=part.slice(separator+1),id;
    try{id=decodeURIComponent(encodedId)}catch{id=encodedId}
    var quantity=Number(rawQty);
    if(!id||!Number.isFinite(quantity)||quantity<=0)return;
    cart[String(id)]=Math.max(1,Math.floor(quantity));
  });
  return cart;
}
var sharedCart=parseSharedCart(rawCart),sharedKeys=Object.keys(sharedCart);
if(!sharedKeys.length)return;
function variantIds(){return new Set(state.products.flatMap(function(product){return (product.variants||[]).map(function(variant){return String(variant.sourceId)})}))}
function missingSharedKeys(){var known=variantIds();return Object.keys(state.cart).filter(function(key){return !known.has(String(key))})}
function addMissingNotice(){
  if(!els.cartItems||!state.products.length)return;
  var old=els.cartItems.querySelector('.shared-cart-warning');if(old)old.remove();
  var missing=missingSharedKeys();if(!missing.length)return;
  var note=document.createElement('div');note.className='shared-cart-warning';note.setAttribute('role','status');note.style.cssText='margin:0 0 14px;padding:12px 14px;border:1px solid #d9c88c;border-radius:12px;background:#fff9e8;color:#5e522a;font-size:13px;line-height:1.45';
  note.textContent='Не удалось найти '+missing.length+' '+(missing.length===1?'товар':'товара')+' из ссылки в текущем каталоге (арт. '+missing.join(', ')+'). Остальные позиции восстановлены.';
  els.cartItems.prepend(note);
}
var originalRenderCart=renderCart;
renderCart=function(){originalRenderCart();addMissingNotice()};
function applySharedCart(){
  state.cart=Object.assign({},sharedCart);storage.write('forma:cart',state.cart);updateCounters();
  if(!state.products.length)return false;
  if(openSharedCart){renderCart();if(els.cartDialog&&!els.cartDialog.open){els.cartDialog.showModal();document.body.style.overflow='hidden'}}
  return true;
}
var attempts=0;
(function retry(){if(applySharedCart())return;if(attempts++<80)window.setTimeout(retry,100)})();
})();

/* Register immediately and force a one-time reload when a newer worker takes
   control. This prevents one stale app.js/catalog pair from surviving a deploy. */
if('serviceWorker' in navigator){
  (function(){
    var reloadKey='tetopt:sw-controller-reload';
    function sessionGet(key){try{return sessionStorage.getItem(key)}catch{return null}}
    function sessionSet(key,value){try{sessionStorage.setItem(key,value)}catch{}}
    function sessionRemove(key){try{sessionStorage.removeItem(key)}catch{}}
    if(sessionGet(reloadKey)==='1')sessionRemove(reloadKey);
    navigator.serviceWorker.addEventListener('controllerchange',function(){
      if(sessionGet(reloadKey)==='1')return;
      sessionSet(reloadKey,'1');location.reload();
    });
    navigator.serviceWorker.register('./sw.js',{scope:'./',updateViaCache:'none'}).then(function(registration){return registration.update()}).catch(function(error){
      console.warn('[service-worker] registration skipped',error);
    });
  })();
}
