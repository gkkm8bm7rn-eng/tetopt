#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const args = parseArgs(process.argv.slice(2));
if (!args.repo) {
  console.error('Usage: node scripts/apply-final-assembly.mjs --repo /path/to/tetopt [--apply]');
  process.exit(2);
}

const repo = path.resolve(args.repo);
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const bundle = path.resolve(scriptDir, '..');
const required = ['catalog.json', 'next/index.html', 'next/styles.css', 'next/app-registry.js'];
for (const relative of required) {
  if (!fs.existsSync(path.join(repo, relative))) throw new Error(`В репозитории нет ${relative}.`);
}

const plan = [
  'заменить catalog.json проверенным каталогом: 541 модель / 1 194 варианта',
  'добавить интерьерные кадры 1–10 последними в галереях',
  'подключить шрифты Lora и Onest, утверждённый баннер и равнозначную двуязычную марку через дробь',
  'подключить поиск с опечатками, раскладкой, синонимами и заменами',
  'подключить нейтральные события аналитики',
  'исправить Telegram и добавить отдельное согласие на обработку данных',
  'подготовить конфигурацию юридических страниц без публикации заглушек',
];

if (!args.apply) {
  console.log('Предварительная проверка пройдена. Будут выполнены действия:');
  plan.forEach((item) => console.log(`- ${item}`));
  console.log('Для применения добавьте --apply.');
  process.exit(0);
}

const backupDir = fs.mkdtempSync(path.join(os.tmpdir(), 'forma-home-final-backup-'));
for (const relative of required) {
  const source = path.join(repo, relative);
  const destination = path.join(backupDir, relative);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
}

try {
  copyFile('catalog.json', 'catalog.json');
  copyTree('assets/fonts', 'assets/fonts');
  copyTree('assets/interiors', 'assets/interiors');
  copyFile('data/interior-images.json', 'data/interior-images.json');
  copyFile('data/merchandising.json', 'data/merchandising.json');
  copyFile('next/final-design.css', 'next/final-design.css');
  copyFile('next/smart-search.js', 'next/smart-search.js');
  copyFile('next/analytics.js', 'next/analytics.js');
  copyIfMissing('next/analytics.config.example.js', 'next/analytics.config.js');
  copyTree('legal', 'legal');
  copyIfMissing('legal/site-legal.config.example.json', 'legal/site-legal.config.json');
  copyFile('scripts/build-legal-pages.mjs', 'scripts/build-legal-pages.mjs');
  copyFile('scripts/validate-final-assembly.mjs', 'scripts/validate-final-assembly.mjs');

  const indexPath = path.join(repo, 'next/index.html');
  const appPath = path.join(repo, 'next/app-registry.js');
  fs.writeFileSync(indexPath, patchIndex(fs.readFileSync(indexPath, 'utf8')), 'utf8');
  fs.writeFileSync(appPath, patchApp(fs.readFileSync(appPath, 'utf8')), 'utf8');
} catch (error) {
  for (const relative of required) {
    fs.copyFileSync(path.join(backupDir, relative), path.join(repo, relative));
  }
  console.error(`Применение остановлено, исходные ключевые файлы восстановлены. Резервная копия: ${backupDir}`);
  throw error;
}

console.log('Материалы итоговой сборки применены.');
console.log(`Резервная копия исходных ключевых файлов: ${backupDir}`);
console.log('Далее заполните legal/site-legal.config.json, создайте юридические страницы и запустите итоговую проверку. Аналитика на этапе запуска отключена.');

function patchIndex(input) {
  let text = input;
  text = text.replace('<title>FORMA HOME — новый каталог</title>', '<title>FORMA HOME / ФОРМА ХОУМ — мебель и предметы интерьера</title>');
  text = insertAfter(text, '<link rel="stylesheet" href="styles.css?v=8">', '\n  <link rel="stylesheet" href="final-design.css?v=1">');
  text = insertAfter(text, '<script defer src="catalog-preprocess.js?v=5"></script>', '\n  <script defer src="analytics.config.js?v=1"></script>\n  <script defer src="analytics.js?v=1"></script>\n  <script defer src="smart-search.js?v=1"></script>');
  text = text.replace(
    '<a class="brand" href="#catalog" aria-label="FORMA HOME — к каталогу">FORMA <span>HOME</span></a>',
    '<a class="brand" href="#catalog" aria-label="FORMA HOME / ФОРМА ХОУМ — к каталогу"><span class="brand-mark"><span lang="en">FORMA HOME</span><span class="brand-separator" aria-hidden="true">/</span><span lang="ru">ФОРМА ХОУМ</span></span></a>',
  );
  text = text.replace(/\n?\s*<div class="hero-stats"[^>]*>\s*<div>[\s\S]*?<\/div>\s*<div>[\s\S]*?<\/div>\s*<\/div>/, '');
  text = text.replace('placeholder="Поиск по названию, коллекции, характеристикам"', 'placeholder="Название, цвет, материал или код модели"');
  if (!text.includes('id="checkout-consent"')) {
    text = text.replace(
      /(<p class="checkout-error" id="checkout-error" aria-live="polite"><\/p>\s*)(<div class="checkout-actions">)/,
      '$1<label class="checkout-consent"><input id="checkout-consent" type="checkbox" required><span>Я даю отдельное <a href="consent.html" target="_blank" rel="noopener">согласие на обработку персональных данных</a> и ознакомлен(а) с <a href="privacy.html" target="_blank" rel="noopener">политикой</a>.</span></label>\n      $2',
    );
  }
  text = text.replace(
    /<footer class="site-footer">[\s\S]*?<\/footer>/,
    '<footer class="site-footer"><div class="shell"><span class="footer-brand"><span class="brand-mark"><span lang="en">FORMA HOME</span><span class="brand-separator" aria-hidden="true">/</span><span lang="ru">ФОРМА ХОУМ</span></span></span><nav aria-label="Контакты"><a href="tel:+79057267946">Позвонить</a><a href="https://wa.me/79057267946">WhatsApp</a><a href="mailto:postes@mail.ru">E-mail</a></nav><nav class="legal-links" aria-label="Документы"><a href="seller.html">Продавец</a><a href="privacy.html">Политика данных</a><a href="terms.html">Доставка и возврат</a></nav><span>Ежедневно, 10:00–20:00</span></div></footer>',
  );
  if (!text.includes('<span lang="en">FORMA HOME</span><span class="brand-separator" aria-hidden="true">/</span><span lang="ru">ФОРМА ХОУМ</span>')) throw new Error('Не удалось обновить равнозначную двуязычную марку в next/index.html.');
  if (text.includes('hero-stats')) throw new Error('Не удалось убрать счётчики из баннера.');
  if (!text.includes('id="checkout-consent"')) throw new Error('Не удалось добавить отдельное согласие в форму заказа.');
  return text;
}

function patchApp(input) {
  let text = input;
  text = patchOnce(text,
    "      state.models = state.models.map((model, sourceOrder) => ({ ...model, sourceOrder }));",
    "      state.models = state.models.map((model, sourceOrder) => ({ ...model, sourceOrder }));\n      window.FormaSearch?.build(state.models);",
    'FormaSearch?.build',
  );
  text = text.replace(
    "      els.modelCount.textContent = formatNumber(state.models.length);\n      els.variantCount.textContent = formatNumber(state.models.reduce((sum, model) => sum + model.variants.length, 0));",
    "      if (els.modelCount) els.modelCount.textContent = formatNumber(state.models.length);\n      if (els.variantCount) els.variantCount.textContent = formatNumber(state.models.reduce((sum, model) => sum + model.variants.length, 0));",
  );
  text = patchOnce(text,
    "    const query = normalizeText(els.search.value);",
    "    const rawQuery = els.search.value;\n    const query = normalizeText(rawQuery);\n    const rankedSearch = query && window.FormaSearch ? window.FormaSearch.rank(state.models, rawQuery) : null;\n    const rankedIds = rankedSearch ? new Set(rankedSearch.map(item => String(item.model.id))) : null;\n    const rankedScores = rankedSearch ? new Map(rankedSearch.map(item => [String(item.model.id), item.score])) : null;",
    'const rankedSearch = query',
  );
  text = patchOnce(text,
    "      if (query && !model.searchable.includes(query)) return false;",
    "      if (query && (rankedIds ? !rankedIds.has(String(model.id)) : !model.searchable.includes(query))) return false;",
    'rankedIds ? !rankedIds.has',
  );
  text = patchOnce(text,
    "    const merchandising = state.view === 'all' && !query && !category && !collection && !priceRange;\n    if (merchandising) filtered = merchandiseModels(filtered);",
    "    if (rankedScores) filtered.sort((a, b) => (rankedScores.get(String(b.id)) || 0) - (rankedScores.get(String(a.id)) || 0) || a.sourceOrder - b.sourceOrder);\n    const merchandising = state.view === 'all' && !query && !category && !collection && !priceRange;\n    if (merchandising) filtered = merchandiseModels(filtered);",
    'if (rankedScores) filtered.sort',
  );
  text = patchOnce(text,
    "    els.count.textContent = resultCountText();\n    renderPage();",
    "    els.count.textContent = resultCountText();\n    if (query) window.FormaAnalytics?.trackSearch(rawQuery, filtered.length);\n    renderPage();",
    'trackSearch(rawQuery',
  );
  text = patchOnce(text,
    "      els.emptyCopy.textContent = 'Измените запрос или сбросьте фильтры.';\n    }\n  }",
    "      els.emptyCopy.textContent = 'Точного совпадения нет. Можно изменить запрос или посмотреть функциональную замену.';\n    }\n    window.FormaSearch?.decorateEmptyState({ container: els.empty, input: els.search, models: state.models, onApply: value => { els.search.value = value; applyFilters(true); } });\n  }",
    'decorateEmptyState({ container: els.empty',
  );
  text = patchOnce(text,
    "    state.activeVariant=preferredVariant || chooseDisplayVariant(model);",
    "    state.activeVariant=preferredVariant || chooseDisplayVariant(model);\n    window.FormaAnalytics?.track('product_open', { modelId: model.id, sourceId: state.activeVariant?.sourceId });",
    "track('product_open'",
  );
  text = patchOnce(text,
    "        state.activeVariant=chosen;\n        state.activeImageIndex=0;",
    "        state.activeVariant=chosen;\n        window.FormaAnalytics?.track('variant_select', { modelId: model.id, sourceId: chosen.sourceId });\n        state.activeImageIndex=0;",
    "track('variant_select'",
  );
  text = patchOnce(text,
    "      state.cart.set(id,1);\n      saveCart();",
    "      state.cart.set(id,1);\n      window.FormaAnalytics?.track('cart_add', { sourceId: id, quantity: 1 });\n      saveCart();",
    "track('cart_add'",
  );
  text = patchOnce(text,
    "    if(!data.city){error.textContent='Укажите город.';return null;}\n    error.textContent='';return data;",
    "    if(!data.city){error.textContent='Укажите город.';return null;}\n    if(!document.querySelector('#checkout-consent')?.checked){error.textContent='Подтвердите согласие на обработку персональных данных.';return null;}\n    error.textContent='';return data;",
    'Подтвердите согласие на обработку персональных данных',
  );
  text = patchOnce(text,
    "`Город: ${data.city}`,data.comment?`Комментарий: ${data.comment}`:'',`Ссылка на заказ: ${orderUrl()}`",
    "`Город: ${data.city}`,data.comment?`Комментарий: ${data.comment}`:'',`Согласие на обработку персональных данных: подтверждено (${window.FormaAnalytics?.config?.consentVersion || '2026-08-11'})`,`Ссылка на заказ: ${orderUrl()}`",
    'Согласие на обработку персональных данных: подтверждено',
  );
  text = patchOnce(text,
    "    const message=checkoutText(data);",
    "    const message=checkoutText(data);\n    window.FormaAnalytics?.track('checkout_send', { channel, itemCount: cartQuantity(), total: cartTotal() });",
    "track('checkout_send'",
  );
  text = text.replace(
    "if(channel==='telegram'){window.open(`https://t.me/+${STORE_PHONE}?text=${encodeURIComponent(message)}`,'_blank','noopener');return;}",
    "if(channel==='telegram'){window.open(`https://t.me/share/url?url=${encodeURIComponent(orderUrl())}&text=${encodeURIComponent(message)}`,'_blank','noopener');return;}",
  );
  text = text.replace(/Заказ FORMA HOME(?! \/ ФОРМА ХОУМ)/g, 'Заказ FORMA HOME / ФОРМА ХОУМ');
  text = text.replace(/заказ в FORMA HOME(?! \/ ФОРМА ХОУМ)/g, 'заказ в FORMA HOME / ФОРМА ХОУМ');
  if (text.includes('https://t.me/+${STORE_PHONE}')) throw new Error('Некорректная Telegram-ссылка не исправлена.');
  return text;
}

function patchOnce(text, oldValue, newValue, marker) {
  if (text.includes(marker)) return text;
  const matches = text.split(oldValue).length - 1;
  if (matches !== 1) throw new Error(`Ожидался один фрагмент для «${marker}», найдено: ${matches}.`);
  return text.replace(oldValue, newValue);
}

function insertAfter(text, anchor, addition) {
  if (text.includes(addition.trim())) return text;
  if (!text.includes(anchor)) throw new Error(`Не найден фрагмент ${anchor}.`);
  return text.replace(anchor, `${anchor}${addition}`);
}

function copyFile(from, to) {
  const source = path.join(bundle, from);
  const destination = path.join(repo, to);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
}

function copyIfMissing(from, to) {
  if (!fs.existsSync(path.join(repo, to))) copyFile(from, to);
}

function copyTree(from, to) {
  const source = path.join(bundle, from);
  const destination = path.join(repo, to);
  fs.mkdirSync(destination, { recursive: true });
  fs.cpSync(source, destination, { recursive: true, force: true });
}

function parseArgs(values) {
  const result = { apply: false };
  for (let index = 0; index < values.length; index += 1) {
    if (values[index] === '--apply') result.apply = true;
    if (values[index] === '--repo') result.repo = values[index + 1];
  }
  return result;
}
