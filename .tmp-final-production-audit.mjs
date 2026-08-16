import { chromium } from 'playwright';
import fs from 'fs';
const viewports=[['desktop',1440,900],['laptop',1024,768],['tablet',768,1024],['mobile430',430,932],['mobile390',390,844],['mobile360',360,800],['mobile320',320,700],['landscape',844,390]];
const failures=[];
const browser=await chromium.launch({headless:true});
for(const [name,width,height] of viewports){
 const page=await browser.newPage({viewport:{width,height}}); const errors=[];
 page.on('pageerror',e=>errors.push(String(e))); page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
 await page.goto('http://127.0.0.1:8000/',{waitUntil:'networkidle'}); await page.waitForSelector('.product-card',{timeout:20000});
 if(errors.length) failures.push(`${name}: JS errors ${errors.slice(0,3).join(' | ')}`);
 const bodyOverflow=await page.evaluate(()=>document.body.scrollWidth-document.body.clientWidth); if(bodyOverflow>2) failures.push(`${name}: body overflow ${bodyOverflow}`);
 const fav=page.locator('.product-card button[data-favorite]').first(); const f0=Number(await page.locator('#favoritesCount').textContent()); await fav.click(); const f1=Number(await page.locator('#favoritesCount').textContent()); if(f1!==f0+1)failures.push(`${name}: favorite`); if(await page.locator('#productDialog').evaluate(el=>el.open))failures.push(`${name}: favorite opened product`); await fav.click();
 const card=page.locator('.product-card').first(); const add=card.locator('.quick-add'); if(!(await add.isVisible())) failures.push(`${name}: quick-add hidden`); const c0=Number(await page.locator('#cartCount').textContent()); await add.click(); const c1=Number(await page.locator('#cartCount').textContent()); if(c1!==c0+1)failures.push(`${name}: quick-add`); if(await page.locator('#productDialog').evaluate(el=>el.open))failures.push(`${name}: add opened product`);
 await card.locator('.product-info').click({position:{x:10,y:10}}); if(!(await page.locator('#productDialog').evaluate(el=>el.open)))failures.push(`${name}: product info no open`); if(await page.locator('#productDialog').evaluate(el=>el.open))await page.locator('[data-close-dialog]').click();
 await page.locator('#cartButton').click(); if(!(await page.locator('#cartDialog').evaluate(el=>el.open))) failures.push(`${name}: cart no open`);
 const item=page.locator('.cart-item').first(); if(await item.count()){ const qty=item.locator('[data-qty]').last(); const beforeQty=Number(await item.locator('.qty span').textContent()); await qty.click(); const afterQty=Number(await page.locator('.cart-item').first().locator('.qty span').textContent()); if(afterQty!==beforeQty+1)failures.push(`${name}: qty`); if(!(await page.locator('#cartDialog').evaluate(el=>el.open))) failures.push(`${name}: qty closed cart`);
   await page.locator('.cart-item').first().locator('img').click(); await page.waitForTimeout(150); if(await page.locator('#cartDialog').evaluate(el=>el.open))failures.push(`${name}: cart item did not close cart`); if(!(await page.locator('#productDialog').evaluate(el=>el.open)))failures.push(`${name}: cart item did not open product`); if(await page.locator('#productDialog').evaluate(el=>el.open))await page.locator('[data-close-dialog]').click();
 }
 await page.locator('#searchInput').fill('стул'); await page.waitForTimeout(80); if((await page.locator('.product-card').count())<1)failures.push(`${name}: search no results`); await page.locator('#clearFilters').click().catch(()=>{});
 await page.screenshot({path:`final-audit-${name}.png`,fullPage:true}); await page.close();
}
await browser.close();
if(failures.length){console.error(failures.join('\n'));process.exit(1)}
console.log(`FINAL AUDIT PASSED: ${viewports.length} viewports`);
