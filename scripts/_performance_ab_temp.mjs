import puppeteer from 'puppeteer-core';
import {execSync} from 'node:child_process';

const chrome=execSync('which google-chrome || which chromium || which chromium-browser',{shell:'/bin/bash'}).toString().trim();
const browser=await puppeteer.launch({headless:true,executablePath:chrome,args:['--no-sandbox','--disable-dev-shm-usage']});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const median=values=>{const v=[...values].sort((a,b)=>a-b);return v[Math.floor(v.length/2)]};
const ok=(value,message)=>{if(!value)throw new Error(message)};

async function run(port,label){
  const page=await browser.newPage();
  await page.setViewport({width:390,height:844,deviceScaleFactor:2});
  await page.setCacheEnabled(false);
  await page.setBypassServiceWorker(true);
  await page.evaluateOnNewDocument(()=>{
    window.__lcp=[];
    new PerformanceObserver(list=>{for(const e of list.getEntries())window.__lcp.push({t:e.startTime,url:e.url||'',tag:e.element?.tagName||'',cls:e.element?.className||''})}).observe({type:'largest-contentful-paint',buffered:true});
  });
  const cdp=await page.createCDPSession();
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled',{cacheDisabled:true});
  await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:150,downloadThroughput:200*1024,uploadThroughput:100*1024,connectionType:'cellular3g'});
  const productRequests=new Map(),finished=[];
  cdp.on('Network.responseReceived',event=>{
    const url=event.response?.url||'';
    if(/\/assets\/products\//.test(url))productRequests.set(event.requestId,url);
  });
  cdp.on('Network.loadingFinished',event=>{
    const url=productRequests.get(event.requestId);
    if(url)finished.push({url,bytes:event.encodedDataLength||0});
  });
  const start=Date.now();
  await page.goto(`http://127.0.0.1:${port}/?tetopt_internal=on`,{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForSelector('#productGrid .product-card',{timeout:30000});
  await page.waitForFunction(()=>[...document.querySelectorAll('#productGrid img')].slice(0,2).every(i=>i.complete&&i.naturalWidth>0),{timeout:30000});
  await wait(1800);
  const dom=await page.evaluate(()=>{
    const images=[...document.querySelectorAll('#productGrid img')].slice(0,8);
    const first2=images.slice(0,2).map(i=>{const r=performance.getEntriesByName(i.src).at(-1);return{src:i.src,end:r?.responseEnd||0,encoded:r?.encodedBodySize||0,loading:i.loading,priority:i.fetchPriority}});
    return{
      lcp:(window.__lcp.at(-1)||{t:0,url:'',tag:'',cls:''}),
      first2,
      first2Max:Math.max(...first2.map(x=>x.end)),
      visible:images.map(i=>({src:i.src,loading:i.loading,priority:i.fetchPriority,complete:i.complete,naturalWidth:i.naturalWidth})),
      overflow:[document.documentElement.scrollWidth,document.documentElement.clientWidth]
    };
  });
  const unique=new Map();
  for(const item of finished)unique.set(item.url,item.bytes);
  const network=[...unique.entries()].map(([url,bytes])=>({url,bytes}));
  const result={label,wall:Date.now()-start,lcp:dom.lcp,first2:dom.first2,first2Max:dom.first2Max,productBytes:network.reduce((s,x)=>s+x.bytes,0),productRequests:network.length,network,visible:dom.visible,overflow:dom.overflow};
  await page.close();
  return result;
}

try{
  const main=[],candidate=[];
  for(let i=0;i<3;i++){
    main.push(await run(8000,'main'));
    candidate.push(await run(8001,'candidate'));
  }
  const summary={
    main:{lcp:median(main.map(x=>x.lcp.t)),first2:median(main.map(x=>x.first2Max)),bytes:median(main.map(x=>x.productBytes)),wall:median(main.map(x=>x.wall)),requests:median(main.map(x=>x.productRequests))},
    candidate:{lcp:median(candidate.map(x=>x.lcp.t)),first2:median(candidate.map(x=>x.first2Max)),bytes:median(candidate.map(x=>x.productBytes)),wall:median(candidate.map(x=>x.wall)),requests:median(candidate.map(x=>x.productRequests))},
    raw:{main,candidate}
  };
  console.log('PERFORMANCE_AB',JSON.stringify(summary,null,2));
  ok(summary.candidate.first2<=summary.main.first2*1.15,`candidate first row regressed: ${summary.candidate.first2} vs ${summary.main.first2}`);
  ok(summary.candidate.bytes<=summary.main.bytes,`candidate transferred more product-image bytes: ${summary.candidate.bytes} vs ${summary.main.bytes}`);
}finally{
  await browser.close();
}
