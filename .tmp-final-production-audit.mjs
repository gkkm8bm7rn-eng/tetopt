import { chromium } from 'playwright';
const viewports=[['desktop',1440,900],['laptop',1024,768],['tablet',768,1024],['mobile',390,844]];
const failures=[];
const browser=await chromium.launch({headless:true});
for(const [name,width,height] of viewports){
 const page=await browser.newPage({viewport:{width,height}}); page.setDefaultTimeout(5000); const errors=[];
 page.on('pageerror',e=>errors.push(String(e))); page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
 await page.goto('http://127.0.0.1:8000/',{waitUntil:'domcontentloaded'}); await page.waitForSelector('.product-card');
 if(errors.length)failures.push(`${name}: JS errors ${errors.slice(0,2).join(' | ')}`);
 if(await page.evaluate(()=>document.body.scrollWidth-document.body.clientWidth)>2)failures.push(`${name}: body overflow`);
 const card=page.locator('.product-card').first();
 const fav=card.locator('button[data-favorite]'); const f0=Number(await page.locator('#favoritesCount').textContent()); await fav.click(); if(Number(await page.locator('#favoritesCount').textContent())!==f0+1)failures.push(`${name}: favorite`); if(await page.locator('#productDialog').evaluate(el=>el.open))failures.push(`${name}: favorite opened product`); await fav.click();
 const add=card.locator('.quick-add'); if(!(await add.isVisible()))failures.push(`${name}: quick-add hidden`); const c0=Number(await page.locator('#cartCount').textContent()); await add.click(); if(Number(await page.locator('#cartCount').textContent())!==c0+1)failures.push(`${name}: quick-add`);
 await page.locator('#cartButton').click(); if(!(await page.locator('#cartDialog').evaluate(el=>el.open)))failures.push(`${name}: cart no open`);
 const item=page.locator('.cart-item').first(); if(!(await item.count())){failures.push(`${name}: cart empty`)}else{
   const qtyPlus=item.locator('[data-qty][data-delta="1"]'); const q0=Number(await item.locator('.qty span').textContent()); await qtyPlus.click(); const q1=Number(await page.locator('.cart-item').first().locator('.qty span').textContent()); if(q1!==q0+1)failures.push(`${name}: qty plus`); if(!(await page.locator('#cartDialog').evaluate(el=>el.open)))failures.push(`${name}: qty opened product`);
   await page.locator('.cart-item').first().locator('img').click(); await page.waitForFunction(()=>document.querySelector('#productDialog')?.open===true); if(await page.locator('#cartDialog').evaluate(el=>el.open))failures.push(`${name}: cart stayed open`); if(!(await page.locator('#productDialog').evaluate(el=>el.open)))failures.push(`${name}: cart item no product`); await page.locator('[data-close-dialog]').click();
 }
 await page.locator('#searchInput').fill('стул'); await page.waitForTimeout(100); if((await page.locator('.product-card').count())<1)failures.push(`${name}: search`);
 await page.close();
}
await browser.close();
if(failures.length){console.error(failures.join('\n'));process.exit(1)}
console.log(`FINAL REGRESSION AUDIT PASSED: ${viewports.length} viewports`);
