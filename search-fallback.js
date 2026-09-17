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
async function sendSiteEmail({subject,message,kind,control}){
  setBusy(control,true);
  try{
    const response=await fetch(EMAIL_ENDPOINT,{
      method:'POST',
      headers:{'Content-Type':'application/json','Accept':'application/json'},
      body:JSON.stringify({_subject:subject,_template:'table',_captcha:'false',type:kind,message,page:location.href})
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
    await sendSiteEmail({subject:link.dataset.emailSubject||'Заказ FORMA HOME',message:link.dataset.emailBody||'',kind:'Заказ из корзины',control:link});
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
    const sent=await sendSiteEmail({subject:'Вопрос FORMA HOME',message:body,kind:'Вопрос с сайта',control:button});
    if(sent&&textarea)textarea.value='';
  }
},true);
})();
