import fs from 'node:fs';

const catalogRaw = JSON.parse(fs.readFileSync(new URL('../catalog.json', import.meta.url), 'utf8'));
const models = Array.isArray(catalogRaw) ? catalogRaw : catalogRaw.products;
const tsv = fs.readFileSync(new URL('../data/forma-home-dimensions-from-price.tsv', import.meta.url), 'utf8').replace(/^\uFEFF/, '');
const lines = tsv.trimEnd().split(/\r?\n/);
const header = lines.shift();
if (header !== 'modelId\tsourceIds\tdimensions') throw new Error('Unexpected TSV header');

const rows = lines.map((line, index) => {
  const columns = line.split('\t');
  if (columns.length !== 3) throw new Error(`Invalid TSV row ${index + 2}`);
  return {
    rowNumber: index + 2,
    modelId: columns[0].trim(),
    sourceIds: columns[1].trim().split(/\s*,\s*/).filter(Boolean),
    dimensions: columns[2].trim().split(/\s*\|\s*/).filter(Boolean),
  };
});

const sourceIdCounts = new Map();
const variantsBySourceId = new Map();
for (const model of models) {
  for (const variant of model.variants || []) {
    const sourceId = String(variant.sourceId);
    sourceIdCounts.set(sourceId, (sourceIdCounts.get(sourceId) || 0) + 1);
    variantsBySourceId.set(sourceId, { model, variant });
  }
}

const exactDimensionPattern = /\d+(?:[.,]\d+)?(?:\s*-\s*\d+(?:[.,]\d+)?)?\s*(?:[xх×]\s*\d+(?:[.,]\d+)?(?:\s*-\s*\d+(?:[.,]\d+)?)?){1,2}\s*(?:см|мм|м)?/iu;
const unapplied = [];
const fallbackVariants = new Set();
const fallbackModels = new Set();
const fullySkippedRows = [];
const partiallyAppliedRows = [];
let foundModels = 0;

for (const row of rows) {
  let found = false;
  let fallbackCount = 0;
  for (const sourceId of row.sourceIds) {
    const match = variantsBySourceId.get(sourceId);
    if (!match) {
      unapplied.push({ row: row.rowNumber, modelId: row.modelId, sourceId, reason: 'sourceId отсутствует в текущем каталоге' });
      continue;
    }
    found = true;
    if (!exactDimensionPattern.test(String(match.variant.specs || ''))) {
      fallbackVariants.add(sourceId);
      fallbackModels.add(match.model.id);
      fallbackCount += 1;
    }
  }
  if (found) foundModels += 1;
  else if (!row.sourceIds.length) unapplied.push({ row: row.rowNumber, modelId: row.modelId, reason: 'в строке нет sourceId' });
  if (found && fallbackCount === 0) fullySkippedRows.push(row.rowNumber);
  else if (fallbackCount > 0 && fallbackCount < row.sourceIds.length) partiallyAppliedRows.push(row.rowNumber);
}

const duplicateSourceIds = [...sourceIdCounts].filter(([, count]) => count > 1).map(([id]) => id);
const catalogSourceIds = new Set(variantsBySourceId.keys());
const auditedSourceIds = new Set([...sourceIdCounts.keys()]);
const lostSourceIds = [...catalogSourceIds].filter(id => !auditedSourceIds.has(id));

const report = {
  tsvRowsRead: rows.length,
  tsvModelsFound: foundModels,
  fallbackVariants: fallbackVariants.size,
  fallbackModels: fallbackModels.size,
  fallbackRows: rows.length - fullySkippedRows.length,
  fullySkippedRows: compressRanges(fullySkippedRows),
  fullySkippedReason: 'у всех Variant/sourceId строки уже есть более точные размеры в исходных характеристиках',
  partiallyAppliedRows: compressRanges(partiallyAppliedRows),
  partiallyAppliedReason: 'fallback применён только к Variant/sourceId без точных размеров; остальные sourceId строки сохранили исходные размеры',
  unapplied,
  lostSourceIds: lostSourceIds.length,
  duplicateSourceIds: duplicateSourceIds.length,
};

console.log(JSON.stringify(report, null, 2));
if (rows.length !== 384 || unapplied.length || lostSourceIds.length || duplicateSourceIds.length) process.exitCode = 1;

function compressRanges(numbers) {
  const ranges = [];
  for (const number of numbers) {
    const last = ranges.at(-1);
    if (last && number === last[1] + 1) last[1] = number;
    else ranges.push([number, number]);
  }
  return ranges.map(([start, end]) => start === end ? String(start) : `${start}-${end}`).join(', ');
}
