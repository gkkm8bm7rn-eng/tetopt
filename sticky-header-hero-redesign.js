(()=>{
  const STYLE_ID='sticky-header-hero-redesign-style';
  const SPACER_ID='forma-fixed-header-spacer';
  const norm=v=>String(v||'').toLowerCase().replace(/ё/g,'е').replace(/\s+/g,' ').trim();
  let scheduled=false;

  function injectStyles(){
    let style=document.getElementById(STYLE_ID);
    if(!style){style=document.createElement('style');style.id=STYLE_ID;document.head.appendChild(style)}
    style.textContent=`
      :root{--forma-announcement-h:0px;--forma-header-h:0px;--forma-fixed-header-h:0px;--forma-paper:#fffaf2;--forma-olive:#71885e;--forma-olive-dark:#405a34;--forma-ink:#28251f}
      .announcement{
        position:fixed!important;
        top:0!important;
        left:0!important;
        right:0!important;
        width:100%!important;
        z-index:121!important;
        transform:none!important;
        margin:0!important;
      }
      header{
        position:fixed!important;
        top:var(--forma-announcement-h)!important;
        left:0!important;
        right:0!important;
        width:100%!important;
        z-index:120!important;
        transform:none!important;
        margin:0!important;
        box-shadow:0 10px 28px rgba(32,31,27,.10)!important;
      }
      #${SPACER_ID}{
        display:block!important;
        width:100%!important;
        height:var(--forma-fixed-header-h)!important;
        min-height:var(--forma-fixed-header-h)!important;
        pointer-events:none!important;
        visibility:hidden!important;
      }
      #catalog,.results-line{scroll-margin-top:calc(var(--forma-fixed-header-h) + 16px)!important}
      .forma-header-stats,.forma-original-stats{display:none!important}
      .hero-actions .forma-question-button{display:none!important}

      .hero-main{display:grid!important;grid-template-columns:minmax(0,1.08fr) minmax(300px,.92fr)!important;grid-template-areas:'eyebrow art' 'title art' 'copy art' 'bottom bottom';column-gap:28px;align-items:start!important;position:relative!important;overflow:hidden!important;padding:42px 46px 28px!important;border:1px solid rgba(131,109,80,.22)!important;border-radius:28px!important;background:linear-gradient(135deg,#f5ecdf 0%,#f2eadf 54%,#d8d9c4 100%)!important;box-shadow:0 20px 55px rgba(73,61,42,.12)!important}
      .hero-main:before{content:'';grid-area:art;align-self:stretch;justify-self:stretch;min-height:280px;margin:-42px -46px -4px 0;background:url('hero-vase-branches.svg?v=1') center/contain no-repeat;pointer-events:none}
      .hero-main>*{position:relative;z-index:2;min-width:0}
      .hero-main .eyebrow,.hero-main .kicker{grid-area:eyebrow;margin:0 0 16px!important;letter-spacing:.19em!important;color:#46583c!important;font-weight:800!important}
      .hero-main h1{grid-area:title;max-width:720px;margin:0 0 16px!important;font-family:Georgia,'Times New Roman',serif!important;font-weight:500!important;line-height:1.04!important;letter-spacing:-.03em!important;color:var(--forma-ink)!important;text-wrap:balance}
      .hero-main p{grid-area:copy;max-width:610px;margin:0!important;color:#4d5149!important;line-height:1.5!important;text-wrap:pretty}

      .forma-hero-bottom{grid-area:bottom;display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr) minmax(250px,1.45fr);gap:14px;align-items:stretch;margin-top:26px}
      .forma-hero-stats{display:contents!important}
      .forma-hero-stat{display:flex;align-items:center;justify-content:center;gap:12px;min-height:88px;padding:15px 18px;border-radius:20px;border:1px solid rgba(255,255,255,.7);box-shadow:0 10px 26px rgba(65,54,38,.09);backdrop-filter:blur(10px)}
      .forma-hero-stat:first-child{background:rgba(255,250,242,.94)}
      .forma-hero-stat:nth-child(2){background:linear-gradient(145deg,#e4ead9,#ccd8bd)}
      .forma-hero-stat strong{font-family:Georgia,'Times New Roman',serif;font-size:36px;font-weight:500;line-height:1;color:var(--forma-ink);white-space:nowrap}
      .forma-hero-stat span{font-size:12px;font-weight:750;line-height:1.28;color:#3f453a}

      .hero-actions{display:flex!important;margin:0!important;min-width:0}
      .hero-actions .btn-primary,.hero-actions a[href*="#catalog"],.hero-actions button[data-scroll-to-catalog]{display:flex!important;align-items:center!important;justify-content:center!important;gap:16px;width:100%!important;min-height:88px;padding:18px 28px!important;border-radius:20px!important;background:linear-gradient(135deg,#5f7c4c,#73905e)!important;color:#fff!important;border:1px solid rgba(255,255,255,.38)!important;box-shadow:0 14px 32px rgba(57,79,46,.25),inset 0 1px 0 rgba(255,255,255,.2)!important;font-size:20px!important;font-weight:850!important;text-decoration:none!important}
      .hero-actions .btn-primary:after,.hero-actions a[href*="#catalog"]:after,.hero-actions button[data-scroll-to-catalog]:after{content:'→';font-size:29px;line-height:1}

      @media(max-width:900px){
        .hero-main{grid-template-columns:1fr!important;grid-template-areas:'eyebrow' 'title' 'copy' 'art' 'bottom'!important}
        .hero-main:before{min-height:220px;margin:18px 0 0;background-position:center;background-size:contain}
        .forma-hero-bottom{grid-template-columns:1fr 1fr}.hero-actions{grid-column:1/-1}
      }
      @media(max-width:760px){
        .announcement{padding:8px 14px!important;font-size:11px!important;line-height:1.35!important}
        header{background:rgba(245,242,236,.98)!important;backdrop-filter:blur(16px)!important;-webkit-backdrop-filter:blur(16px)!important}
        .container.nav{width:calc(100% - 20px)!important;gap:8px!important;min-height:66px!important;height:auto!important;padding:8px 0!important}
        .logo{font-size:18px!important;letter-spacing:.08em!important;flex:0 1 auto;min-width:0}
        .nav-links{display:none!important}.icon-btn{padding:8px 10px!important;gap:5px!important;font-size:12px!important;white-space:nowrap}
        .hero{padding-top:24px!important}
        .hero-main{display:flex!important;flex-direction:column!important;padding:26px 20px 22px!important;border-radius:25px!important}
        .hero-main .eyebrow,.hero-main .kicker{width:100%!important;margin-bottom:12px!important;font-size:12px!important;line-height:1.35!important}
        .hero-main h1{width:100%!important;max-width:none!important;margin-bottom:14px!important;font-size:clamp(38px,11vw,56px)!important;line-height:1.02!important;letter-spacing:-.035em!important;text-wrap:balance!important;overflow-wrap:normal!important;word-break:normal!important}
        .hero-main p{width:100%!important;max-width:none!important;font-size:17px!important;line-height:1.45!important;overflow-wrap:normal!important;word-break:normal!important}
        .hero-main:before{order:4;width:100%;min-height:190px;margin:18px 0 0!important;background-position:center!important;background-size:contain!important}
        .forma-hero-bottom{order:5;width:100%;display:grid!important;grid-template-columns:1fr 1fr!important;gap:9px;margin-top:18px!important}
        .forma-hero-stat{min-height:76px;padding:11px 9px;border-radius:16px;gap:7px}
        .forma-hero-stat strong{font-size:28px}.forma-hero-stat span{font-size:9px}
        .hero-actions{grid-column:1/-1!important}
        .hero-actions .btn-primary,.hero-actions a[href*="#catalog"],.hero-actions button[data-scroll-to-catalog]{min-height:60px;border-radius:17px!important;font-size:17px!important;padding:15px 18px!important}
      }
      @media(max-width:390px){
        .logo{font-size:16px!important}.icon-btn{padding:7px 8px!important}
        .hero-main{padding:24px 17px 20px!important}
        .hero-main h1{font-size:clamp(34px,10.8vw,46px)!important}
        .hero-main p{font-size:16px!important}
        .hero-main:before{min-height:165px}
        .forma-hero-stat strong{font-size:24px}.forma-hero-stat span{font-size:8px}
      }
    `;
  }

  function ensureSpacer(){
    const announcement=document.querySelector('.announcement');
    const header=document.querySelector('header');
    const anchor=announcement||header;
    if(!anchor?.parentNode)return null;
    let spacer=document.getElementById(SPACER_ID);
    if(!spacer){
      spacer=document.createElement('div');
      spacer.id=SPACER_ID;
      spacer.setAttribute('aria-hidden','true');
      anchor.parentNode.insertBefore(spacer,anchor);
    }else if(spacer.nextElementSibling!==anchor){
      anchor.parentNode.insertBefore(spacer,anchor);
    }
    return spacer;
  }

  function updateFixedHeaderMetrics(){
    const announcement=document.querySelector('.announcement');
    const header=document.querySelector('header');
    const announcementHeight=announcement?Math.ceil(announcement.getBoundingClientRect().height):0;
    const headerHeight=header?Math.ceil(header.getBoundingClientRect().height):0;
    const totalHeight=announcementHeight+headerHeight;
    const root=document.documentElement;
    root.style.setProperty('--forma-announcement-h',`${announcementHeight}px`);
    root.style.setProperty('--forma-header-h',`${headerHeight}px`);
    root.style.setProperty('--forma-fixed-header-h',`${totalHeight}px`);
    ensureSpacer();
    window.__FORMA_FIXED_HEADER__={announcementHeight,headerHeight,totalHeight};
  }

  function observeHeaderSize(){
    if(window.__FORMA_FIXED_HEADER_OBSERVER__)return;
    const targets=[document.querySelector('.announcement'),document.querySelector('header')].filter(Boolean);
    if(!targets.length)return;
    if('ResizeObserver' in window){
      const observer=new ResizeObserver(()=>schedule());
      targets.forEach(target=>observer.observe(target));
      window.__FORMA_FIXED_HEADER_OBSERVER__=observer;
    }else{
      window.__FORMA_FIXED_HEADER_OBSERVER__=true;
    }
  }

  function readStats(){
    const cards=[...document.querySelectorAll('.stat-card')];let products='—',collections='—';
    cards.forEach(card=>{const text=norm(card.textContent),n=(card.querySelector('.stat-number')?.textContent||'').trim();if(!n)return;if(text.includes('товар')&&products==='—')products=n;if(text.includes('коллекц')&&collections==='—')collections=n});
    return{products,collections,cards};
  }
  function findHero(){return [...document.querySelectorAll('.hero-main')].find(el=>/дом, в который/i.test(el.textContent||''))||document.querySelector('.hero-main')}
  function setupHero(){
    const hero=findHero(),actions=hero?.querySelector('.hero-actions');if(!hero||!actions)return false;
    const{products,collections,cards}=readStats();document.querySelectorAll('.forma-header-stats').forEach(el=>el.remove());
    let bottom=hero.querySelector(':scope > .forma-hero-bottom');if(!bottom){bottom=document.createElement('div');bottom.className='forma-hero-bottom';actions.before(bottom)}
    let box=bottom.querySelector('.forma-hero-stats');if(!box){box=document.createElement('div');box.className='forma-hero-stats';bottom.appendChild(box)}
    const sig=`${products}|${collections}`;
    if(box.dataset.signature!==sig){box.innerHTML=`<div class="forma-hero-stat"><strong>${products}</strong><span>товара<br>в каталоге</span></div><div class="forma-hero-stat"><strong>${collections}</strong><span>коллекций<br>мебели</span></div>`;box.dataset.signature=sig}
    if(actions.parentElement!==bottom)bottom.appendChild(actions);
    cards.forEach(card=>{card.classList.add('forma-original-stats');card.closest('.hero-side,.stats-grid,.stat-grid')?.classList.add('forma-original-stats')});
    return true;
  }
  function setup(){
    injectStyles();
    ensureSpacer();
    const hero=findHero();
    if(hero){[...hero.querySelectorAll('.hero-actions a,.hero-actions button')].forEach(el=>{if(norm(el.textContent).includes('задать вопрос'))el.classList.add('forma-question-button');if(/смотреть (товары|каталог)/i.test(el.textContent||'')){el.classList.add('btn-primary');el.setAttribute('aria-label','Перейти к каталогу товаров')}})}
    const ready=setupHero();
    updateFixedHeaderMetrics();
    observeHeaderSize();
    return ready;
  }
  function schedule(){if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;setup()})}
  new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true});
  window.addEventListener('resize',schedule,{passive:true});
  window.addEventListener('orientationchange',()=>setTimeout(schedule,120),{passive:true});
  window.addEventListener('pageshow',schedule,{passive:true});
  window.addEventListener('load',schedule,{once:true});
  const poll=setInterval(()=>{if(setup())clearInterval(poll)},250);setTimeout(()=>clearInterval(poll),20000);
})();