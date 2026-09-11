import puppeteer from 'puppeteer-core';
import {execSync} from 'node:child_process';

const chrome=execSync('which google-chrome || which chromium || which chromium-browser',{shell:'/bin/bash'}).toString().trim();
const browser=await puppeteer.launch({headless:true,executablePath:chrome,args:['--no-sandbox','--disable-dev-shm-usage']});
const median=values=>{const v=[...values].sort((a,b)=>a-b);return v[Math.floor(v.length/2)]};
const ok=(value,message)=>{if(!value)throw new Error(message)};

async function run(port,label){
  const page=await browser.newPage();
  await page.setViewport({width:390,height:844,deviceScaleFactor:2});
  await page.setCacheEnabled(false);
  await page.setBypassServiceWorker(true);
  await page.evaluateOnNewDocument(()=>{window.__lcp=[];new PerformanceObserver(list=>{for(const e of list.getEntries())window.__lcp.push({t:e.startTime,url:e.url||''})}).observe({type:'largest-contentful-paint',buffered:true})});
  const cdp=await page.createCDPSession();
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled',{cacheDisabled:true});
  await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:150,downloadThroughput:200*1024,uploadThroughput:100*1024,connectionType:'cellular3g'});
  const ids=new Map(),finished=new Map(),partial=new Map();
  cdp.on('Network.responseReceived',e=>{const u=e.response?.url||'';if(/\/assets\/products\//.test(u))ids.set(e.requestId,u)});
  cdp.on('Network.dataReceived',e=>{const u=ids.get(e.requestId);if(u)partial.set(u,(partial.get(u)||0)+(e.encodedDataLength||e.dataLength||0))});
  cdp.on('Network.loadingFinished',e=>{const u=ids.get(e.requestId);if(u)finished.set(u,e.encodedDataLength||0)});
  const transferred=()=>[...partial.values()].reduce((s,n)=>s+n,0);
  const start=Date.now();
  await page.goto(`http://127.0.0.1:${port}/?tetopt_internal=on`,{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForSelector('#productGrid .product-card',{timeout:30000});
  await page.waitForFunction(()=>[...document.querySelectorAll('#productGrid img')].slice(0,2).every(i=>i.complete&&i.naturalWidth>0),{timeout:30000});
  const first2Wall=Date.now()-start,bytesAtFirst2=transferred();
  const first8Urls=await page.$$eval('#productGrid img',nodes=>nodes.slice(0,8).map(i=>i.src));
  await page.$eval('#productGrid .product-card:nth-child(8)',e=>e.scrollIntoView({block:'center',behavior:'instant'}));
  await page.waitForFunction(()=>[...document.querySelectorAll('#productGrid img')].slice(0,8).every(i=>i.complete&&i.naturalWidth>0),{timeout:60000});
  const first8Wall=Date.now()-start;
  await new Promise(r=>setTimeout(r,200));
  const first8Bytes=first8Urls.reduce((s,u)=>s+(finished.get(u)||0),0);
  const lcp=await page.evaluate(()=>window.__lcp.at(-1)||{t:0,url:''});
  const sources=await page.$$eval('#productGrid img',nodes=>nodes.slice(0,8).map(i=>({src:i.src,loading:i.loading,priority:i.fetchPriority,width:i.naturalWidth})));
  await page.close();
  return{label,lcp:lcp.t,first2Wall,bytesAtFirst2,first8Wall,first8Bytes,sources};
}

try{
  const main=[],candidate=[];
  for(let i=0;i<3;i++){main.push(await run(8000,'main'));candidate.push(await run(8001,'candidate'))}
  const summarize=a=>({lcp:median(a.map(x=>x.lcp)),first2:median(a.map(x=>x.first2Wall)),bytesAtFirst2:median(a.map(x=>x.bytesAtFirst2)),first8:median(a.map(x=>x.first8Wall)),first8Bytes:median(a.map(x=>x.first8Bytes))});
  const summary={main:summarize(main),candidate:summarize(candidate),raw:{main,candidate}};
  console.log('FAIR_AB',JSON.stringify(summary,null,2));
  ok(summary.candidate.first2<=summary.main.first2*1.15,`first row regression ${summary.candidate.first2} vs ${summary.main.first2}`);
  ok(summary.candidate.bytesAtFirst2<=summary.main.bytesAtFirst2*1.10,`bytes before first row regression ${summary.candidate.bytesAtFirst2} vs ${summary.main.bytesAtFirst2}`);
  ok(summary.candidate.first8Bytes<summary.main.first8Bytes,`same-card bytes not improved ${summary.candidate.first8Bytes} vs ${summary.main.first8Bytes}`);
  ok(summary.candidate.first8<summary.main.first8,`same-card load time not improved ${summary.candidate.first8} vs ${summary.main.first8}`);
}finally{await browser.close()}
