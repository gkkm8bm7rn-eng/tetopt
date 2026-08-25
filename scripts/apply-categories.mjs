import { readFile, readdir, writeFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const readJson = async path => JSON.parse(await readFile(new URL(path, root), 'utf8'));
const writeJson = (path, value, pretty = false) => writeFile(new URL(path, root), JSON.stringify(value, null, pretty ? 2 : 0) + (pretty ? '\n' : ''), 'utf8');
const detailPaths = (await readdir(new URL('data/details/', root)))
  .filter(name => name.endsWith('.json'))
  .sort()
  .map(name => `data/details/${name}`);

const assignments = await readJson('data/category-assignments.json');
const categoryLabels = assignments.categoryLabels;
const codesFor = product => [...new Set((product.variants || []).flatMap(variant => assignments.assignments[String(variant.sourceId)] || []))]
  .sort((left, right) => Number(left) - Number(right));
const categorize = product => {
  const categoryCodes = codesFor(product);
  if (!categoryCodes.length) throw new Error(`Нет категории для ${product.id}`);
  return {
    ...product,
    category: categoryLabels[categoryCodes[0]],
    categoryCodes,
  };
};

const catalog = await readJson('catalog.json');
catalog.products = catalog.products.map(categorize);

const index = await readJson('data/catalog-index.json');
index.products = index.products.map(categorize);

const shards = await Promise.all(detailPaths.map(async path => [path, await readJson(path)]));
for (const [, shard] of shards) {
  shard.products = Object.fromEntries(Object.entries(shard.products).map(([id, product]) => [id, categorize(product)]));
}

await Promise.all([
  writeJson('catalog.json', catalog, true),
  writeJson('data/catalog-index.json', index),
  ...shards.map(([path, shard]) => writeJson(path, shard)),
]);

const productCounts = {};
for (const product of index.products) {
  for (const code of product.categoryCodes) productCounts[code] = (productCounts[code] || 0) + 1;
}
console.log(JSON.stringify({ models: index.products.length, productCounts }, null, 2));
