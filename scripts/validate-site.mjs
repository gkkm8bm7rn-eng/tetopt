import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

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
  'compact-extra-filters.js'
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
  'compact-extra-filters.js'
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

if (products.length < 1000) fail(`Каталог подозрительно мал: ${products.length} товаров`);
const ids = products.map(product => Number(product.id));
if (ids.some(id => !Number.isFinite(id))) fail('В каталоге обнаружен некорректный id товара');
if (new Set(ids).size !== ids.length) fail('В каталоге обнаружены повторяющиеся id товаров');
if (!collections.length || !categories.length) fail('Списки коллекций или категорий пусты');

const hidden = JSON.parse(read('hidden-products.json'));
const hiddenIds = new Set((hidden.ids || []).map(Number).filter(Number.isFinite));
const visibleCount = products.filter(product => !hiddenIds.has(Number(product.id))).length;
const withLocalImages = products.filter(product =>
  Array.isArray(product.images) && product.images.some(path => typeof path === 'string' && path.startsWith('assets/'))
).length;

ok(`Каталог сохранён: ${products.length} товаров, ${visibleCount} видимых`);
console.log(`ℹ Локальные изображения указаны у ${withLocalImages} товаров`);

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

if (!process.exitCode) {
  ok('Проверка целостности и производительности сайта завершена успешно');
}
