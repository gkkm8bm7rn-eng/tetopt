import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const EXPECTED_TOTAL_PRODUCTS = 1723;
const EXPECTED_HIDDEN_PRODUCTS = 361;
const EXPECTED_PRODUCTS_AFTER_HIDDEN_LIST = 1362;

const requiredFiles = [
  'index.html',
  'catalog-source.html',
  'hidden-products.json',
  'performance-bootstrap.js',
  'catalog-pagination.js',
  'catalog-loader.js',
  'sw.js',
  'offline.html',
  'hero-banner-final.js',
  'compact-extra-filters.js',
  'product-color-swatches.js',
  'product-duplicate-hider.js',
  'catalog-image-click-behavior.js',
  'scripts/calculate-card-count.mjs',
  'scripts/e2e-site.mjs',
  '.github/workflows/e2e-site.yml'
];

function fail(message) {
  console.error(`✗ ${message}`);
  process.exitCode = 1;
}

function ok(message) {
  console.log(`✓ ${message}`);
}

function read(path) {
  return readFileSync(path, 'utf8');
}

function readConstArray(source, name) {
  const marker = `    const ${name} = `;
  const start = source.indexOf(marker);
  if (start < 0) throw new Error(`Не найден массив ${name}`);
  const valueStart = start + marker.length;
  const end = source.indexOf(';\n', valueStart);
  if (end < 0) throw new Error(`Не найден конец массива ${name}`);
  const value = JSON.parse(source.slice(valueStart, end));
  if (!Array.isArray(value)) throw new Error(`${name} не является массивом`);
  return value;
}

for (const file of requiredFiles) {
  if (!existsSync(file)) fail(`Отсутствует обязательный файл: ${file}`);
}
if (process.exitCode) process.exit(process.exitCode);
ok('Все обязательные файлы присутствуют');

const javascriptFiles = [
  'performance-bootstrap.js',
  'catalog-pagination.js',
  'catalog-loader.js',
  'sw.js',
  'hero-banner-final.js',
  'compact-extra-filters.js',
  'product-color-swatches.js',
  'product-duplicate-hider.js',
  'catalog-image-click-behavior.js',
  'scripts/calculate-card-count.mjs',
  'scripts/e2e-site.mjs'
];
for (const file of javascriptFiles) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) fail(`Синтаксическая ошибка в ${file}: ${result.stderr.trim()}`);
}
if (!process.exitCode) ok('Критические JavaScript-файлы проходят синтаксическую проверку');

const index = read('index.html');
const expectedScripts = [
  'performance-bootstrap.js?v=5',
  'catalog-pagination.js?v=3',
  'product-color-swatches.js?v=6',
  'product-duplicate-hider.js?v=3',
  'catalog-image-click-behavior.js?v=2',
  'catalog-loader.js?v=22'
];
let previous = -1;
for (const script of expectedScripts) {
  const position = index.indexOf(script);
  if (position < 0) fail(`index.html не подключает ${script}`);
  if (position <= previous) fail(`Нарушен порядок подключения скриптов около ${script}`);
  previous = position;
}
const externalScripts = [...index.matchAll(/<script\s+([^>]*?)src="([^"]+)"[^>]*><\/script>/g)];
for (const [, attributes, src] of externalScripts) {
  if (!/\bdefer\b/.test(attributes)) fail(`Скрипт ${src} должен загружаться с defer`);
}
if (!index.includes('class="boot-hero"') || !index.includes('Загружаем каталог')) {
  fail('В index.html отсутствует быстрый экран загрузки');
} else {
  ok('Быстрый адаптивный экран загрузки подключён');
}
if (index.includes('<strong class="boot-number">1 362</strong>')) {
  fail('Быстрый экран не должен показывать промежуточные 1 362 товара как финальное число карточек');
}

const catalog = read('catalog-source.html');
let products = [];
let collections = [];
let categories = [];
try {
  products = readConstArray(catalog, 'PRODUCTS');
  collections = readConstArray(catalog, 'COLLECTIONS');
  categories = readConstArray(catalog, 'CATEGORIES');
} catch (error) {
  fail(error.message);
}

const ids = products.map(product => Number(product.id));
if (ids.some(id => !Number.isFinite(id))) fail('В каталоге обнаружен некорректный id товара');
if (new Set(ids).size !== ids.length) fail('В каталоге обнаружены повторяющиеся id товаров');
if (!collections.length || !categories.length) fail('Списки коллекций или категорий пусты');
if (products.length !== EXPECTED_TOTAL_PRODUCTS) {
  fail(`Нарушена целостность каталога: ожидалось ${EXPECTED_TOTAL_PRODUCTS} товаров, найдено ${products.length}`);
}

const hidden = JSON.parse(read('hidden-products.json'));
const hiddenIds = new Set((hidden.ids || []).map(Number).filter(Number.isFinite));
const productsAfterHiddenList = products.filter(product => !hiddenIds.has(Number(product.id))).length;
const withLocalImages = products.filter(product =>
  Array.isArray(product.images) && product.images.some(path => typeof path === 'string' && path.startsWith('assets/'))
).length;

if (hiddenIds.size !== EXPECTED_HIDDEN_PRODUCTS) {
  fail(`Нарушен список скрытых товаров: ожидалось ${EXPECTED_HIDDEN_PRODUCTS}, найдено ${hiddenIds.size}`);
}
if (productsAfterHiddenList !== EXPECTED_PRODUCTS_AFTER_HIDDEN_LIST) {
  fail(`Нарушено промежуточное число товаров после списка исключений: ожидалось ${EXPECTED_PRODUCTS_AFTER_HIDDEN_LIST}, найдено ${productsAfterHiddenList}`);
}
ok(`Исходные данные сохранены: ${products.length} товаров, после списка исключений — ${productsAfterHiddenList}`);
console.log(`ℹ Локальные изображения указаны у ${withLocalImages} товаров`);

const countResult = spawnSync(process.execPath, ['scripts/calculate-card-count.mjs'], { encoding: 'utf8' });
if (countResult.status !== 0) {
  fail(`Не удалось рассчитать финальное число карточек: ${countResult.stderr.trim()}`);
} else {
  try {
    const countAudit = JSON.parse(countResult.stdout);
    if (countAudit.productsAfterHiddenList !== productsAfterHiddenList) {
      fail('Расчёт карточек использует другое промежуточное число товаров');
    }
    if (!(countAudit.finalUniqueCards > 0 && countAudit.finalUniqueCards < productsAfterHiddenList)) {
      fail(`Некорректное финальное число карточек после объединения дублей: ${countAudit.finalUniqueCards}`);
    }
    if (countAudit.removedByGrouping !== productsAfterHiddenList - countAudit.finalUniqueCards) {
      fail('Не сходится контрольное число объединённых карточек');
    }
    ok(`После объединения цветовых вариантов и дублей остаётся ${countAudit.finalUniqueCards} уникальных карточек`);
  } catch (error) {
    fail(`Некорректный результат расчёта карточек: ${error.message}`);
  }
}

const bootstrap = read('performance-bootstrap.js');
const serviceWorker = read('sw.js');
const dataCache = bootstrap.match(/const DATA_CACHE_NAME='([^']+)'/)?.[1];
const swVersion = serviceWorker.match(/const CACHE_VERSION='([^']+)'/)?.[1];
if (!dataCache || !swVersion || dataCache !== `forma-data-${swVersion}`) {
  fail('Имена кэша каталога в performance-bootstrap.js и sw.js не совпадают');
} else {
  ok(`Кэш каталога согласован: ${dataCache}`);
}
if (!bootstrap.includes('catalogSnapshots=new Map()')) fail('Не включено объединение параллельных загрузок каталога');
if (!bootstrap.includes("register('./sw.js?v=4'")) fail('Service Worker подключён с неожиданной версией');
if (!serviceWorker.includes("new Request(request,{cache:'no-cache'})")) fail('Фоновая перепроверка актуальности кэша отключена');
if (!serviceWorker.includes('MAX_CACHED_IMAGES=120')) fail('Не установлен лимит кэша изображений');
if (!read('catalog-pagination.js').includes('const photoJobLimit = constrainedNetwork ? 1 : 3;')) {
  fail('Не настроено ограничение параллельных фотографий для слабой сети');
}

const colorSwatches = read('product-color-swatches.js');
if (!colorSwatches.includes('function switchCatalogCard')) {
  fail('Цветовые кружки не переключают содержимое карточки каталога');
}
if (!colorSwatches.includes('forma:card-variant-changed')) {
  fail('После смены цвета не отправляется событие обновления карточки');
}

const duplicateHider = read('product-duplicate-hider.js');
if (!duplicateHider.includes('document.write = function patchedWrite')) {
  fail('Удаление дублей не переносится в окончательный документ каталога');
}
if (!duplicateHider.includes('__FINAL_CARD_AUDIT__')) {
  fail('На сайте не формируется аудит финального числа уникальных карточек');
}
if (!duplicateHider.includes('isSelectedColorHost')) {
  fail('Выбранный цвет карточки может быть ошибочно скрыт механизмом дублей');
}

const imageClickBehavior = read('catalog-image-click-behavior.js');
if (!imageClickBehavior.includes('document.write = function patchedWrite')) {
  fail('Обработчик клика по фото не переносится в окончательный документ каталога');
}
if (!imageClickBehavior.includes('openCatalogProduct(card)')) {
  fail('Клик по фотографии не настроен на открытие товара');
}
if (!imageClickBehavior.includes('[data-color-product]')) {
  fail('Обработчик карточки может перехватить клик по цвету');
}

const e2eScript = read('scripts/e2e-site.mjs');
if (!e2eScript.includes('checkCatalogColorAndPhotoInteractions')) {
  fail('Браузерный тест не проверяет смену цвета и открытие товара по фотографии');
}
const e2eWorkflow = read('.github/workflows/e2e-site.yml');
if (!e2eWorkflow.includes('node scripts/e2e-site.mjs')) fail('Workflow не запускает браузерные проверки');
if (!e2eWorkflow.includes('playwright install --with-deps chromium')) fail('Workflow не устанавливает Chromium для браузерных проверок');

if (!process.exitCode) {
  ok('Проверка целостности и производительности сайта завершена успешно');
}
