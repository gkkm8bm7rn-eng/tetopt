(() => {
  "use strict";

  const previousFetch = window.fetch.bind(window);

  function patchLegacyCatalog(source) {
    if (typeof source !== "string") return source;
    if (!source.includes("state.visible") && !source.includes('id="loadMore"')) return source;

    let text = source;

    text = text.replace(/image-zoom\.js\?v=\d+/g, "image-zoom.js?v=4");

    text = text.replace(
      /<div class="load-wrap">\s*<button class="btn btn-primary" id="loadMore">Показать ещё<\/button>\s*<\/div>/,
      '<nav class="pagination-wrap" id="pagination" aria-label="Страницы каталога"></nav>'
    );

    text = text.replace(
      /let state\s*=\s*\{search:"",collection:"",category:"Все",price:"",sort:"popular",visible:PAGE_SIZE\};/,
      'let state = {search:"",collection:"",category:"Все",price:"",sort:"popular",page:1};'
    );

    text = text.replace(
      /\$\("#loadMore"\)\.addEventListener\("click",\(\)=>\{state\.visible\+=PAGE_SIZE;render\(\)\}\);/,
      '$("#pagination").addEventListener("click",e=>{const button=e.target.closest("[data-page]");if(!button||button.disabled)return;goToPage(button.dataset.page)});'
    );

    text = text.replace(
      /function resetAndRender\(\)\{state\.visible=PAGE_SIZE;render\(\)\}/,
      'function resetAndRender(){state.page=1;render()}'
    );

    if (!text.includes("function paginationItems(")) {
      const helpers = `
    function paginationItems(current,total){
      if(total<=7)return Array.from({length:total},(_,i)=>i+1);
      const items=[1],start=Math.max(2,current-1),end=Math.min(total-1,current+1);
      if(start>2)items.push("start");
      for(let i=start;i<=end;i++)items.push(i);
      if(end<total-1)items.push("end");
      items.push(total);
      return items;
    }
    function renderPagination(totalProducts){
      const totalPages=Math.max(1,Math.ceil(totalProducts/PAGE_SIZE));
      state.page=Math.min(Math.max(1,state.page),totalPages);
      const pagination=$("#pagination");
      if(!pagination)return;
      if(totalPages<=1){pagination.hidden=true;pagination.innerHTML="";return}
      pagination.hidden=false;
      const numbered=paginationItems(state.page,totalPages).map(item=>{
        if(typeof item!=="number")return '<span class="page-ellipsis" aria-hidden="true">…</span>';
        const active=item===state.page;
        return '<button class="page-btn'+(active?' active':'')+'" type="button" data-page="'+item+'"'+(active?' aria-current="page"':'')+' aria-label="Страница '+item+'">'+item+'</button>';
      }).join("");
      pagination.innerHTML='<button class="page-btn" type="button" data-page="'+(state.page-1)+'" '+(state.page===1?'disabled':'')+' aria-label="Предыдущая страница">←</button>'+numbered+'<button class="page-btn" type="button" data-page="'+(state.page+1)+'" '+(state.page===totalPages?'disabled':'')+' aria-label="Следующая страница">→</button>';
    }
    function goToPage(page){
      const totalPages=Math.max(1,Math.ceil(filtered().length/PAGE_SIZE));
      const next=Math.min(Math.max(1,Number(page)||1),totalPages);
      if(next===state.page)return;
      state.page=next;
      render();
      const anchor=$("#catalog")||$("#grid");
      if(anchor)anchor.scrollIntoView({behavior:"smooth",block:"start"});
    }

`;
      if (text.includes("    function bind(){")) {
        text = text.replace("    function bind(){", helpers + "    function bind(){");
      }
    }

    text = text.replace(
      /const all=filtered\(\),\s*shown=all\.slice\(0,state\.visible\);/,
      'const all=filtered();const totalPages=Math.max(1,Math.ceil(all.length/PAGE_SIZE));state.page=Math.min(Math.max(1,state.page),totalPages);const start=(state.page-1)*PAGE_SIZE;const shown=all.slice(start,start+PAGE_SIZE);'
    );

    text = text.replace(
      /\$\("#loadMore"\)\.style\.display\s*=\s*state\.visible\s*<\s*all\.length\s*\?\s*"inline-flex"\s*:\s*"none";/,
      'renderPagination(all.length);'
    );

    if (!text.includes(".pagination-wrap{")) {
      text = text.replace("</style>", `.pagination-wrap{display:flex;justify-content:center;align-items:center;gap:8px;flex-wrap:wrap;padding:34px 0 76px}.page-btn{min-width:42px;height:42px;border:1px solid var(--line);background:var(--surface);color:var(--ink);border-radius:999px;padding:0 14px;font-weight:800;display:inline-flex;align-items:center;justify-content:center}.page-btn.active{background:var(--ink);border-color:var(--ink);color:#fff}.page-btn:disabled{opacity:.4}.page-ellipsis{padding:0 3px;color:var(--muted)}@media(max-width:700px){.pagination-wrap{gap:6px;padding:28px 0 54px}.page-btn{min-width:40px;height:40px;padding:0 12px;font-size:13px}}</style>`);
    }

    const failed = text.includes("state.visible") ||
      text.includes('id="loadMore"') ||
      text.includes("Показать ещё") ||
      !text.includes("function renderPagination(") ||
      !text.includes("function goToPage(");

    if (failed) {
      console.error("Функциональная пагинация не смогла полностью заменить старую логику");
      return source;
    }

    window.__FORMA_PAGINATION_FALLBACK_AUDIT__ = {
      applied: true,
      sourceBinding: "bind"
    };
    return text;
  }

  window.fetch = async function functionalPaginationFetch(input, init) {
    const response = await previousFetch(input, init);
    const rawUrl = input instanceof Request ? input.url : String(input);
    const url = new URL(rawUrl, location.href);
    if (!response.ok || !url.pathname.endsWith("/catalog-source.html")) return response;

    const source = await response.text();
    const patched = patchLegacyCatalog(source);
    const headers = new Headers(response.headers);
    headers.delete("content-length");
    return new Response(patched, {status:response.status,statusText:response.statusText,headers});
  };
})();
