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

/* Header shortcut to the delivery and payment terms in the footer. */
(function(){
'use strict';
var actions=document.querySelector('.site-header .header-actions'),favorites=document.getElementById('favoritesButton');
if(!actions||!favorites||document.querySelector('.delivery-payment-button'))return;
var style=document.createElement('style');
style.textContent='\
.site-header .delivery-payment-button{display:grid;grid-template-columns:24px auto 24px;align-items:center;justify-items:center;gap:7px;width:94px;min-width:94px;height:46px;min-height:46px;padding:0 10px;border:1px solid #d7dfd3;border-radius:14px;background:#fff;color:#20201d;box-shadow:0 6px 18px rgba(49,77,50,.08);text-decoration:none;line-height:1;transition:background .16s ease,border-color .16s ease,transform .16s ease}\
.site-header .delivery-payment-button:hover,.site-header .delivery-payment-button:focus-visible{background:#eff4ed;border-color:#b8c9b3;outline:none}\
.site-header .delivery-payment-button:focus-visible{box-shadow:0 0 0 2px #f7f5f0,0 0 0 4px #435d41}\
.site-header .delivery-payment-button:active{transform:translateY(1px)}\
.site-header .delivery-payment-icon{display:block;width:24px;height:24px;color:#20201d;overflow:visible}\
.site-header .delivery-payment-slash{display:block;color:#20201d;font:700 19px/1 Arial,sans-serif}\
footer#delivery{scroll-margin-top:84px}\
@media(max-width:640px){.site-header .delivery-payment-button{grid-template-columns:21px auto 21px;gap:5px;width:80px;min-width:80px;height:42px;min-height:42px;padding:0 8px;border-radius:14px}.site-header .delivery-payment-icon{width:21px;height:21px}.site-header .delivery-payment-slash{font-size:17px}footer#delivery{scroll-margin-top:68px}}\
@media(max-width:390px){.site-header{padding-left:10px!important;padding-right:10px!important}.site-header .header-actions{gap:4px!important}.site-header .brand-line{font-size:11px}.site-header .delivery-payment-button{grid-template-columns:19px auto 19px;gap:4px;width:70px;min-width:70px;height:40px;min-height:40px;padding:0 6px;border-radius:13px}.site-header .delivery-payment-icon{width:19px;height:19px}.site-header .delivery-payment-slash{font-size:16px}.site-header .favorites-button,.site-header .cart-button{width:40px;min-width:40px;height:40px;min-height:40px}}\
@media(max-width:340px){.site-header .brand-line{font-size:10px}.site-header .delivery-payment-button{width:66px;min-width:66px}.site-header .favorites-button,.site-header .cart-button{width:38px;min-width:38px;height:38px;min-height:38px}.site-header .delivery-payment-button{height:38px;min-height:38px}}';
document.head.appendChild(style);
var link=document.createElement('a');
link.className='delivery-payment-button';
link.href='#delivery';
link.setAttribute('aria-label','Доставка и оплата');
link.title='Доставка и оплата';
link.innerHTML='<svg class="delivery-payment-icon" aria-hidden="true" viewBox="0 0 32 32" fill="none"><path d="M3.5 8.5h15v12H3.5zM18.5 13h5.2l4.8 5v2.5h-10z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><circle cx="9" cy="23.5" r="2.5" stroke="currentColor" stroke-width="2"/><circle cx="23.5" cy="23.5" r="2.5" stroke="currentColor" stroke-width="2"/><path d="M23.5 13v5h5" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg><span class="delivery-payment-slash" aria-hidden="true">/</span><svg class="delivery-payment-icon" aria-hidden="true" viewBox="0 0 32 32" fill="none"><rect x="3.5" y="7" width="25" height="18" rx="3" stroke="currentColor" stroke-width="2"/><path d="M4.5 12h23" stroke="currentColor" stroke-width="2"/><path d="M8 20h6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg><span class="sr-only">Доставка и оплата</span>';
actions.insertBefore(link,favorites);
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

/* Register immediately rather than waiting for window.load. On a weak first
   connection this lets the worker claim the page while catalog data is still
   loading, so product images can already use the same-origin Cloudflare path. */
if('serviceWorker' in navigator){
  navigator.serviceWorker.register('./sw.js',{scope:'./',updateViaCache:'none'}).catch(function(error){
    console.warn('[service-worker] registration skipped',error);
  });
}
