// Автоматическая группировка непроверенных карточек по названию товара.
// Упаковка не создаёт новую модель; разные цвета остаются вариантами;
// среди точных дублей одного цвета остаётся карточка с минимальной оптовой ценой.
(() => {
  "use strict";
  const originalWrite = document.write.bind(document);

  function runtime() {
    "use strict";
    const normalize = value => String(value || "")
      .toLowerCase()
      .replace(/ё/g, "е")
      .replace(/[‐‑‒–—−]/g, "-")
      .replace(/\s+/g, " ")
      .trim();

    const baseName = value => normalize(value)
      .replace(/\s*\/\s*\d+\s*шт\.?\s*в\s*упаковке\s*$/i, "")
      .replace(/\s*\(\s*\d+\s*шт\.?\s*в\s*упаковке\s*\)\s*$/i, "")
      .replace(/\s*\/\s*\d+\s*шт\.?\s*в\s*уп\.?\s*$/i, "")
      .replace(/\s*\(\s*\d+\s*шт\.?\s*в\s*уп\.?\s*\)\s*$/i, "")
      .replace(/\s+/g, " ")
      .trim();

    const specsSignature = value => normalize(value)
      .replace(/[×x]/g, "х")
      .replace(/\s+/g, "")
      .trim();

    const products = (() => {
      try {
        if (typeof PRODUCTS !== "undefined" && Array.isArray(PRODUCTS)) return PRODUCTS;
      } catch {}
      return Array.isArray(window.PRODUCTS) ? window.PRODUCTS : [];
    })();
    if (!products.length) return;

    const idOf = (product, index) => Number(product.id) || index + 1;
    const manualColorIds = new Set(
      (window.PRODUCT_COLOR_GROUPS || []).flatMap(group => group.ids || []).map(Number)
    );
    const manualDuplicateIds = new Set(
      (window.PRODUCT_DUPLICATE_GROUPS || []).flatMap(group => group.ids || []).map(Number)
    );

    const buckets = new Map();
    products.forEach((product, index) => {
      const id = idOf(product, index);
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
          autoDuplicates.push({
            name,
            ids: candidates.map(item => item.id)
          });
        }
      }

      kept.sort((a, b) => a.id - b.id);
      if (kept.length > 1 && !items.some(item => manualColorIds.has(item.id))) {
        autoColors.push({
          name,
          ids: kept.map(item => item.id)
        });
      }
    }

    const merge = (current, additions) => {
      const result = Array.isArray(current) ? [...current] : [];
      const seen = new Set(
        result.map(group => [...new Set((group.ids || []).map(Number))]
          .sort((a, b) => a - b)
          .join(","))
      );

      for (const group of additions) {
        const ids = [...new Set(group.ids.map(Number).filter(Number.isFinite))];
        const key = [...ids].sort((a, b) => a - b).join(",");
        if (ids.length < 2 || seen.has(key)) continue;
        seen.add(key);
        result.push({ name: group.name, ids });
      }
      return result;
    };

    window.PRODUCT_COLOR_GROUPS = merge(window.PRODUCT_COLOR_GROUPS, autoColors);
    window.PRODUCT_DUPLICATE_GROUPS = merge(window.PRODUCT_DUPLICATE_GROUPS, autoDuplicates);
    window.__AUTO_PRODUCT_GROUP_AUDIT__ = {
      rule: "normalized product name; package ignored; colors merged; cheapest exact duplicate kept",
      colorGroupsAdded: autoColors.length,
      duplicateGroupsAdded: autoDuplicates.length,
      duplicateCardsHidden: autoDuplicates.reduce((sum, group) => sum + group.ids.length - 1, 0)
    };
  }

  document.write = function patchedWrite(...parts) {
    let html = parts.join("");
    if (typeof html === "string" && html.includes("</body>")) {
      html = html.replace("</body>", `<script>(${runtime.toString()})();<\/script></body>`);
    }
    return originalWrite(html);
  };
})();
