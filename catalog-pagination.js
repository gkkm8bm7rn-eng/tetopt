(() => {
  "use strict";

  const nativeFetch = window.fetch.bind(window);

  function replaceOnce(source, search, replacement, label) {
    const matches = typeof search === "string"
      ? source.split(search).length - 1
      : (source.match(search) || []).length;
    if (matches !== 1) {
      throw new Error(`${label}: expected 1 occurrence, found ${matches}`);
    }
    return source.replace(search, replacement);
  }

  function patchCatalogSource(source) {
    let text = source;

    text = replaceOnce(
      text,
      ".load-wrap{text-align:center;padding:34px 0 76px}",
      `.pagination-wrap{display:flex;justify-content:center;align-items:center;gap:8px;flex-wrap:wrap;padding:34px 0 76px}
    .page-btn{min-width:42px;height:42px;border:1px solid var(--line);background:var(--surface);color:var(--ink);border-radius:999px;padding:0 14px;font-weight:800;cursor:pointer;display:inline-flex;align-items:center;justify-content:center}
    .page-btn:hover:not(:disabled){border-color:var(--accent);color:var(--accent)}
    .page-btn.active{background:var(--ink);border-color:var(--ink);color:#fff}
    .page-btn:disabled{opacity:.4;cursor:not-allowed}
    .page-ellipsis{padding:0 3px;color:var(--muted)}`,
      "pagination styles"
    );

    text = replaceOnce(
      text,
      '<div class="load-wrap"><button class="btn btn-primary" id="loadMore">Показать ещё</button></div>',
      '<nav class="pagination-wrap" id="pagination" aria-label="Страницы каталога"></nav>',
      "pagination markup"
    );

    text = replaceOnce(
      text,
      'let state = {search:"",collection:"",category:"Все",price:"",sort:"popular",visible:PAGE_SIZE};',
      'let state = {search:"",collection:"",category:"Все",price:"",sort:"popular",page:1};',
      "catalog state"
    );

    text = replaceOnce(
      text,
      '$("#loadMore").addEventListener("click",()=>{state.visible+=PAGE_SIZE;render()});',
      `$("#pagination").addEventListener("click",e=>{
        const button=e.target.closest("[data-page]");
        if(!button||button.disabled)return;
        goToPage(button.dataset.page);
      });`,
      "pagination click handler"
    );

    text = replaceOnce(
      text,
      "function resetAndRender(){state.visible=PAGE_SIZE;render()}",
      "function resetAndRender(){state.page=1;render()}",
      "pagination reset"
    );

    const helpers = `
    function paginationItems(current,total){
      if(total<=7)return Array.from({length:total},(_,i)=>i+1);
      const items=[1];
      const start=Math.max(2,current-1);
      const end=Math.min(total-1,current+1);
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
      if(totalPages<=1){pagination.hidden=true;pagination.innerHTML="";return}
      pagination.hidden=false;
      const numbered=paginationItems(state.page,totalPages).map(item=>{
        if(typeof item!=="number")return '<span class="page-ellipsis" aria-hidden="true">…</span>';
        const active=item===state.page;
        return '<button class="page-btn'+(active?' active':'')+'" type="button" data-page="'+item+'"'+(active?' aria-current="page"':'')+' aria-label="Страница '+item+'">'+item+'</button>';
      }).join("");
      pagination.innerHTML=
        '<button class="page-btn" type="button" data-page="'+(state.page-1)+'" '+(state.page===1?'disabled':'')+' aria-label="Предыдущая страница">← Назад</button>'+numbered+
        '<button class="page-btn" type="button" data-page="'+(state.page+1)+'" '+(state.page===totalPages?'disabled':'')+' aria-label="Следующая страница">Вперёд →</button>';
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

    text = replaceOnce(
      text,
      "    function bindEvents(){",
      helpers + "    function bindEvents(){",
      "pagination helpers"
    );

    text = replaceOnce(
      text,
      "const all=filtered(), shown=all.slice(0,state.visible);",
      `const all=filtered();
      const totalPages=Math.max(1,Math.ceil(all.length/PAGE_SIZE));
      state.page=Math.min(Math.max(1,state.page),totalPages);
      const start=(state.page-1)*PAGE_SIZE;
      const shown=all.slice(start,start+PAGE_SIZE);`,
      "page slice"
    );

    text = replaceOnce(
      text,
      '$("#loadMore").style.display = state.visible < all.length ? "inline-flex" : "none";',
      "renderPagination(all.length);",
      "pagination render"
    );

    if (text.includes("Показать ещё") || text.includes("loadMore") || text.includes("state.visible")) {
      throw new Error("Legacy load-more logic remains after patching");
    }
    for (const token of ['id="pagination"', "function renderPagination", "function goToPage", 'aria-current="page"']) {
      if (!text.includes(token)) throw new Error(`Missing pagination token: ${token}`);
    }

    return text;
  }

  window.fetch = async function patchedFetch(input, init) {
    const response = await nativeFetch(input, init);
    const rawUrl = input instanceof Request ? input.url : String(input);
    const url = new URL(rawUrl, window.location.href);

    if (!url.pathname.endsWith("/catalog-source.html") || !response.ok) {
      return response;
    }

    const source = await response.text();
    try {
      const patched = patchCatalogSource(source);
      const headers = new Headers(response.headers);
      headers.delete("content-length");
      return new Response(patched, {
        status: response.status,
        statusText: response.statusText,
        headers
      });
    } catch (error) {
      console.error("Не удалось включить постраничную навигацию каталога:", error);
      return new Response(source, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers
      });
    }
  };
})();
