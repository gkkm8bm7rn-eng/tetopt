import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const BASE_URL = process.env.NEXT_BASE_URL || 'http://127.0.0.1:4173/next/';
const OUT_DIR = process.env.NEXT_E2E_OUT || 'artifacts/next-client';

const viewports = [
  { name: 'phone-320', width: 320, height: 740, expectedColumns: 2 },
  { name: 'iphone-390', width: 390, height: 844, expectedColumns: 2 },
  { name: 'android-412', width: 412, height: 915, expectedColumns: 2 },
  { name: 'tablet-768', width: 768, height: 1024, expectedColumns: 3 },
  { name: 'laptop-1280', width: 1280, height: 800, expectedColumns: 4 },
  { name: 'desktop-1440', width: 1440, height: 900, expectedColumns: 4 },
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function waitForCatalog(page) {
  await page.waitForSelector('.product-card', { timeout: 20_000 });
  await page.waitForFunction(() => {
    const modelCount = document.querySelector('#model-count')?.textContent?.replace(/\D/g, '');
    return Number(modelCount) > 0;
  }, null, { timeout: 20_000 });
}

async function getColumns(page) {
  return page.locator('.product-grid').evaluate(el => {
    const value = getComputedStyle(el).gridTemplateColumns;
    return value.split(' ').filter(Boolean).length;
  });
}

async function checkViewport(browser, cfg) {
  const context = await browser.newContext({ viewport: { width: cfg.width, height: cfg.height }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  const failedRequests = [];

  page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('requestfailed', request => failedRequests.push(`${request.method()} ${request.url()} :: ${request.failure()?.errorText || 'failed'}`));

  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await waitForCatalog(page);

  const modelCount = Number((await page.locator('#model-count').textContent()).replace(/\D/g, ''));
  const variantCount = Number((await page.locator('#variant-count').textContent()).replace(/\D/g, ''));
  assert(modelCount === 542, `${cfg.name}: ожидалось 542 модели, получено ${modelCount}`);
  assert(variantCount === 1196, `${cfg.name}: ожидалось 1196 вариантов, получено ${variantCount}`);

  const initialCards = await page.locator('.product-card').count();
  assert(initialCards === 24, `${cfg.name}: первая порция должна содержать 24 карточки, получено ${initialCards}`);

  const columns = await getColumns(page);
  assert(columns === cfg.expectedColumns, `${cfg.name}: ожидалось ${cfg.expectedColumns} колонок, получено ${columns}`);

  const firstImage = page.locator('.card-image').first();
  await firstImage.waitFor({ state: 'visible' });
  await firstImage.evaluate(img => img.decode?.().catch(() => {}));
  const firstImageOk = await firstImage.evaluate(img => img.complete && img.naturalWidth > 0 && img.naturalHeight > 0);
  assert(firstImageOk, `${cfg.name}: первое изображение карточки не загрузилось`);

  const loadAttrs = await page.locator('.card-image').evaluateAll(images => images.slice(0, 6).map(img => ({ loading: img.loading, priority: img.fetchPriority })));
  assert(loadAttrs.slice(0, 4).every(item => item.loading === 'eager'), `${cfg.name}: первые четыре изображения должны быть eager`);
  assert(loadAttrs.slice(4).every(item => item.loading === 'lazy'), `${cfg.name}: изображения после первых четырёх должны быть lazy`);

  await page.locator('#search').fill('Fluffy');
  await page.waitForTimeout(250);
  const fluffyNames = (await page.locator('.product-card .card-name').allTextContents()).map(name => name.trim());
  assert(fluffyNames.length === 3, `${cfg.name}: поиск Fluffy должен показывать 3 логические карточки, получено ${fluffyNames.length}: ${fluffyNames.join(' | ')}`);
  assert(fluffyNames.includes('Кресло Флаффи/Fluffy — крестовина без колес'), `${cfg.name}: не найдена отдельная Fluffy на крестовине без колес`);
  assert(fluffyNames.includes('Кресло Флаффи/Fluffy — колесная база'), `${cfg.name}: не найдена отдельная Fluffy на колесной базе`);
  assert(fluffyNames.includes('Кресло Флаффи/Fluffy'), `${cfg.name}: потеряна исходная отдельная Fluffy-группа`);
  await page.locator('#search').fill('');
  await page.waitForTimeout(250);

  await page.locator('.product-card .card-open').first().click();
  await page.waitForSelector('#product-dialog[open]', { timeout: 5_000 });
  const dialogImage = page.locator('#dialog-main-image');
  await dialogImage.evaluate(img => img.decode?.().catch(() => {}));
  assert(await dialogImage.evaluate(img => img.complete && img.naturalWidth > 0), `${cfg.name}: главное фото в карточке товара не загрузилось`);

  const galleryArrows = await page.locator('[data-gallery-step]').count();
  if (galleryArrows >= 2) {
    const before = await dialogImage.getAttribute('src');
    await page.locator('[data-gallery-step="1"]').click();
    const after = await dialogImage.getAttribute('src');
    assert(before !== after, `${cfg.name}: стрелка галереи не меняет изображение`);
  }

  const favoriteButton = page.locator('.dialog-favorite');
  await favoriteButton.click();
  await page.locator('#dialog-close').click();
  assert(Number(await page.locator('#favorite-count').textContent()) >= 1, `${cfg.name}: избранное не сохраняет выбранную модель`);
  await page.locator('[data-action="favorites"]').click();
  await page.waitForTimeout(100);
  assert((await page.locator('.product-card').count()) >= 1, `${cfg.name}: представление избранного пусто после добавления`);
  await page.locator('[data-action="all"]').click();

  await page.locator('.product-card .card-open').first().click();
  const addCart = page.locator('.add-cart');
  await addCart.click();
  assert((await addCart.textContent()).includes('В заказе'), `${cfg.name}: кнопка заказа не переключилась после добавления`);
  await page.locator('#dialog-close').click();
  assert(Number(await page.locator('#cart-count').textContent()) >= 1, `${cfg.name}: счётчик заказа не обновился`);
  await page.locator('[data-action="cart"]').click();
  await page.waitForTimeout(100);
  assert((await page.locator('.product-card').count()) >= 1, `${cfg.name}: представление заказа пусто после добавления`);

  await fs.mkdir(OUT_DIR, { recursive: true });
  await page.screenshot({ path: path.join(OUT_DIR, `${cfg.name}.png`), fullPage: true });

  assert(pageErrors.length === 0, `${cfg.name}: pageerror: ${pageErrors.join(' | ')}`);
  assert(consoleErrors.length === 0, `${cfg.name}: console.error: ${consoleErrors.join(' | ')}`);
  assert(failedRequests.length === 0, `${cfg.name}: failed requests: ${failedRequests.slice(0, 5).join(' | ')}`);

  await context.close();
  return { viewport: cfg.name, modelCount, variantCount, columns, initialCards };
}

const browser = await chromium.launch({ headless: true });
const results = [];
try {
  for (const cfg of viewports) results.push(await checkViewport(browser, cfg));
} finally {
  await browser.close();
}

await fs.mkdir(OUT_DIR, { recursive: true });
await fs.writeFile(path.join(OUT_DIR, 'results.json'), JSON.stringify({ ok: true, baseUrl: BASE_URL, results }, null, 2));
console.log(JSON.stringify({ ok: true, results }, null, 2));
