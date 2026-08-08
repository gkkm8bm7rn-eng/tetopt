import { chromium, webkit } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const BASE_URL = process.env.NEXT_BASE_URL || 'http://127.0.0.1:4173/next/';
const ENGINE = process.env.BROWSER_ENGINE || 'chromium';
const browserType = ENGINE === 'webkit' ? webkit : chromium;
const OUT_DIR = process.env.NEXT_E2E_OUT || `artifacts/next-client-${ENGINE}`;

const viewports = [
  { name: 'phone-320', width: 320, height: 740, expectedColumns: 2 },
  { name: 'iphone-390', width: 390, height: 844, expectedColumns: 2 },
  { name: 'android-412', width: 412, height: 915, expectedColumns: 2 },
  { name: 'tablet-768', width: 768, height: 1024, expectedColumns: 3 },
  { name: 'laptop-1280', width: 1280, height: 800, expectedColumns: 4 },
  { name: 'desktop-1440', width: 1440, height: 900, expectedColumns: 4 },
];

function assert(condition, message) { if (!condition) throw new Error(message); }

async function waitForCatalog(page) {
  await page.waitForSelector('.product-card', { timeout: 20_000 });
  await page.waitForFunction(() => Number(document.querySelector('#model-count')?.textContent?.replace(/\D/g, '')) > 0, null, { timeout: 20_000 });
}

async function getColumns(page) {
  return page.locator('.product-grid').evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').filter(Boolean).length);
}

async function assertFirstCardPainted(page, cfg) {
  const firstCard = page.locator('.product-card').first();
  const firstName = firstCard.locator('.card-name');
  const firstPrice = firstCard.locator('.card-price');
  const nameText = (await firstName.textContent())?.trim() || '';
  const priceText = (await firstPrice.textContent())?.trim() || '';
  assert(nameText.length > 0, `${ENGINE}/${cfg.name}: у первой карточки пустое название`);
  assert(priceText.length > 0, `${ENGINE}/${cfg.name}: у первой карточки пустая цена`);
  assert(await firstName.isVisible(), `${ENGINE}/${cfg.name}: название первой карточки не видно`);
  assert(await firstPrice.isVisible(), `${ENGINE}/${cfg.name}: цена первой карточки не видна`);
  const cardStyle = await firstCard.evaluate(el => ({
    contentVisibility: getComputedStyle(el).contentVisibility,
    visibility: getComputedStyle(el).visibility,
    opacity: Number(getComputedStyle(el).opacity),
  }));
  assert(cardStyle.contentVisibility !== 'auto', `${ENGINE}/${cfg.name}: content-visibility:auto запрещён из-за WebKit blank-card regression`);
  assert(cardStyle.visibility === 'visible' && cardStyle.opacity > 0, `${ENGINE}/${cfg.name}: первая карточка скрыта стилями`);
  const nameBox = await firstName.boundingBox();
  const priceBox = await firstPrice.boundingBox();
  assert(nameBox && nameBox.width > 1 && nameBox.height > 1, `${ENGINE}/${cfg.name}: название первой карточки не имеет видимого размера`);
  assert(priceBox && priceBox.width > 1 && priceBox.height > 1, `${ENGINE}/${cfg.name}: цена первой карточки не имеет видимого размера`);
}

async function checkViewport(browser, cfg) {
  const context = await browser.newContext({ viewport: { width: cfg.width, height: cfg.height }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const consoleErrors = [], pageErrors = [], failedRequests = [];
  page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('requestfailed', request => failedRequests.push(`${request.method()} ${request.url()} :: ${request.failure()?.errorText || 'failed'}`));

  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await waitForCatalog(page);
  const modelCount = Number((await page.locator('#model-count').textContent()).replace(/\D/g, ''));
  const variantCount = Number((await page.locator('#variant-count').textContent()).replace(/\D/g, ''));
  assert(modelCount === 542, `${ENGINE}/${cfg.name}: ожидалось 542 модели, получено ${modelCount}`);
  assert(variantCount === 1196, `${ENGINE}/${cfg.name}: ожидалось 1196 вариантов, получено ${variantCount}`);
  const initialCards = await page.locator('.product-card').count();
  assert(initialCards === 24, `${ENGINE}/${cfg.name}: первая порция должна содержать 24 карточки, получено ${initialCards}`);
  const columns = await getColumns(page);
  assert(columns === cfg.expectedColumns, `${ENGINE}/${cfg.name}: ожидалось ${cfg.expectedColumns} колонок, получено ${columns}`);
  await assertFirstCardPainted(page, cfg);

  const firstImage = page.locator('.card-image').first();
  await firstImage.waitFor({ state: 'visible' });
  await firstImage.evaluate(img => img.decode?.().catch(() => {}));
  assert(await firstImage.evaluate(img => img.complete && img.naturalWidth > 0), `${ENGINE}/${cfg.name}: первое изображение карточки не загрузилось`);
  const loading = await page.locator('.card-image').evaluateAll(images => images.slice(0, 6).map(img => img.loading));
  assert(loading.slice(0, 4).every(value => value === 'eager'), `${ENGINE}/${cfg.name}: первые четыре изображения должны быть eager`);
  assert(loading.slice(4).every(value => value === 'lazy'), `${ENGINE}/${cfg.name}: изображения после первых четырёх должны быть lazy`);

  await fs.mkdir(OUT_DIR, { recursive: true });
  await page.screenshot({ path: path.join(OUT_DIR, `${cfg.name}-catalog.png`), fullPage: true });

  await page.locator('#search').fill('Fluffy');
  await page.waitForTimeout(250);
  const fluffyNames = (await page.locator('.product-card .card-name').allTextContents()).map(name => name.trim());
  assert(fluffyNames.length === 3, `${ENGINE}/${cfg.name}: поиск Fluffy должен показывать 3 карточки, получено ${fluffyNames.length}: ${fluffyNames.join(' | ')}`);
  assert(fluffyNames.includes('Кресло Флаффи/Fluffy — крестовина без колес'), `${ENGINE}/${cfg.name}: не найдена Fluffy без колес`);
  assert(fluffyNames.includes('Кресло Флаффи/Fluffy — колесная база'), `${ENGINE}/${cfg.name}: не найдена Fluffy на колесной базе`);
  assert(fluffyNames.includes('Кресло Флаффи/Fluffy'), `${ENGINE}/${cfg.name}: потеряна исходная отдельная Fluffy-группа`);
  await page.locator('#search').fill('');
  await page.waitForTimeout(250);

  await page.locator('.product-card .card-open').first().click();
  await page.waitForSelector('#product-dialog[open]', { timeout: 5_000 });
  const dialogImage = page.locator('#dialog-main-image');
  await dialogImage.evaluate(img => img.decode?.().catch(() => {}));
  assert(await dialogImage.evaluate(img => img.complete && img.naturalWidth > 0), `${ENGINE}/${cfg.name}: главное фото в карточке товара не загрузилось`);
  await page.screenshot({ path: path.join(OUT_DIR, `${cfg.name}-dialog.png`) });
  if (await page.locator('[data-gallery-step]').count() >= 2) {
    const before = await dialogImage.getAttribute('src');
    await page.locator('[data-gallery-step="1"]').click();
    assert(before !== await dialogImage.getAttribute('src'), `${ENGINE}/${cfg.name}: стрелка галереи не меняет изображение`);
  }

  await page.locator('.dialog-favorite').click();
  await page.locator('#dialog-close').click();
  assert(Number(await page.locator('#favorite-count').textContent()) >= 1, `${ENGINE}/${cfg.name}: избранное не сохраняет модель`);
  await page.locator('[data-action="favorites"]').click();
  assert(await page.locator('.product-card').count() >= 1, `${ENGINE}/${cfg.name}: избранное пусто после добавления`);
  await page.locator('[data-action="all"]').click();

  await page.locator('.product-card .card-open').first().click();
  const addCart = page.locator('.add-cart');
  await addCart.click();
  assert((await addCart.textContent()).includes('В заказе'), `${ENGINE}/${cfg.name}: товар не добавился в заказ`);
  await page.locator('#dialog-close').click();
  assert(Number(await page.locator('#cart-count').textContent()) >= 1, `${ENGINE}/${cfg.name}: счётчик заказа не обновился`);
  await page.locator('[data-action="cart"]').click();
  assert(await page.locator('.product-card').count() >= 1, `${ENGINE}/${cfg.name}: заказ пуст после добавления`);

  assert(pageErrors.length === 0, `${ENGINE}/${cfg.name}: pageerror: ${pageErrors.join(' | ')}`);
  assert(consoleErrors.length === 0, `${ENGINE}/${cfg.name}: console.error: ${consoleErrors.join(' | ')}`);
  assert(failedRequests.length === 0, `${ENGINE}/${cfg.name}: failed requests: ${failedRequests.slice(0, 5).join(' | ')}`);
  await context.close();
  return { engine: ENGINE, viewport: cfg.name, modelCount, variantCount, columns, initialCards };
}

const browser = await browserType.launch({ headless: true });
const results = [];
try { for (const cfg of viewports) results.push(await checkViewport(browser, cfg)); }
finally { await browser.close(); }
await fs.mkdir(OUT_DIR, { recursive: true });
await fs.writeFile(path.join(OUT_DIR, 'results.json'), JSON.stringify({ ok: true, engine: ENGINE, baseUrl: BASE_URL, results }, null, 2));
console.log(JSON.stringify({ ok: true, engine: ENGINE, results }, null, 2));
