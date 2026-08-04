import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import vm from 'node:vm';

const writeResult = process.argv.includes('--write');

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

function loadManualGroups(source) {
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: 'product-color-groups.js' });
  return {
    colorGroups: Array.isArray(sandbox.window.PRODUCT_COLOR_GROUPS)
      ? sandbox.window.PRODUCT_COLOR_GROUPS
      : [],
    duplicateGroups: Array.isArray(sandbox.window.PRODUCT_DUPLICATE_GROUPS)
      ? sandbox.window.PRODUCT_DUPLICATE_GROUPS
      : []
  };
}

const normalize = value => String(value || '')
  .toLowerCase()
  .replace(/ё/g, 'е')
  .replace(/[‐‑‒–—−]/g, '-')
  .replace(/\s+/g, ' ')
  .trim();

const baseName = value => normalize(value)
  .replace(/\s*\/\s*\d+\s*шт\.?\s*в\s*упаковке\s*$/i, '')
  .replace(/\s*\(\s*\d+\s*шт\.?\s*в\s*упаковке\s*\)\s*$/i, '')
  .replace(/\s*\/\s*\d+\s*шт\.?\s*в\s*уп\.?\s*$/i, '')
  .replace(/\s*\(\s*\d+\s*шт\.?\s*в\s*уп\.?\s*\)\s*$/i, '')
  .replace(/\s+/g, ' ')
  .trim();

const specsSignature = value => normalize(value)
  .replace(/[×x]/g, 'х')
  .replace(/\s+/g, '')
  .trim();

function mergeGroups(current, additions) {
  const result = Array.isArray(current) ? current.map(group => ({ ...group })) : [];
  const seen = new Set(
    result.map(group => [...new Set((group.ids || []).map(Number).filter(Number.isFinite))]
      .sort((a, b) => a - b)
      .join(','))
  );
  for (const group of additions) {
    const ids = [...new Set((group.ids || []).map(Number).filter(Number.isFinite))];
    const key = [...ids].sort((a, b) => a - b).join(',');
    if (ids.length < 2 || seen.has(key)) continue;
    seen.add(key);
    result.push({ name: group.name || '', ids });
  }
  return result;
}

function buildAutoGroups(products, manualColorGroups, manualDuplicateGroups) {
  const manualColorIds = new Set(
    manualColorGroups.flatMap(group => group.ids || []).map(Number).filter(Number.isFinite)
  );
  const manualDuplicateIds = new Set(
    manualDuplicateGroups.flatMap(group => group.ids || []).map(Number).filter(Number.isFinite)
  );

  const buckets = new Map();
  products.forEach((product, index) => {
    const id = Number(product.id) || index + 1;
    const key = baseName(product.name);
    if (!key) return;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push({ product, id });
  });

  const autoColors = [];
  const autoDuplicates = [];
  for (const [name, items] of buckets.entries()) {
    if (items.length < 2) continue;
    const bySpecs = new Map();
    for (const item of items) {
      const signature = specsSignature(item.product.specs);
      if (!bySpecs.has(signature)) bySpecs.set(signature, []);
      bySpecs.get(signature).push(item);
    }

    const kept = [];
    for (const same of bySpecs.values()) {
      same.sort((a, b) =>
        (Number(a.product.wholesalePrice) || Infinity) -
        (Number(b.product.wholesalePrice) || Infinity) ||
        a.id - b.id
      );
      kept.push(same[0]);
      const candidates = same.filter(item => !manualDuplicateIds.has(item.id));
      if (candidates.length > 1) {
        autoDuplicates.push({ name, ids: candidates.map(item => item.id) });
      }
    }

    kept.sort((a, b) => a.id - b.id);
    if (kept.length > 1 && !items.some(item => manualColorIds.has(item.id))) {
      autoColors.push({ name, ids: kept.map(item => item.id) });
    }
  }

  return {
    colorGroups: mergeGroups(manualColorGroups, autoColors),
    duplicateGroups: mergeGroups(manualDuplicateGroups, autoDuplicates),
    autoColorGroupsAdded: autoColors.length,
    autoDuplicateGroupsAdded: autoDuplicates.length
  };
}

const COLORS = [
  ['светло-серый'],['темно-серый'],['тёмно-серый'],['серо-бежевый'],
  ['пыльно-розовый'],['темно-синий'],['тёмно-синий'],['темно-зеленый'],
  ['тёмно-зелёный'],['горчичный'],['терракотовый'],['бордовый'],
  ['антрацит'],['графит'],['черный'],['чёрный'],['белый'],
  ['молочный'],['кремовый'],['бежевый'],['песочный'],
  ['коричневый'],['коньячный'],['желтый'],['жёлтый'],
  ['оранжевый'],['красный'],['розовый'],['пудровый'],
  ['фиолетовый'],['сиреневый'],['синий'],['голубой'],
  ['бирюзовый'],['зеленый'],['зелёный'],['оливковый'],
  ['хаки'],['мятный'],['натуральный'],['дуб'],
  ['орех'],['венге'],['золотой'],['золото'],
  ['серебро'],['серебристый'],['хром'],['серый']
].map(([label]) => label);

function colorLabel(product) {
  const text = String(`${product?.specs || ''} ${product?.name || ''}`)
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^a-zа-я0-9]+/gi, ' ')
    .trim();
  for (const label of COLORS) {
    const normalizedLabel = label.toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9]+/gi, ' ').trim();
    if (text.includes(normalizedLabel)) return normalizedLabel;
  }
  return 'вариант';
}

const catalogSource = read('catalog-source.html');
const hiddenSource = read('hidden-products.json');
const groupsSource = read('product-color-groups.js');
const products = readConstArray(catalogSource, 'PRODUCTS');
const hiddenConfig = JSON.parse(hiddenSource);
const hiddenIds = new Set((hiddenConfig.ids || []).map(Number).filter(Number.isFinite));
const visibleProducts = products.filter(product => !hiddenIds.has(Number(product.id)));
const visibleById = new Map(visibleProducts.map(product => [Number(product.id), product]));

const manual = loadManualGroups(groupsSource);
const grouped = buildAutoGroups(visibleProducts, manual.colorGroups, manual.duplicateGroups);

const hiddenByColor = new Set();
let acceptedColorGroups = 0;
for (const group of grouped.colorGroups) {
  const variants = [...new Set((group.ids || []).map(Number).filter(Number.isFinite))]
    .map(id => visibleById.get(id))
    .filter(Boolean);
  const uniqueProducts = [...new Map(variants.map(product => [Number(product.id), product])).values()];
  const uniqueColors = new Set(uniqueProducts.map(colorLabel));
  if (uniqueProducts.length < 2 || uniqueColors.size < 2) continue;
  acceptedColorGroups += 1;
  uniqueProducts.slice(1).forEach(product => hiddenByColor.add(Number(product.id)));
}

const hiddenByDuplicate = new Set();
let acceptedDuplicateGroups = 0;
for (const group of grouped.duplicateGroups) {
  const members = [...new Set((group.ids || []).map(Number).filter(Number.isFinite))]
    .filter(id => visibleById.has(id));
  if (members.length < 2) continue;
  acceptedDuplicateGroups += 1;
  members.slice(1).forEach(id => hiddenByDuplicate.add(id));
}

const hiddenAfterGrouping = new Set([...hiddenByColor, ...hiddenByDuplicate]);
const finalCards = visibleProducts.filter(product => !hiddenAfterGrouping.has(Number(product.id))).length;
const inputHash = createHash('sha256')
  .update(catalogSource)
  .update(hiddenSource)
  .update(groupsSource)
  .digest('hex');

const result = {
  version: 1,
  inputHash,
  totalProducts: products.length,
  hiddenProducts: hiddenIds.size,
  productsAfterHiddenList: visibleProducts.length,
  finalUniqueCards: finalCards,
  removedByGrouping: visibleProducts.length - finalCards,
  hiddenByColorVariants: hiddenByColor.size,
  hiddenByExactDuplicates: hiddenByDuplicate.size,
  acceptedColorGroups,
  acceptedDuplicateGroups,
  autoColorGroupsAdded: grouped.autoColorGroupsAdded,
  autoDuplicateGroupsAdded: grouped.autoDuplicateGroupsAdded
};

const json = `${JSON.stringify(result, null, 2)}\n`;
if (writeResult) writeFileSync('catalog-card-count.json', json);
process.stdout.write(json);
