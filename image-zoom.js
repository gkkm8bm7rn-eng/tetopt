(()=>{
  const STYLE_ID="forma-image-zoom-style";
  const LIGHTBOX_ID="formaImageZoom";

  if(!document.getElementById(STYLE_ID)){
    const style=document.createElement("style");
    style.id=STYLE_ID;
    style.textContent=`
      body.image-zoom-open{overflow:hidden!important}
      .product-photo.loaded,#galleryMainImage.loaded{cursor:zoom-in}
      .image-zoom-lightbox{position:fixed;inset:0;z-index:220;background:rgba(15,14,12,.94);display:grid;place-items:center;padding:18px;opacity:0;visibility:hidden;pointer-events:none;transition:opacity .2s ease,visibility .2s ease}
      .image-zoom-lightbox.show{opacity:1;visibility:visible;pointer-events:auto}
      .image-zoom-frame{position:relative;width:min(96vw,1600px);height:min(92vh,1100px);display:grid;place-items:center;border-radius:18px;overflow:hidden;background:#fff;box-shadow:0 24px 90px rgba(0,0,0,.42)}
      .image-zoom-frame img{display:block;max-width:100%;max-height:100%;width:100%;height:100%;object-fit:contain;background:#fff;user-select:none;-webkit-user-drag:none}
      .image-zoom-close{position:absolute;top:12px;right:12px;z-index:2;width:44px;height:44px;border:0;border-radius:50%;background:rgba(32,31,27,.82);color:#fff;font-size:30px;line-height:1;display:grid;place-items:center;box-shadow:0 7px 24px rgba(0,0,0,.2)}
      .image-zoom-caption{position:absolute;left:14px;right:70px;bottom:12px;z-index:2;color:#fff;background:rgba(32,31,27,.72);backdrop-filter:blur(8px);border-radius:999px;padding:8px 13px;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      @media(max-width:640px){.image-zoom-lightbox{padding:0}.image-zoom-frame{width:100vw;height:100dvh;max-height:none;border-radius:0}.image-zoom-close{top:max(12px,env(safe-area-inset-top));right:12px}.image-zoom-caption{bottom:max(12px,env(safe-area-inset-bottom))}}
    `;
    document.head.appendChild(style);
  }

  let lightbox=document.getElementById(LIGHTBOX_ID);
  if(!lightbox){
    lightbox=document.createElement("div");
    lightbox.id=LIGHTBOX_ID;
    lightbox.className="image-zoom-lightbox";
    lightbox.setAttribute("role","dialog");
    lightbox.setAttribute("aria-modal","true");
    lightbox.setAttribute("aria-label","Увеличенная фотография товара");
    lightbox.innerHTML=`
      <div class="image-zoom-frame" role="document">
        <button type="button" class="image-zoom-close" aria-label="Закрыть увеличенную фотографию">×</button>
        <img alt="" draggable="false">
        <div class="image-zoom-caption" hidden></div>
      </div>`;
    document.body.appendChild(lightbox);
  }

  const zoomImage=lightbox.querySelector("img");
  const caption=lightbox.querySelector(".image-zoom-caption");
  const closeButton=lightbox.querySelector(".image-zoom-close");
  let previousOverflow="";
  let lastFocus=null;

  function openZoom(source,alt){
    if(!source)return;
    lastFocus=document.activeElement;
    previousOverflow=document.body.style.overflow;
    zoomImage.src=source;
    zoomImage.alt=alt||"Фотография товара";
    caption.textContent=alt||"";
    caption.hidden=!alt;
    lightbox.classList.add("show");
    document.body.classList.add("image-zoom-open");
    closeButton.focus({preventScroll:true});
  }

  function closeZoom(){
    if(!lightbox.classList.contains("show"))return;
    lightbox.classList.remove("show");
    document.body.classList.remove("image-zoom-open");
    document.body.style.overflow=previousOverflow;
    zoomImage.removeAttribute("src");
    if(lastFocus?.focus)lastFocus.focus({preventScroll:true});
  }

  document.addEventListener("click",event=>{
    const image=event.target.closest?.("#grid .js-product-image.loaded,#galleryMainImage.loaded");
    if(!image)return;
    const source=image.currentSrc||image.src;
    if(!source)return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    openZoom(source,image.alt||image.closest("[data-product]")?.querySelector("h3")?.textContent||"");
  },true);

  closeButton.addEventListener("click",closeZoom);
  lightbox.addEventListener("click",event=>{if(event.target===lightbox)closeZoom()});
  document.addEventListener("keydown",event=>{
    if(event.key==="Escape"&&lightbox.classList.contains("show")){
      event.preventDefault();
      event.stopPropagation();
      closeZoom();
    }
  },true);
})();
