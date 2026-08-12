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
  assert(['fixed', 'sticky'].includes(result.announcementPosition), `${viewport.name}: верхнее уведомление не закреплено`);
  assert(['fixed', 'sticky'].includes(result.headerPosition), `${viewport.name}: шапка не закреплена`);
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

async function checkCatalogColorAndPhotoInteractions(browser) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));

  await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await waitForStorefront(page);
  await page.waitForSelector('#grid .card:not(.product-color-duplicate-hidden) [data-color-product]', { timeout: 120_000 });

  const card = page.locator('#grid .card:not(.product-color-duplicate-hidden):has([data-color-product])').first();
  const swatches = card.locator('[data-color-product]');
  const swatchCount = await swatches.count();
  assert(swatchCount >= 2, `Для проверки переключения цветов найдено только ${swatchCount} варианта`);

  const initialProductId = Number(await card.getAttribute('data-product'));
  const hostId = Number((await card.getAttribute('data-color-host')) || initialProductId);
  const targetProductId = Number(await swatches.nth(1).getAttribute('data-color-product'));
  assert(Number.isFinite(targetProductId) && targetProductId !== initialProductId, 'Второй цвет не ведёт на другой товар');

  await swatches.nth(1).click();
  await page.waitForFunction(({ hostId, targetProductId }) => {
    const host = [...document.querySelectorAll('#grid .card')]
      .find(card => Number(card.dataset.colorHost) === hostId && Number(card.dataset.product) === targetProductId);
    return Boolean(
      host &&
      host.offsetParent !== null &&
      host.querySelector(`[data-color-product="${targetProductId}"]`)?.classList.contains('active') &&
      !document.querySelector('#modal')?.classList.contains('show')
    );
  }, { hostId, targetProductId }, { timeout: 30_000 });

  const switched = await card.evaluate((node, targetId) => ({
    productId: Number(node.dataset.product),
    imageProductId: Number(node.querySelector('.product-photo')?.dataset.productImage),
    addProductId: Number(node.querySelector('[data-add]')?.dataset.add),
    favoriteProductId: Number(node.querySelector('[data-favorite-toggle]')?.dataset.favoriteToggle || targetId),
    activeColorId: Number(node.querySelector('.color-swatch.active')?.dataset.colorProduct),
    title: node.querySelector('h3')?.textContent?.trim() || '',
    hidden: getComputedStyle(node).display === 'none'
  }), targetProductId);
  const expectedTitle = await page.evaluate(id => {
    try { return typeof productById === 'function' ? productById(id)?.name || '' : ''; }
    catch { return ''; }
  }, targetProductId);

  assert(switched.productId === targetProductId, 'Карточка не переключила идентификатор выбранного цвета');
  assert(switched.imageProductId === targetProductId, 'Фото карточки осталось привязано к предыдущему цвету');
  assert(switched.addProductId === targetProductId, 'Кнопка добавления в корзину осталась привязана к предыдущему цвету');
  assert(switched.favoriteProductId === targetProductId, 'Избранное осталось привязано к предыдущему цвету');
  assert(switched.activeColorId === targetProductId, 'Активный цветовой кружок не обновился');
  assert(!switched.hidden, 'Карточка исчезла после выбора цвета');
  assert(!expectedTitle || switched.title === expectedTitle, 'Название карточки не соответствует выбранному цвету');

  await card.locator('.product-photo').click({ force: true });
  await page.waitForSelector('#modal.show', { timeout: 30_000 });
  const openedProductId = await page.evaluate(() => {
    try { return Number(activeGallery?.productId); }
    catch { return NaN; }
  });
  const catalogZoomVisible = await page.locator('#formaImageZoom.show').count();
  assert(openedProductId === targetProductId, `По клику на фото открыт товар ${openedProductId}, ожидался ${targetProductId}`);
  assert(catalogZoomVisible === 0, 'Фото из каталога ошибочно открылось в режиме увеличения');

  await page.waitForSelector('#galleryMainImage.loaded', { timeout: 30_000 });
  await page.locator('#galleryMainImage').click({ force: true });
  await page.waitForSelector('#formaImageZoom.show', { timeout: 30_000 });
  assert(await page.locator('#modal.show').count() === 1, 'Карточка товара закрылась при увеличении внутренней фотографии');
  assert(errors.length === 0, `Переключение цвета/открытие фото: ошибки страницы: ${errors.join(' | ')}`);

  await context.close();
  console.log('✓ Цвет переключает карточку; фото каталога открывает товар; увеличение работает только внутри товара');
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
  console.log('✓ Устаревший service worker и его кэши отключены; повторная онлайн-загрузка работает');
}

const browser = await chromium.launch({ headless: true });
try {
  for (const viewport of viewports) {
    await checkViewport(browser, viewport);
  }
  await checkCatalogColorAndPhotoInteractions(browser);
  await checkSlowConnectionShell(browser);
  await checkLegacyOfflineLayerDisabled(browser);
  console.log('✓ Все браузерные проверки завершены успешно');
} finally {
  await browser.close();
}
