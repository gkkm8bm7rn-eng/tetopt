(()=>{
  const STYLE_ID="forma-image-zoom-style";
  const LIGHTBOX_ID="formaImageZoom";
  const cleanSource=value=>String(value||"").split("#",1)[0].split("?",1)[0].replace(/^https?:\/\/[^/]+\//i,"").replace(/^\.\//,"");

  function parseProducts(){
    for(const script of document.scripts){
      const text=script.textContent||"";
      const marker="const PRODUCTS =";
      const markerIndex=text.indexOf(marker);
      if(markerIndex<0)continue;
      let start=markerIndex+marker.length;
      while(/\s/.test(text[start]||""))start++;
      if(text[start]!=="[")continue;
      let depth=0,inString=false,escaped=false;
      for(let index=start;index<text.length;index++){
        const char=text[index];
        if(inString){
          if(escaped)escaped=false;
          else if(char==="\\")escaped=true;
          else if(char==='"')inString=false;
          continue;
        }
        if(char==='"'){inString=true;continue}
        if(char==="[")depth++;
        else if(char==="]"){
          depth--;
          if(depth===0){
            try{
              const parsed=JSON.parse(text.slice(start,index+1));
              if(Array.isArray(parsed))return parsed;
            }catch{}
            break;
          }
        }
      }
    }
    return [];
  }

  const productMap=new Map();
  let productsLoaded=false;
  function ensureProducts(){
    if(productsLoaded)return;
    productsLoaded=true;
    for(const product of parseProducts())productMap.set(Number(product.id),product);
  }

  if(!document.getElementById(STYLE_ID)){
    const style=document.createElement("style");
    style.id=STYLE_ID;
    style.textContent=`
      body.image-zoom-open{overflow:hidden!important;touch-action:none}
      .product-photo.loaded,#galleryMainImage.loaded{cursor:zoom-in}
      .image-zoom-lightbox{position:fixed;inset:0;z-index:220;background:rgba(15,14,12,.94);display:grid;place-items:center;padding:18px;opacity:0;visibility:hidden;pointer-events:none;transition:opacity .2s ease,visibility .2s ease}
      .image-zoom-lightbox.show{opacity:1;visibility:visible;pointer-events:auto}
      .image-zoom-frame{position:relative;width:min(96vw,1600px);height:min(92vh,1100px);display:grid;place-items:center;border-radius:18px;overflow:hidden;background:#fff;box-shadow:0 24px 90px rgba(0,0,0,.42);touch-action:pan-y}
      .image-zoom-frame img{display:block;max-width:100%;max-height:100%;width:100%;height:100%;object-fit:contain;background:#fff;user-select:none;-webkit-user-drag:none;transition:opacity .12s ease}
      .image-zoom-frame.is-changing img{opacity:.35}
      .image-zoom-close,.image-zoom-nav{position:absolute;z-index:3;border:0;border-radius:50%;background:rgba(32,31,27,.82);color:#fff;display:grid;place-items:center;box-shadow:0 7px 24px rgba(0,0,0,.2);cursor:pointer}
      .image-zoom-close{top:12px;right:12px;width:44px;height:44px;font-size:30px;line-height:1}
      .image-zoom-nav{top:50%;width:48px;height:48px;transform:translateY(-50%);font-size:34px;line-height:1}
      .image-zoom-prev{left:14px}.image-zoom-next{right:14px}
      .image-zoom-nav[hidden]{display:none}
      .image-zoom-caption{position:absolute;left:14px;right:70px;bottom:12px;z-index:2;color:#fff;background:rgba(32,31,27,.72);backdrop-filter:blur(8px);border-radius:999px;padding:8px 13px;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .image-zoom-counter{position:absolute;right:14px;bottom:14px;z-index:3;color:#fff;background:rgba(32,31,27,.82);border-radius:999px;padding:7px 11px;font-size:12px;font-weight:700}
      @media(max-width:640px){.image-zoom-lightbox{padding:0}.image-zoom-frame{width:100vw;height:100dvh;max-height:none;border-radius:0}.image-zoom-close{top:max(12px,env(safe-area-inset-top));right:12px}.image-zoom-caption{left:12px;right:72px;bottom:max(12px,env(safe-area-inset-bottom))}.image-zoom-counter{right:12px;bottom:max(14px,env(safe-area-inset-bottom))}.image-zoom-nav{width:44px;height:44px;background:rgba(32,31,27,.68)}.image-zoom-prev{left:8px}.image-zoom-next{right:8px}}
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
    lightbox.setAttribute("aria-label","Галерея фотографий товара");
    lightbox.innerHTML=`
      <div class="image-zoom-frame" role="document">
        <button type="button" class="image-zoom-close" aria-label="Закрыть галерею">×</button>
        <button type="button" class="image-zoom-nav image-zoom-prev" aria-label="Предыдущая фотография">‹</button>
        <img alt="" draggable="false">
        <button type="button" class="image-zoom-nav image-zoom-next" aria-label="Следующая фотография">›</button>
        <div class="image-zoom-caption" hidden></div>
        <div class="image-zoom-counter" hidden></div>
      </div>`;
    document.body.appendChild(lightbox);
  }

  const frame=lightbox.querySelector(".image-zoom-frame");
  const zoomImage=lightbox.querySelector("img");
  const caption=lightbox.querySelector(".image-zoom-caption");
  const counter=lightbox.querySelector(".image-zoom-counter");
  const closeButton=lightbox.querySelector(".image-zoom-close");
  const previousButton=lightbox.querySelector(".image-zoom-prev");
  const nextButton=lightbox.querySelector(".image-zoom-next");
  let previousOverflow="";
  let lastFocus=null;
  let slides=[];
  let currentIndex=0;
  let currentTitle="";
  let touchStartX=0;
  let touchStartY=0;

  function uniqueSources(values){
    const seen=new Set();
    return values.filter(Boolean).filter(value=>{
      const key=cleanSource(value);
      if(!key||seen.has(key))return false;
      seen.add(key);return true;
    });
  }

  function findProduct(image){
    ensureProducts();
    const holder=image.closest?.("[data-product]");
    const directId=Number(holder?.dataset?.product||holder?.getAttribute?.("data-product"));
    if(Number.isFinite(directId)&&productMap.has(directId))return productMap.get(directId);
    const clicked=cleanSource(image.currentSrc||image.src);
    for(const product of productMap.values()){
      const values=[...(Array.isArray(product.images)?product.images:[]),product.directImage];
      if(values.some(value=>cleanSource(value)===clicked))return product;
    }
    return null;
  }

  function renderSlide(index,animate=true){
    if(!slides.length)return;
    currentIndex=(index+slides.length)%slides.length;
    if(animate)frame.classList.add("is-changing");
    zoomImage.onload=()=>frame.classList.remove("is-changing");
    zoomImage.onerror=()=>frame.classList.remove("is-changing");
    zoomImage.src=slides[currentIndex];
    zoomImage.alt=currentTitle||"Фотография товара";
    caption.textContent=currentTitle;
    caption.hidden=!currentTitle;
    counter.textContent=`${currentIndex+1} / ${slides.length}`;
    counter.hidden=slides.length<2;
    previousButton.hidden=slides.length<2;
    nextButton.hidden=slides.length<2;
    if(slides.length>1){
      new Image().src=slides[(currentIndex+1)%slides.length];
      new Image().src=slides[(currentIndex-1+slides.length)%slides.length];
    }
  }

  function moveSlide(step){renderSlide(currentIndex+step)}

  function openZoom(image){
    const source=image.currentSrc||image.src;
    if(!source)return;
    const product=findProduct(image);
    const title=image.alt||product?.name||image.closest?.("[data-product]")?.querySelector?.("h3")?.textContent||"";
    const productSlides=product?uniqueSources([...(Array.isArray(product.images)?product.images:[]),product.directImage]):[];
    slides=productSlides.length?productSlides:[source];
    const sourceKey=cleanSource(source);
    const matchedIndex=slides.findIndex(value=>cleanSource(value)===sourceKey);
    currentIndex=matchedIndex>=0?matchedIndex:0;
    currentTitle=title.trim();
    lastFocus=document.activeElement;
    previousOverflow=document.body.style.overflow;
    lightbox.classList.add("show");
    document.body.classList.add("image-zoom-open");
    renderSlide(currentIndex,false);
    closeButton.focus({preventScroll:true});
  }

  function closeZoom(){
    if(!lightbox.classList.contains("show"))return;
    lightbox.classList.remove("show");
    document.body.classList.remove("image-zoom-open");
    document.body.style.overflow=previousOverflow;
    zoomImage.removeAttribute("src");
    slides=[];
    if(lastFocus?.focus)lastFocus.focus({preventScroll:true});
  }

  document.addEventListener("click",event=>{
    const image=event.target.closest?.("#grid .js-product-image.loaded,#galleryMainImage.loaded");
    if(!image)return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    openZoom(image);
  },true);

  closeButton.addEventListener("click",closeZoom);
  previousButton.addEventListener("click",event=>{event.stopPropagation();moveSlide(-1)});
  nextButton.addEventListener("click",event=>{event.stopPropagation();moveSlide(1)});
  lightbox.addEventListener("click",event=>{if(event.target===lightbox)closeZoom()});

  frame.addEventListener("touchstart",event=>{
    const touch=event.changedTouches?.[0];
    if(!touch)return;
    touchStartX=touch.clientX;touchStartY=touch.clientY;
  },{passive:true});
  frame.addEventListener("touchend",event=>{
    if(slides.length<2)return;
    const touch=event.changedTouches?.[0];
    if(!touch)return;
    const dx=touch.clientX-touchStartX;
    const dy=touch.clientY-touchStartY;
    if(Math.abs(dx)>=48&&Math.abs(dx)>Math.abs(dy)*1.2)moveSlide(dx<0?1:-1);
  },{passive:true});

  document.addEventListener("keydown",event=>{
    if(!lightbox.classList.contains("show"))return;
    if(event.key==="Escape"){
      event.preventDefault();event.stopPropagation();closeZoom();
    }else if(event.key==="ArrowLeft"&&slides.length>1){
      event.preventDefault();moveSlide(-1);
    }else if(event.key==="ArrowRight"&&slides.length>1){
      event.preventDefault();moveSlide(1);
    }
  },true);
})();
