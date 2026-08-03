(()=>{
  const SWIPE_MIN=42;
  const SWIPE_MAX_VERTICAL=90;
  let start=null;
  let lastWheel=0;

  function visible(el){
    if(!el)return false;
    const s=getComputedStyle(el);
    const r=el.getBoundingClientRect();
    return s.display!=="none"&&s.visibility!=="hidden"&&Number(s.opacity)!==0&&r.width>0&&r.height>0;
  }

  function fullscreenRoot(target){
    let node=target instanceof Element?target:null;
    while(node&&node!==document.body){
      const s=getComputedStyle(node);
      const r=node.getBoundingClientRect();
      const fixed=s.position==="fixed";
      const covers=fixed&&r.width>=innerWidth*.85&&r.height>=innerHeight*.8;
      if(covers&&node.querySelector("img"))return node;
      node=node.parentElement;
    }
    return null;
  }

  function galleryButtons(root){
    const all=[...root.querySelectorAll("button,[role=button]")].filter(visible);
    const prev=all.find(el=>/prev|previous|назад|предыдущ|‹|❮|←/i.test(`${el.className} ${el.getAttribute("aria-label")||""} ${el.textContent||""}`));
    const next=all.find(el=>/next|следующ|далее|›|❯|→/i.test(`${el.className} ${el.getAttribute("aria-label")||""} ${el.textContent||""}`));
    return {prev,next};
  }

  function move(root,direction){
    const {prev,next}=galleryButtons(root);
    const button=direction>0?next:prev;
    if(button){button.click();return true;}
    return false;
  }

  function fit(root){
    root.style.overscrollBehavior="contain";
    root.style.touchAction="pan-y pinch-zoom";
    const imgs=[...root.querySelectorAll("img")];
    imgs.forEach(img=>{
      img.style.maxWidth="calc(100vw - 24px)";
      img.style.maxHeight="calc(100dvh - 150px)";
      img.style.width="auto";
      img.style.height="auto";
      img.style.objectFit="contain";
      img.style.userSelect="none";
      img.style.webkitUserDrag="none";
      img.draggable=false;
    });
  }

  function onDown(e){
    const root=fullscreenRoot(e.target);
    if(!root)return;
    fit(root);
    const p=e.touches?e.touches[0]:e;
    start={x:p.clientX,y:p.clientY,time:Date.now(),root};
  }

  function onUp(e){
    if(!start)return;
    const p=e.changedTouches?e.changedTouches[0]:e;
    const dx=p.clientX-start.x;
    const dy=p.clientY-start.y;
    const elapsed=Date.now()-start.time;
    const root=start.root;
    start=null;
    if(elapsed>900||Math.abs(dx)<SWIPE_MIN||Math.abs(dy)>SWIPE_MAX_VERTICAL||Math.abs(dx)<=Math.abs(dy))return;
    if(move(root,dx<0?1:-1))e.preventDefault();
  }

  function onWheel(e){
    const root=fullscreenRoot(e.target);
    if(root){
      fit(root);
      if(Math.abs(e.deltaY)<18&&Math.abs(e.deltaX)<18)return;
      const now=Date.now();
      if(now-lastWheel<420){e.preventDefault();return;}
      lastWheel=now;
      const direction=Math.abs(e.deltaX)>Math.abs(e.deltaY)?Math.sign(e.deltaX):Math.sign(e.deltaY);
      if(move(root,direction||1))e.preventDefault();
      return;
    }

    const modal=e.target instanceof Element?e.target.closest(".modal,.drawer,[role=dialog]"):null;
    if(modal&&visible(modal)){
      const scrollable=[modal,...modal.querySelectorAll("*")].find(el=>{
        const s=getComputedStyle(el);
        return /(auto|scroll)/.test(s.overflowY)&&el.scrollHeight>el.clientHeight+2;
      });
      if(scrollable){
        scrollable.scrollTop+=e.deltaY;
        e.preventDefault();
      }
    }
  }

  const observer=new MutationObserver(()=>{
    document.querySelectorAll("body *").forEach(el=>{
      if(fullscreenRoot(el)===el)fit(el);
    });
  });

  document.addEventListener("pointerdown",onDown,{passive:true,capture:true});
  document.addEventListener("pointerup",onUp,{passive:false,capture:true});
  document.addEventListener("touchstart",onDown,{passive:true,capture:true});
  document.addEventListener("touchend",onUp,{passive:false,capture:true});
  document.addEventListener("wheel",onWheel,{passive:false,capture:true});
  observer.observe(document.documentElement,{subtree:true,childList:true});
})();
