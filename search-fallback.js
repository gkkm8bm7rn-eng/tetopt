/* Search UX: if a text query has no matches in the selected category, repeat it across the full catalog. */
(function(){
'use strict';
const form=document.getElementById('searchForm');
if(!form)return;
form.addEventListener('submit',function(event){
  const input=document.getElementById('searchInput');
  const query=(input?.value||'').trim();
  if(!query||state.category==='Все'||state.view==='favorites')return;
  const currentCategory=state.category;
  const categoryHasMatches=state.products.some(product=>
    product.category===currentCategory&&
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
  state.category='Все';
  state.page=1;
  renderCategories();
  applyFilters();
  const count=document.getElementById('resultCount');
  if(count){
    count.hidden=false;
    count.textContent=`В категории «${currentCategory}» ничего не найдено — показываем по всему каталогу: ${state.filtered.length}`;
  }
  requestAnimationFrame(()=>document.getElementById('productGrid')?.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'}));
},true);
})();
