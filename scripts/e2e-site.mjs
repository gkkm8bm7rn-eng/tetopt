import { chromium } from 'playwright';

const baseUrl = process.env.SITE_URL || 'http://127.0.0.1:4173/';
const viewports = [
  { name: 'narrow-phone', width: 320, height: 700 },
  { name: 'phone', width: 390, height: 844 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1440, height: 1000 }
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function waitForStorefront(page) {
  await page.waitForSelector('.hero-main', { timeout: 120_000 });
  await page.waitForSelector('#grid .card', { timeout: 120_000 });
  await page.waitForFunction(() => {
    const title = document.querySelector('.hero-main h1')?.textContent || '';
    return /Дом, в который хочется возвращаться/i.test(title);
  }, null, { timeout: 30_000 });
}

async function checkViewport(browser, viewport) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));

  await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await waitForStorefront(page);

  const result = await page.evaluate(() => {
    const announcement = document.querySelector('.announcement');
    const header = document.querySelector('header');
    const hero = document.querySelector('.hero-main');
    const stats = [...document.querySelectorAll('.forma-hero-stat')];
    const cta = document.querySelector('.hero-actions .btn-primary, .hero-actions a[href*="#catalog"]');
    const cards = [...document.querySelectorAll('#grid .card')];
    const firstImages = [...document.querySelectorAll('#grid .product-photo')].slice(0, 8);
    const topText = [announcement, header, hero].filter(Boolean).map(node => node.textContent || '').join(' ').toLowerCase();
    return {
      viewportWidth: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      announcementPosition: announcement ? getComputedStyle(announcement).position : '',
      headerPosition: header ? getComputedStyle(header).position : '',
      heroWidth: hero?.getBoundingClientRect().width || 0,
      heroContainerWidth: hero?.parentElement?.getBoundingClientRect().width || 0,
      statCount: stats.length,
      hasCta: Boolean(cta),
      cardCount: cards.length,
      hasObsoleteTopBadges: /бесплатн\w*\s+достав|подтвержден\w*\s+цен/.test(topText),
      imageHints: firstImages.map(image => ({ loading: image.loading, decoding: image.decoding }))
    };
  });

  assert(result.documentWidth <= result.viewportWidth + 1, `${viewport.name}: горизонтальное переполнение ${result.documentWidth}px при viewport ${result.viewportWidth}px`);
  assert(['fixed', 'sticky'].includes(result.announcementPosition), `${viewport.name}: верхнее уведомление не закреплено`);
  assert(['fixed', 'sticky'].includes(result.headerPosition), `${viewport.name}: шапка не закреплена`);
  assert(result.heroWidth > 0 && result.heroWidth >= result.heroContainerWidth * 0.94, `${viewport.name}: баннер не занимает доступную ширину`);
  assert(result.statCount === 2, `${viewport.name}: ожидаются две статистические кнопки, найдено ${result.statCount}`);
  assert(result.hasCta, `${viewport.name}: отсутствует кнопка перехода к товарам`);
  assert(result.cardCount > 0, `${viewport.name}: каталог не отрисован`);
  assert(!result.hasObsoleteTopBadges, `${viewport.name}: в верхней части вернулись старые промо-бейджи`);
  assert(result.imageHints.every(item => item.decoding === 'async'), `${viewport.name}: не все изображения декодируются асинхронно`);
  assert(result.imageHints.slice(4).every(item => item.loading === 'lazy'), `${viewport.name}: изображения за первым экраном не переведены в lazy-loading`);
  assert(errors.length === 0, `${viewport.name}: ошибки страницы: ${errors.join(' | ')}`);

  await context.close();
  console.log(`✓ ${viewport.name}: ${viewport.width}×${viewport.height}`);
}

async function checkSearchAndProduct(browser) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));

  await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await waitForStorefront(page);

  const firstTitle = (await page.locator('#grid .card h3').first().textContent())?.trim() || '';
  assert(firstTitle, 'У первой карточки нет названия');
  await page.locator('#search').fill(firstTitle);
  await page.waitForFunction(title => {
    const cards = [...document.querySelectorAll('#grid .card')].filter(card => card.offsetParent !== null);
    return cards.length > 0 && cards.some(card => (card.querySelector('h3')?.textContent || '').trim() === title);
  }, firstTitle, { timeout: 20_000 });

  const card = page.locator('#grid .card').filter({ hasText: firstTitle }).first();
  await card.locator('.product-photo').click({ force: true });
  await page.waitForSelector('#modal.show', { timeout: 30_000 });
  assert(await page.locator('#modal .modal-content').count() === 1, 'Карточка товара не открылась');
  assert(errors.length === 0, `Поиск/карточка: ошибки страницы: ${errors.join(' | ')}`);

  await context.close();
  console.log('✓ Поиск находит товар, карточка товара открывается без ошибок');
}

async function checkSlowConnectionShell(browser) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.route('**/catalog-source.html*', async route => {
    await new Promise(resolve => setTimeout(resolve, 1800));
    await route.continue();
  });
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  assert(await page.locator('.boot-hero').isVisible(), 'При медленной загрузке не показывается облегчённый баннер');
  await waitForStorefront(page);
  await context.close();
  console.log('✓ Медленное соединение: первый экран остаётся видимым до загрузки каталога');
}

async function checkLegacyOfflineLayerDisabled(browser) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'allow' });
  const page = await context.newPage();
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await waitForStorefront(page);
  await page.waitForTimeout(250);

  const state = await page.evaluate(async () => {
    const registrations = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistrations() : [];
    const cacheNames = 'caches' in window ? await caches.keys() : [];
    return {
      registrations: registrations.length,
      formaCaches: cacheNames.filter(name => name.startsWith('forma-')).length,
      bootstrap: window.__formaPerformanceBootstrapV8 || null
    };
  });

  assert(state.registrations === 0, `Старый service worker всё ещё зарегистрирован: ${state.registrations}`);
  assert(state.formaCaches === 0, `Остались старые кэши FORMA HOME: ${state.formaCaches}`);
  assert(state.bootstrap?.serviceWorkerDisabled === true, 'Bootstrap не подтверждает отключение старого service worker');
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 120_000 });
  await waitForStorefront(page);
  assert(await page.locator('#grid .card').count() > 0, 'После повторной загрузки каталог не отрисован');
  await context.close();
  console.log('✓ Старый offline-кэш отключён; повторная загрузка каталога работает');
}

const browser = await chromium.launch({ headless: true });
try {
  for (const viewport of viewports) await checkViewport(browser, viewport);
  await checkSearchAndProduct(browser);
  await checkSlowConnectionShell(browser);
  await checkLegacyOfflineLayerDisabled(browser);
  console.log('✓ Основная браузерная проверка завершена успешно');
} finally {
  await browser.close();
}
