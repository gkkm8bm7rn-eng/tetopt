import { chromium } from 'playwright';

const baseUrl = process.env.SITE_URL || 'http://127.0.0.1:4173/';
const devices = [
  { name: 'very-narrow-phone', width: 280, height: 653 },
  { name: 'compact-phone', width: 320, height: 568 },
  { name: 'phone', width: 390, height: 844 },
  { name: 'large-phone', width: 430, height: 932 },
  { name: 'phone-landscape', width: 667, height: 375 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1440, height: 900 }
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function openProduct(page) {
  await page.waitForSelector('#grid .card .product-photo', { timeout: 120_000 });
  const image = page.locator('#grid .card:not(.product-color-duplicate-hidden):not(.product-exact-duplicate-hidden) .product-photo').first();
  await image.scrollIntoViewIfNeeded();
  await image.click({ force: true });
  await page.waitForSelector('#modal.show .modal-content h2', { timeout: 30_000 });
  await page.waitForFunction(() => {
    const modal = document.getElementById('modal');
    const add = modal?.querySelector('.journey-actions .btn.btn-primary:not(.journey-fast), .modal-content>.btn.btn-primary');
    const favorite = modal?.querySelector('.favorite-toggle.modal-favorite');
    return Boolean(modal?.classList.contains('show') && add && favorite);
  }, null, { timeout: 30_000 });
  await page.waitForTimeout(500);
}

async function checkDevice(browser, device) {
  const context = await browser.newContext({ viewport: { width: device.width, height: device.height } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));

  await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await openProduct(page);

  const metrics = await page.evaluate(() => {
    const modal = document.getElementById('modal');
    const content = modal?.querySelector('.modal-content');
    const title = content?.querySelector('h2');
    const gallery = modal?.querySelector('.gallery-main');
    const galleryImage = gallery?.querySelector('img');
    const favorite = content?.querySelector('.favorite-toggle.modal-favorite');
    const add = content?.querySelector('.journey-actions .btn.btn-primary:not(.journey-fast), :scope>.btn.btn-primary');
    const benefits = [...(content?.querySelectorAll('.journey-benefit') || [])];
    const rect = element => element?.getBoundingClientRect() || null;

    return {
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      documentWidth: document.documentElement.scrollWidth,
      modalRect: rect(modal),
      contentRect: rect(content),
      titleRect: rect(title),
      galleryRect: rect(gallery),
      galleryImageRect: rect(galleryImage),
      favoriteRect: rect(favorite),
      addRect: rect(add),
      favoriteText: favorite?.textContent.trim() || '',
      favoriteDisplay: favorite ? getComputedStyle(favorite).display : '',
      favoritePosition: favorite ? getComputedStyle(favorite).position : '',
      favoriteMinHeight: favorite ? parseFloat(getComputedStyle(favorite).minHeight) : 0,
      addText: add?.textContent.trim() || '',
      benefitTexts: benefits.map(item => item.textContent.trim()),
      modalOverflow: modal ? modal.scrollWidth - modal.clientWidth : 0,
      contentOverflow: content ? content.scrollWidth - content.clientWidth : 0,
      audit: window.__FORMA_PRODUCT_UI_AUDIT__ || null
    };
  });

  const { modalRect, contentRect, titleRect, galleryRect, galleryImageRect, favoriteRect, addRect } = metrics;
  assert(modalRect, `${device.name}: карточка товара не открылась`);
  assert(metrics.documentWidth <= metrics.viewportWidth + 1, `${device.name}: страница шире экрана`);
  assert(metrics.modalOverflow <= 1, `${device.name}: горизонтальное переполнение карточки`);
  assert(metrics.contentOverflow <= 1, `${device.name}: горизонтальное переполнение текста`);
  assert(modalRect.left >= -1 && modalRect.right <= metrics.viewportWidth + 1, `${device.name}: карточка вышла за экран`);

  if (contentRect && titleRect) {
    assert(titleRect.left >= contentRect.left - 1, `${device.name}: заголовок вышел влево`);
    assert(titleRect.right <= contentRect.right + 1, `${device.name}: заголовок вышел вправо`);
  }
  if (galleryRect && galleryImageRect) {
    assert(galleryImageRect.left >= galleryRect.left - 1, `${device.name}: изображение вышло влево`);
    assert(galleryImageRect.right <= galleryRect.right + 1, `${device.name}: изображение вышло вправо`);
  }

  assert(metrics.addText === 'Добавить в корзину', `${device.name}: неверный текст кнопки «${metrics.addText}»`);
  assert(addRect && addRect.left >= modalRect.left - 1 && addRect.right <= modalRect.right + 1, `${device.name}: кнопка корзины вышла за карточку`);

  assert(favoriteRect, `${device.name}: кнопка Избранного отсутствует`);
  assert(metrics.favoriteDisplay === 'inline-flex', `${device.name}: кнопка Избранного собрана некорректно (${metrics.favoriteDisplay})`);
  assert(metrics.favoritePosition === 'static', `${device.name}: кнопка Избранного плавает (${metrics.favoritePosition})`);
  assert(favoriteRect.height >= 44, `${device.name}: кнопка Избранного ниже безопасного размера касания`);
  assert(favoriteRect.left >= contentRect.left - 1 && favoriteRect.right <= contentRect.right + 1, `${device.name}: кнопка Избранного вышла за текстовый блок`);
  assert(/избран/i.test(metrics.favoriteText), `${device.name}: подпись Избранного потеряна`);

  assert(metrics.benefitTexts.length <= 2, `${device.name}: осталось больше двух преимуществ`);
  assert(!metrics.benefitTexts.some(text => /контакт.*браузер|браузер.*контакт/i.test(text)), `${device.name}: пункт о сохранении контактов не удалён`);
  assert(errors.length === 0, `${device.name}: ошибки JavaScript: ${errors.join(' | ')}`);

  await context.close();
  console.log(`✓ ${device.name}: карточка и элементы управления адаптивны`);
}

const browser = await chromium.launch({ headless: true });
try {
  for (const device of devices) await checkDevice(browser, device);
  console.log('✓ Адаптивность карточки товара проверена на телефонах, планшете и компьютере');
} finally {
  await browser.close();
}
