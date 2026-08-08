import { chromium, webkit } from 'playwright';

const ENGINE = process.env.BROWSER_ENGINE || 'chromium';
const BASE_URL = process.env.NEXT_BASE_URL || 'http://127.0.0.1:4173/next/';
const browserType = ENGINE === 'webkit' ? webkit : chromium;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const browser = await browserType.launch({ headless: true });
try {
  for (const viewport of [
    { name: 'mobile', width: 390, height: 844 },
    { name: 'desktop', width: 1440, height: 900 },
  ]) {
    const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });

    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForSelector('.product-card', { timeout: 20_000 });
    const cards = page.locator('.product-card');
    assert(await cards.count() === 24, `${ENGINE}/${viewport.name}: ожидалось 24 карточки`);

    const lastCard = cards.nth(23);
    const lastImage = lastCard.locator('.card-image');
    assert(await lastImage.getAttribute('loading') === 'lazy', `${ENGINE}/${viewport.name}: последняя карточка первой порции должна быть lazy`);

    await lastCard.scrollIntoViewIfNeeded();
    await page.waitForTimeout(250);
    await page.waitForFunction(() => {
      const images = [...document.querySelectorAll('.product-card .card-image')];
      const img = images[23];
      return Boolean(img && img.complete && img.naturalWidth > 0);
    }, null, { timeout: 10_000 });

    const imageLoaded = await lastImage.evaluate(img => img.complete && img.naturalWidth > 0);
    assert(imageLoaded, `${ENGINE}/${viewport.name}: lazy-фото 24-й карточки не загрузилось после прокрутки`);
    const nameVisible = await lastCard.locator('.card-name').isVisible();
    const priceVisible = await lastCard.locator('.card-price').isVisible();
    assert(nameVisible && priceVisible, `${ENGINE}/${viewport.name}: содержимое 24-й карточки не видно после прокрутки`);

    await page.locator('#load-more').click();
    await page.waitForFunction(() => document.querySelectorAll('.product-card').length === 48, null, { timeout: 5_000 });
    const card48 = page.locator('.product-card').nth(47);
    await card48.scrollIntoViewIfNeeded();
    await page.waitForFunction(() => {
      const images = [...document.querySelectorAll('.product-card .card-image')];
      const img = images[47];
      return Boolean(img && img.complete && img.naturalWidth > 0);
    }, null, { timeout: 10_000 });
    assert(await card48.locator('.card-name').isVisible(), `${ENGINE}/${viewport.name}: 48-я карточка не отрисовалась`);
    assert(errors.length === 0, `${ENGINE}/${viewport.name}: ошибки после прокрутки: ${errors.join(' | ')}`);

    await context.close();
  }
} finally {
  await browser.close();
}

console.log(JSON.stringify({ ok: true, engine: ENGINE, check: 'lazy-scroll-and-load-more' }));
