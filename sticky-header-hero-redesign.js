(()=>{
  const STYLE_ID='sticky-header-hero-redesign-style';
  const norm=value=>String(value||'').toLowerCase().replace(/ё/g,'е').replace(/\s+/g,' ').trim();
  let scheduled=false;

  function injectStyles(){
    if(document.getElementById(STYLE_ID))return;
    const style=document.createElement('style');
    style.id=STYLE_ID;
    style.textContent=`
      :root{--forma-announcement-h:0px}
      .announcement{
        position:sticky!important;top:0!important;z-index:120!important;
        box-shadow:0 1px 0 rgba(255,255,255,.08);
      }
      header{
        position:sticky!important;top:var(--forma-announcement-h)!important;z-index:119!important;
        box-shadow:0 10px 28px rgba(32,31,27,.08);
      }
      .nav{min-height:72px;height:auto!important;padding:10px 0;flex-wrap:nowrap}
      .forma-header-stats{display:flex;align-items:center;gap:8px;margin-left:auto}
      .forma-header-stat{
        display:flex;align-items:center;gap:7px;border:1px solid rgba(93,107,79,.16);
        background:rgba(255,255,255,.88);backdrop-filter:blur(14px);
        border-radius:999px;padding:9px 12px;box-shadow:0 6px 18px rgba(47,42,33,.07);
        white-space:nowrap;color:#5d6b4f;font-weight:800;font-size:13px;
      }
      .forma-header-stat strong{font-size:15px;color:#201f1b}
      .forma-header-stat span{font-size:11px;color:#706d65;font-weight:700}
      .forma-original-stats{display:none!important}
      .hero-actions .forma-question-button{display:none!important}
      .hero-actions{margin-top:28px!important}
      .hero-actions .btn-primary,
      .hero-actions a[href*="#catalog"],
      .hero-actions button[data-scroll-to-catalog]{
        position:relative;overflow:hidden;min-height:58px;padding:17px 28px!important;
        background:linear-gradient(135deg,#171813,#2e3528)!important;color:#fff!important;
        border:1px solid rgba(255,255,255,.08)!important;
        box-shadow:0 14px 32px rgba(32,31,27,.28),inset 0 1px 0 rgba(255,255,255,.14)!important;
        transform:translateZ(0);transition:transform .2s ease,box-shadow .2s ease,filter .2s ease;
      }
      .hero-actions .btn-primary:after,
      .hero-actions a[href*="#catalog"]:after,
      .hero-actions button[data-scroll-to-catalog]:after{
        content:'→';font-size:20px;margin-left:4px;transition:transform .2s ease;
      }
      .hero-actions .btn-primary:hover,
      .hero-actions a[href*="#catalog"]:hover,
      .hero-actions button[data-scroll-to-catalog]:hover{
        transform:translateY(-2px);box-shadow:0 18px 38px rgba(32,31,27,.34)!important;filter:brightness(1.06);
      }
      .hero-actions .btn-primary:hover:after,
      .hero-actions a[href*="#catalog"]:hover:after,
      .hero-actions button[data-scroll-to-catalog]:hover:after{transform:translateX(4px)}
      .hero-actions .btn-primary:active,
      .hero-actions a[href*="#catalog"]:active,
      .hero-actions button[data-scroll-to-catalog]:active{transform:translateY(1px) scale(.99)}
      @media(max-width:760px){
        .announcement{padding:8px 14px!important;font-size:11px!important;line-height:1.35!important}
        header{background:rgba(245,242,236,.97)!important}
        .container.nav{
          width:calc(100% - 20px)!important;min-height:92px!important;padding:8px 0!important;
          display:grid!important;grid-template-columns:minmax(0,1fr) auto auto;grid-template-rows:auto auto;
          gap:7px 8px!important;align-items:center!important;
        }
        .logo{grid-column:1;grid-row:1;font-size:18px!important;letter-spacing:.08em!important;min-width:0}
        .nav-links{display:none!important}
        .forma-header-stats{grid-column:1/-1;grid-row:2;margin:0!important;gap:6px;justify-content:flex-start;min-width:0;overflow:hidden}
        .forma-header-stat{padding:6px 9px;gap:5px;font-size:11px;min-width:0}
        .forma-header-stat strong{font-size:13px}
        .forma-header-stat span{font-size:10px;display:inline}
        .icon-btn{grid-row:1;padding:8px 10px!important;gap:5px!important;font-size:12px!important;white-space:nowrap}
        .hero{padding-top:28px!important}
        .hero-main{padding:34px 28px!important;min-height:auto!important}
        .hero-actions{display:block!important}
        .hero-actions .btn-primary,
        .hero-actions a[href*="#catalog"],
        .hero-actions button[data-scroll-to-catalog]{width:100%;min-height:60px;font-size:17px!important}
      }
      @media(max-width:390px){
        .logo{font-size:16px!important}
        .forma-header-stat{padding:5px 8px}
        .forma-header-stat span{font-size:9px}
        .icon-btn{padding:7px 8px!important}
      }
    `;
    document.head.appendChild(style);
  }

  function updateStickyOffset(){
    const announcement=document.querySelector('.announcement');
    const height=announcement?Math.ceil(announcement.getBoundingClientRect().height):0;
    const current=document.documentElement.style.getPropertyValue('--forma-announcement-h');
    const next=`${height}px`;
    if(current!==next)document.documentElement.style.setProperty('--forma-announcement-h',next);
  }

  function readStats(){
    const cards=[...document.querySelectorAll('.stat-card')];
    let products=null;
    let collections=null;
    cards.forEach(card=>{
      const text=norm(card.textContent);
      const number=(card.querySelector('.stat-number')?.textContent||'').trim();
      if(!number)return;
      if(text.includes('товар')&&products===null)products=number;
      if(text.includes('коллекц')&&collections===null)collections=number;
    });
    return {products:products||'—',collections:collections||'—',cards};
  }

  function statHtml(label,value){
    return `<div class="forma-header-stat"><strong>${value}</strong><span>${label}</span></div>`;
  }

  function setupHeaderStats(){
    const nav=document.querySelector('header .nav');
    if(!nav)return false;
    const {products,collections,cards}=readStats();
    let box=nav.querySelector('.forma-header-stats');
    if(!box){
      box=document.createElement('div');
      box.className='forma-header-stats';
      const cart=[...nav.children].find(el=>norm(el.textContent).includes('корзина'));
      nav.insertBefore(box,cart||null);
    }
    const signature=`${products}|${collections}`;
    if(box.dataset.statsSignature!==signature){
      box.innerHTML=statHtml('товаров',products)+statHtml('коллекций',collections);
      box.dataset.statsSignature=signature;
    }
    cards.forEach(card=>{
      const wrapper=card.closest('.hero-side,.stats-grid,.stat-grid');
      if(wrapper&&!wrapper.classList.contains('forma-original-stats'))wrapper.classList.add('forma-original-stats');
      if(!card.classList.contains('forma-original-stats'))card.classList.add('forma-original-stats');
    });
    return true;
  }

  function removeQuestionButton(){
    const actions=document.querySelector('.hero-actions');
    if(!actions)return false;
    [...actions.querySelectorAll('a,button')].forEach(el=>{
      if(norm(el.textContent).includes('задать вопрос')&&!el.classList.contains('forma-question-button'))el.classList.add('forma-question-button');
    });
    return true;
  }

  function emphasizeCatalogButton(){
    const actions=document.querySelector('.hero-actions');
    if(!actions)return false;
    const button=[...actions.querySelectorAll('a,button')].find(el=>/смотреть (товары|каталог)/i.test(el.textContent||''));
    if(button){
      if(!button.classList.contains('btn-primary'))button.classList.add('btn-primary');
      if(button.getAttribute('aria-label')!=='Перейти к каталогу товаров')button.setAttribute('aria-label','Перейти к каталогу товаров');
    }
    return Boolean(button);
  }

  function setup(){
    injectStyles();
    const ready=setupHeaderStats();
    removeQuestionButton();
    emphasizeCatalogButton();
    updateStickyOffset();
    return ready;
  }

  function scheduleSetup(){
    if(scheduled)return;
    scheduled=true;
    requestAnimationFrame(()=>{
      scheduled=false;
      setup();
    });
  }

  const observer=new MutationObserver(scheduleSetup);
  observer.observe(document.documentElement,{childList:true,subtree:true});
  window.addEventListener('resize',scheduleSetup,{passive:true});
  window.addEventListener('orientationchange',()=>setTimeout(scheduleSetup,120),{passive:true});
  const poll=setInterval(()=>{if(setup())clearInterval(poll)},250);
  setTimeout(()=>clearInterval(poll),20000);
})();
