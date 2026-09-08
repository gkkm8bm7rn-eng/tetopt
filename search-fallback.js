/* Search UX: if a text query has no matches in the selected category, repeat it across the full catalog. */
(function(){
'use strict';
const form=document.getElementById('searchForm');
if(!form)return;
form.addEventListener('submit',function(event){
  const input=document.getElementById('searchInput');
  const query=(input?.value||'').trim();
  if(!query||(state.categoryMain==='all'&&state.categoryCode==='all')||state.view==='favorites')return;
  const currentCategory=state.categoryCode!=='all'?categoryLabel(state.categoryCode):CATEGORY_TREE.find(item=>item.id===state.categoryMain)?.label||'категории';
  const categoryHasMatches=state.products.some(product=>
    matchesSelectedCategory(product)&&
    searchMatches(product,query)&&
    (!state.min||minPrice(product)>=Number(state.min))&&
    (!state.max||minPrice(product)<=Number(state.max))&&
    (!state.multi||product.variants.length>1)
  );
  if(categoryHasMatches)return;
  const catalogHasMatches=state.products.some(product=>
    searchMatches(product,query)&&
    (!state.min||minPrice(product)>=Number(state.min))&&
    (!state.max||minPrice(product)<=Number(state.max))&&
    (!state.multi||product.variants.length>1)
  );
  if(!catalogHasMatches)return;
  event.preventDefault();
  event.stopImmediatePropagation();
  state.search=query;
  state.categoryMain='all';
  state.categoryCode='all';
  state.page=1;
  renderCategories();
  applyFilters();
  syncCatalogHistory();
  const count=document.getElementById('resultCount');
  if(count){
    count.hidden=false;
    count.textContent=`В категории «${currentCategory}» ничего не найдено — показываем по всему каталогу: ${state.filtered.length}`;
  }
  requestAnimationFrame(()=>instantScroll(document.getElementById('productGrid')));
},true);
})();

/* Mobile category UX: parent categories with children open their subcategories first.
   Filtering and scrolling to products happens only after a real subcategory is chosen,
   or immediately for a parent category that has no subcategories. */
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

/* Contact actions: open a real compose/chat screen instead of a share picker/new popup.
   WhatsApp uses the official click-to-chat URL. Telegram first uses the app phone deep link
   and falls back to the HTTPS phone link when Telegram is not installed. */
(function(){
'use strict';
const CONTACT_PHONE='79057267946';
const CONTACT_EMAIL='postes@mail.ru';

function whatsappUrl(text){
  return`https://wa.me/${CONTACT_PHONE}?text=${encodeURIComponent(text||'')}`;
}
function telegramWebUrl(text){
  return`https://t.me/+${CONTACT_PHONE}?text=${encodeURIComponent(text||'')}`;
}
function telegramAppUrl(text){
  return`tg://resolve?phone=${CONTACT_PHONE}&text=${encodeURIComponent(text||'')}`;
}
function mailUrl(subject,body){
  return`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject||'')}&body=${encodeURIComponent(body||'')}`;
}
function openTelegram(text){
  const fallback=telegramWebUrl(text);
  let settled=false;
  const onVisibility=()=>{
    if(document.hidden){
      settled=true;
      clearTimeout(timer);
      document.removeEventListener('visibilitychange',onVisibility);
    }
  };
  document.addEventListener('visibilitychange',onVisibility);
  const timer=setTimeout(()=>{
    document.removeEventListener('visibilitychange',onVisibility);
    if(!settled&&!document.hidden)location.assign(fallback);
  },900);
  location.assign(telegramAppUrl(text));
}

function rewriteCartLinks(){
  const footer=document.getElementById('cartFooter');
  if(!footer)return;
  footer.querySelectorAll('.checkout-actions a').forEach(link=>{
    const label=(link.textContent||'').toLocaleLowerCase('ru-RU');
    const raw=link.getAttribute('href')||'';
    link.removeAttribute('target');
    if(label.includes('whatsapp')){
      let text='';
      try{text=new URL(raw,location.href).searchParams.get('text')||''}catch{}
      link.dataset.directChannel='whatsapp';
      link.setAttribute('href',whatsappUrl(text));
      return;
    }
    if(label.includes('telegram')){
      let text='';
      try{
        const url=new URL(raw,location.href);
        text=url.searchParams.get('text')||'';
        const share=url.searchParams.get('url')||'';
        if(share)text=[text,share].filter(Boolean).join('\n');
      }catch{}
      link.dataset.directChannel='telegram';
      link.dataset.directText=text;
      link.setAttribute('href',telegramAppUrl(text));
      return;
    }
    if(label.includes('e-mail')||label.includes('email')){
      let subject='Заказ FORMA HOME',body='';
      try{
        const query=raw.includes('?')?raw.slice(raw.indexOf('?')):'';
        const params=new URLSearchParams(query);
        subject=params.get('subject')||subject;
        body=params.get('body')||'';
      }catch{}
      link.dataset.directChannel='email';
      link.setAttribute('href',mailUrl(subject,body));
    }
  });
}

const cartFooter=document.getElementById('cartFooter');
if(cartFooter&&window.MutationObserver)new MutationObserver(rewriteCartLinks).observe(cartFooter,{childList:true,subtree:true});
document.addEventListener('click',event=>{
  if(event.target.closest('#cartButton,[data-qty],[data-remove]'))setTimeout(rewriteCartLinks,0);
});
setTimeout(rewriteCartLinks,0);

document.addEventListener('click',function(event){
  const link=event.target.closest('#cartFooter .checkout-actions a[data-direct-channel]');
  if(!link)return;
  const channel=link.dataset.directChannel;
  event.preventDefault();
  event.stopImmediatePropagation();
  if(channel==='telegram'){
    openTelegram(link.dataset.directText||'');
    return;
  }
  location.assign(link.getAttribute('href'));
},true);

document.addEventListener('click',function(event){
  const button=event.target.closest('[data-question-channel]');
  if(!button)return;
  const textarea=document.getElementById('questionText');
  const question=(textarea?.value||'').trim();
  if(!question)return;

  const page=location.href;
  const body=`Здравствуйте! Хочу задать вопрос по FORMA HOME:\n\n${question}\n\nСтраница: ${page}`;
  const channel=button.dataset.questionChannel;
  event.preventDefault();
  event.stopImmediatePropagation();
  const error=document.getElementById('questionError');
  if(error)error.hidden=true;

  if(channel==='whatsapp'){
    location.assign(whatsappUrl(body));
    return;
  }
  if(channel==='telegram'){
    openTelegram(body);
    return;
  }
  if(channel==='email')location.assign(mailUrl('Вопрос FORMA HOME',body));
},true);
})();
