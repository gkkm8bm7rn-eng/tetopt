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
      .announcement{position:sticky!important;top:0!important;z-index:120!important;box-shadow:0 1px 0 rgba(255,255,255,.08)}
      header{position:sticky!important;top:var(--forma-announcement-h)!important;z-index:119!important;box-shadow:0 10px 28px rgba(32,31,27,.08)}
      .nav{min-height:72px;height:auto!important;padding:10px 0;flex-wrap:nowrap}
      .forma-header-stats{display:none!important}
      .forma-original-stats{display:none!important}
      .hero-actions .forma-question-button{display:none!important}
      .hero-main{display:flex!important;flex-direction:column!important}
      .forma-hero-stats{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:24px 0 14px;position:relative;z-index:2}
      .forma-hero-stat{display:flex;align-items:center;justify-content:center;gap:8px;padding:12px 14px;border:1px solid rgba(255,255,255,.42);border-radius:18px;background:rgba(255,255,255,.76);backdrop-filter:blur(12px);box-shadow:0 8px 22px rgba(47,42,33,.08)}
      .forma-hero-stat strong{font-size:25px;font-weight:900;line-height:1;color:#201f1b}
      .forma-hero-stat span{font-size:11px;font-weight:800;line-height:1.2;color:#5d6b4f;text-transform:uppercase;letter-spacing:.04em}
      .hero-actions{margin-top:0!important;position:relative;z-index:2}
      .hero-actions .btn-primary,.hero-actions a[href*="#catalog"],.hero-actions button[data-scroll-to-catalog]{position:relative;overflow:hidden;min-height:58px;padding:17px 28px!important;background:linear-gradient(135deg,#171813,#2e3528)!important;color:#fff!important;border:1px solid rgba(255,255,255,.08)!important;box-shadow:0 14px 32px rgba(32,31,27,.28),inset 0 1px 0 rgba(255,255,255,.14)!important;transform:translateZ(0);transition:transform .2s ease,box-shadow .2s ease,filter .2s ease}
      .hero-actions .btn-primary:after,.hero-actions a[href*="#catalog"]:after,.hero-actions button[data-scroll-to-catalog]:after{content:'→';font-size:20px;margin-left:4px;transition:transform .2s ease}
      .hero-actions .btn-primary:hover,.hero-actions a[href*="#catalog"]:hover,.hero-actions button[data-scroll-to-catalog]:hover{transform:translateY(-2px);box-shadow:0 18px 38px rgba(32,31,27,.34)!important;filter:brightness(1.06)}
      .hero-actions .btn-primary:hover:after,.hero-actions a[href*="#catalog"]:hover:after,.hero-actions button[data-scroll-to-catalog]:hover:after{transform:translateX(4px)}
      .hero-actions .btn-primary:active,.hero-actions a[href*="#catalog"]:active,.hero-actions button[data-scroll-to-catalog]:active{transform:translateY(1px) scale(.99)}
      @media(max-width:760px){
        .announcement{padding:8px 14px!important;font-size:11px!important;line-height:1.35!important}
        header{background:rgba(245,242,236,.97)!important}
        .container.nav{width:calc(100% - 20px)!important;gap:8px!important;min-height:66px!important;padding:8px 0!important}
        .logo{font-size:18px!important;letter-spacing:.08em!important;flex:0 1 auto;min-width:0}
        .nav-links{display:none!important}
        .icon-btn{padding:8px 10px!important;gap:5px!important;font-size:12px!important;white-space:nowrap}
        .hero{padding-top:28px!important}
        .hero-main{padding:34px 28px!important;min-height:auto!important}
        .forma-hero-stats{gap:8px;margin:20px 0 12px}
        .forma-hero-stat{padding:11px 10px;border-radius:16px}
        .forma-hero-stat strong{font-size:23px}
        .forma-hero-stat span{font-size:9px}
        .hero-actions{display:block!important}
        .hero-actions .btn-primary,.hero-actions a[href*="#catalog"],.hero-actions button[data-scroll-to-catalog]{width:100%;min-height:60px;font-size:17px!important}
      }
      @media(max-width:390px){
        .logo{font-size:16px!important}
        .icon-btn{padding:7px 8px!important}
        .forma-hero-stat strong{font-size:21px}
      }
    `;
    document.head.appendChild(style);
  }

  function updateStickyOffset(){
    const announcement=document.querySelector('.announcement');
    const height=announcement?Math.ceil(announcement.getBoundingClientRect().height):0;
    const next=`${height}px`;
    if(document.documentElement.style.getPropertyValue('--forma-announcement-h')!==next){
      document.documentElement.style.setProperty('--forma-announcement-h',next);
    }
  }

  function readStats(){
    const cards=[...document.querySelectorAll('.stat-card')];
    let products='—',collections='—';
    cards.forEach(card=>{
      const text=norm(card.textContent);
      const number=(card.querySelector('.stat-number')?.textContent||'').trim();
      if(!number)return;
      if(text.includes('товар')&&products==='—')products=number;
      if(text.includes('коллекц')&&collections==='—')collections=number;
    });
    return {products,collections,cards};
  }

  function findHero(){
    return [...document.querySelectorAll('.hero-main')].find(el=>/дом, в который/i.test(el.textContent||''))||document.querySelector('.hero-main');
  }

  function setupHeroStats(){
    const heroMain=findHero();
    const actions=heroMain?.querySelector('.hero-actions');
    if(!heroMain||!actions)return false;
    const {products,collections,cards}=readStats();
    document.querySelectorAll('.forma-header-stats').forEach(el=>el.remove());
    let box=heroMain.querySelector(':scope > .forma-hero-stats');
    if(!box){
      box=document.createElement('div');
      box.className='forma-hero-stats';
      actions.before(box);
    }
    const signature=`${products}|${collections}`;
    if(box.dataset.signature!==signature){
      box.innerHTML=`<div class="forma-hero-stat"><strong>${products}</strong><span>товаров<br>в каталоге</span></div><div class="forma-hero-stat"><strong>${collections}</strong><span>коллекций<br>мебели</span></div>`;
      box.dataset.signature=signature;
    }
    cards.forEach(card=>{
      card.classList.add('forma-original-stats');
      card.closest('.hero-side,.stats-grid,.stat-grid')?.classList.add('forma-original-stats');
    });
    return true;
  }

  function removeQuestionButton(){
    const actions=findHero()?.querySelector('.hero-actions');
    if(!actions)return false;
    [...actions.querySelectorAll('a,button')].forEach(el=>{
      if(norm(el.textContent).includes('задать вопрос'))el.classList.add('forma-question-button');
    });
    return true;
  }

  function emphasizeCatalogButton(){
    const actions=findHero()?.querySelector('.hero-actions');
    if(!actions)return false;
    const button=[...actions.querySelectorAll('a,button')].find(el=>/смотреть (товары|каталог)/i.test(el.textContent||''));
    if(!button)return false;
    button.classList.add('btn-primary');
    button.setAttribute('aria-label','Перейти к каталогу товаров');
    return true;
  }

  function setup(){
    injectStyles();
    const ready=setupHeroStats();
    removeQuestionButton();
    emphasizeCatalogButton();
    updateStickyOffset();
    return ready;
  }

  function scheduleSetup(){
    if(scheduled)return;
    scheduled=true;
    requestAnimationFrame(()=>{scheduled=false;setup()});
  }

  const observer=new MutationObserver(scheduleSetup);
  observer.observe(document.documentElement,{childList:true,subtree:true});
  window.addEventListener('resize',scheduleSetup,{passive:true});
  window.addEventListener('orientationchange',()=>setTimeout(scheduleSetup,120),{passive:true});
  const poll=setInterval(()=>{if(setup())clearInterval(poll)},250);
  setTimeout(()=>clearInterval(poll),20000);
})();