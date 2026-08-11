#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const values = process.argv.slice(2);
const release = values.includes('--release');
const rootArg = values.find((value) => value !== '--release') || path.resolve(new URL('..', import.meta.url).pathname);
const root = path.resolve(rootArg);
const problems = [];
const notes = [];

const catalogPath = path.join(root, 'catalog.json');
if (!fs.existsSync(catalogPath)) fail('Нет catalog.json.');
else validateCatalog(JSON.parse(fs.readFileSync(catalogPath, 'utf8')));

validateMaterials();
validateSearch();
scanPublicText();
if (release) validateRelease();
else notes.push('Юридические реквизиты проверяются только в режиме --release; аналитика на этапе запуска может оставаться отключённой.');

if (problems.length) {
  console.error(`Итоговая проверка: FAIL (${problems.length})`);
  problems.forEach((problem) => console.error(`- ${problem}`));
  process.exit(1);
}
console.log(`Итоговая проверка: PASS (${release ? 'release' : 'materials'}).`);
notes.forEach((note) => console.log(`- ${note}`));

function validateCatalog(catalog) {
  const models = catalog.products || [];
  const variants = models.flatMap((model) => model.variants || []);
  const ids = variants.map((variant) => Number(variant.sourceId));
  if (models.length !== 541) fail(`Каталог: ожидалось 541 модель, получено ${models.length}.`);
  if (variants.length !== 1194) fail(`Каталог: ожидалось 1 194 варианта, получено ${variants.length}.`);
  if (new Set(ids).size !== ids.length) fail('Каталог: sourceId не уникальны.');
  if (ids.includes(1008) || ids.includes(1009)) fail('Каталог: скрытые sourceId 1008/1009 вернулись.');
  if (!ids.includes(62) || !ids.includes(102) || !ids.includes(103)) fail('Каталог: потеряны контрольные sourceId 62, 102 или 103.');
  for (const variant of variants) {
    if (!(Number(variant.wholesalePrice) > 0)) fail(`Каталог: нет положительной оптовой цены у ${variant.sourceId}.`);
    if (!Array.isArray(variant.images) || !variant.images.length) fail(`Каталог: нет галереи у ${variant.sourceId}.`);
    if (variant.images?.some((image) => /^https?:/i.test(image))) fail(`Каталог: внешняя фотография у ${variant.sourceId}.`);
    if (variant.images?.[0] !== variant.directImage) fail(`Каталог: directImage не совпадает с первым кадром у ${variant.sourceId}.`);
    for (const image of variant.images || []) {
      const imagePath = path.join(root, image);
      if (!fs.existsSync(imagePath)) fail(`Каталог: отсутствует файл ${image}.`);
      else if (fs.statSync(imagePath).size === 0) fail(`Каталог: пустой файл изображения ${image}.`);
    }
  }
  for (let sourceId = 1; sourceId <= 10; sourceId += 1) {
    const variant = variants.find((item) => Number(item.sourceId) === sourceId);
    const interior = `assets/interiors/${sourceId}.webp`;
    if (!variant?.images.includes(interior)) fail(`Каталог: интерьер не подключён у ${sourceId}.`);
    if (variant?.images[0] === interior) fail(`Каталог: интерьер ошибочно стал первым у ${sourceId}.`);
    if (!fs.existsSync(path.join(root, interior))) fail(`Нет интерьерного файла ${interior}.`);
  }
}

function validateMaterials() {
  const required = [
    'next/final-design.css', 'next/smart-search.js', 'next/analytics.js',
    'next/analytics.config.example.js', 'scripts/apply-final-assembly.mjs',
    'scripts/build-legal-pages.mjs', 'legal/site-legal.config.example.json',
  ];
  required.forEach((relative) => { if (!fs.existsSync(path.join(root, relative))) fail(`Нет материала ${relative}.`); });
  const css = read('next/final-design.css');
  if (!css.includes('Lora Variable') || !css.includes('Onest Variable')) fail('Дизайн: не подключены Lora и Onest.');
  if (!css.includes('.hero::after') || !css.includes('border-radius:50%')) fail('Дизайн: нет широкого кольца баннера.');
  if (!css.includes('.hero-stats{display:none!important}')) fail('Дизайн: счётчики баннера не отключены.');
  if (!css.includes('.brand-mark') || !css.includes('.brand-separator')) fail('Дизайн: нет равнозначного двуязычного логотипа через дробь.');
}

function validateSearch() {
  try {
    const context = { window: {}, console };
    vm.runInNewContext(read('next/smart-search.js'), context, { filename: 'smart-search.js' });
    const catalog = JSON.parse(read('catalog.json'));
    const models = catalog.products.map((model, sourceOrder) => ({ ...model, sourceOrder }));
    const search = context.window.FormaSearch;
    search.build(models);
    const cases = [
      ['nev,jxrf', /тумб/i], ['тумбочька', /тумб/i], ['rhtckj', /кресл/i], ['stul', /стул/i],
    ];
    for (const [query, pattern] of cases) {
      const match = search.rank(models, query).find((entry) => pattern.test(entry.model.name));
      if (!match) fail(`Поиск: не пройден сценарий «${query}».`);
    }
  } catch (error) {
    fail(`Поиск: ${error.message}`);
  }
}

function scanPublicText() {
  const roots = ['next', 'legal'];
  for (const directory of roots) {
    const full = path.join(root, directory);
    if (!fs.existsSync(full)) continue;
    for (const file of walk(full)) {
      if (!/\.(?:html|js|css|json|md)$/i.test(file)) continue;
      const text = fs.readFileSync(file, 'utf8');
      if (/\bavito\b|авито/iu.test(text)) fail(`Публичное упоминание запрещённой площадки: ${path.relative(root, file)}.`);
    }
  }
}

function validateRelease() {
  const index = read('next/index.html');
  const app = read('next/app-registry.js');
  if (!index.includes('<span lang="en">FORMA HOME</span><span class="brand-separator" aria-hidden="true">/</span><span lang="ru">ФОРМА ХОУМ</span>')) fail('Release: марка не оформлена равнозначно через дробь.');
  if (index.includes('hero-stats')) fail('Release: в баннере остались счётчики.');
  if (!index.includes('smart-search.js') || !app.includes('rankedSearch')) fail('Release: умный поиск не подключён.');
  if (!index.includes('checkout-consent') || !app.includes('Подтвердите согласие')) fail('Release: нет отдельного согласия в заявке.');
  if (/https:\/\/t\.me\/\+79057267946/.test(index + app)) fail('Release: осталась некорректная Telegram-ссылка на телефон.');
  for (const page of ['seller.html', 'privacy.html', 'consent.html', 'terms.html']) {
    if (!fs.existsSync(path.join(root, 'next', page))) fail(`Release: не создана страница next/${page}.`);
  }
  const legalConfigPath = path.join(root, 'legal/site-legal.config.json');
  if (!fs.existsSync(legalConfigPath)) fail('Release: нет legal/site-legal.config.json.');
  else if (/\[ОБЯЗАТЕЛЬНО/i.test(fs.readFileSync(legalConfigPath, 'utf8'))) fail('Release: не заполнены юридические реквизиты.');
  const analyticsPath = path.join(root, 'next/analytics.config.js');
  if (fs.existsSync(analyticsPath)) {
    const analytics = fs.readFileSync(analyticsPath, 'utf8');
    if (/enabled:\s*true/.test(analytics) && !/yandexMetrikaId:\s*['"]\d+['"]/.test(analytics)) fail('Release: аналитика включена, но не указан номер счётчика Яндекс Метрики.');
  }
}

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(target) : [target];
  });
}

function read(relative) {
  const target = path.join(root, relative);
  return fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : '';
}

function fail(message) { if (!problems.includes(message)) problems.push(message); }
