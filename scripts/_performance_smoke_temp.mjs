import puppeteer from 'puppeteer-core';
import {execSync} from 'node:child_process';

const chrome=execSync('which google-chrome || which chromium || which chromium-browser',{shell:'/bin/bash'}).toString().trim();
const browser=await puppeteer.launch({headless:true,executablePath:chrome,args:['--no-sandbox','--disable-dev-shm-usage']});
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const ok=(value,message)=>{if(!value)throw new Error(message)};

async function mobile(){
  const page=await browser.newPage();
  await page.setViewport({width:390,height:844,deviceScaleFactor:2});
  await page.setCacheEnabled(false); await page.setBypassServiceWorker(true);
  const pageErrors=[]; page.on('pageerror',e=>pageErrors.push(e.message));
  await page.goto('http://127.0.0.1:8000/?tetopt_internal=on',{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForSelector('#productGrid .product-card',{timeout:30000});

  // Fresh-layout physical click: verifies the visible mobile filter button is genuinely clickable.
  await page.click('#filterToggle'); await pause(80);
  ok(await page.$eval('#filters',e=>e.classList.contains('open')),'initial physical filter click');
  await page.$eval('#filterToggle',e=>e.click()); await pause(50);
  ok(!(await page.$eval('#filters',e=>e.classList.contains('open'))),'filter close');

  let imgs=await page.$$eval('#productGrid img',nodes=>nodes.slice(0,4).map(i=>({loading:i.loading,priority:i.fetchPriority,src:i.getAttribute('src')})));
  ok((await page.$$eval('#productGrid .product-card',x=>x.length))===24,'initial catalog count');
  ok(imgs[0].loading==='eager'&&imgs[1].loading==='eager'&&imgs[2].loading==='lazy','mobile image priority');
  ok(imgs.some(x=>/card\.webp$/.test(x.src)),'optimized image not used');

  await page.type('#searchInput','Амура'); await page.click('.search-submit'); await pause(120);
  ok((await page.$eval('#catalogTitle',e=>e.textContent)).includes('Амура'),'search');
  await page.$eval('#clearFilters',e=>e.click()); await pause(120);
  ok((await page.$$eval('#productGrid .product-card',x=>x.length))===24,'search reset');

  // After search the browser may have scrolled beneath the sticky header, so invoke the same real click handler directly.
  await page.$eval('#filterToggle',e=>e.click()); await pause(50);
  ok(await page.$eval('#filters',e=>e.classList.contains('open')),'filter handler after search');
  await page.type('#priceMin','3000'); await pause(80);
  ok((await page.$eval('#priceMin',e=>e.value))==='3000','price input');
  await page.$eval('#clearFilters',e=>e.click()); await pause(80);

  await page.select('#sortSelect','price-asc'); await pause(100);
  ok((await page.$eval('#sortSelect',e=>e.value))==='price-asc','sort');

  const mobileCategory=await page.$('[data-mobile-category-toggle="interior"]');
  if(mobileCategory){
    await mobileCategory.click(); await pause(80);
    const panel=await page.$('#mobile-category-interior');
    ok(panel && !(await panel.evaluate(e=>e.hidden)),'mobile category accordion');
    const option=await page.$('#mobile-category-interior [data-main-category="interior"]');
    if(option){await option.click(); await pause(100);}
    const reset=await page.$('[data-reset-all-products]'); if(reset){await reset.click(); await pause(100);}
  }

  await page.click('#productGrid .product-card button[data-favorite]');
  await page.click('#productGrid .product-card button[data-add]'); await pause(80);
  ok((await page.$eval('#cartCount',e=>Number(e.textContent)||0))>=1,'cart add');
  await page.click('#cartButton'); await pause(80); ok(await page.$eval('#cartDialog',e=>e.open),'cart open');
  await page.click('[data-close-cart]'); await pause(50); ok(!(await page.$eval('#cartDialog',e=>e.open)),'cart close');

  await page.click('#productGrid .product-card .product-image-stage');
  await page.waitForSelector('#productDialog[open] .detail',{timeout:15000});
  const detailMain=await page.$eval('#galleryMain',e=>e.getAttribute('src'));
  ok(!/\/card\.webp$/.test(detailMain),'detail gallery uses thumbnail');
  const galleryNext=await page.$('.gallery-nav.next'); if(galleryNext){await galleryNext.click(); await pause(80);}
  await page.click('[data-close-dialog]'); await pause(50); ok(!(await page.$eval('#productDialog',e=>e.open)),'detail close');

  const variant=await page.evaluate(async()=>{
    const card=[...document.querySelectorAll('#productGrid .product-card')].find(c=>c.querySelector('[data-card-variant]'));
    if(!card)return {skipped:true};
    const neighbor=card.nextElementSibling||card.previousElementSibling;
    const target=[...card.querySelectorAll('[data-card-variant]')].find(x=>!x.classList.contains('active'));
    if(!target)return {skipped:true};
    target.click(); await new Promise(r=>setTimeout(r,100));
    return {skipped:false,count:document.querySelectorAll('#productGrid .product-card').length,neighborStable:neighbor?.isConnected&&[...document.querySelectorAll('#productGrid .product-card')].includes(neighbor)};
  });
  ok(variant.skipped||(variant.count===24&&variant.neighborStable),'variant local render');

  const question=await page.$('#questionButton'); if(question){await question.click(); await pause(50); await page.keyboard.press('Escape');}
  const delivery=await page.$('.delivery-payment-button'); if(delivery){await delivery.click(); await pause(50); await page.keyboard.press('Escape');}
  ok(pageErrors.length===0,'page errors: '+pageErrors.join(' | '));
  console.log('MOBILE_OK',JSON.stringify({imgs,detailMain,variant}));
  await page.close();
}

async function desktop(){
  const page=await browser.newPage(); await page.setViewport({width:1440,height:1000}); await page.setBypassServiceWorker(true);
  await page.goto('http://127.0.0.1:8000/?tetopt_internal=on',{waitUntil:'domcontentloaded',timeout:60000}); await page.waitForSelector('#productGrid .product-card');
  const pri=await page.$$eval('#productGrid img',nodes=>nodes.slice(0,5).map(i=>[i.loading,i.fetchPriority]));
  ok(pri[0][0]==='eager'&&pri[1][0]==='eager'&&pri[2][0]==='eager'&&pri[3][0]==='lazy','desktop image priority');
  ok((await page.$eval('#filters',e=>getComputedStyle(e).display))!=='none','desktop filters visible');
  const page2=await page.$('#pagination [data-page="2"]'); if(page2){await page2.click(); await pause(100);}
  console.log('DESKTOP_OK',JSON.stringify({pri,pagination:!!page2}));
  await page.close();
}

try{await mobile(); await desktop();}finally{await browser.close();}
