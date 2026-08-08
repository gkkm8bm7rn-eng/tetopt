import { chromium } from 'playwright';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:4173/next/';
const viewports = [
  { name: 'iphone-narrow', width: 320, height: 700 },
  { name: 'iphone', width: 390, height: 844 },
  { name: 'android', width: 412, height: 915 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'laptop', width: 1280, height: 800 },
  { name: 'desktop', width: 1440, height: 900 },
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const browser = await chromium.launch({ headless: true });
try {
  for (const viewport of viewports) {
    const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height } });
    const errors = [];
    page.on('pageerror', error => errors.push(`pageerror: ${error.message}`));
    page.on('console', msg => { if (msg.type() === 'error') errors.push(`console: ${msg.text()}`); });

    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForFunction(() => document.querySelectorAll('.product-card').length > 0, null, { timeout: 30000 });

    const counts = await page.evaluate(() => ({
      cards: document.querySelectorAll('.product-card').length,
      models: document.querySelector('#model-count')?.textContent?.trim(),
      variants: document.querySelector('#variant-count')?.textContent?.trim(),
      bodyWidth: document.body.scrollWidth,
      innerWidth: window.innerWidth,
      columns: getComputedStyle(document.querySelector('.product-grid')).gridTemplateColumns.split(' ').length,
    }));

    assert(counts.cards === 24, `${viewport.name}: ожидалось 24 карточки, найдено ${counts.cards}`);
    assert(counts.models && counts.models !== '—', `${viewport.name}: не показано число моделей`);
    assert(counts.variants && counts.variants !== '—', `${viewport.name}: не показано число вариантов`);
    assert(counts.bodyWidth <= counts.innerWidth + 1, `${viewport.name}: горизонтальный overflow ${counts.bodyWidth}/${counts.innerWidth}`);
    if (viewport.width <= 412) assert(counts.columns === 2, `${viewport.name}: на мобильном ожидалось 2 колонки, найдено ${counts.columns}`);

    await page.fill('#search', 'Fluffy');
    await page.waitForTimeout(250);
    const fluffyCount = await page.locator('.product-card').count();
    assert(fluffyCount >= 2, `${viewport.name}: поиск Fluffy должен показывать как минимум две конструктивные модели`);
    await page.fill('#search', '');
    await page.waitForTimeout(250);

    await page.locator('.product-card .card-open').first().click();
    await page.waitForSelector('#product-dialog[open]', { timeout: 5000 });
    assert(await page.locator('.dialog-main-image').count() === 1, `${viewport.name}: модалка без главного изображения`);

    const variantButtons = page.locator('.variant-pill');
    if (await variantButtons.count()) await variantButtons.first().click();
    const colorButtons = page.locator('.color-pill');
    if (await colorButtons.count() > 1) await colorButtons.nth(1).click();

    const favorite = page.locator('.dialog-favorite');
    await favorite.click();
    await page.click('#dialog-close');
    await page.click('[data-action="favorites"]');
    await page.waitForTimeout(100);
    assert(await page.locator('.product-card').count() >= 1, `${viewport.name}: избранное не показывает отмеченную модель`);
    await page.click('[data-action="all"]');

    await page.locator('.product-card .card-open').first().click();
    await page.locator('.add-cart').click();
    await page.click('#dialog-close');
    await page.click('[data-action="cart"]');
    await page.waitForTimeout(100);
    assert(await page.locator('.product-card').count() >= 1, `${viewport.name}: заказ не показывает добавленную позицию`);

    assert(errors.length === 0, `${viewport.name}: ошибки JS: ${errors.join(' | ')}`);
    await page.close();
    console.log(`✓ ${viewport.name} ${viewport.width}x${viewport.height}`);
  }
} finally {
  await browser.close();
}
