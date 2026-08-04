import { chromium } from 'playwright';

const baseUrl = process.env.SITE_URL || 'http://127.0.0.1:4173/';
const viewports = [
  { name: 'phone', width: 390, height: 844 },
  { name: 'desktop', width: 1440, height: 1000 }
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function waitForStorefront(page) {
  await page.waitForSelector('.announcement', { timeout: 120_000 });
  await page.waitForSelector('header', { timeout: 120_000 });
  await page.waitForSelector('#grid .card', { timeout: 120_000 });
  await page.waitForFunction(() => Number(window.__FORMA_FIXED_HEADER__?.totalHeight) > 0, null, { timeout: 30_000 });
}

async function metrics(page) {
  return page.evaluate(() => {
    const announcement = document.querySelector('.announcement');
    const header = document.querySelector('header');
    const spacer = document.getElementById('forma-fixed-site-header-spacer') || document.getElementById('forma-fixed-header-spacer');
    const cart = document.querySelector('#openCart,[data-open-cart],button[aria-label*="корзин" i]');
    const announcementRect = announcement?.getBoundingClientRect();
    const headerRect = header?.getBoundingClientRect();
    const spacerRect = spacer?.getBoundingClientRect();
    return {
      scrollY: window.scrollY,
      announcementPosition: announcement ? getComputedStyle(announcement).position : '',
      headerPosition: header ? getComputedStyle(header).position : '',
      announcementTop: announcementRect?.top ?? NaN,
      announcementHeight: announcementRect?.height ?? 0,
      headerTop: headerRect?.top ?? NaN,
      headerHeight: headerRect?.height ?? 0,
      spacerHeight: spacerRect?.height ?? 0,
      totalHeight: Number(window.__FORMA_FIXED_HEADER__?.totalHeight || 0),
      cartVisible: Boolean(cart && cart.getBoundingClientRect().width > 0 && cart.getBoundingClientRect().height > 0)
    };
  });
}

async function checkViewport(browser, viewport) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));

  await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await waitForStorefront(page);

  const before = await metrics(page);
  await page.evaluate(() => window.scrollTo(0, Math.max(document.body.scrollHeight * 0.65, 1200)));
  await page.waitForTimeout(350);
  const after = await metrics(page);

  assert(before.announcementPosition === 'fixed', `${viewport.name}: уведомление не fixed до прокрутки`);
  assert(before.headerPosition === 'fixed', `${viewport.name}: шапка не fixed до прокрутки`);
  assert(after.announcementPosition === 'fixed', `${viewport.name}: уведомление потеряло fixed после прокрутки`);
  assert(after.headerPosition === 'fixed', `${viewport.name}: шапка потеряла fixed после прокрутки`);
  assert(Math.abs(after.announcementTop) <= 1, `${viewport.name}: уведомление ушло с верхней границы (${after.announcementTop}px)`);
  assert(Math.abs(after.headerTop - after.announcementHeight) <= 2, `${viewport.name}: шапка не следует сразу за уведомлением`);
  assert(after.totalHeight > 0, `${viewport.name}: высота фиксированной панели не рассчитана`);
  assert(Math.abs(after.spacerHeight - after.totalHeight) <= 2, `${viewport.name}: компенсирующий отступ не равен высоте панели`);
  assert(after.cartVisible, `${viewport.name}: корзина не видна после прокрутки`);
  assert(errors.length === 0, `${viewport.name}: ошибки страницы: ${errors.join(' | ')}`);

  const cartButton = page.locator('#openCart,[data-open-cart],button[aria-label*="корзин" i]').first();
  await cartButton.click();
  await page.waitForFunction(() => Boolean(document.querySelector('.drawer.show,#cartDrawer.show,[data-cart-drawer].show')), null, { timeout: 15_000 });

  await context.close();
  console.log(`✓ ${viewport.name}: панель закреплена, корзина доступна после прокрутки`);
}

const browser = await chromium.launch({ headless: true });
try {
  for (const viewport of viewports) await checkViewport(browser, viewport);
  console.log('✓ Проверка фиксированной верхней панели завершена успешно');
} finally {
  await browser.close();
}
