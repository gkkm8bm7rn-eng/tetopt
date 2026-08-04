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
      imageHints: firstImages.map(image => ({
        loading: image.loading,
        decoding: image.decoding,
        priority: image.fetchPriority
      }))
    };
  });

  assert(result.documentWidth <= result.viewportWidth + 1, `${viewport.name}: горизонтальное переполнение ${result.documentWidth}px при viewport ${result.viewportWidth}px`);
  assert(result.announcementPosition === 'sticky', `${viewport.name}: верхнее уведомление не закреплено`);
  assert(result.headerPosition === 'sticky', `${viewport.name}: шапка не закреплена`);
  assert(result.heroWidth > 0 && result.heroWidth >= result.heroContainerWidth * 0.94, `${viewport.name}: баннер не занимает доступную ширину`);
  assert(result.statCount === 2, `${viewport.name}: ожидаются две статистические кнопки, найдено ${result.statCount}`);
  assert(result.hasCta, `${viewport.name}: отсутствует кнопка «Смотреть товары»`);
  assert(result.cardCount > 0, `${viewport.name}: каталог не отрисован`);
  assert(result.imageHints.every(item => item.decoding === 'async'), `${viewport.name}: не все изображения декодируются асинхронно`);
  assert(result.imageHints.slice(4).every(item => item.loading === 'lazy'), `${viewport.name}: изображения за первым экраном не переведены в lazy-loading`);
  assert(errors.length === 0, `${viewport.name}: ошибки страницы: ${errors.join(' | ')}`);

  await context.close();
  console.log(`✓ ${viewport.name}: ${viewport.width}×${viewport.height}`);
}

async function checkSlowConnectionShell(browser) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();

  await page.route('**/catalog-source.html*', async route => {
    await new Promise(resolve => setTimeout(resolve, 1800));
    await route.continue();
  });

  await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  const shellVisible = await page.locator('.boot-hero').isVisible();
  assert(shellVisible, 'При медленной загрузке не показывается облегчённый баннер');
  await waitForStorefront(page);

  await context.close();
  console.log('✓ Медленное соединение: облегчённый первый экран отображается до каталога');
}

async function checkOfflineRepeatVisit(browser) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'allow' });
  const page = await context.newPage();

  await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await waitForStorefront(page);
  await page.evaluate(async () => {
    if ('serviceWorker' in navigator) {
      await navigator.serviceWorker.ready;
    }
  });

  await page.reload({ waitUntil: 'domcontentloaded', timeout: 120_000 });
  await waitForStorefront(page);
  await context.setOffline(true);
  await page.goto(`${baseUrl}?offline-e2e=1`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await waitForStorefront(page);

  const cards = await page.locator('#grid .card').count();
  assert(cards > 0, 'При повторном офлайн-открытии каталог не восстановился из кэша');

  await context.setOffline(false);
  await context.close();
  console.log('✓ Повторное посещение без сети: интерфейс и каталог восстановлены из кэша');
}

const browser = await chromium.launch({ headless: true });
try {
  for (const viewport of viewports) {
    await checkViewport(browser, viewport);
  }
  await checkSlowConnectionShell(browser);
  await checkOfflineRepeatVisit(browser);
  console.log('✓ Все браузерные проверки завершены успешно');
} finally {
  await browser.close();
}
