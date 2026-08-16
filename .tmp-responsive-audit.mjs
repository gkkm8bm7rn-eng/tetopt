import { chromium } from 'playwright';
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:320,height:700}});
await page.goto('http://127.0.0.1:8000/',{waitUntil:'networkidle'});
await page.waitForSelector('.product-card',{timeout:20000});
const report=await page.evaluate(()=>{
  const sels=['html','body','.trade-note','.site-header','.brand-lockup','.header-actions','#favoritesButton','#cartButton','main','.hero','.catalog-section','.catalog-tools','.category-row','.catalog-layout','.catalog-content','.product-grid','.product-card','.product-info','.product-bottom','.quick-add','footer#delivery','.toast'];
  const info={viewport:document.documentElement.clientWidth,htmlScroll:document.documentElement.scrollWidth,bodyScroll:document.body.scrollWidth};
  info.elements=sels.map(sel=>{const el=document.querySelector(sel);if(!el)return{sel,missing:true};const r=el.getBoundingClientRect(),cs=getComputedStyle(el);return{sel,left:Math.round(r.left),right:Math.round(r.right),width:Math.round(r.width),scrollWidth:el.scrollWidth,clientWidth:el.clientWidth,overflowX:cs.overflowX,display:cs.display,minWidth:cs.minWidth,maxWidth:cs.maxWidth,position:cs.position}});
  info.direct=[...document.body.children].map(el=>{const r=el.getBoundingClientRect(),cs=getComputedStyle(el);return{tag:el.tagName,id:el.id,cls:el.className?.toString().slice(0,80)||'',left:Math.round(r.left),right:Math.round(r.right),width:Math.round(r.width),scrollWidth:el.scrollWidth,overflowX:cs.overflowX,position:cs.position}});
  return info;
});
console.log('MOBILE_DIAGNOSTIC '+JSON.stringify(report));
await page.screenshot({path:'audit-mobile-320.png',fullPage:true});
await browser.close();
