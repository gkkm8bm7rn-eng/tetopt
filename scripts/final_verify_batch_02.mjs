import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { chromium } from 'playwright';

const ROOTS = [
  { key: 'github', url: 'https://gkkm8bm7rn-eng.github.io/tetopt/' },
  { key: 'cloudflare', url: 'https://tetopt.m78m6cfc2v.workers.dev/' },
];
const BATCH_IDS = [21,28,29,30,31,32,33,34,36,41,45,50,51,52,56,57,62,63,64,65];
const SCREENSHOT_IDS = new Set([28,41,51,52,57,65]);
const OUT_DIR = path.join('data', 'live-review-batch-02');
const REPORT_PATH = path.join('data', 'batch-02-final-verification.json');

function fail(message) { throw new Error(message); }
function cleanAsset(value) { return String(value || '').split('#')[0].split('?')[0]; }
function sha256(buffer) { return crypto.createHash('sha256').update(buffer).digest('hex'); }
function readProducts() {
  const html = fs.readFileSync('catalog-source.html', 'utf8');
  const marker = '    const PRODUCTS = ';
  const start = html.indexOf(marker);
  if (start < 0) fail('В catalog-source.html не найден PRODUCTS');
  const valueStart = start + marker.length;
  const end = html.indexOf(';\n', valueStart);
  if (end < 0) fail('Не найден конец PRODUCTS');
  return JSON.parse(html.slice(valueStart, end));
}
function readAssetVersion() {
  const loader = fs.readFileSync('catalog-loader.js', 'utf8');
  const match = loader.match(/const assetVersion="([^"]+)";/);
  if (!match) fail('Не найден assetVersion');
  return match[1];
}
async function waitForDeployment(root, assetVersion) {
  const deadline = Date.now() + 12 * 60 * 1000;
  let last = '';
  while (Date.now() < deadline) {
    try {
      const url = new URL(`catalog-loader.js?final-check=${Date.now()}`, root).href;
      const response = await fetch(url, { cache: 'no-store', headers: { 'cache-control': 'no-cache' } });
      last = `${response.status}`;
      if (response.ok) {
        const text = await response.text();
        if (text.includes(`const assetVersion="${assetVersion}";`)) return;
        last = 'loader доступен, но версия ещё старая';
      }
    } catch (error) { last = String(error); }
    await new Promise(resolve => setTimeout(resolve, 15000));
  }
  fail(`${root}: публикация ${assetVersion} не появилась за 12 минут (${last})`);
}
async function remoteBytes(request, root, assetPath, assetVersion) {
  const url = new URL(`${cleanAsset(assetPath)}?v=${encodeURIComponent(assetVersion)}&final-check=${Date.now()}`, root).href;
  const response = await request.get(url, { timeout: 30000, headers: { 'cache-control': 'no-cache' } });
  if (!response.ok()) fail(`${url}: HTTP ${response.status()}`);
  const contentType = response.headers()['content-type'] || '';
  if (!contentType.startsWith('image/')) fail(`${url}: неверный Content-Type ${contentType}`);
  return { url, contentType, bytes: await response.body() };
}

const products = readProducts();
const assetVersion = readAssetVersion();
const localById = new Map(products.map(product => [Number(product.id), product]));
for (const id of BATCH_IDS) {
  const product = localById.get(id);
  if (!product) fail(`ID ${id} отсутствует в исходном каталоге`);
  const images = (product.images || []).filter(Boolean).map(cleanAsset);
  if (!images.length) fail(`ID ${id}: нет фотографий`);
  if (cleanAsset(product.directImage) !== images[0]) fail(`ID ${id}: directImage не совпадает с первым фото`);
  if (images.some(item => /assets\/interiors\//i.test(item))) fail(`ID ${id}: присутствует непроверенная интерьерная визуализация`);
  if (new Set(images).size !== images.length) fail(`ID ${id}: дубли в галерее`);
  for (const item of images) {
    if (!item.startsWith(`assets/products/${id}/`)) fail(`ID ${id}: посторонний путь ${item}`);
    if (!fs.existsSync(item)) fail(`ID ${id}: локальный файл отсутствует ${item}`);
  }
}

fs.rmSync(OUT_DIR, { recursive: true, force: true });
fs.mkdirSync(OUT_DIR, { recursive: true });
const report = {
  batch: 2,
  checkedAt: new Date().toISOString(),
  assetVersion,
  activeTarget: 1362,
  batchIds: BATCH_IDS,
  rules: {
    firstPhoto: 'local exact-model product photo; whole product visible',
    gallery: 'all local images load; no duplicates; no broken images',
    interiors: 'none unless exact model is manually verified',
    publication: 'same bytes as repository on GitHub Pages and Cloudflare',
  },
  sites: {},
  status: 'running',
};

for (const site of ROOTS) {
  await waitForDeployment(site.url, assetVersion);
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  page.on('pageerror', error => consoleErrors.push(String(error)));
  const pageUrl = `${site.url}?final-check=${Date.now()}#catalog`;
  const navigation = await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 90000 });
  if (!navigation || !navigation.ok()) fail(`${site.key}: главная страница HTTP ${navigation?.status()}`);
  await page.waitForSelector('#grid .card', { timeout: 90000 });
  await page.waitForFunction(() => document.querySelector('#resultCount')?.textContent?.includes('1 362'), null, { timeout: 30000 });

  const liveCount = await page.evaluate(() => PRODUCTS.length);
  if (liveCount !== 1362) fail(`${site.key}: в браузере ${liveCount} товаров вместо 1362`);
  const siteReport = { root: site.url, liveCount, products: [], consoleErrors };

  for (const id of BATCH_IDS) {
    const local = localById.get(id);
    const expected = local.images.map(cleanAsset);
    const live = await page.evaluate(productId => {
      const product = PRODUCTS.find(item => Number(item.id) === Number(productId));
      if (!product) return null;
      return { name: product.name, directImage: product.directImage, images: product.images };
    }, id);
    if (!live) fail(`${site.key} ID ${id}: товар не найден в браузере`);
    const liveImages = (live.images || []).map(cleanAsset);
    if (JSON.stringify(liveImages) !== JSON.stringify(expected)) {
      fail(`${site.key} ID ${id}: порядок/состав галереи отличается: ${JSON.stringify(liveImages)} != ${JSON.stringify(expected)}`);
    }
    if (cleanAsset(live.directImage) !== expected[0]) fail(`${site.key} ID ${id}: неверный directImage`);

    const assetChecks = [];
    for (const asset of expected) {
      const localData = fs.readFileSync(asset);
      const remote = await remoteBytes(context.request, site.url, asset, assetVersion);
      const localHash = sha256(localData);
      const remoteHash = sha256(remote.bytes);
      if (localHash !== remoteHash) fail(`${site.key} ID ${id}: опубликованный файл отличается от репозитория ${asset}`);
      assetChecks.push({ asset, bytes: remote.bytes.length, sha256: remoteHash, contentType: remote.contentType });
    }

    await page.evaluate(productId => {
      const product = PRODUCTS.find(item => Number(item.id) === Number(productId));
      const grid = document.querySelector('#grid');
      grid.innerHTML = cardHtml(product);
      observeProductImages(grid);
      const img = grid.querySelector('.js-product-image');
      queueProductPhoto(img);
    }, id);
    const cardSelector = `[data-product="${id}"] .js-product-image`;
    await page.waitForFunction(selector => {
      const image = document.querySelector(selector);
      return image?.classList.contains('loaded') && image.naturalWidth > 80 && image.naturalHeight > 80;
    }, cardSelector, { timeout: 30000 });
    const cardCheck = await page.$eval(`[data-product="${id}"]`, card => {
      const image = card.querySelector('.js-product-image');
      const tag = card.querySelector('.collection-tag');
      return {
        src: image?.getAttribute('src') || '',
        naturalWidth: image?.naturalWidth || 0,
        naturalHeight: image?.naturalHeight || 0,
        failed: image?.classList.contains('failed') || false,
        collectionTagVisible: !!tag && getComputedStyle(tag).display !== 'none',
      };
    });
    if (cleanAsset(cardCheck.src).endsWith(expected[0]) === false) fail(`${site.key} ID ${id}: карточка показывает не первое фото`);
    if (cardCheck.failed || cardCheck.collectionTagVisible) fail(`${site.key} ID ${id}: ошибка карточки или видимая верхняя плашка`);

    await page.evaluate(productId => openProduct(productId), id);
    await page.waitForSelector('#modal.show');
    await page.waitForFunction(() => {
      const image = document.querySelector('#galleryMainImage');
      const status = document.querySelector('#galleryStatus');
      return image?.classList.contains('loaded') && image.naturalWidth > 80 && image.naturalHeight > 80 && status?.hidden === true;
    }, null, { timeout: 30000 });
    const thumbs = await page.locator('#galleryThumbs .gallery-thumb').count();
    if (thumbs !== expected.length) fail(`${site.key} ID ${id}: миниатюр ${thumbs}, ожидалось ${expected.length}`);

    const galleryChecks = [];
    for (let index = 0; index < expected.length; index += 1) {
      await page.evaluate(photoIndex => selectGalleryPhoto(photoIndex), index);
      await page.waitForFunction(({ expectedPath }) => {
        const image = document.querySelector('#galleryMainImage');
        return image?.classList.contains('loaded') && image.naturalWidth > 80 && image.naturalHeight > 80 && image.src.includes(expectedPath);
      }, { expectedPath: expected[index] }, { timeout: 30000 });
      galleryChecks.push(await page.$eval('#galleryMainImage', image => ({
        src: image.getAttribute('src') || '',
        naturalWidth: image.naturalWidth,
        naturalHeight: image.naturalHeight,
      })));
    }
    if (SCREENSHOT_IDS.has(id)) {
      await page.screenshot({ path: path.join(OUT_DIR, `${site.key}-${id}.png`), fullPage: false });
    }
    await page.evaluate(() => closeAll());
    siteReport.products.push({ id, name: live.name, first: expected[0], imageCount: expected.length, card: cardCheck, gallery: galleryChecks, assets: assetChecks, status: 'passed' });
  }

  if (consoleErrors.some(item => /failed to load|uncaught|typeerror|referenceerror/i.test(item))) {
    fail(`${site.key}: критические ошибки консоли: ${consoleErrors.join(' | ')}`);
  }
  report.sites[site.key] = siteReport;
  await browser.close();
}

report.status = 'passed';
report.completedCount = BATCH_IDS.length;
report.summary = 'Вторая партия проверена на GitHub Pages и Cloudflare: 20/20 карточек, все локальные изображения совпадают с файлами репозитория и загружаются в карточках и модальных галереях.';
fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), 'utf8');
console.log(JSON.stringify({ status: report.status, batch: 2, completed: report.completedCount, assetVersion }, null, 2));
