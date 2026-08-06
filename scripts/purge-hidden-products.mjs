// Одноразовая проверенная очистка скрытых товаров.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
const catalogPath = path.join(root, "catalog-source.html");
const hiddenPath = path.join(root, "hidden-products.json");
const archiveRelativePath = "archive/hidden-products-removed-2026-08-06.json";
const archivePath = path.join(root, archiveRelativePath);

function findProductsArray(source) {
  const declaration = /\bconst\s+PRODUCTS\s*=\s*/g;
  const match = declaration.exec(source);
  if (!match) throw new Error("Не найдено объявление const PRODUCTS");

  const start = source.indexOf("[", match.index + match[0].length);
  if (start < 0) throw new Error("Не найдено начало массива PRODUCTS");

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < source.length; index += 1) {
    const char = source[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === "[") depth += 1;
    if (char === "]") {
      depth -= 1;
      if (depth === 0) return { start, end: index };
    }
  }

  throw new Error("Не найден конец массива PRODUCTS");
}

if (!fs.existsSync(catalogPath)) throw new Error("catalog-source.html отсутствует");
if (!fs.existsSync(hiddenPath)) throw new Error("hidden-products.json отсутствует");

const hiddenConfig = JSON.parse(fs.readFileSync(hiddenPath, "utf8"));
const hiddenIds = [...new Set((hiddenConfig.ids || []).map(Number).filter(Number.isFinite))];

if (!hiddenIds.length) {
  console.log("Список скрытых товаров уже пуст — удалять нечего.");
  process.exit(0);
}

if (Number(hiddenConfig.count) !== hiddenIds.length) {
  throw new Error(`Количество скрытых ID не совпадает: count=${hiddenConfig.count}, ids=${hiddenIds.length}`);
}

const catalogSource = fs.readFileSync(catalogPath, "utf8");
const { start, end } = findProductsArray(catalogSource);
const productsJson = catalogSource.slice(start, end + 1);
const products = JSON.parse(productsJson);

if (!Array.isArray(products)) throw new Error("PRODUCTS не является массивом");

const hiddenSet = new Set(hiddenIds);
const removedProducts = products.filter(product => hiddenSet.has(Number(product?.id)));
const keptProducts = products.filter(product => !hiddenSet.has(Number(product?.id)));
const removedIds = new Set(removedProducts.map(product => Number(product?.id)));
const missingIds = hiddenIds.filter(id => !removedIds.has(id));

if (missingIds.length) {
  throw new Error(`В каталоге не найдены скрытые ID: ${missingIds.join(", ")}`);
}

if (removedProducts.length !== hiddenIds.length) {
  throw new Error(`Удалено ${removedProducts.length}, ожидалось ${hiddenIds.length}`);
}

if (keptProducts.length + removedProducts.length !== products.length) {
  throw new Error("Нарушена целостность массива PRODUCTS");
}

const originalHash = crypto.createHash("sha256").update(productsJson).digest("hex");
const updatedProductsJson = JSON.stringify(keptProducts);
const updatedHash = crypto.createHash("sha256").update(updatedProductsJson).digest("hex");
const updatedCatalogSource =
  catalogSource.slice(0, start) + updatedProductsJson + catalogSource.slice(end + 1);

fs.mkdirSync(path.dirname(archivePath), { recursive: true });
fs.writeFileSync(
  archivePath,
  JSON.stringify(
    {
      version: 1,
      removedAt: "2026-08-06",
      sourceFile: "catalog-source.html",
      originalProductCount: products.length,
      remainingProductCount: keptProducts.length,
      removedCount: removedProducts.length,
      originalProductsSha256: originalHash,
      remainingProductsSha256: updatedHash,
      originalHiddenConfig: hiddenConfig,
      removedProducts
    },
    null,
    2
  ) + "\n",
  "utf8"
);

fs.writeFileSync(catalogPath, updatedCatalogSource, "utf8");
fs.writeFileSync(
  hiddenPath,
  JSON.stringify({
    version: Number(hiddenConfig.version || 0) + 1,
    updatedAt: "2026-08-06",
    source: "Скрытые товары физически удалены из catalog-source.html",
    count: 0,
    ids: [],
    removedCount: removedProducts.length,
    removedArchive: archiveRelativePath,
    previousSource: hiddenConfig.source || null
  }) + "\n",
  "utf8"
);

const verificationSource = fs.readFileSync(catalogPath, "utf8");
const verificationRange = findProductsArray(verificationSource);
const verificationProducts = JSON.parse(
  verificationSource.slice(verificationRange.start, verificationRange.end + 1)
);
const remainingHidden = verificationProducts
  .map(product => Number(product?.id))
  .filter(id => hiddenSet.has(id));

if (remainingHidden.length) {
  throw new Error(`После записи остались скрытые ID: ${remainingHidden.join(", ")}`);
}
if (verificationProducts.length !== keptProducts.length) {
  throw new Error("Контрольное количество товаров после записи не совпадает");
}

console.log(`Удалено скрытых товаров: ${removedProducts.length}`);
console.log(`Было товаров: ${products.length}`);
console.log(`Осталось товаров: ${keptProducts.length}`);
console.log(`Архив: ${archiveRelativePath}`);
