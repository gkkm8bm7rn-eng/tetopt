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

/* Keep checkout and question actions addressed to the verified FORMA HOME contacts.
   The existing cart/question UI stays unchanged; only destination links are rewritten. */
(function(){
'use strict';
const CONTACT_PHONE='79057267946';
const CONTACT_EMAIL='postes@mail.ru';
const directUrl=(channel,text)=>{
  const encoded=encodeURIComponent(text||'');
  if(channel==='whatsapp')return`https://wa.me/${CONTACT_PHONE}?text=${encoded}`;
  if(channel==='telegram')return`https://t.me/+${CONTACT_PHONE}?text=${encoded}`;
  return'';
};

function rewriteCartLinks(){
  const footer=document.getElementById('cartFooter');
  if(!footer)return;
  footer.querySelectorAll('.checkout-actions a').forEach(link=>{
    const label=(link.textContent||'').toLocaleLowerCase('ru-RU');
    const raw=link.getAttribute('href')||'';
    if(label.includes('whatsapp')){
      try{const url=new URL(raw,location.href);link.setAttribute('href',directUrl('whatsapp',url.searchParams.get('text')||''))}catch{}
      return;
    }
    if(label.includes('telegram')){
      try{
        const url=new URL(raw,location.href);
        const text=url.searchParams.get('text')||'';
        const share=url.searchParams.get('url')||'';
        link.setAttribute('href',directUrl('telegram',[text,share].filter(Boolean).join('\n')));
      }catch{}
      return;
    }
    if(label.includes('e-mail')||label.includes('email')){
      const query=raw.includes('?')?raw.slice(raw.indexOf('?')):'';
      link.setAttribute('href',`mailto:${CONTACT_EMAIL}${query}`);
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
  const button=event.target.closest('[data-question-channel]');
  if(!button)return;
  const textarea=document.getElementById('questionText');
  const question=(textarea?.value||'').trim();
  if(!question)return;

  const page=location.href;
  const body=`Здравствуйте! Хочу задать вопрос по FORMA HOME:\n\n${question}\n\nСтраница: ${page}`;
  const channel=button.dataset.questionChannel;
  let url='';
  if(channel==='whatsapp'||channel==='telegram')url=directUrl(channel,body);
  if(channel==='email')url=`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent('Вопрос FORMA HOME')}&body=${encodeURIComponent(body)}`;
  if(!url)return;

  event.preventDefault();
  event.stopImmediatePropagation();
  const error=document.getElementById('questionError');
  if(error)error.hidden=true;
  if(channel==='email')location.href=url;
  else window.open(url,'_blank','noopener');
},true);
})();
