(() => {
  "use strict";
  const originalWrite = document.write.bind(document);

  function paginationRecoveryRuntime() {
    "use strict";
    let scheduled = false;
    function totalProducts(){try{return typeof filtered==="function"?filtered().length:0}catch{return 0}}
    function pageItems(current,total){if(total<=5)return Array.from({length:total},(_,i)=>i+1);const items=[1],start=Math.max(2,current-1),end=Math.min(total-1,current+1);if(start>2)items.push("a");for(let p=start;p<=end;p++)items.push(p);if(end<total-1)items.push("b");items.push(total);return items}
    function ensurePagination(){const grid=document.getElementById("grid");if(!grid)return null;let p=document.getElementById("pagination");if(!p){p=document.createElement("nav");p.id="pagination";p.className="pagination-wrap";p.setAttribute("aria-label","Страницы каталога");grid.insertAdjacentElement("afterend",p)}return p}
    function currentPage(){try{const value=Number(state?.page||1);return Number.isFinite(value)&&value>0?value:1}catch{return 1}}
    function renderControls(){scheduled=false;const p=ensurePagination();if(!p)return;const count=totalProducts(),size=typeof PAGE_SIZE==="number"&&PAGE_SIZE>0?PAGE_SIZE:48,total=Math.max(1,Math.ceil(count/size)),page=Math.min(currentPage(),total);if(total<=1){p.hidden=true;p.innerHTML="";return}p.hidden=false;const nums=pageItems(page,total).map(item=>typeof item!=="number"?'<span class="page-ellipsis" aria-hidden="true">…</span>':`<button class="page-btn${item===page?" active":""}" type="button" data-page="${item}"${item===page?' aria-current="page"':""} aria-label="Страница ${item}">${item}</button>`).join("");p.innerHTML=`<button class="page-btn" type="button" data-page="${page-1}"${page===1?" disabled":""} aria-label="Предыдущая страница">←</button>${nums}<button class="page-btn" type="button" data-page="${page+1}"${page===total?" disabled":""} aria-label="Следующая страница">→</button>`}
    function schedule(){if(scheduled)return;scheduled=true;requestAnimationFrame(renderControls)}
    document.addEventListener("click",event=>{const button=event.target.closest("#pagination [data-page]");if(!button||button.disabled)return;event.preventDefault();const page=Number(button.dataset.page);try{if(typeof goToPage==="function")goToPage(page);else if(typeof state!=="undefined"){state.page=page;if(typeof render==="function")render()}}catch(error){console.error("Не удалось перейти на страницу каталога",error)}schedule()},true);
    const observer=new MutationObserver(schedule);function start(){const grid=document.getElementById("grid");if(grid)observer.observe(grid,{childList:true});schedule();setTimeout(schedule,100);setTimeout(schedule,500)}
    if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start,{once:true});else start();
  }

  document.write=function patchedWrite(...parts){let html=parts.join("");if(typeof html==="string"&&html.includes("</body>")){const runtime=`<script>(${paginationRecoveryRuntime.toString()})();<\/script>`;html=html.replace("</body>",`${runtime}</body>`)}return originalWrite(html)};
})();
