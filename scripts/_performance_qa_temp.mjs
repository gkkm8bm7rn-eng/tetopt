import puppeteer from 'puppeteer-core';
import {execSync} from 'node:child_process';

const chrome=execSync('which google-chrome || which chromium || which chromium-browser',{shell:'/bin/bash'}).toString().trim();
const browser=await puppeteer.launch({headless:true,executablePath:chrome,args:['--no-sandbox','--disable-dev-shm-usage']});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const ok=(value,message)=>{if(!value)throw new Error(message)};
const median=values=>{const v=[...values].sort((a,b)=>a-b);return v[Math.floor(v.length/2)]};

async function physicalClick(page,selector,label){
  const el=await page.$(selector); ok(el,`${label}: missing ${selector}`);
  await el.evaluate(node=>node.scrollIntoView({block:'center',inline:'nearest',behavior:'instant'}));
  await wait(60);
  const hit=await el.evaluate(node=>{const r=node.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2,t=document.elementFromPoint(x,y);return{x,y,w:r.width,h:r.height,reachable:!!t&&(t===node||node.contains(t))}});
  ok(hit.w>1&&hit.h>1&&hit.reachable,`${label}: not physically clickable ${JSON.stringify(hit)}`);
  await page.mouse.click(hit.x,hit.y);
}

async function pageReady(page,url,width,height){
  await page.setViewport({width,height,deviceScaleFactor:width<=640?2:1});
  await page.setCacheEnabled(false); await page.setBypassServiceWorker(true);
  await page.goto(url,{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForSelector('#productGrid .product-card',{timeout:30000});
  const overflow=await page.evaluate(()=>[document.documentElement.scrollWidth,document.documentElement.clientWidth]);
  ok(overflow[0]<=overflow[1]+1,`${width}px overflow ${overflow}`);
}

async function functional(){
  const page=await browser.newPage(),errors=[]; page.on('pageerror',e=>errors.push(e.message));
  const base='http://127.0.0.1:8001/?tetopt_internal=on';
  await pageReady(page,base,390,844);
  ok((await page.$$eval('#productGrid .product-card',x=>x.length))===24,'mobile catalog count');
  const imgs=await page.$$eval('#productGrid img',nodes=>nodes.slice(0,4).map(i=>({loading:i.loading,priority:i.fetchPriority,src:i.src,raw:i.getAttribute('src')})));
  ok(imgs[0].loading==='eager'&&imgs[0].priority==='high'&&imgs[1].loading==='eager'&&imgs[1].priority==='high','mobile priority first row');
  ok(imgs[2].loading==='lazy'&&imgs[2].priority==='auto','mobile later card priority');
  ok(imgs.slice(0,2).every(x=>x.src.startsWith('http://127.0.0.1:8001/assets/products/')),'candidate media must be same-origin');
  await page.waitForFunction(()=>[...document.querySelectorAll('#productGrid img')].slice(0,2).every(i=>i.complete&&i.naturalWidth>0),{timeout:15000});

  await physicalClick(page,'#filterToggle','filter'); await wait(80); ok(await page.$eval('#filters',e=>e.classList.contains('open')),'filter open');
  await page.type('#priceMin','3000'); await wait(60); ok((await page.$eval('#priceMin',e=>e.value))==='3000','price filter');
  await page.$eval('#clearFilters',e=>e.click()); await wait(80); if(await page.$eval('#filters',e=>e.classList.contains('open')))await page.$eval('#filterToggle',e=>e.click());

  await page.type('#searchInput','Амура'); await physicalClick(page,'.search-submit','search'); await wait(120); ok((await page.$eval('#catalogTitle',e=>e.textContent)).includes('Амура'),'search result title');
  await page.$eval('#clearFilters',e=>e.click()); await wait(100); ok((await page.$$eval('#productGrid .product-card',x=>x.length))===24,'search reset');
  await page.select('#sortSelect','price-asc'); await wait(100); ok((await page.$eval('#sortSelect',e=>e.value))==='price-asc','sort');

  await physicalClick(page,'#productGrid .product-card button[data-favorite]','favorite');
  await physicalClick(page,'#productGrid .product-card button[data-add]','cart add'); await wait(100); ok(Number(await page.$eval('#cartCount',e=>e.textContent))>=1,'cart counter');
  await physicalClick(page,'#cartButton','cart'); await wait(100); ok(await page.$eval('#cartDialog',e=>e.open),'cart dialog');
  const contacts=await page.$$eval('#cartFooter .checkout-actions a',links=>links.map(a=>({text:(a.textContent||'').toLowerCase(),href:a.getAttribute('href')||''})));
  ok(contacts.some(x=>x.text.includes('whatsapp')&&x.href.startsWith('https://wa.me/79057267946?text=')),'WhatsApp recipient');
  ok(contacts.some(x=>x.text.includes('telegram')&&x.href.startsWith('tg://resolve?phone=79057267946&text=')),'Telegram recipient');
  ok(contacts.some(x=>(x.text.includes('e-mail')||x.text.includes('email'))&&x.href.startsWith('mailto:postes@mail.ru?')),'email recipient');
  await physicalClick(page,'#cartDialog [data-close-cart]','cart close'); await wait(60);

  await physicalClick(page,'#productGrid .product-card .product-image-stage','product');
  await page.waitForSelector('#productDialog[open] .detail',{timeout:15000});
  await page.waitForSelector('#productDialog[open] .detail-inline-close',{visible:true,timeout:5000});
  const detail=await page.$eval('#galleryMain',i=>({src:i.src,raw:i.getAttribute('src')}));
  ok(detail.src.startsWith('http://127.0.0.1:8001/assets/products/'),'detail media same-origin');
  ok(!/\/card\.webp(?:$|\?)/.test(detail.src),'detail must retain full source image');
  await page.waitForFunction(()=>{const i=document.querySelector('#galleryMain');return i&&i.complete&&i.naturalWidth>0},{timeout:15000});
  await physicalClick(page,'#productDialog .detail-inline-close','detail close'); await wait(60); ok(!(await page.$eval('#productDialog',e=>e.open)),'detail closed');

  const variant=await page.evaluate(async()=>{const card=[...document.querySelectorAll('.product-card')].find(c=>c.querySelector('[data-card-variant],[data-axis]'));if(!card)return{skipped:true};const neighbor=card.nextElementSibling||card.previousElementSibling,target=[...card.querySelectorAll('[data-card-variant],[data-axis]')].find(x=>!x.classList.contains('active')&&!x.disabled);if(!target)return{skipped:true};target.click();await new Promise(r=>setTimeout(r,120));return{skipped:false,count:document.querySelectorAll('.product-card').length,neighborStable:!!neighbor?.isConnected}});
  ok(variant.skipped||(variant.count===24&&variant.neighborStable),'variant local update');

  await physicalClick(page,'#questionButton','question'); await wait(70); ok(await page.$eval('#questionDialog',e=>e.open),'question dialog');
  const qchannels=await page.$$eval('#questionDialog [data-question-channel]',x=>x.map(n=>n.dataset.questionChannel)); ok(['whatsapp','telegram','email'].every(x=>qchannels.includes(x)),'question channels'); await page.keyboard.press('Escape');
  await physicalClick(page,'.delivery-payment-button','delivery'); await wait(70); ok(await page.$eval('#deliveryDialog',e=>e.open),'delivery dialog'); await page.keyboard.press('Escape');
  ok(errors.length===0,'mobile JS errors: '+errors.join(' | '));
  await page.close();

  for(const [width,height,label] of [[768,1024,'tablet'],[1440,1000,'desktop']]){
    const p=await browser.newPage(),errs=[];p.on('pageerror',e=>errs.push(e.message));await pageReady(p,base,width,height);
    const pri=await p.$$eval('#productGrid img',nodes=>nodes.slice(0,4).map(i=>[i.loading,i.fetchPriority]));
    ok(pri[0][0]==='eager'&&pri[0][1]==='high'&&pri[1][0]==='eager'&&pri[2][0]==='eager'&&pri[3][0]==='lazy'&&pri[3][1]==='auto',`${label} priorities`);
    ok((await p.$eval('main#top>.hero',e=>e.getBoundingClientRect().height))<100,`${label} compact hero`);
    await physicalClick(p,'#filterToggle',`${label} filter`);await wait(50);ok(await p.$eval('#filters',e=>e.classList.contains('open')),`${label} filter open`);
    const p2=await p.$('#pagination [data-page="2"]');if(p2){await physicalClick(p,'#pagination [data-page="2"]',`${label} pagination`);await wait(80)}
    ok(errs.length===0,`${label} JS errors ${errs.join(' | ')}`);await p.close();
  }
  console.log('FUNCTIONAL_OK',JSON.stringify({imgs,detail,variant,contacts}));
}

async function perfRun(port,label){
  const page=await browser.newPage();
  await page.setViewport({width:390,height:844,deviceScaleFactor:2});await page.setCacheEnabled(false);await page.setBypassServiceWorker(true);
  await page.evaluateOnNewDocument(()=>{window.__lcp=[];new PerformanceObserver(list=>{for(const e of list.getEntries())window.__lcp.push({t:e.startTime,url:e.url||'',size:e.size||0,tag:e.element?.tagName||'',cls:e.element?.className||''})}).observe({type:'largest-contentful-paint',buffered:true})});
  const cdp=await page.createCDPSession();await cdp.send('Network.enable');await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:150,downloadThroughput:200*1024,uploadThroughput:100*1024,connectionType:'cellular3g'});
  const start=Date.now();await page.goto(`http://127.0.0.1:${port}/?tetopt_internal=on`,{waitUntil:'domcontentloaded',timeout:60000});await page.waitForSelector('#productGrid .product-card',{timeout:30000});
  await page.waitForFunction(()=>[...document.querySelectorAll('#productGrid img')].slice(0,2).every(i=>i.complete&&i.naturalWidth>0),{timeout:30000});
  await wait(1200);
  const result=await page.evaluate(()=>{
    const images=[...document.querySelectorAll('#productGrid img')].slice(0,8);
    const resources=performance.getEntriesByType('resource').filter(r=>/\/assets\/products\//.test(r.name));
    const first2=images.slice(0,2).map(i=>{const r=performance.getEntriesByName(i.src).at(-1);return{src:i.src,end:r?.responseEnd||0,bytes:r?.encodedBodySize||0}});
    const lcp=window.__lcp.at(-1)||{t:0,url:'',size:0,tag:'',cls:''};
    return{lcp,first2Max:Math.max(...first2.map(x=>x.end)),first2,productBytes:resources.reduce((s,r)=>s+(r.encodedBodySize||0),0),productRequests:resources.length,cardLoaded:images.filter(i=>i.complete&&i.naturalWidth>0).length,loader:!!document.getElementById('siteLoader')};
  });
  result.wall=Date.now()-start;result.label=label;await page.close();return result;
}

async function performanceComparison(){
  const main=[],candidate=[];
  for(let i=0;i<3;i++){main.push(await perfRun(8000,'main'));candidate.push(await perfRun(8001,'candidate'))}
  const summary={
    main:{lcp:median(main.map(x=>x.lcp.t)),first2:median(main.map(x=>x.first2Max)),bytes:median(main.map(x=>x.productBytes)),wall:median(main.map(x=>x.wall))},
    candidate:{lcp:median(candidate.map(x=>x.lcp.t)),first2:median(candidate.map(x=>x.first2Max)),bytes:median(candidate.map(x=>x.productBytes)),wall:median(candidate.map(x=>x.wall))},
    raw:{main,candidate}
  };
  ok(summary.candidate.bytes<summary.main.bytes,'candidate must reduce initial product-image bytes');
  ok(summary.candidate.first2<=summary.main.first2*1.15,'candidate first visible row regressed');
  console.log('PERFORMANCE_COMPARISON',JSON.stringify(summary,null,2));
  return summary;
}

try{await functional();await performanceComparison()}finally{await browser.close()}
