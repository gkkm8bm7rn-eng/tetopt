import { chromium } from 'playwright';

const viewports=[
  ['desktop-1440',1440,900],['desktop-1366',1366,768],['desktop-1280',1280,800],
  ['laptop-1024',1024,768],['tablet-820',820,1180],['tablet-768',768,1024],
  ['mobile-430',430,932],['mobile-390',390,844],['mobile-375',375,812],['mobile-360',360,800],['mobile-320',320,700],
  ['mobile-landscape',844,390]
];
const browser=await chromium.launch({headless:true});
const failures=[];
for(const [name,width,height] of viewports){
  const page=await browser.newPage({viewport:{width,height}});
  await page.goto('http://127.0.0.1:8000/',{waitUntil:'networkidle'});
  await page.waitForSelector('.product-card',{timeout:20000});

  const layout=await page.evaluate(()=>{
    const viewport=document.documentElement.clientWidth;
    const selectors=['body','.site-header','main','.hero','.catalog-section','.catalog-layout','.catalog-content','.product-grid','footer#delivery'];
    const bad=selectors.flatMap(sel=>[...document.querySelectorAll(sel)].map(el=>{
      const r=el.getBoundingClientRect();return {sel,left:r.left,right:r.right,width:r.width};
    })).filter(x=>x.left < -2 || x.right > viewport+2);
    const row=document.querySelector('.category-row');
    const rowStyle=row?getComputedStyle(row):null;
    return {bodyOverflow:document.body.scrollWidth-document.body.clientWidth,bad,categoryScrollable:!!row&&['auto','scroll'].includes(rowStyle.overflowX)&&row.scrollWidth>=row.clientWidth};
  });
  if(layout.bodyOverflow>2)failures.push(`${name}: body horizontal overflow ${layout.bodyOverflow}px`);
  if(layout.bad.length)failures.push(`${name}: major layout outside viewport ${JSON.stringify(layout.bad.slice(0,4))}`);
  if(!layout.categoryScrollable)failures.push(`${name}: category row is not safely horizontally scrollable`);

  const fav=page.locator('.product-card button[data-favorite]').first();
  const beforeFav=Number(await page.locator('#favoritesCount').textContent()||0);
  await fav.click();
  const afterFav=Number(await page.locator('#favoritesCount').textContent()||0);
  if(afterFav!==beforeFav+1)failures.push(`${name}: favorite did not increment`);
  if(await page.locator('#productDialog').evaluate(el=>el.open))failures.push(`${name}: favorite opened product dialog`);
  await fav.click();

  const add=page.locator('.product-card .quick-add').first();
  if(!(await add.isVisible())) failures.push(`${name}: quick-add not visible`);
  else {
    const box=await add.boundingBox();
    if(!box||box.x<0||box.x+box.width>width+1) failures.push(`${name}: quick-add outside viewport`);
    const beforeCart=Number(await page.locator('#cartCount').textContent()||0);
    await add.click();
    const afterCart=Number(await page.locator('#cartCount').textContent()||0);
    if(afterCart!==beforeCart+1)failures.push(`${name}: quick-add did not increment cart`);
    if(await page.locator('#productDialog').evaluate(el=>el.open))failures.push(`${name}: quick-add opened product dialog`);
  }

  const info=page.locator('.product-card .product-info').first();
  await info.click({position:{x:10,y:10}});
  await page.waitForTimeout(80);
  if(!(await page.locator('#productDialog').evaluate(el=>el.open)))failures.push(`${name}: product info did not open dialog`);
  if(await page.locator('#productDialog').evaluate(el=>el.open)) await page.locator('[data-close-dialog]').click();

  await page.locator('#cartButton').click();
  if(!(await page.locator('#cartDialog').evaluate(el=>el.open)))failures.push(`${name}: cart button did not open drawer`);
  if(await page.locator('#cartDialog').evaluate(el=>el.open)) await page.locator('[data-close-cart]').click();

  await page.screenshot({path:`audit-${name}.png`,fullPage:true});
  await page.close();
}
await browser.close();
if(failures.length){console.error('AUDIT FAILURES\n'+failures.join('\n'));process.exit(1)}
console.log(`Responsive interaction audit passed for all ${viewports.length} viewport profiles.`);
