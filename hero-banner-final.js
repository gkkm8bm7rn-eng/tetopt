(()=>{
  const KEY='__formaHeroBannerFinalV7';
  const STYLE_ID='hero-banner-final-style';
  const api=window[KEY]||{};

  api.ensureStyle=()=>{
    let style=document.getElementById(STYLE_ID);
    if(!style){
      style=document.createElement('style');
      style.id=STYLE_ID;
    }
    if(!document.head)return;
    style.textContent=`
.hero-grid{
  grid-template-columns:minmax(0,1fr)!important;
}
.hero-main{
  display:block!important;
  grid-column:1/-1!important;
  width:100%!important;
  position:relative!important;
  overflow:hidden!important;
  isolation:isolate!important;
  min-height:0!important;
  padding:44px 46px 30px!important;
  border:1px solid rgba(118,105,82,.18)!important;
  border-radius:30px!important;
  background:
    radial-gradient(circle at 64% 91%,transparent 0 150px,rgba(255,255,255,.20) 152px 220px,transparent 222px 280px,rgba(255,255,255,.14) 282px 354px,transparent 356px),
    linear-gradient(135deg,#ded5c2 0%,#d4cfb9 51%,#abb397 100%)!important;
  box-shadow:0 18px 48px rgba(63,52,38,.10)!important;
}
.hero-main::before,.hero-main::after{
  display:none!important;
  content:none!important;
  background:none!important;
}
.hero-main>*{
  position:relative!important;
  z-index:1!important;
  min-width:0!important;
}
.hero-main .eyebrow,.hero-main .kicker{
  margin:0 0 16px!important;
  max-width:760px!important;
  color:#40553b!important;
  font-weight:800!important;
  letter-spacing:.18em!important;
}
.hero-main h1{
  margin:0 0 18px!important;
  max-width:800px!important;
  font-family:Georgia,'Times New Roman',serif!important;
  font-size:clamp(46px,5vw,76px)!important;
  font-weight:500!important;
  line-height:1!important;
  letter-spacing:-.03em!important;
  color:#211f1b!important;
  text-wrap:balance!important;
  overflow-wrap:normal!important;
  word-break:normal!important;
}
.hero-main p{
  margin:0!important;
  max-width:680px!important;
  font-size:clamp(16px,1.5vw,20px)!important;
  line-height:1.48!important;
  color:#454a43!important;
  overflow-wrap:normal!important;
  word-break:normal!important;
}
.forma-hero-bottom{
  display:grid!important;
  grid-template-columns:minmax(0,1fr) minmax(0,1fr)!important;
  gap:14px!important;
  align-items:stretch!important;
  width:min(940px,100%)!important;
  max-width:100%!important;
  margin-top:22px!important;
}
.forma-hero-stats{display:contents!important}
.forma-hero-stat{
  display:flex!important;
  align-items:center!important;
  justify-content:flex-start!important;
  gap:18px!important;
  min-width:0!important;
  min-height:112px!important;
  padding:18px 28px!important;
  border:1px solid rgba(255,255,255,.72)!important;
  border-radius:24px!important;
  box-shadow:0 10px 26px rgba(65,54,38,.08)!important;
}
.forma-hero-stat:first-child{background:rgba(255,255,255,.94)!important}
.forma-hero-stat:nth-child(2){background:linear-gradient(145deg,#647557,#536647)!important}
.forma-hero-stat strong{
  flex:0 0 auto!important;
  font-family:Georgia,'Times New Roman',serif!important;
  font-size:50px!important;
  font-weight:500!important;
  line-height:1!important;
  white-space:nowrap!important;
  color:#211f1b!important;
}
.forma-hero-stat:nth-child(2) strong{color:#fff!important}
.forma-hero-stat span{
  min-width:0!important;
  font-size:15px!important;
  font-weight:760!important;
  line-height:1.28!important;
  color:#3f433b!important;
}
.forma-hero-stat:nth-child(2) span{color:rgba(255,255,255,.84)!important}
.forma-stat-icon{display:none!important}
.hero-actions{
  display:flex!important;
  grid-column:1/-1!important;
  order:-1!important;
  margin:0!important;
  min-width:0!important;
}
.hero-actions .btn-primary,.hero-actions a[href*='#catalog'],.hero-actions button[data-scroll-to-catalog]{
  display:flex!important;
  align-items:center!important;
  justify-content:center!important;
  gap:24px!important;
  width:100%!important;
  min-height:82px!important;
  padding:17px 26px!important;
  border-radius:24px!important;
  background:linear-gradient(135deg,#24231f,#181815)!important;
  color:#fff!important;
  border:1px solid rgba(255,255,255,.16)!important;
  box-shadow:0 14px 30px rgba(31,31,27,.22)!important;
  font-size:22px!important;
  font-weight:850!important;
  text-decoration:none!important;
  -webkit-tap-highlight-color:transparent!important;
}
.hero-actions .btn-primary:after,.hero-actions a[href*='#catalog']:after,.hero-actions button[data-scroll-to-catalog]:after{
  content:'→'!important;
  font-size:34px!important;
  line-height:1!important;
}
#catalog,.results-line{
  scroll-margin-top:calc(var(--forma-announcement-h,0px) + 96px)!important;
}
@media(max-width:900px){
  .hero-main{padding:34px 30px 26px!important}
}
@media(max-width:760px){
  .hero-main{
    padding:28px 20px 20px!important;
    border-radius:27px!important;
    background:
      radial-gradient(circle at 64% 91%,transparent 0 112px,rgba(255,255,255,.20) 114px 170px,transparent 172px 219px,rgba(255,255,255,.14) 221px 278px,transparent 280px),
      linear-gradient(135deg,#ded5c2 0%,#d4cfb9 51%,#abb397 100%)!important;
  }
  .hero-main .eyebrow,.hero-main .kicker{
    font-size:11px!important;
    line-height:1.35!important;
    margin-bottom:12px!important;
  }
  .hero-main h1{
    font-size:clamp(38px,10.8vw,52px)!important;
    line-height:1.01!important;
    margin-bottom:14px!important;
    max-width:none!important;
  }
  .hero-main p{
    font-size:16px!important;
    line-height:1.45!important;
    max-width:none!important;
  }
  .forma-hero-bottom{
    gap:9px!important;
    margin-top:15px!important;
  }
  .hero-actions .btn-primary,.hero-actions a[href*='#catalog'],.hero-actions button[data-scroll-to-catalog]{
    min-height:60px!important;
    border-radius:18px!important;
    font-size:17px!important;
    padding:13px 16px!important;
    gap:14px!important;
  }
  .hero-actions .btn-primary:after,.hero-actions a[href*='#catalog']:after,.hero-actions button[data-scroll-to-catalog]:after{
    font-size:27px!important;
  }
  .forma-hero-stat{
    min-height:92px!important;
    padding:12px 14px!important;
    border-radius:18px!important;
    gap:10px!important;
  }
  .forma-hero-stat strong{font-size:34px!important}
  .forma-hero-stat span{font-size:11px!important}
}
@media(max-width:390px){
  .hero-main{padding:25px 17px 18px!important}
  .hero-main h1{font-size:clamp(35px,10.6vw,46px)!important}
  .hero-main p{font-size:15px!important}
  .forma-hero-bottom{margin-top:13px!important;gap:8px!important}
  .forma-hero-stat{
    min-height:84px!important;
    padding:10px!important;
    gap:7px!important;
  }
  .forma-hero-stat strong{font-size:29px!important}
  .forma-hero-stat span{font-size:9px!important}
}
@media(max-width:340px){
  .hero-main{padding:23px 14px 16px!important}
  .hero-main h1{font-size:34px!important}
  .hero-main p{font-size:14px!important}
  .forma-hero-bottom{gap:6px!important;margin-top:12px!important}
  .forma-hero-stat{
    min-height:78px!important;
    padding:8px!important;
    gap:5px!important;
  }
  .forma-hero-stat strong{font-size:24px!important}
  .forma-hero-stat span{font-size:7.8px!important;line-height:1.2!important}
}
@media(min-width:1100px){
  .forma-hero-bottom{margin-top:24px!important}
}
`;
    if(style.parentNode!==document.head||style!==document.head.lastElementChild){
      document.head.appendChild(style);
    }
  };

  window[KEY]=api;
  api.ensureStyle();
  document.addEventListener('DOMContentLoaded',api.ensureStyle,{once:true});
  window.addEventListener('pageshow',api.ensureStyle,{passive:true});
  window.addEventListener('forma:catalog-ready',api.ensureStyle,{passive:true});

  if(!api.interval){
    let attempts=0;
    api.interval=setInterval(()=>{
      api.ensureStyle();
      attempts+=1;
      if(attempts>=20){
        clearInterval(api.interval);
        api.interval=null;
      }
    },500);
  }
})();