import { chromium } from 'playwright';

const baseUrl = process.env.SITE_URL || 'http://127.0.0.1:4173/';
const viewports = [
  { name: 'phone', width: 390, height: 844 },
  { name: 'desktop', width: 1440, height: 1000 }
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function waitForFilters(page) {
  await page.waitForSelector('#grid .card', { timeout: 120_000 });
  await page.waitForSelector('[data-forma-extra-toggle]', { timeout: 120_000 });
  await page.waitForFunction(() => {
    const audit = window.__FORMA_EXTRA_FILTERS__;
    return audit?.version === '6' && Array.isArray(audit.fields);
  }, null, { timeout: 30_000 });
}

async function inspect(page) {
  return page.evaluate(() => {
    const toggle = document.querySelector('[data-forma-extra-toggle]');
    const body = document.querySelector('.compact-extra-filters-body');
    const panel = toggle?.closest('.filter-panel,.filters-panel,.catalog-filters,[data-filter-panel]') || toggle?.parentElement;
    const normalize = value => String(value || '').toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
    const fieldLabels = body ? [...body.querySelectorAll('.field,.filter-field,.form-field,[data-filter-field]')]
      .map(field => normalize(field.querySelector('label,.field-label,.filter-label,strong,b')?.textContent))
      .filter(Boolean) : [];
    const panelText = normalize(panel?.textContent);
    const search = panel?.querySelector('input[placeholder*="поиск" i],input[aria-label*="поиск" i],input[type="search"]');
    return {
      expanded: toggle?.getAttribute('aria-expanded'),
      hidden: Boolean(body?.hidden),
      display: body ? getComputedStyle(body).display : '',
      fields: window.__FORMA_EXTRA_FILTERS__?.fields || fieldLabels,
      fieldControls: body?.querySelectorAll('select,input').length || 0,
      hasWidth: panelText.includes('ширина'),
      hasHeight: panelText.includes('высота'),
      hasAvailability: panelText.includes('наличие'),
      hasArticle: panelText.includes('модель или артикул'),
      searchPresent: Boolean(search)
    };
  });
}

async function checkViewport(browser, viewport) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));

  await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await waitForFilters(page);

  const initial = await inspect(page);
  assert(initial.expanded === 'false', `${viewport.name}: дополнительные фильтры открыты при первой загрузке`);
  assert(initial.hidden || initial.display === 'none', `${viewport.name}: тело дополнительных фильтров видно при первой загрузке`);
  assert(JSON.stringify(initial.fields) === JSON.stringify(['тип товара', 'цвет', 'материал']), `${viewport.name}: ожидаются только три фильтра, получено ${initial.fields.join(', ')}`);
  assert(initial.fieldControls === 3, `${viewport.name}: внутри блока должно быть три поля, найдено ${initial.fieldControls}`);
  assert(!initial.hasWidth && !initial.hasHeight && !initial.hasAvailability && !initial.hasArticle, `${viewport.name}: на странице остались лишние дополнительные поля`);
  assert(initial.searchPresent, `${viewport.name}: основное поле поиска было удалено`);

  const toggle = page.locator('[data-forma-extra-toggle]').first();
  await toggle.click();
  await page.waitForFunction(() => {
    const toggle = document.querySelector('[data-forma-extra-toggle]');
    const body = document.querySelector('.compact-extra-filters-body');
    return toggle?.getAttribute('aria-expanded') === 'true' && body && !body.hidden && getComputedStyle(body).display !== 'none';
  }, null, { timeout: 15_000 });

  await toggle.click();
  await page.waitForFunction(() => {
    const toggle = document.querySelector('[data-forma-extra-toggle]');
    const body = document.querySelector('.compact-extra-filters-body');
    return toggle?.getAttribute('aria-expanded') === 'false' && Boolean(body?.hidden);
  }, null, { timeout: 15_000 });

  assert(errors.length === 0, `${viewport.name}: ошибки страницы: ${errors.join(' | ')}`);
  await context.close();
  console.log(`✓ ${viewport.name}: дополнительные фильтры закрыты и содержат ровно три поля`);
}

const browser = await chromium.launch({ headless: true });
try {
  for (const viewport of viewports) await checkViewport(browser, viewport);
  console.log('✓ Проверка дополнительных фильтров завершена успешно');
} finally {
  await browser.close();
}
