import puppeteer from 'puppeteer-core';
import {execSync} from 'node:child_process';

const chrome=execSync('which google-chrome || which chromium || which chromium-browser',{shell:'/bin/bash'}).toString().trim();
const browser=await puppeteer.launch({headless:true,executablePath:chrome,args:['--no-sandbox','--disable-dev-shm-usage']});
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const ok=(value,message)=>{if(!value)throw new Error(message)};

async function assertNoOverflow(page,label){
  const overflow=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,client:document.documentElement.clientWidth}));
  ok(overflow.scroll<=overflow.client+1,`${label}: horizontal overflow ${overflow.scroll}/${overflow.client}`);
}

async function physicalClick(page,selector,label){
  const handle=await page.$(selector);
  ok(handle,`${label}: element missing (${selector})`);
  await handle.evaluate(el=>el.scrollIntoView({block:'center',inline:'nearest',behavior:'instant'}));
  await pause(80);
  const target=await handle.evaluate(el=>{
    const r=el.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2,hit=document.elementFromPoint(x,y);
    return {x,y,width:r.width,height:r.height,visible:r.width>1&&r.height>1,hit:hit?.tagName||null,hitClass:hit?.className||'',reachable:!!hit&&(hit===el||el.contains(hit))};
  });
  ok(target.visible,`${label}: zero-size target ${JSON.stringify(target)}`);
  ok(target.reachable,`${label}: target covered ${JSON.stringify(target)}`);
  await page.mouse.click(target.x,target.y);
  return target;
}

async function openLocal(page,width,height){
  await page.setViewport({width,height,deviceScaleFactor:width<=640?2:1});
  await page.setCacheEnabled(false);
  await page.setBypassServiceWorker(true);
  await page.goto('http://127.0.0.1:8000/?tetopt_internal=on',{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForSelector('#productGrid .product-card',{timeout:30000});
  await assertNoOverflow(page,`${width}px`);
}

async function mobile(){
  const page=await browser.newPage();
  const pageErrors=[]; page.on('pageerror',e=>pageErrors.push(e.message));
  await openLocal(page,390,844);

  ok((await page.$$eval('#productGrid .product-card',x=>x.length))===24,'mobile: initial catalog count');
  const imgs=await page.$$eval('#productGrid img',nodes=>nodes.slice(0,4).map(i=>({loading:i.loading,priority:i.fetchPriority,src:i.getAttribute('src')})));
  ok(imgs[0].loading==='eager'&&imgs[0].priority==='high','mobile: first image priority');
  ok(imgs[1].loading==='eager'&&imgs[1].priority==='high','mobile: second image priority');
  ok(imgs[2].loading==='lazy'&&imgs[2].priority==='low','mobile: third image must stay lazy');
  ok(imgs.some(x=>/card\.webp$/.test(x.src)),'mobile: optimized card media not used');

  await physicalClick(page,'#filterToggle','mobile filter open'); await pause(80);
  ok(await page.$eval('#filters',e=>e.classList.contains('open')),'mobile: filter did not open');
  await page.type('#priceMin','3000'); await pause(80);
  ok((await page.$eval('#priceMin',e=>e.value))==='3000','mobile: price input');
  await page.$eval('#clearFilters',e=>e.click()); await pause(80);
  if(await page.$eval('#filters',e=>e.classList.contains('open'))){await page.$eval('#filterToggle',e=>e.click());await pause(50);}
  ok(!(await page.$eval('#filters',e=>e.classList.contains('open'))),'mobile: filter close');

  await page.type('#searchInput','Амура');
  await physicalClick(page,'.search-submit','mobile search submit'); await pause(150);
  ok((await page.$eval('#catalogTitle',e=>e.textContent)).includes('Амура'),'mobile: search');
  await page.$eval('#clearFilters',e=>e.click()); await pause(120);
  ok((await page.$$eval('#productGrid .product-card',x=>x.length))===24,'mobile: search reset');

  await page.select('#sortSelect','price-asc'); await pause(120);
  ok((await page.$eval('#sortSelect',e=>e.value))==='price-asc','mobile: sort');

  const mobileCategory=await page.$('[data-mobile-category-toggle="interior"]');
  if(mobileCategory){
    await mobileCategory.click(); await pause(80);
    const panel=await page.$('#mobile-category-interior');
    ok(panel && !(await panel.evaluate(e=>e.hidden)),'mobile: category accordion');
    const option=await page.$('#mobile-category-interior [data-main-category="interior"]');
    if(option){await option.click(); await pause(100);}
    const reset=await page.$('[data-reset-all-products]'); if(reset){await reset.click(); await pause(100);}
  }

  await physicalClick(page,'#productGrid .product-card button[data-favorite]','mobile favorite');
  await physicalClick(page,'#productGrid .product-card button[data-add]','mobile add to cart'); await pause(100);
  ok((await page.$eval('#cartCount',e=>Number(e.textContent)||0))>=1,'mobile: cart add');
  await physicalClick(page,'#cartButton','mobile cart open'); await pause(100);
  ok(await page.$eval('#cartDialog',e=>e.open),'mobile: cart dialog');
  await pause(100);
  const contacts=await page.$$eval('#cartFooter .checkout-actions a',links=>links.map(a=>({label:(a.textContent||'').trim().toLowerCase(),href:a.getAttribute('href')||'',channel:a.dataset.directChannel||''})));
  const wa=contacts.find(x=>x.label.includes('whatsapp')),tg=contacts.find(x=>x.label.includes('telegram')),mail=contacts.find(x=>x.label.includes('e-mail')||x.label.includes('email'));
  ok(wa?.href.startsWith('https://wa.me/79057267946?text='),'mobile: WhatsApp recipient');
  ok(tg?.href.startsWith('tg://resolve?phone=79057267946&text='),'mobile: Telegram recipient');
  ok(mail?.href.startsWith('mailto:postes@mail.ru?'),'mobile: email recipient');
  await page.click('[data-close-cart]'); await pause(80);
  ok(!(await page.$eval('#cartDialog',e=>e.open)),'mobile: cart close');

  const stage=await physicalClick(page,'#productGrid .product-card .product-image-stage','mobile product card');
  await page.waitForSelector('#productDialog[open] .detail',{timeout:15000});
  const detailMain=await page.$eval('#galleryMain',e=>e.getAttribute('src'));
  ok(!/\/card\.webp$/.test(detailMain),'mobile: detail gallery must use full image');
  const galleryNext=await page.$('.gallery-nav.next'); if(galleryNext){await physicalClick(page,'.gallery-nav.next','mobile gallery next'); await pause(80);}
  await physicalClick(page,'#productDialog [data-close-dialog]','mobile detail close'); await pause(80);
  ok(!(await page.$eval('#productDialog',e=>e.open)),'mobile: detail close');

  const variant=await page.evaluate(async()=>{
    const card=[...document.querySelectorAll('#productGrid .product-card')].find(c=>c.querySelector('[data-card-variant],[data-axis]'));
    if(!card)return {skipped:true};
    const neighbor=card.nextElementSibling||card.previousElementSibling;
    const target=[...card.querySelectorAll('[data-card-variant],[data-axis]')].find(x=>!x.classList.contains('active')&&!x.disabled);
    if(!target)return {skipped:true};
    target.click(); await new Promise(r=>setTimeout(r,120));
    return {skipped:false,count:document.querySelectorAll('#productGrid .product-card').length,neighborStable:neighbor?.isConnected&&[...document.querySelectorAll('#productGrid .product-card')].includes(neighbor)};
  });
  ok(variant.skipped||(variant.count===24&&variant.neighborStable),'mobile: variant local render');

  const question=await page.$('#questionButton');
  if(question){await physicalClick(page,'#questionButton','mobile question');await pause(80);ok(await page.$eval('#questionDialog',e=>e.open),'mobile: question dialog');await page.keyboard.press('Escape');await pause(50);}
  const delivery=await page.$('.delivery-payment-button');
  if(delivery){await physicalClick(page,'.delivery-payment-button','mobile delivery');await pause(80);const open=await page.$eval('#deliveryDialog',e=>e.open).catch(()=>false);ok(open,'mobile: delivery dialog');await page.keyboard.press('Escape');await pause(50);}

  await assertNoOverflow(page,'mobile final');
  ok(pageErrors.length===0,'mobile page errors: '+pageErrors.join(' | '));
  console.log('MOBILE_OK',JSON.stringify({imgs,detailMain,variant,contacts,stage}));
  await page.close();
}

async function wide(width,height,label){
  const page=await browser.newPage();
  const pageErrors=[]; page.on('pageerror',e=>pageErrors.push(e.message));
  await openLocal(page,width,height);
  ok((await page.$$eval('#productGrid .product-card',x=>x.length))===24,`${label}: catalog count`);
  const pri=await page.$$eval('#productGrid img',nodes=>nodes.slice(0,5).map(i=>[i.loading,i.fetchPriority,i.getAttribute('src')]));
  ok(pri[0][0]==='eager'&&pri[1][0]==='eager'&&pri[2][0]==='eager'&&pri[3][0]==='lazy',`${label}: image priority`);
  await physicalClick(page,'#filterToggle',`${label} filter`); await pause(80);
  ok(await page.$eval('#filters',e=>e.classList.contains('open')),`${label}: filter open`);
  await page.$eval('#filterToggle',e=>e.click()); await pause(50);
  ok(!(await page.$eval('#filters',e=>e.classList.contains('open'))),`${label}: filter close`);
  const hero=await page.$eval('main#top>.hero',e=>e.getBoundingClientRect().height);
  ok(hero<100,`${label}: compact hero regression ${hero}`);
  const page2=await page.$('#pagination [data-page="2"]'); if(page2){await physicalClick(page,'#pagination [data-page="2"]',`${label} pagination`);await pause(100);}
  await assertNoOverflow(page,`${label} final`);
  ok(pageErrors.length===0,`${label} page errors: ${pageErrors.join(' | ')}`);
  console.log(`${label.toUpperCase()}_OK`,JSON.stringify({pri,pagination:!!page2,hero}));
  await page.close();
}

try{
  await mobile();
  await wide(768,1024,'tablet');
  await wide(1440,1000,'desktop');
}finally{
  await browser.close();
}
