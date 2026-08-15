import { readFile, writeFile } from 'node:fs/promises';

const dataRoot = new URL('../data/', import.meta.url);
const detailPaths = Array.from({ length: 14 }, (_, index) => `details/${String(index + 1).padStart(3, '0')}.json`);
const packagingPattern = /\d+\s*(?:шт\.?|штук)\s*(?:в\s*(?:\d+\s*(?:[-–—]\s*х)?\s*)?)?(?:упаковк[а-яёa-z]*|уп\.?)/iu;
const ignoredNameWords = new Set(['стул', 'кресло', 'стол', 'обеденный', 'барный', 'офисное', 'мягкое', 'сиденье', 'сидение', 'chair', 'iron', 'soft', 'fashion']);
const colorWords = ['бел', 'черн', 'сер', 'беж', 'корич', 'орех', 'натурал', 'олив', 'зел', 'син', 'голуб', 'бирюз', 'корал', 'лаванд', 'желт', 'крем', 'песоч', 'коф', 'изумруд', 'светло', 'темно'];

const readJson = async path => JSON.parse(await readFile(new URL(path, dataRoot), 'utf8'));
const writeJson = (path, value) => writeFile(new URL(path, dataRoot), JSON.stringify(value), 'utf8');
const stripPackaging = value => String(value ?? '')
  .replace(/\(\s*\d+\s*(?:шт\.?|штук)\s*(?:в\s*(?:\d+\s*(?:[-–—]\s*х)?\s*)?)?(?:упаковк[а-яёa-z]*|уп\.?)\s*\)/giu, ' ')
  .replace(/,\s*\d+\s*(?:шт\.?|штук)\s*(?:в\s*(?:\d+\s*(?:[-–—]\s*х)?\s*)?)?(?:упаковк[а-яёa-z]*|уп\.?)\s*\)/giu, ')')
  .replace(/(?:\s*[\[(/,-]?\s*)\d+\s*(?:шт\.?|штук)\s*(?:в\s*(?:\d+\s*(?:[-–—]\s*х)?\s*)?)?(?:упаковк[а-яёa-z]*|уп\.?)/giu, ' ')
  .replace(/\s+/g, ' ').trim();
const hasPackaging = value => packagingPattern.test(value || '');
const modelCode = value => {
  const match = String(value ?? '').match(/\(\s*мод\.?\s*([^)]+)\)/iu);
  return match ? match[1].toLocaleLowerCase('ru-RU').replace(/[^a-zа-яё0-9]+/giu, '') : '';
};
const nameKey = value => stripPackaging(value).toLocaleLowerCase('ru-RU').replace(/ё/gu, 'е')
  .replace(/\([^)]*\)/g, ' ').replace(/\b\d+\b/gu, ' ').replace(/[^a-zа-яё]+/giu, ' ')
  .split(/\s+/).filter(Boolean).filter(word => !ignoredNameWords.has(word)).sort().join(' ');
const dimensions = value => {
  const match = String(value ?? '').match(/(\d+(?:[.,]\d+)?)\s*[хx×*]\s*(\d+(?:[.,]\d+)?)\s*[хx×*]\s*(\d+(?:[.,]\d+)?)/iu);
  return match ? match.slice(1).map(part => Number(part.replace(',', '.'))) : null;
};
const dimensionsClose = (left, right) => left && right && left.length === right.length && left.every((size, index) => Math.abs(size - right[index]) <= 1);
const constructionKey = product => {
  const text = [product.name, ...(product.variants || []).map(variant => `${variant.specs || ''} ${variant.label || ''}`)].join(' ').toLocaleLowerCase('ru-RU');
  return [
    /опора\s*360|(?:поворотн|вращающ)[а-яё]*/iu.test(text) ? 'swivel' : '',
    /полоз[а-яё]*/iu.test(text) ? 'runners' : '',
    /(?:колес|крестовин|газлифт)[а-яё]*/iu.test(text) ? 'casters' : '',
    /без\s+подлокотник[а-яё]*/iu.test(text) ? 'no-armrests' : '',
    /с\s+подлокотник[а-яё]*/iu.test(text) ? 'armrests' : '',
    /(?:раскладн|складн)[а-яё]*/iu.test(text) ? 'folding' : ''
  ].filter(Boolean).join('|') || 'standard';
};
const constructionLabel = key => key.split('|').map(part => ({ swivel: 'поворотная опора', runners: 'опора-полозья', casters: 'на колёсах', 'no-armrests': 'без подлокотников', armrests: 'с подлокотниками', folding: 'складная конструкция' })[part]).filter(Boolean).join(' · ');
const variantKey = variant => {
  const text = String(variant.specs || variant.label || '').toLocaleLowerCase('ru-RU').replace(/ё/gu, 'е').replace(/barkhat/giu, 'бархат').replace(/torquoise/giu, 'бирюзовый');
  const hlr = text.match(/hlr\s*(\d+)/iu)?.[1];
  const size = dimensions(text)?.join('x') || '';
  const colors = colorWords.filter(word => text.includes(word)).join('|');
  return `${hlr ? `hlr${hlr}` : size}:${colors}`;
};
const variantLabelKey = variant => String(variant.label || '').toLocaleLowerCase('ru-RU').replace(/ё/gu, 'е').replace(/[^a-zа-яё0-9]+/giu, ' ').replace(/\s+/g, ' ').trim();
const minPrice = product => Math.min(...product.variants.map(variant => Number(variant.wholesalePrice) || Infinity));

function confirmedPairs(products) {
  const pairs = [];
  const unpackaged = products.filter(product => !hasPackaging(product.name));
  for (const packaged of products.filter(product => hasPackaging(product.name))) {
    for (const plain of unpackaged) {
      if (nameKey(packaged.name) !== nameKey(plain.name) || constructionKey(packaged) !== constructionKey(plain)) continue;
      const sameCode = modelCode(packaged.name) && modelCode(packaged.name) === modelCode(plain.name);
      const sameVariant = packaged.variants.some(left => plain.variants.some(right => variantKey(left) === variantKey(right) && (dimensionsClose(dimensions(left.specs || left.label), dimensions(right.specs || right.label)) || (variantLabelKey(left) && variantLabelKey(left) === variantLabelKey(right)))));
      if (sameCode || sameVariant) pairs.push([packaged.id, plain.id]);
    }
  }
  return pairs;
}

function connectedComponents(ids, pairs) {
  const neighbors = new Map(ids.map(id => [id, new Set()]));
  pairs.forEach(([left, right]) => { neighbors.get(left).add(right); neighbors.get(right).add(left); });
  const visited = new Set();
  return ids.flatMap(id => {
    if (visited.has(id)) return [];
    const component = [], queue = [id];
    visited.add(id);
    while (queue.length) {
      const current = queue.shift();
      component.push(current);
      neighbors.get(current).forEach(next => { if (!visited.has(next)) { visited.add(next); queue.push(next); } });
    }
    return component.length > 1 ? [component] : [];
  });
}

function uniqueVariants(products, indexById) {
  const winners = new Map();
  products.forEach(product => product.variants.forEach((variant, variantIndex) => {
    const candidate = { variant, product, order: indexById.get(product.id) * 10000 + variantIndex };
    const key = variantKey(variant), current = winners.get(key);
    if (current) current.candidates.push(candidate);
    const candidatePreferred = Number(candidate.variant.wholesalePrice) < Number(current?.variant.wholesalePrice)
      || (Number(candidate.variant.wholesalePrice) === Number(current?.variant.wholesalePrice) && !hasPackaging(candidate.product.name) && hasPackaging(current?.product.name));
    if (!current) winners.set(key, { ...candidate, candidates: [candidate] });
    else if (candidatePreferred) winners.set(key, { ...candidate, candidates: current.candidates });
  }));
  return [...winners.values()].sort((left, right) => left.order - right.order);
}

const index = await readJson('catalog-index.json');
const shardEntries = await Promise.all(detailPaths.map(async path => [path, await readJson(path)]));
const shards = new Map(shardEntries);
const indexById = new Map(index.products.map((product, position) => [product.id, position]));
const indexProducts = new Map(index.products.map(product => [product.id, product]));
const detailById = new Map([...shards.values()].flatMap(shard => Object.values(shard.products)).map(product => [product.id, product]));
const components = connectedComponents(index.products.map(product => product.id), confirmedPairs(index.products));
const removedIds = new Set();

for (const ids of components) {
  const products = ids.map(id => indexProducts.get(id));
  const survivor = [...products].sort((left, right) => minPrice(left) - minPrice(right) || Number(hasPackaging(left.name)) - Number(hasPackaging(right.name)) || indexById.get(left.id) - indexById.get(right.id))[0];
  const selected = uniqueVariants(products, indexById);
  const fullBySourceId = new Map(products.flatMap(product => detailById.get(product.id).variants).map(variant => [String(variant.sourceId), variant]));
  const fullVariants = selected.map(({ variant, candidates }) => {
    const full = fullBySourceId.get(String(variant.sourceId));
    const images = [...new Set(candidates.flatMap(candidate => fullBySourceId.get(String(candidate.variant.sourceId))?.images || []))];
    return { ...full, images, localImageCount: images.length, mergedDuplicateSourceIds: candidates.map(candidate => candidate.variant.sourceId).filter(sourceId => String(sourceId) !== String(variant.sourceId)) };
  });
  const full = detailById.get(survivor.id);
  full.name = stripPackaging(full.name);
  full.variants = fullVariants;
  full.variantCount = fullVariants.length;
  delete full.searchText;
  survivor.name = stripPackaging(survivor.name);
  survivor.variants = selected.map(({ variant }) => variant);
  survivor.variantCount = survivor.variants.length;
  delete survivor.searchText;
  ids.filter(id => id !== survivor.id).forEach(id => removedIds.add(id));
}

for (const product of index.products) {
  product.name = stripPackaging(product.name);
  delete product.searchText;
  const full = detailById.get(product.id);
  if (full) { full.name = stripPackaging(full.name); delete full.searchText; }
}

for (const shard of shards.values()) Object.keys(shard.products).forEach(id => { if (removedIds.has(id)) delete shard.products[id]; });

index.products = index.products.filter(product => !removedIds.has(product.id));
const constructionFamilies = new Map();
index.products.forEach(product => {
  const key = stripPackaging(product.name).toLocaleLowerCase('ru-RU');
  if (!constructionFamilies.has(key)) constructionFamilies.set(key, new Set());
  constructionFamilies.get(key).add(constructionKey(product));
});
index.products.forEach(product => {
  const constructions = constructionFamilies.get(product.name.toLocaleLowerCase('ru-RU'));
  const key = constructionKey(product);
  if (constructions.size > 1 && key !== 'standard') product.name = `${product.name} — ${constructionLabel(key)}`;
});
index.stats = { ...index.stats, models: index.products.length, variants: index.products.reduce((count, product) => count + product.variants.length, 0), dualAxisVariants: index.products.flatMap(product => product.variants).filter(variant => variant.axes?.soft && variant.axes?.hard).length };

const errors = [
  ...index.products.filter(product => hasPackaging(product.name)).map(product => `Упаковка осталась в имени ${product.id}`),
  ...index.products.filter(product => !detailById.has(product.id)).map(product => `Нет подробной карточки ${product.id}`),
  ...index.products.flatMap(product => product.variants.filter(variant => !detailById.get(product.id).variants.some(full => String(full.sourceId) === String(variant.sourceId))).map(variant => `Нет варианта ${variant.sourceId} в ${product.id}`))
];
if (errors.length) throw new Error(errors.join('\n'));
await Promise.all([...shards].map(([path, shard]) => writeJson(path, shard)));
await writeJson('catalog-index.json', index);
console.log(JSON.stringify({ removedModels: removedIds.size, models: index.stats.models, variants: index.stats.variants, pairedModels: components }, null, 2));
