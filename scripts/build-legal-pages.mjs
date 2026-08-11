#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const bundleRoot = path.resolve(scriptDir, '..');
const [configArg, outputArg] = process.argv.slice(2);
if (!configArg || !outputArg) {
  console.error('Usage: node scripts/build-legal-pages.mjs LEGAL_CONFIG OUTPUT_NEXT_DIRECTORY');
  process.exit(2);
}

const configPath = path.resolve(configArg);
const outputDir = path.resolve(outputArg);
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const requiredProblems = findIncomplete(config);
if (requiredProblems.length) {
  console.error('Юридические страницы не созданы: заполните обязательные поля.');
  requiredProblems.forEach((problem) => console.error(`- ${problem}`));
  process.exit(1);
}

const pages = [
  ['seller-info.template.md', 'seller.html', 'Сведения о продавце'],
  ['privacy-policy.template.md', 'privacy.html', 'Политика обработки персональных данных'],
  ['consent.template.md', 'consent.html', 'Согласие на обработку персональных данных'],
  ['terms-and-returns.template.md', 'terms.html', 'Доставка, оплата, гарантия и возврат'],
];
fs.mkdirSync(outputDir, { recursive: true });
for (const [templateName, outputName, title] of pages) {
  const templatePath = path.join(bundleRoot, 'legal', templateName);
  const markdown = replaceTokens(fs.readFileSync(templatePath, 'utf8'), config);
  const html = pageHtml(title, markdownToHtml(markdown), config);
  fs.writeFileSync(path.join(outputDir, outputName), html, 'utf8');
}
console.log(`Создано юридических страниц: ${pages.length}.`);

function findIncomplete(value, prefix = '') {
  if (Array.isArray(value)) return value.flatMap((item, index) => findIncomplete(item, `${prefix}[${index}]`));
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, item]) => findIncomplete(item, prefix ? `${prefix}.${key}` : key));
  }
  const text = String(value ?? '').trim();
  return !text || /\[ОБЯЗАТЕЛЬНО/i.test(text) ? [prefix || 'неизвестное поле'] : [];
}

function replaceTokens(template, data) {
  return template.replace(/\{\{([a-zA-Z0-9_.]+)\}\}/g, (_, key) => {
    const value = key.split('.').reduce((current, part) => current?.[part], data);
    if (value == null) throw new Error(`Нет значения для {{${key}}}.`);
    return escapeHtml(String(value));
  });
}

function markdownToHtml(markdown) {
  const blocks = [];
  let paragraph = [];
  const flush = () => {
    if (!paragraph.length) return;
    blocks.push(`<p>${inline(paragraph.join(' '))}</p>`);
    paragraph = [];
  };
  for (const rawLine of markdown.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) { flush(); continue; }
    if (line.startsWith('# ')) { flush(); blocks.push(`<h1>${inline(line.slice(2))}</h1>`); continue; }
    if (line.startsWith('## ')) { flush(); blocks.push(`<h2>${inline(line.slice(3))}</h2>`); continue; }
    paragraph.push(line);
  }
  flush();
  return blocks.join('\n');
}

function inline(value) {
  return value.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
}

function pageHtml(title, content, config) {
  const russianName = escapeHtml(config.brand.russianName);
  const latinName = escapeHtml(config.brand.latinName);
  const displayName = `${latinName} / ${russianName}`;
  return `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="robots" content="index,follow">
  <title>${escapeHtml(title)} — ${displayName}</title>
  <link rel="stylesheet" href="styles.css?v=8">
  <link rel="stylesheet" href="final-design.css?v=1">
  <style>.legal-page{max-width:850px;padding:54px 0 90px}.legal-page h1{font-family:"Lora Variable",Lora,serif;font-size:clamp(34px,5vw,56px);line-height:1.06}.legal-page h2{margin-top:34px;font-family:"Lora Variable",Lora,serif;font-size:25px}.legal-page p{line-height:1.7;color:#45443f}.legal-nav{display:flex;gap:14px;flex-wrap:wrap;margin-top:44px}.legal-nav a{color:var(--accent-strong);text-underline-offset:3px}</style>
</head>
<body>
  <header class="site-header"><div class="nav shell"><a class="brand" href="index.html#catalog" aria-label="${displayName} — к каталогу"><span class="brand-mark"><span lang="en">${latinName}</span><span class="brand-separator" aria-hidden="true">/</span><span lang="ru">${russianName}</span></span></a></div></header>
  <main class="legal-page shell">${content}<nav class="legal-nav" aria-label="Юридические документы"><a href="seller.html">Продавец</a><a href="privacy.html">Политика данных</a><a href="consent.html">Согласие</a><a href="terms.html">Доставка и возврат</a></nav></main>
</body>
</html>\n`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}
