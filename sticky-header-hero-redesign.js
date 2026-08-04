(()=>{
  const STYLE_ID='sticky-header-hero-redesign-style';
  const norm=value=>String(value||'').toLowerCase().replace(/ё/g,'е').replace(/\s+/g,' ').trim();
  let scheduled=false;

  function injectStyles(){
    let style=document.getElementById(STYLE_ID);
    if(!style){style=document.createElement('style');style.id=STYLE_ID;document.head.appendChild(style)}
    style.textContent=`
      :root{--forma-announcement-h:0px;--forma-cream:#f5f0e7;--forma-paper:#fffaf2;--forma-olive:#667653;--forma-olive-dark:#31472b;--forma-ink:#201f1b}
      .announcement{position:sticky!important;top:0!important;z-index:120!important;box-shadow:0 1px 0 rgba(255,255,255,.08)}
      header{position:sticky!important;top:var(--forma-announcement-h)!important;z-index:119!important;box-shadow:0 10px 28px rgba(32,31,27,.08)}
      .nav{min-height:72px;height:auto!important;padding:10px 0;flex-wrap:nowrap}
      .forma-header-stats,.forma-original-stats{display:none!important}
      .hero-actions .forma-question-button{display:none!important}

      .hero-main{display:flex!important;flex-direction:column!important;justify-content:flex-start!important;position:relative!important;overflow:hidden!important;padding:52px 54px 46px!important;border-radius:30px!important;background:
        radial-gradient(circle at 92% 18%,rgba(255,255,255,.55) 0 10%,transparent 35%),
        linear-gradient(128deg,#eee3d2 0%,#e6ddcc 47%,#c8cdb4 100%)!important;
        box-shadow:0 20px 55px rgba(73,61,42,.13)!important}
      .hero-main:before{content:'';position:absolute;right:-7%;top:-22%;width:58%;aspect-ratio:1;border-radius:50%;border:72px solid rgba(255,255,255,.22);pointer-events:none}
      .hero-main>*{position:relative;z-index:2}
      .hero-main .eyebrow,.hero-main .kicker{max-width:720px;letter-spacing:.19em!important;color:#46583c!important}
      .hero-main h1{max-width:820px;margin:24px 0 18px!important;font-family:Georgia,'Times New Roman',serif!important;font-weight:500!important;line-height:.98!important;letter-spacing:-.035em!important;color:var(--forma-ink)!important;text-wrap:balance}
      .hero-main p{max-width:690px;margin:0!important;color:#4d5149!important;line-height:1.55!important;text-wrap:pretty}

      .forma-hero-bottom{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr) minmax(260px,1.45fr);gap:14px;align-items:stretch;margin-top:30px}
      .forma-hero-stats{display:contents!important}
      .forma-hero-stat{display:flex;align-items:center;justify-content:center;gap:13px;min-height:92px;padding:17px 22px;border-radius:22px;border:1px solid rgba(255,255,255,.72);box-shadow:0 12px 30px rgba(65,54,38,.10);backdrop-filter:blur(10px)}
      .forma-hero-stat:first-child{background:rgba(255,250,242,.93);color:var(--forma-ink)}
      .forma-hero-stat:nth-child(2){background:linear-gradient(145deg,#778763,#596b49);color:#fff;border-color:rgba(255,255,255,.24)}
      .forma-hero-stat strong{font-family:Georgia,'Times New Roman',serif;font-size:38px;font-weight:500;line-height:1;letter-spacing:.015em}
      .forma-hero-stat span{font-size:12px;font-weight:800;line-height:1.28;text-transform:uppercase;letter-spacing:.07em}
      .forma-hero-stat:first-child span{color:#4f5e45}
      .forma-hero-stat:nth-child(2) span{color:rgba(255,255,255,.9)}

      .hero-actions{display:flex!important;margin:0!important;min-width:0}
      .hero-actions .btn-primary,.hero-actions a[href*="#catalog"],.hero-actions button[data-scroll-to-catalog]{display:flex!important;align-items:center!important;justify-content:center!important;gap:16px;width:100%!important;min-height:92px;padding:20px 30px!important;border-radius:22px!important;background:linear-gradient(135deg,#405a34,#627a50)!important;color:#fff!important;border:1px solid rgba(255,255,255,.28)!important;box-shadow:0 15px 34px rgba(45,67,37,.28),inset 0 1px 0 rgba(255,255,255,.18)!important;font-size:20px!important;font-weight:850!important;letter-spacing:.01em!important;text-decoration:none!important;transition:transform .2s ease,box-shadow .2s ease,filter .2s ease}
      .hero-actions .btn-primary:after,.hero-actions a[href*="#catalog"]:after,.hero-actions button[data-scroll-to-catalog]:after{content:'→';font-size:29px;line-height:1;transition:transform .2s ease}
      .hero-actions .btn-primary:hover,.hero-actions a[href*="#catalog"]:hover,.hero-actions button[data-scroll-to-catalog]:hover{transform:translateY(-2px);filter:brightness(1.06);box-shadow:0 19px 40px rgba(45,67,37,.34)!important}
      .hero-actions .btn-primary:hover:after,.hero-actions a[href*="#catalog"]:hover:after,.hero-actions button[data-scroll-to-catalog]:hover:after{transform:translateX(5px)}
      .hero-actions .btn-primary:active,.hero-actions a[href*="#catalog"]:active,.hero-actions button[data-scroll-to-catalog]:active{transform:translateY(1px) scale(.99)}

      @media(max-width:900px){
        .forma-hero-bottom{grid-template-columns:1fr 1fr}.hero-actions{grid-column:1/-1}.hero-actions .btn-primary,.hero-actions a[href*="#catalog"],.hero-actions button[data-scroll-to-catalog]{min-height:70px}
      }
      @media(max-width:760px){
        .announcement{padding:8px 14px!important;font-size:11px!important;line-height:1.35!important}
        header{background:rgba(245,242,236,.97)!important}
        .container.nav{width:calc(100% - 20px)!important;gap:8px!important;min-height:66px!important;padding:8px 0!important}
        .logo{font-size:18px!important;letter-spacing:.08em!important;flex:0 1 auto;min-width:0}
        .nav-links{display:none!important}.icon-btn{padding:8px 10px!important;gap:5px!important;font-size:12px!important;white-space:nowrap}
        .hero{padding-top:28px!important}
        .hero-main{padding:34px 26px 28px!important;border-radius:28px!important}
        .hero-main:before{right:-38%;top:7%;width:105%;border-width:48px}
        .hero-main h1{margin:20px 0 16px!important;line-height:1.02!important}
        .hero-main p{line-height:1.48!important}
        .forma-hero-bottom{grid-template-columns:1fr 1fr;gap:9px;margin-top:24px}
        .forma-hero-stat{min-height:78px;padding:12px 10px;border-radius:17px;gap:8px}
        .forma-hero-stat strong{font-size:29px}.forma-hero-stat span{font-size:9px;letter-spacing:.055em}
        .hero-actions{grid-column:1/-1}
        .hero-actions .btn-primary,.hero-actions a[href*="#catalog"],.hero-actions button[data-scroll-to-catalog]{min-height:62px;border-radius:18px!important;font-size:17px!important;padding:16px 20px!important}
      }
      @media(max-width:390px){
        .logo{font-size:16px!important}.icon-btn{padding:7px 8px!important}
        .hero-main{padding:30px 20px 24px!important}.forma-hero-stat strong{font-size:25px}.forma-hero-stat span{font-size:8px}
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
      box.innerHTML=`<div class="forma-hero-stat"><strong>${products}</strong><span>товаров<br>в каталоге</span></div><div class="forma-hero-stat"><strong>${collections}</strong><span>коллекций<br>мебели</span></div>`;
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