(()=>{
  const STYLE_ID='sticky-header-hero-redesign-style';
  const norm=value=>String(value||'').toLowerCase().replace(/ё/g,'е').replace(/\s+/g,' ').trim();
  let scheduled=false;

  function injectStyles(){
    let style=document.getElementById(STYLE_ID);
    if(!style){style=document.createElement('style');style.id=STYLE_ID;document.head.appendChild(style)}
    style.textContent=`
      :root{--forma-announcement-h:0px;--forma-paper:#fffaf2;--forma-olive:#71885e;--forma-olive-dark:#405a34;--forma-ink:#28251f}
      .announcement{position:sticky!important;top:0!important;z-index:120!important;box-shadow:0 1px 0 rgba(255,255,255,.08)}
      header{position:sticky!important;top:var(--forma-announcement-h)!important;z-index:119!important;box-shadow:0 10px 28px rgba(32,31,27,.08)}
      .nav{min-height:72px;height:auto!important;padding:10px 0;flex-wrap:nowrap}
      .forma-header-stats,.forma-original-stats{display:none!important}
      .hero-actions .forma-question-button{display:none!important}

      .hero-main{display:grid!important;grid-template-columns:minmax(0,1.08fr) minmax(300px,.92fr)!important;grid-template-areas:'eyebrow art' 'title art' 'copy art' 'bottom bottom';column-gap:28px;align-items:start!important;position:relative!important;overflow:hidden!important;padding:42px 46px 28px!important;border:1px solid rgba(131,109,80,.22)!important;border-radius:28px!important;background:linear-gradient(135deg,#f5ecdf 0%,#f2eadf 54%,#d8d9c4 100%)!important;box-shadow:0 20px 55px rgba(73,61,42,.12)!important}
      .hero-main:before{content:'';grid-area:art;align-self:stretch;justify-self:stretch;min-height:280px;margin:-42px -46px -4px 0;background:url('hero-vase-branches.svg?v=1') center/cover no-repeat;mask-image:linear-gradient(90deg,transparent 0%,#000 22%,#000 100%);-webkit-mask-image:linear-gradient(90deg,transparent 0%,#000 22%,#000 100%);pointer-events:none}
      .hero-main>*{position:relative;z-index:2}
      .hero-main .eyebrow,.hero-main .kicker{grid-area:eyebrow;max-width:640px;margin:0 0 18px!important;letter-spacing:.19em!important;color:#46583c!important;font-weight:800!important}
      .hero-main h1{grid-area:title;max-width:720px;margin:0 0 16px!important;font-family:Georgia,'Times New Roman',serif!important;font-weight:500!important;line-height:1.04!important;letter-spacing:-.03em!important;color:var(--forma-ink)!important;text-wrap:balance}
      .hero-main p{grid-area:copy;max-width:610px;margin:0!important;color:#4d5149!important;line-height:1.5!important;text-wrap:pretty}

      .forma-hero-bottom{grid-area:bottom;display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr) minmax(250px,1.45fr);gap:14px;align-items:stretch;margin-top:26px}
      .forma-hero-stats{display:contents!important}
      .forma-hero-stat{display:grid;grid-template-columns:42px auto;grid-template-rows:auto auto;column-gap:12px;align-items:center;justify-content:center;min-height:88px;padding:15px 18px;border-radius:20px;border:1px solid rgba(255,255,255,.7);box-shadow:0 10px 26px rgba(65,54,38,.09);backdrop-filter:blur(10px)}
      .forma-hero-stat:first-child{background:rgba(255,250,242,.94);color:var(--forma-ink)}
      .forma-hero-stat:nth-child(2){background:linear-gradient(145deg,#e4ead9,#ccd8bd);color:var(--forma-ink)}
      .forma-stat-icon{grid-row:1/3;width:36px;height:36px;color:#667653;display:grid;place-items:center}
      .forma-stat-icon svg{width:100%;height:100%;stroke:currentColor;fill:none;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}
      .forma-hero-stat strong{font-family:Georgia,'Times New Roman',serif;font-size:35px;font-weight:500;line-height:1;letter-spacing:.01em;align-self:end}
      .forma-hero-stat span{font-size:12px;font-weight:750;line-height:1.28;color:#3f453a;align-self:start}

      .hero-actions{display:flex!important;margin:0!important;min-width:0}
      .hero-actions .btn-primary,.hero-actions a[href*="#catalog"],.hero-actions button[data-scroll-to-catalog]{display:flex!important;align-items:center!important;justify-content:center!important;gap:16px;width:100%!important;min-height:88px;padding:18px 28px!important;border-radius:20px!important;background:linear-gradient(135deg,#5f7c4c,#73905e)!important;color:#fff!important;border:1px solid rgba(255,255,255,.38)!important;box-shadow:0 14px 32px rgba(57,79,46,.25),inset 0 1px 0 rgba(255,255,255,.2)!important;font-size:20px!important;font-weight:850!important;text-decoration:none!important;transition:transform .2s ease,box-shadow .2s ease,filter .2s ease}
      .hero-actions .btn-primary:after,.hero-actions a[href*="#catalog"]:after,.hero-actions button[data-scroll-to-catalog]:after{content:'→';font-size:29px;line-height:1;transition:transform .2s ease}
      .hero-actions .btn-primary:hover,.hero-actions a[href*="#catalog"]:hover,.hero-actions button[data-scroll-to-catalog]:hover{transform:translateY(-2px);filter:brightness(1.05);box-shadow:0 18px 38px rgba(57,79,46,.32)!important}
      .hero-actions .btn-primary:hover:after,.hero-actions a[href*="#catalog"]:hover,.hero-actions button[data-scroll-to-catalog]:hover{transform:translateX(5px)}
      .hero-actions .btn-primary:active,.hero-actions a[href*="#catalog"]:active,.hero-actions button[data-scroll-to-catalog]:active{transform:translateY(1px) scale(.99)}

      @media(max-width:900px){
        .hero-main{grid-template-columns:1fr;grid-template-areas:'eyebrow' 'title' 'copy' 'art' 'bottom'}
        .hero-main:before{min-height:220px;margin:16px -46px -6px;background-position:center 44%;mask-image:linear-gradient(180deg,transparent 0%,#000 20%,#000 100%);-webkit-mask-image:linear-gradient(180deg,transparent 0%,#000 20%,#000 100%)}
        .forma-hero-bottom{grid-template-columns:1fr 1fr}.hero-actions{grid-column:1/-1}.hero-actions .btn-primary,.hero-actions a[href*="#catalog"],.hero-actions button[data-scroll-to-catalog]{min-height:68px}
      }
      @media(max-width:760px){
        .announcement{padding:8px 14px!important;font-size:11px!important;line-height:1.35!important}
        header{background:rgba(245,242,236,.97)!important}
        .container.nav{width:calc(100% - 20px)!important;gap:8px!important;min-height:66px!important;padding:8px 0!important}
        .logo{font-size:18px!important;letter-spacing:.08em!important;flex:0 1 auto;min-width:0}
        .nav-links{display:none!important}.icon-btn{padding:8px 10px!important;gap:5px!important;font-size:12px!important;white-space:nowrap}
        .hero{padding-top:26px!important}
        .hero-main{padding:30px 24px 24px!important;border-radius:26px!important}
        .hero-main:before{min-height:180px;margin:14px -24px -4px;background-position:center 42%}
        .hero-main .eyebrow,.hero-main .kicker{margin-bottom:14px!important}
        .hero-main h1{margin-bottom:14px!important;line-height:1.03!important}
        .hero-main p{line-height:1.46!important}
        .forma-hero-bottom{grid-template-columns:1fr 1fr;gap:9px;margin-top:20px}
        .forma-hero-stat{grid-template-columns:30px auto;column-gap:7px;min-height:76px;padding:11px 9px;border-radius:16px}
        .forma-stat-icon{width:28px;height:28px}.forma-hero-stat strong{font-size:27px}.forma-hero-stat span{font-size:9px}
        .hero-actions{grid-column:1/-1}
        .hero-actions .btn-primary,.hero-actions a[href*="#catalog"],.hero-actions button[data-scroll-to-catalog]{min-height:60px;border-radius:17px!important;font-size:17px!important;padding:15px 18px!important}
      }
      @media(max-width:390px){
        .logo{font-size:16px!important}.icon-btn{padding:7px 8px!important}.hero-main{padding:27px 19px 21px!important}.hero-main:before{margin-left:-19px;margin-right:-19px}.forma-hero-stat strong{font-size:24px}.forma-hero-stat span{font-size:8px}
      }
    `;
  }

  function updateStickyOffset(){
    const announcement=document.querySelector('.announcement');
    const height=announcement?Math.ceil(announcement.getBoundingClientRect().height):0;
    const next=`${height}px`;
    if(document.documentElement.style.getPropertyValue('--forma-announcement-h')!==next)document.documentElement.style.setProperty('--forma-announcement-h',next);
  }

  function readStats(){
    const cards=[...document.querySelectorAll('.stat-card')];
    let products='—',collections='—';
    cards.forEach(card=>{
      const text=norm(card.textContent),number=(card.querySelector('.stat-number')?.textContent||'').trim();
      if(!number)return;
      if(text.includes('товар')&&products==='—')products=number;
      if(text.includes('коллекц')&&collections==='—')collections=number;
    });
    return {products,collections,cards};
  }

  function findHero(){return [...document.querySelectorAll('.hero-main')].find(el=>/дом, в который/i.test(el.textContent||''))||document.querySelector('.hero-main')}

  function setupHero(){
    const heroMain=findHero(),actions=heroMain?.querySelector('.hero-actions');
    if(!heroMain||!actions)return false;
    const {products,collections,cards}=readStats();
    document.querySelectorAll('.forma-header-stats').forEach(el=>el.remove());
    let bottom=heroMain.querySelector(':scope > .forma-hero-bottom');
    if(!bottom){bottom=document.createElement('div');bottom.className='forma-hero-bottom';actions.before(bottom)}
    let box=bottom.querySelector('.forma-hero-stats');
    if(!box){box=document.createElement('div');box.className='forma-hero-stats';bottom.appendChild(box)}
    const signature=`${products}|${collections}`;
    if(box.dataset.signature!==signature){
      box.innerHTML=`
        <div class="forma-hero-stat">
          <span class="forma-stat-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 7.5 12 3l8 4.5v9L12 21l-8-4.5z"/><path d="m4 7.5 8 4.5 8-4.5M12 12v9"/></svg></span>
          <strong>${products}</strong><span>товара<br>в каталоге</span>
        </div>
        <div class="forma-hero-stat">
          <span class="forma-stat-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M7 10V8a5 5 0 0 1 10 0v2M6 10h12a2 2 0 0 1 2 2v5H4v-5a2 2 0 0 1 2-2Z"/><path d="M6 17v3M18 17v3M8 10v7M16 10v7"/></svg></span>
          <strong>${collections}</strong><span>коллекций<br>мебели</span>
        </div>`;
      box.dataset.signature=signature;
    }
    if(actions.parentElement!==bottom)bottom.appendChild(actions);
    cards.forEach(card=>{card.classList.add('forma-original-stats');card.closest('.hero-side,.stats-grid,.stat-grid')?.classList.add('forma-original-stats')});
    return true;
  }

  function removeQuestionButton(){
    const actions=findHero()?.querySelector('.hero-actions');if(!actions)return false;
    [...actions.querySelectorAll('a,button')].forEach(el=>{if(norm(el.textContent).includes('задать вопрос'))el.classList.add('forma-question-button')});return true;
  }

  function emphasizeCatalogButton(){
    const actions=findHero()?.querySelector('.hero-actions');if(!actions)return false;
    const button=[...actions.querySelectorAll('a,button')].find(el=>/смотреть (товары|каталог)/i.test(el.textContent||''));if(!button)return false;
    button.classList.add('btn-primary');button.setAttribute('aria-label','Перейти к каталогу товаров');return true;
  }

  function setup(){injectStyles();const ready=setupHero();removeQuestionButton();emphasizeCatalogButton();updateStickyOffset();return ready}
  function scheduleSetup(){if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;setup()})}
  const observer=new MutationObserver(scheduleSetup);observer.observe(document.documentElement,{childList:true,subtree:true});
  window.addEventListener('resize',scheduleSetup,{passive:true});window.addEventListener('orientationchange',()=>setTimeout(scheduleSetup,120),{passive:true});
  const poll=setInterval(()=>{if(setup())clearInterval(poll)},250);setTimeout(()=>clearInterval(poll),20000);
})();