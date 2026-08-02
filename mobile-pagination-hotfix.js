(() => {
  "use strict";
  const originalWrite = document.write.bind(document);

  function patchCatalog(html) {
    if (typeof html !== "string" || !html.includes("</body>")) return html;

    const responsiveCss = `
      html,body{max-width:100%;overflow-x:hidden}
      .nav{min-width:0}
      .logo{min-width:0;flex-shrink:1}
      .icon-btn{flex-shrink:0}
      .pagination-wrap{display:flex;justify-content:center;align-items:center;gap:8px;flex-wrap:wrap;padding:34px 0 76px}
      .page-btn{min-width:42px;height:42px;border:1px solid var(--line);background:var(--surface);color:var(--ink);border-radius:999px;padding:0 14px;font-weight:800;display:inline-flex;align-items:center;justify-content:center}
      .page-btn.active{background:var(--ink);border-color:var(--ink);color:#fff}
      .page-btn:disabled{opacity:.4;cursor:not-allowed}
      .page-ellipsis{padding:0 3px;color:var(--muted)}
      @media(max-width:700px){
        .container{width:min(100% - 20px,1240px)}
        .nav{height:68px;gap:7px;overflow:hidden}
        .logo{font-size:clamp(16px,5vw,22px);letter-spacing:.08em;white-space:nowrap;overflow:hidden;text-overflow:clip}
        .icon-btn{min-width:44px;height:44px;padding:0 10px;gap:4px;justify-content:center}
        .favorites-nav>span:not(.badge){display:none}
        .favorites-nav{font-size:0}
        .favorites-nav:before{content:"♡";font-size:22px;line-height:1}
        .badge{font-size:11px;min-width:20px;height:20px;padding:0 5px}
        .pagination-wrap{padding:28px 0 54px;gap:6px}
        .page-btn{min-width:40px;height:40px;padding:0 12px;font-size:13px}
      }
      @media(max-width:430px){
        .logo{font-size:17px;letter-spacing:.06em}
        .icon-btn{padding:0 8px}
      }
    `;
    html = html.replace("</style>", responsiveCss + "</style>");

    if (!html.includes('id="pagination"')) {
      html = html.replace(
        /<div class="load-wrap"><button class="btn btn-primary" id="loadMore">Показать ещё<\/button><\/div>/,
        '<nav class="pagination-wrap" id="pagination" aria-label="Страницы каталога"></nav>'
      );
      html = html.replace(
        /let state = \{search:"",collection:"",category:"Все",price:"",sort:"popular",visible:PAGE_SIZE\};/,
        'let state = {search:"",collection:"",category:"Все",price:"",sort:"popular",page:1};'
      );
      html = html.replace(
        /\$\("#loadMore"\)\.addEventListener\("click",\(\)=>\{state\.visible\+=PAGE_SIZE;render\(\)\}\);/,
        '$("#pagination").addEventListener("click",e=>{const b=e.target.closest("[data-page]");if(!b||b.disabled)return;goToPage(b.dataset.page)});'
      );
      html = html.replace(
        /function resetAndRender\(\)\{state\.visible=PAGE_SIZE;render\(\)\}/,
        'function resetAndRender(){state.page=1;render()}'
      );
      html = html.replace(
        '    function bindEvents(){',
        `    function paginationItems(current,total){if(total<=7)return Array.from({length:total},(_,i)=>i+1);const items=[1],start=Math.max(2,current-1),end=Math.min(total-1,current+1);if(start>2)items.push("start");for(let i=start;i<=end;i++)items.push(i);if(end<total-1)items.push("end");items.push(total);return items}\n    function renderPagination(totalProducts){const totalPages=Math.max(1,Math.ceil(totalProducts/PAGE_SIZE));state.page=Math.min(Math.max(1,state.page),totalPages);const p=$("#pagination");if(totalPages<=1){p.hidden=true;p.innerHTML="";return}p.hidden=false;const nums=paginationItems(state.page,totalPages).map(item=>typeof item!=="number"?'<span class="page-ellipsis">…</span>':'<button class="page-btn'+(item===state.page?' active':'')+'" type="button" data-page="'+item+'"'+(item===state.page?' aria-current="page"':'')+'>'+item+'</button>').join("");p.innerHTML='<button class="page-btn" type="button" data-page="'+(state.page-1)+'" '+(state.page===1?'disabled':'')+'>← Назад</button>'+nums+'<button class="page-btn" type="button" data-page="'+(state.page+1)+'" '+(state.page===totalPages?'disabled':'')+'>Вперёд →</button>'}\n    function goToPage(page){const totalPages=Math.max(1,Math.ceil(filtered().length/PAGE_SIZE));state.page=Math.min(Math.max(1,Number(page)||1),totalPages);render();const a=$("#catalog")||$("#grid");if(a)a.scrollIntoView({behavior:"smooth",block:"start"})}\n\n    function bindEvents(){`
      );
      html = html.replace(
        /const all=filtered\(\), shown=all\.slice\(0,state\.visible\);/,
        'const all=filtered();const totalPages=Math.max(1,Math.ceil(all.length/PAGE_SIZE));state.page=Math.min(Math.max(1,state.page),totalPages);const start=(state.page-1)*PAGE_SIZE;const shown=all.slice(start,start+PAGE_SIZE);'
      );
      html = html.replace(
        /\$\("#loadMore"\)\.style\.display = state\.visible < all\.length \? "inline-flex" : "none";/,
        'renderPagination(all.length);'
      );
    }

    return html;
  }

  document.write = function patchedWrite(...parts) {
    const joined = parts.join("");
    return originalWrite(patchCatalog(joined));
  };
})();
