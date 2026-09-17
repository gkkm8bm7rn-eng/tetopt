/* Core Web Vitals: keep search interactions light and reserve the async mobile catalog controls. */
(function(){
'use strict';
const form=document.getElementById('searchForm');
const originalInput=document.getElementById('searchInput');
if(!form||!originalInput)return;

const input=originalInput.cloneNode(true);
input.value=originalInput.value;
originalInput.replaceWith(input);

const normalizedNames=new WeakMap();
searchRelevance=function(product,query){
  const needle=normalizeSearch(query);
  if(!needle)return 0;
  if(/^\d+$/.test(needle)){
    const ids=(product.variants||[]).map(variant=>String(variant.sourceId||''));
    if(ids.includes(needle))return 0;
    const prefix=ids.findIndex(id=>id.startsWith(needle));
    if(prefix>=0)return 10+prefix;
    const partial=ids.findIndex(id=>id.includes(needle));
    return partial>=0?50+partial:Number.POSITIVE_INFINITY;
  }
  let name=normalizedNames.get(product);
  if(name===undefined){name=normalizeSearch(product.name);normalizedNames.set(product,name)}
  const index=name.indexOf(needle);
  if(index<0)return Number.POSITIVE_INFINITY;
  const words=name.split(' '),exactWord=words.indexOf(needle),prefixWord=words.findIndex(word=>word.startsWith(needle));
  if(name===needle)return 0;
  if(exactWord>=0)return 10+exactWord;
  if(prefixWord>=0)return 20+prefixWord;
  return 100+index;
};

let searchTimer=0;
function runSearch({scroll=false}={}){
  clearTimeout(searchTimer);
  state.search=input.value;
  state.page=1;
  if(!state.products.length)return;
  applyFilters();
  syncCatalogHistory();
  if(scroll)requestAnimationFrame(()=>instantScroll(document.getElementById('productGrid')));
}
function scheduleSearch(){
  state.search=input.value;
  state.page=1;
  clearTimeout(searchTimer);
  searchTimer=setTimeout(()=>requestAnimationFrame(()=>runSearch()),180);
}
input.addEventListener('input',scheduleSearch,{passive:true});
form.addEventListener('submit',function(event){
  event.preventDefault();
  event.stopImmediatePropagation();
  clearTimeout(searchTimer);
  requestAnimationFrame(()=>runSearch({scroll:true}));
},true);

const style=document.createElement('style');
style.dataset.cwvReserve='catalog';
style.textContent=`@media(max-width:640px){
  #categoryRow:empty{min-height:286px}
  #catalog>.section-heading #resultCount[hidden]{display:block!important;visibility:hidden;min-width:72px}
}`;
document.head.appendChild(style);
})();

(function(){
'use strict';
const style=document.createElement('style');
style.textContent='@media(max-width:640px){.category-subgroup .category-all{display:none!important}}';
document.head.appendChild(style);

document.addEventListener('click',function(event){
  if(!window.matchMedia('(max-width: 640px)').matches)return;
  const button=event.target.closest('.category-main[data-main-category]');
  if(!button)return;
  const mainId=button.dataset.mainCategory;
  if(!mainId||mainId==='all')return;
  const main=CATEGORY_TREE.find(item=>item.id===mainId);
  if(!main||!main.children.length)return;
  event.preventDefault();
  event.stopImmediatePropagation();
  state.view='catalog';
  state.categoryMain=mainId;
  state.categoryCode='all';
  state.page=1;
  renderCategories();
},true);
})();

/* Direct contact actions. Email is submitted through FormSubmit instead of mailto,
   so the shopper does not need a configured mail application. */
(function(){
'use strict';
const CONTACT_PHONE='79057267946';
const CONTACT_EMAIL='postes@mail.ru';
const EMAIL_ENDPOINT=`https://formsubmit.co/ajax/${CONTACT_EMAIL}`;

function whatsappUrl(text){return`https://wa.me/${CONTACT_PHONE}?text=${encodeURIComponent(text||'')}`}
function telegramWebUrl(text){return`https://t.me/+${CONTACT_PHONE}?text=${encodeURIComponent(text||'')}`}
function telegramAppUrl(text){return`tg://resolve?phone=${CONTACT_PHONE}&text=${encodeURIComponent(text||'')}`}
function openTelegram(text){
  const fallback=telegramWebUrl(text);
  let settled=false;
  const onVisibility=()=>{if(document.hidden){settled=true;clearTimeout(timer);document.removeEventListener('visibilitychange',onVisibility)}};
  document.addEventListener('visibilitychange',onVisibility);
  const timer=setTimeout(()=>{document.removeEventListener('visibilitychange',onVisibility);if(!settled&&!document.hidden)location.assign(fallback)},900);
  location.assign(telegramAppUrl(text));
}
function setBusy(control,busy,label){
  if(!control)return;
  if(busy){control.dataset.emailLabel=control.textContent;control.textContent=label||'Отправляем…';control.setAttribute('aria-busy','true');control.style.pointerEvents='none'}
  else{control.textContent=control.dataset.emailLabel||control.textContent;control.removeAttribute('aria-busy');control.style.pointerEvents=''}
}
function validEmail(value){return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value||'').trim())}
function ensureReplyDialog(){
  let dialog=document.getElementById('replyEmailDialog');
  if(dialog)return dialog;
  const style=document.createElement('style');
  style.dataset.replyEmailStyles='true';
  style.textContent=`.reply-email-dialog{width:min(460px,calc(100vw - 24px));padding:0;border:0;border-radius:22px;background:#f7f5f0;color:#201f1b;box-shadow:0 28px 80px rgba(24,27,22,.24)}.reply-email-dialog::backdrop{background:rgba(25,27,23,.48);backdrop-filter:blur(2px)}.reply-email-shell{padding:24px}.reply-email-head{display:flex;align-items:start;justify-content:space-between;gap:16px}.reply-email-head h2{margin:0;font:400 30px/1 Georgia,serif}.reply-email-close{display:grid;width:40px;height:40px;place-items:center;border:1px solid #cfd8ca;border-radius:999px;background:#fff;color:#435d41;font-size:24px;cursor:pointer}.reply-email-copy{margin:12px 0 16px;color:#666b63;font:500 13px/1.5 Arial,sans-serif}.reply-email-field{display:grid;gap:7px;color:#314d32;font:750 12px/1.25 Arial,sans-serif}.reply-email-field input{width:100%;height:48px;padding:0 13px;border:1px solid #cfd8ca;border-radius:13px;background:#fff;color:#242520;font:500 16px/1 Arial,sans-serif;box-sizing:border-box}.reply-email-field input:focus{outline:none;border-color:#657c62;box-shadow:0 0 0 3px rgba(67,93,65,.13)}.reply-email-error{margin:8px 0 0;color:#a54434;font:700 11px/1.4 Arial,sans-serif}.reply-email-submit{width:100%;min-height:48px;margin-top:16px;padding:10px 14px;border:0;border-radius:13px;background:#435d41;color:#fff;font:800 13px/1.2 Arial,sans-serif;cursor:pointer}.reply-email-submit:hover,.reply-email-submit:focus-visible{background:#365137;outline:none}`;
  document.head.appendChild(style);
  dialog=document.createElement('dialog');
  dialog.id='replyEmailDialog';dialog.className='reply-email-dialog';
  dialog.innerHTML='<form class="reply-email-shell" method="dialog" novalidate><div class="reply-email-head"><h2>Куда вам ответить?</h2><button class="reply-email-close" type="button" data-reply-email-close aria-label="Закрыть">×</button></div><p class="reply-email-copy">Укажите ваш e-mail. Мы получим его вместе с вопросом или заказом и сможем ответить вам обычным письмом.</p><label class="reply-email-field" for="replyEmailInput">Ваш e-mail<input id="replyEmailInput" name="email" type="email" inputmode="email" autocomplete="email" maxlength="254" placeholder="name@example.com" required></label><p class="reply-email-error" id="replyEmailError" hidden>Введите корректный e-mail.</p><button class="reply-email-submit" type="submit">Отправить на почту</button></form>';
  document.body.appendChild(dialog);
  dialog.querySelector('[data-reply-email-close]').addEventListener('click',()=>dialog.close('cancel'));
  dialog.addEventListener('click',event=>{if(event.target===dialog)dialog.close('cancel')});
  return dialog;
}
function requestReplyEmail(){
  const dialog=ensureReplyDialog(),form=dialog.querySelector('form'),input=dialog.querySelector('#replyEmailInput'),error=dialog.querySelector('#replyEmailError');
  if(!dialog.showModal){const fallback=window.prompt('Ваш e-mail для ответа:','')||'';return Promise.resolve(validEmail(fallback)?fallback.trim():'')}
  error.hidden=true;input.value='';
  return new Promise(resolve=>{
    let settled=false;
    const finish=value=>{if(settled)return;settled=true;form.removeEventListener('submit',onSubmit);dialog.removeEventListener('close',onClose);resolve(value)};
    const onSubmit=event=>{event.preventDefault();const value=input.value.trim();if(!validEmail(value)){error.hidden=false;input.focus();return}error.hidden=true;dialog.close('sent');finish(value)};
    const onClose=()=>finish('');
    form.addEventListener('submit',onSubmit);dialog.addEventListener('close',onClose,{once:true});
    dialog.showModal();setTimeout(()=>input.focus(),0);
  });
}
async function sendSiteEmail({subject,message,kind,replyEmail,control}){
  if(!validEmail(replyEmail))return false;
  setBusy(control,true);
  try{
    const response=await fetch(EMAIL_ENDPOINT,{
      method:'POST',
      headers:{'Content-Type':'application/json','Accept':'application/json'},
      body:JSON.stringify({_subject:subject,_template:'table',_captcha:'false',email:replyEmail,_replyto:replyEmail,'E-mail покупателя':replyEmail,type:kind,message,page:location.href})
    });
    let data={};
    try{data=await response.json()}catch{}
    if(!response.ok||data.success===false)throw new Error(data.message||`HTTP ${response.status}`);
    if(typeof toast==='function')toast('Отправлено на почту');
    return true;
  }catch(error){
    console.error('[email-submit]',error);
    if(typeof toast==='function')toast('Не удалось отправить. Попробуйте ещё раз');
    return false;
  }finally{setBusy(control,false)}
}

function rewriteCartLinks(){
  const footer=document.getElementById('cartFooter');
  if(!footer)return;
  footer.querySelectorAll('.checkout-actions a').forEach(link=>{
    const label=(link.textContent||'').toLocaleLowerCase('ru-RU');
    const raw=link.getAttribute('href')||'';
    link.removeAttribute('target');
    if(label.includes('whatsapp')){
      let text='';try{text=new URL(raw,location.href).searchParams.get('text')||''}catch{}
      link.dataset.directChannel='whatsapp';link.setAttribute('href',whatsappUrl(text));return;
    }
    if(label.includes('telegram')){
      let text='';try{const url=new URL(raw,location.href);text=url.searchParams.get('text')||'';const share=url.searchParams.get('url')||'';if(share)text=[text,share].filter(Boolean).join('\n')}catch{}
      link.dataset.directChannel='telegram';link.dataset.directText=text;link.setAttribute('href',telegramAppUrl(text));return;
    }
    if(label.includes('e-mail')||label.includes('email')){
      let subject='Заказ FORMA HOME',body='';
      try{const query=raw.includes('?')?raw.slice(raw.indexOf('?')):'';const params=new URLSearchParams(query);subject=params.get('subject')||subject;body=params.get('body')||''}catch{}
      link.dataset.directChannel='email';link.dataset.emailSubject=subject;link.dataset.emailBody=body;link.setAttribute('href','#');
    }
  });
}

const cartFooter=document.getElementById('cartFooter');
if(cartFooter&&window.MutationObserver)new MutationObserver(rewriteCartLinks).observe(cartFooter,{childList:true,subtree:true});
document.addEventListener('click',event=>{if(event.target.closest('#cartButton,[data-qty],[data-remove]'))setTimeout(rewriteCartLinks,0)});
setTimeout(rewriteCartLinks,0);

document.addEventListener('click',async function(event){
  const link=event.target.closest('#cartFooter .checkout-actions a[data-direct-channel]');
  if(!link)return;
  const channel=link.dataset.directChannel;
  event.preventDefault();event.stopImmediatePropagation();
  if(channel==='telegram'){openTelegram(link.dataset.directText||'');return}
  if(channel==='email'){
    const replyEmail=await requestReplyEmail();if(!replyEmail)return;
    await sendSiteEmail({subject:link.dataset.emailSubject||'Заказ FORMA HOME',message:link.dataset.emailBody||'',kind:'Заказ из корзины',replyEmail,control:link});
    return;
  }
  location.assign(link.getAttribute('href'));
},true);

document.addEventListener('click',async function(event){
  const button=event.target.closest('[data-question-channel]');
  if(!button)return;
  const textarea=document.getElementById('questionText');
  const question=(textarea?.value||'').trim();
  if(!question)return;
  const page=location.href;
  const body=`Здравствуйте! Хочу задать вопрос по FORMA HOME:\n\n${question}\n\nСтраница: ${page}`;
  const channel=button.dataset.questionChannel;
  event.preventDefault();event.stopImmediatePropagation();
  const error=document.getElementById('questionError');if(error)error.hidden=true;
  if(channel==='whatsapp'){location.assign(whatsappUrl(body));return}
  if(channel==='telegram'){openTelegram(body);return}
  if(channel==='email'){
    const replyEmail=await requestReplyEmail();if(!replyEmail)return;
    const sent=await sendSiteEmail({subject:'Вопрос FORMA HOME',message:body,kind:'Вопрос с сайта',replyEmail,control:button});
    if(sent&&textarea)textarea.value='';
  }
},true);
})();