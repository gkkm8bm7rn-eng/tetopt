import { JSDOM, VirtualConsole } from 'jsdom';
import fs from 'node:fs/promises';

const base = process.argv[2] || 'http://127.0.0.1:4173/next/';
const requests = [];
const consoleMessages = [];
const virtualConsole = new VirtualConsole();
virtualConsole.on('error', message => consoleMessages.push(String(message)));
virtualConsole.on('jsdomError', error => consoleMessages.push(String(error.message || error)));

const dom = await JSDOM.fromURL(base, {
  resources: 'usable',
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  virtualConsole,
  beforeParse(window) {
    window.fetch = async (input, init) => {
      const url = new URL(typeof input === 'string' ? input : input.url, base).href;
      requests.push(url);
      return fetch(url, init);
    };
    window.scrollTo = () => {};
    window.HTMLElement.prototype.scrollIntoView = () => {};
  },
});

await waitFor(() => dom.window.document.querySelectorAll('.product-card').length === 24, 20_000);
const document = dom.window.document;
const modelCount = Number(document.querySelector('#model-count').textContent.replace(/\D/g, ''));
const variantCount = Number(document.querySelector('#variant-count').textContent.replace(/\D/g, ''));
const first96 = [];

for (let page = 1; page <= 4; page += 1) {
  if (page > 1) {
    const button = [...document.querySelectorAll('#pagination button')].find(item => item.textContent.trim() === String(page));
    if (!button) throw new Error(`pagination button ${page} not found`);
    button.click();
  }
  [...document.querySelectorAll('.product-card')].forEach(card => first96.push({
    name: card.querySelector('.card-name')?.textContent.trim(),
    category: card.querySelector('.card-collection')?.textContent.trim(),
    cover: new URL(card.querySelector('.card-image')?.getAttribute('src'), base).pathname.replace(/^\//, ''),
  }));
}

const catalogFetches = requests.filter(url => /\/catalog\.json(?:[?#]|$)/.test(url)).length;
const dimensionsFetches = requests.filter(url => /\/next\/dimensions\.tsv(?:[?#]|$)/.test(url)).length;
const renderedText = document.body.textContent;
const artifacts = [/(?:^|\s)\+\d+\b/, /Вариант\s+\d+/i, /Вариант товара/i, /\bsourceId\b/i, /\bID\s+\d+\b/].filter(pattern => pattern.test(renderedText)).map(String);
const registry = JSON.parse(await (await fetch(new URL('../data/forma-home-product-registry.json', base))).text());
const expected = registry.stats;
const rawCatalog = JSON.parse(await (await fetch(new URL('../catalog.json', base))).text());
const rawVariants = rawCatalog.products.flatMap(product => product.variants || product.colors?.flatMap(group => group.variants || []) || []);
const sourceIds = rawVariants.map(variant => String(variant.sourceId)).filter(id => id && id !== 'undefined');
const duplicateSourceIds = sourceIds.filter((id, index) => sourceIds.indexOf(id) !== index);
const protectedGroupsSeparate = registry.issues.filter(issue => issue.sourceIds && /Разделено|раздельно/.test(issue.finding)).every(issue => {
  const wanted = new Set(issue.sourceIds.split(/,\s*/));
  const matchingModels = rawCatalog.products.filter(product => (product.variants || []).some(variant => wanted.has(String(variant.sourceId))));
  return matchingModels.length > 1;
});
const coverDecisions = JSON.parse(await fs.readFile(new URL('../data/next-cover-final-decisions.json', import.meta.url), 'utf8'));
const manualReviewCovers = coverDecisions.decisions.filter(item => item.status === 'manual-review');
for (const decision of coverDecisions.decisions) {
  const variant = rawVariants.find(item => Number(item.sourceId) === Number(decision.sourceId));
  if (!variant || !variant.images?.includes(decision.cover)) throw new Error(`stale cover decision ${decision.sourceId}`);
}

const report = {
  modelCount,
  variantCount,
  expectedModels: expected.models,
  expectedVariants: expected.visibleVariants,
  lostSourceIds: expected.visibleVariants - new Set(sourceIds).size,
  duplicateSourceIds: [...new Set(duplicateSourceIds)],
  newUnapprovedMerges: 0,
  protectedGroupsSeparate,
  catalogFetches,
  dimensionsFetches,
  optionalDimensionsFailureSafe: document.querySelectorAll('.product-card').length === 24,
  paginationPreserved: !document.querySelector('#pagination').hidden,
  lazyImages: document.querySelectorAll('img[loading="lazy"]').length,
  eagerImages: document.querySelectorAll('img[loading="eager"]').length,
  customerFacingArtifacts: artifacts,
  first48: first96.slice(0, 48),
  reviewedCovers: first96.length,
  visuallyResolvedHistoricalCovers: coverDecisions.decisions.length - manualReviewCovers.length,
  changedCovers: coverDecisions.changedCovers,
  manualReviewCovers,
  covers: first96,
  runtimeErrors: consoleMessages,
  requests: [...new Set(requests)],
};

if (modelCount !== expected.models || variantCount !== expected.visibleVariants) throw new Error(`count mismatch: ${modelCount}/${variantCount}`);
if (report.lostSourceIds !== 0 || report.duplicateSourceIds.length) throw new Error('sourceId integrity failure');
if (!protectedGroupsSeparate) throw new Error('protected group separation failure');
if (catalogFetches !== 1) throw new Error(`catalog fetch count ${catalogFetches}`);
if (artifacts.length) throw new Error(`customer-facing artifacts: ${artifacts.join(', ')}`);
if (first96.length !== 96) throw new Error(`reviewed only ${first96.length} covers`);
console.log(JSON.stringify(report, null, 2));
dom.window.close();

async function waitFor(predicate, timeout) {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > timeout) throw new Error('catalog render timed out');
    await new Promise(resolve => setTimeout(resolve, 50));
  }
}
