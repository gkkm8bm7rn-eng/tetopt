import { chromium, webkit } from 'playwright';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const base = process.argv[2] || 'http://127.0.0.1:4173/next/';
const requestedEngine = process.argv[3] || 'chromium';
const engine = requestedEngine === 'webkit' ? webkit : chromium;
const launchOptions = { headless: true };
if (requestedEngine === 'chromium' && process.env.CHROMIUM_PATH) launchOptions.executablePath = process.env.CHROMIUM_PATH;
const widths = [320, 390, 412, 430, 768, 1280, 1440];
const output = { engine: requestedEngine, widths: [], catalogRequests: 0, imageRequests: 0, errors: [] };
const screenshotsDir = process.env.SCREENSHOTS_DIR;
const browser = await engine.launch(launchOptions);

for (const width of widths) {
  const page = await browser.newPage({ viewport: { width, height: width < 768 ? 844 : 900 } });
  let catalogRequests = 0;
  let imageRequests = 0;
  page.on('request', request => {
    if (/\/catalog\.json(?:[?#]|$)/.test(request.url())) catalogRequests += 1;
    if (request.resourceType() === 'image') imageRequests += 1;
  });
  page.on('pageerror', error => output.errors.push(`${width}: ${error.message}`));
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.locator('.product-card').first().waitFor();
  const firstPageNames = await page.locator('.card-name').allTextContents();
  await page.getByLabel('Страница 2', { exact: true }).click();
  const secondPageNames = await page.locator('.card-name').allTextContents();
  if (firstPageNames.join('|') === secondPageNames.join('|')) throw new Error(`${width}px pagination did not change products`);
  await page.getByLabel('Страница 1', { exact: true }).click();
  await page.locator('#search').fill('Бомбей');
  if (await page.locator('.product-card').count() < 1) throw new Error(`${width}px search returned no cards`);
  await page.locator('#search').fill('');
  const categoryValue = await page.locator('#category-filter option').nth(1).getAttribute('value');
  await page.locator('#category-filter').selectOption(categoryValue);
  if (await page.locator('.product-card').count() < 1) throw new Error(`${width}px category filter returned no cards`);
  await page.locator('#category-filter').selectOption('');
  const singleVariantCards = await page.locator('.product-card', { has: page.locator('.card-meta:empty') }).count();
  const multiVariantCards = await page.locator('.product-card', { hasText: 'Доступно несколько исполнений' }).count();
  if (!multiVariantCards) throw new Error(`${width}px no multi-variant card was rendered`);
  await page.locator('.favorite-button').first().click();
  if (await page.locator('#favorite-count').textContent() !== '1') throw new Error(`${width}px favorite did not update`);
  await page.locator('.product-card .card-open').first().click();
  await page.locator('#product-dialog[open]').waitFor();
  const galleryImage = page.locator('#dialog-main-image');
  const beforeGallery = await galleryImage.getAttribute('src');
  if (await page.locator('[data-gallery-step="1"]').count()) {
    await page.locator('[data-gallery-step="1"]').click();
    if (await galleryImage.getAttribute('src') === beforeGallery) throw new Error(`${width}px gallery did not advance`);
  }
  const variantButton = page.locator('.dialog-axis-selectors button:not(.active):not([disabled])').first();
  if (await variantButton.count()) {
    const beforePrice = await page.locator('.dialog-price').textContent();
    const beforeCartSource = await page.locator('.add-cart').getAttribute('data-cart-id');
    await variantButton.click();
    await page.locator('#product-dialog[open]').waitFor();
    const afterCartSource = await page.locator('.add-cart').getAttribute('data-cart-id');
    if (beforeCartSource === afterCartSource) throw new Error(`${width}px variant sourceId did not change atomically`);
    output.widths.push({ width, singleVariantCards, multiVariantCards, variantSwitchChecked: true, priceBeforeSwitch: beforePrice });
  }
  await page.locator('.add-cart').click();
  if (await page.locator('#cart-count').textContent() !== '1') throw new Error(`${width}px cart did not update`);
  const geometry = await page.evaluate(() => {
    const dialog = document.querySelector('#product-dialog').getBoundingClientRect();
    return {
      bodyScrollWidth: document.body.scrollWidth,
      viewportWidth: innerWidth,
      cards: document.querySelectorAll('.product-card').length,
      dialog: { left: dialog.left, right: dialog.right, top: dialog.top, bottom: dialog.bottom, width: dialog.width, height: dialog.height },
      artifacts: /(?:^|\s)\+\d+\b|Вариант\s+\d+|Вариант товара|\bsourceId\b|\bID\s+\d+\b/i.test(document.body.textContent),
    };
  });
  if (geometry.bodyScrollWidth > width) throw new Error(`${width}px horizontal overflow: ${geometry.bodyScrollWidth}`);
  if (geometry.artifacts) throw new Error(`${width}px customer-facing artifact`);
  if (screenshotsDir) {
    await fs.mkdir(screenshotsDir, { recursive: true });
    await page.screenshot({ path: path.join(screenshotsDir, `next-${requestedEngine}-${width}.png`), fullPage: true });
  }
  const existing = output.widths.find(item => item.width === width) || {};
  Object.assign(existing, { width, catalogRequests, imageRequests, firstPageCards: firstPageNames.length, secondPageCards: secondPageNames.length, ...geometry });
  if (!output.widths.includes(existing)) output.widths.push(existing);
  output.catalogRequests += catalogRequests;
  output.imageRequests += imageRequests;
  await page.close();
}

await browser.close();
await fs.writeFile(path.join(os.tmpdir(), `forma-next-browser-${requestedEngine}.json`), `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify(output, null, 2));
