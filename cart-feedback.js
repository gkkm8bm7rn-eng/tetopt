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

/* Reuse this original combined control for the modal added by media-policy.js.
   If <dialog> is unavailable, the href still falls back to the footer. */
var duplicate=document.getElementById('deliveryButton');
if(duplicate&&duplicate!==link)duplicate.remove();
var dialog=document.getElementById('deliveryDialog');
if(dialog){
  var intro=dialog.querySelector('.delivery-dialog-intro');
  if(intro)intro.remove();
  link.setAttribute('aria-haspopup','dialog');
  link.setAttribute('aria-controls','deliveryDialog');
  var previousOverflow='';
  link.addEventListener('click',function(event){
    if(typeof dialog.showModal!=='function')return;
    event.preventDefault();
    var body=dialog.querySelector('[data-delivery-dialog-body]');
    if(body&&!body.childElementCount){
      var columns=document.querySelector('#delivery .footer-columns');
      if(columns)[].slice.call(columns.children).forEach(function(section){body.appendChild(section.cloneNode(true))});
    }
    previousOverflow=document.body.style.overflow;
    if(!dialog.open)dialog.showModal();
    document.body.style.overflow='hidden';
  });
  dialog.addEventListener('close',function(){
    document.body.style.overflow=previousOverflow;
    try{link.focus({preventScroll:true})}catch{link.focus()}
  });
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

/* Register immediately rather than waiting for window.load. On a weak first
   connection this lets the worker claim the page while catalog data is still
   loading, so product images can already use the same-origin Cloudflare path. */
if('serviceWorker' in navigator){
  navigator.serviceWorker.register('./sw.js',{scope:'./',updateViaCache:'none'}).catch(function(error){
    console.warn('[service-worker] registration skipped',error);
  });
}


/* Header question shortcut. It mirrors the cart sharing model: the shopper
   writes one question, then opens WhatsApp, Telegram or email with that
   text already prepared. No external UI library or network request is added. */
(function(){
'use strict';
const actions=document.querySelector('.site-header .header-actions');
const delivery=actions&&actions.querySelector('.delivery-payment-button');
if(!actions||!delivery||document.getElementById('questionButton'))return;

const style=document.createElement('style');
style.id='formaQuestionStyles';
style.textContent=`
.site-header .question-button{display:grid;width:46px;min-width:46px;height:46px;min-height:46px;padding:0;place-items:center;border:1px solid #d7dfd3;border-radius:14px;background:#fff;color:#314d32;box-shadow:0 6px 18px rgba(49,77,50,.08);cursor:pointer;-webkit-tap-highlight-color:transparent}
.site-header .question-button:hover,.site-header .question-button:focus-visible{background:#eff4ed;border-color:#b8c9b3;outline:none}
.site-header .question-button:focus-visible{box-shadow:0 0 0 2px #f7f5f0,0 0 0 4px #435d41}
.site-header .question-button svg{display:block;width:25px;height:25px}
.question-dialog{width:min(620px,calc(100vw - 24px));max-height:min(86svh,720px);padding:0;border:0;border-radius:24px;background:#f7f5f0;color:#201f1b;box-shadow:0 28px 80px rgba(24,27,22,.24);overflow:auto}
.question-dialog::backdrop{background:rgba(25,27,23,.48);backdrop-filter:blur(2px)}
.question-dialog-shell{padding:25px 26px 26px;background:radial-gradient(560px 280px at 95% 0%,rgba(185,201,176,.22),rgba(185,201,176,0) 70%),#f7f5f0}
.question-dialog-head{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:16px;align-items:start;padding-bottom:18px;border-bottom:1px solid rgba(67,93,65,.13)}
.question-dialog-kicker{margin:0 0 7px;color:#5f7859;font:750 10px/1.2 ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif;letter-spacing:.15em;text-transform:uppercase}
.question-dialog-title{margin:0;color:#201f1b;font:400 clamp(30px,5vw,40px)/1 Georgia,serif;letter-spacing:-.03em}
.question-close{display:grid;width:42px;height:42px;min-width:42px;padding:0;place-items:center;border:1px solid rgba(67,93,65,.18);border-radius:999px;background:rgba(255,255,255,.86);color:#435d41;box-shadow:0 5px 16px rgba(49,77,50,.08);cursor:pointer}
.question-close svg{width:18px;height:18px}
.question-close:hover,.question-close:focus-visible{background:#eff4ed;border-color:#b8c9b3;outline:none}
.question-field{display:grid;gap:8px;margin-top:18px;color:#314d32;font:750 12px/1.25 ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif}
.question-field textarea{width:100%;min-height:138px;resize:vertical;padding:14px 15px;border:1px solid #cfd8ca;border-radius:15px;background:rgba(255,255,255,.9);color:#242520;font:500 15px/1.5 ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif;box-sizing:border-box}
.question-field textarea:focus{outline:none;border-color:#657c62;box-shadow:0 0 0 3px rgba(67,93,65,.13)}
.question-field textarea::placeholder{color:#90938c}
.question-dialog-hint{margin:13px 0 0;color:#6a6c65;font:500 12px/1.45 ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif}
.question-actions{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px;margin-top:15px}
.question-channel{min-height:48px;padding:10px 12px;border:1px solid #cfd8ca;border-radius:12px;background:#fff;color:#314d32;font:800 12px/1.15 ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif;cursor:pointer}
.question-channel:hover,.question-channel:focus-visible{background:#eff4ed;border-color:#9caf98;outline:none}
.question-channel.primary{background:#435d41;border-color:#435d41;color:#fff}
.question-channel.primary:hover,.question-channel.primary:focus-visible{background:#365137;border-color:#365137}
.question-error{margin:10px 0 0;color:#a54434;font:700 11px/1.4 ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif}
@media(max-width:640px){
  .site-header .question-button{width:42px;min-width:42px;height:42px;min-height:42px;border-radius:13px}
  .site-header .question-button svg{width:23px;height:23px}
  .question-dialog{width:calc(100vw - 20px);max-height:88svh;border-radius:21px}
  .question-dialog-shell{padding:21px 18px 20px}
  .question-dialog-title{font-size:31px}
  .question-actions{grid-template-columns:1fr;gap:8px}
  .question-channel{min-height:46px}
}
@media(max-width:390px){
  .site-header{padding-left:10px!important;padding-right:10px!important}
  .site-header .header-actions{gap:4px!important}
  .site-header .brand-line{font-size:10.5px!important;letter-spacing:.04em!important}
  .site-header .question-button{width:36px;min-width:36px;height:40px;min-height:40px}
  .site-header .question-button svg{width:21px;height:21px}
  .site-header .delivery-payment-button{width:68px!important;min-width:68px!important;height:40px!important;min-height:40px!important;padding:0 6px!important}
  .site-header .favorites-button,.site-header .cart-button{width:38px!important;min-width:38px!important;height:40px!important;min-height:40px!important}
}
@media(max-width:340px){
  .site-header{padding-left:8px!important;padding-right:8px!important}
  .site-header .header-actions{gap:3px!important}
  .site-header .brand-line{font-size:9px!important;letter-spacing:.025em!important}
  .site-header .question-button{width:32px;min-width:32px;height:36px;min-height:36px;border-radius:11px}
  .site-header .question-button svg{width:19px;height:19px}
  .site-header .delivery-payment-button{width:60px!important;min-width:60px!important;height:36px!important;min-height:36px!important;padding:0 5px!important}
  .site-header .delivery-payment-icon{width:17px!important;height:17px!important}
  .site-header .delivery-payment-slash{font-size:14px!important}
  .site-header .favorites-button,.site-header .cart-button{width:34px!important;min-width:34px!important;height:36px!important;min-height:36px!important}
}
`;
document.head.appendChild(style);

const questionIcon='<svg aria-hidden="true" viewBox="0 0 28 28" fill="none"><circle cx="14" cy="14" r="10.2" stroke="currentColor" stroke-width="1.8"/><path d="M10.9 10.7a3.35 3.35 0 0 1 6.35 1.5c0 2.45-3.25 2.75-3.25 5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="14" cy="20.2" r="1" fill="currentColor"/></svg>';
const closeIcon='<svg aria-hidden="true" viewBox="0 0 24 24" fill="none"><path d="M7 7l10 10M17 7 7 17" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
const trigger=document.createElement('button');
trigger.id='questionButton';
trigger.className='question-button';
trigger.type='button';
trigger.setAttribute('aria-label','Задать вопрос');
trigger.setAttribute('title','Задать вопрос');
trigger.setAttribute('aria-haspopup','dialog');
trigger.setAttribute('aria-controls','questionDialog');
trigger.innerHTML=questionIcon+'<span class="sr-only">Задать вопрос</span>';
actions.insertBefore(trigger,delivery);

const dialog=document.createElement('dialog');
dialog.id='questionDialog';
dialog.className='question-dialog';
dialog.setAttribute('aria-labelledby','questionDialogTitle');
dialog.innerHTML='<div class="question-dialog-shell"><div class="question-dialog-head"><div><p class="question-dialog-kicker">FORMA HOME</p><h2 class="question-dialog-title" id="questionDialogTitle">Задать вопрос</h2></div><button class="question-close" type="button" data-close-question aria-label="Закрыть">'+closeIcon+'</button></div><label class="question-field" for="questionText">Ваш вопрос<textarea id="questionText" maxlength="1200" placeholder="Напишите, что хотите уточнить о товаре, доставке, оплате или заказе"></textarea></label><p class="question-dialog-hint">Выберите удобный способ отправки. Сообщение откроется уже заполненным — как при оформлении заказа из корзины.</p><div class="question-actions"><button class="question-channel primary" type="button" data-question-channel="whatsapp">Отправить в WhatsApp</button><button class="question-channel" type="button" data-question-channel="telegram">Отправить в Telegram</button><button class="question-channel" type="button" data-question-channel="email">Отправить на почту</button></div><p class="question-error" id="questionError" hidden>Сначала напишите вопрос.</p></div>';
document.body.appendChild(dialog);

const textarea=dialog.querySelector('#questionText');
const error=dialog.querySelector('#questionError');
let previousOverflow='';
function questionText(){return (textarea.value||'').trim()}
function payload(question){
  const page=location.href;
  const intro='Здравствуйте! Хочу задать вопрос по FORMA HOME:';
  return {page,body:`${intro}\n\n${question}\n\nСтраница: ${page}`,telegram:`${intro}\n\n${question}`};
}
function openQuestion(){
  previousOverflow=document.body.style.overflow;
  if(!dialog.open)dialog.showModal();
  document.body.style.overflow='hidden';
  requestAnimationFrame(()=>{try{textarea.focus({preventScroll:true})}catch{textarea.focus()}});
}
trigger.addEventListener('click',openQuestion);
dialog.querySelector('[data-close-question]').addEventListener('click',()=>dialog.close());
dialog.addEventListener('click',event=>{if(event.target===dialog)dialog.close()});
dialog.addEventListener('close',()=>{document.body.style.overflow=previousOverflow;try{trigger.focus({preventScroll:true})}catch{trigger.focus()}});
textarea.addEventListener('input',()=>{if(questionText())error.hidden=true});
dialog.addEventListener('click',event=>{
  const button=event.target.closest('[data-question-channel]');
  if(!button)return;
  const question=questionText();
  if(!question){error.hidden=false;textarea.focus();return}
  error.hidden=true;
  const data=payload(question),channel=button.dataset.questionChannel;
  let url='';
  if(channel==='whatsapp'||channel==='telegram')url=directContactUrl(channel,data.body);
  if(channel==='email')url='mailto:'+ORDER_EMAIL+'?subject='+encodeURIComponent('Вопрос FORMA HOME')+'&body='+encodeURIComponent(data.body);
  if(!url)return;
  if(channel==='email')location.href=url;
  else window.open(url,'_blank','noopener');
});
})();
