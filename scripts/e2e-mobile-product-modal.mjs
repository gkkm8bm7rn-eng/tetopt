import { chromium } from 'playwright';

const baseUrl = process.env.SITE_URL || 'http://127.0.0.1:4173/';
const viewports = [
  { name: 'narrow-phone', width: 320, height: 700 },
  { name: 'phone', width: 390, height: 844 },
  { name: 'phone-landscape', width: 667, height: 375 }
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function waitForCatalog(page) {
  await page.waitForSelector('#grid .card .product-photo', { timeout: 120_000 });
}

async function openFirstProduct(page) {
  const image = page.locator('#grid .card:not(.product-color-duplicate-hidden):not(.product-exact-duplicate-hidden) .product-photo').first();
  await image.scrollIntoViewIfNeeded();
  await image.click({ force: true });
  await page.waitForSelector('#modal.show .modal-grid', { timeout: 30_000 });
  await page.waitForFunction(() => {
    const modal = document.getElementById('modal');
    return Boolean(modal?.classList.contains('show') && modal.querySelector('.modal-content h2'));
  }, null, { timeout: 30_000 });
  await page.waitForTimeout(500);
}

async function checkViewport(browser, viewport) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));

  await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await waitForCatalog(page);
  await openFirstProduct(page);

  const metrics = await page.evaluate(() => {
    const modal = document.getElementById('modal');
    const grid = modal?.querySelector('.modal-grid');
    const gallery = modal?.querySelector('.gallery-panel');
    const content = modal?.querySelector('.modal-content');
    const title = content?.querySelector('h2');
    const price = content?.querySelector('.modal-price-stack');
    const actions = content?.querySelector('.journey-actions');
    const buttons = [...(actions?.querySelectorAll('button,.btn') || [])];
    const rect = element => element?.getBoundingClientRect() || null;
    const modalRect = rect(modal);
    const contentRect = rect(content);

    return {
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      documentWidth: document.documentElement.scrollWidth,
      modalRect,
      gridRect: rect(grid),
      galleryRect: rect(gallery),
      contentRect,
      titleRect: rect(title),
      priceRect: rect(price),
      modalScrollWidth: modal?.scrollWidth || 0,
      modalClientWidth: modal?.clientWidth || 0,
      gridScrollWidth: grid?.scrollWidth || 0,
      gridClientWidth: grid?.clientWidth || 0,
      contentScrollWidth: content?.scrollWidth || 0,
      contentClientWidth: content?.clientWidth || 0,
      gridOverflowY: grid ? getComputedStyle(grid).overflowY : '',
      actionsPosition: actions ? getComputedStyle(actions).position : '',
      buttonRects: buttons.map(rect),
      layoutAudit: window.__FORMA_PRODUCT_MODAL_LAYOUT__ || null
    };
  });

  const { modalRect, contentRect, titleRect, priceRect } = metrics;
  assert(modalRect, `${viewport.name}: модальное окно отсутствует`);
  assert(modalRect.left >= -1, `${viewport.name}: модальное окно вышло влево (${modalRect.left}px)`);
  assert(modalRect.right <= metrics.viewportWidth + 1, `${viewport.name}: модальное окно вышло вправо (${modalRect.right}px при ${metrics.viewportWidth}px)`);
  assert(modalRect.top >= -1, `${viewport.name}: модальное окно вышло вверх (${modalRect.top}px)`);
  assert(modalRect.bottom <= metrics.viewportHeight + 1, `${viewport.name}: модальное окно вышло вниз (${modalRect.bottom}px при ${metrics.viewportHeight}px)`);
  assert(metrics.modalScrollWidth <= metrics.modalClientWidth + 1, `${viewport.name}: горизонтальное переполнение modal`);
  assert(metrics.gridScrollWidth <= metrics.gridClientWidth + 1, `${viewport.name}: горизонтальное переполнение modal-grid`);
  assert(metrics.contentScrollWidth <= metrics.contentClientWidth + 1, `${viewport.name}: горизонтальное переполнение modal-content`);
  assert(metrics.documentWidth <= metrics.viewportWidth + 1, `${viewport.name}: документ стал шире экрана`);
  assert(['auto', 'scroll'].includes(metrics.gridOverflowY), `${viewport.name}: карточка не прокручивается внутри (${metrics.gridOverflowY})`);

  if (contentRect && titleRect) {
    assert(titleRect.left >= contentRect.left - 1, `${viewport.name}: заголовок вышел влево`);
    assert(titleRect.right <= contentRect.right + 1, `${viewport.name}: заголовок вышел вправо`);
  }
  if (contentRect && priceRect) {
    assert(priceRect.left >= contentRect.left - 1, `${viewport.name}: цена вышла влево`);
    assert(priceRect.right <= contentRect.right + 1, `${viewport.name}: цена вышла вправо`);
  }

  if (metrics.actionsPosition) {
    assert(metrics.actionsPosition === 'static', `${viewport.name}: кнопки всё ещё плавают (${metrics.actionsPosition})`);
  }
  for (const buttonRect of metrics.buttonRects) {
    assert(buttonRect.left >= modalRect.left - 1, `${viewport.name}: кнопка вышла влево`);
    assert(buttonRect.right <= modalRect.right + 1, `${viewport.name}: кнопка вышла вправо`);
  }
  assert(errors.length === 0, `${viewport.name}: ошибки страницы: ${errors.join(' | ')}`);

  await page.evaluate(() => {
    const grid = document.querySelector('#modal.show .modal-grid');
    if (grid) grid.scrollTop = grid.scrollHeight;
  });
  await page.waitForTimeout(150);

  const afterScroll = await page.evaluate(() => {
    const modal = document.getElementById('modal');
    const actions = modal?.querySelector('.journey-actions');
    return {
      modalRight: modal?.getBoundingClientRect().right || 0,
      viewportWidth: window.innerWidth,
      actionsPosition: actions ? getComputedStyle(actions).position : ''
    };
  });
  assert(afterScroll.modalRight <= afterScroll.viewportWidth + 1, `${viewport.name}: после прокрутки карточка сместилась`);
  if (afterScroll.actionsPosition) assert(afterScroll.actionsPosition === 'static', `${viewport.name}: после прокрутки кнопки стали плавающими`);

  await context.close();
  console.log(`✓ ${viewport.name}: карточка товара адаптирована и не плавает`);
}

const browser = await chromium.launch({ headless: true });
try {
  for (const viewport of viewports) await checkViewport(browser, viewport);
  console.log('✓ Проверка мобильной карточки товара завершена успешно');
} finally {
  await browser.close();
}
