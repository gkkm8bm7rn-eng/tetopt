// Последняя проверка реестров после всех автоматических и ручных группировок.
// У каждого дубля остаётся один канонический ID; цветовые группы ссылаются только на него.
(() => {
  "use strict";
  const originalWrite = document.write.bind(document);

  function runtime() {
    "use strict";
    const products = (() => {
      try { if (typeof PRODUCTS !== "undefined" && Array.isArray(PRODUCTS)) return PRODUCTS; } catch {}
      return Array.isArray(window.PRODUCTS) ? window.PRODUCTS : [];
    })();
    if (!products.length) return;

    const idOf = (product, index = 0) => Number(product?.id) || index + 1;
    const byId = new Map(products.map((product, index) => [idOf(product, index), product]));
    const order = new Map(products.map((product, index) => [idOf(product, index), index]));
    const normalize = value => String(value || "").toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ").trim();
    const hasPackage = product => /(?:\d+\s*шт|упаковк|\bуп\.?\b)/i.test(normalize(`${product?.name || ""} ${product?.specs || ""}`));
    const price = product => {
      for (const key of ["wholesalePrice", "price", "retailPrice"]) {
        const value = Number(String(product?.[key] ?? "").replace(/\s+/g, "").replace(",", "."));
        if (Number.isFinite(value) && value >= 0) return value;
      }
      return Number.POSITIVE_INFINITY;
    };
    const unique = ids => [...new Set((ids || []).map(Number).filter(id => byId.has(id)))];

    const adjacency = new Map();
    const connect = (left, right) => {
      if (!adjacency.has(left)) adjacency.set(left, new Set());
      if (!adjacency.has(right)) adjacency.set(right, new Set());
      adjacency.get(left).add(right);
      adjacency.get(right).add(left);
    };
    for (const group of Array.isArray(window.PRODUCT_DUPLICATE_GROUPS) ? window.PRODUCT_DUPLICATE_GROUPS : []) {
      const ids = unique(group.ids);
      for (let index = 1; index < ids.length; index += 1) connect(ids[0], ids[index]);
    }

    const canonicalById = new Map();
    const reconciled = [];
    const visited = new Set();
    for (const start of adjacency.keys()) {
      if (visited.has(start)) continue;
      const stack = [start];
      const component = [];
      visited.add(start);
      while (stack.length) {
        const id = stack.pop();
        component.push(id);
        for (const next of adjacency.get(id) || []) {
          if (visited.has(next)) continue;
          visited.add(next);
          stack.push(next);
        }
      }
      component.sort((left, right) =>
        Number(hasPackage(byId.get(left))) - Number(hasPackage(byId.get(right))) ||
        price(byId.get(left)) - price(byId.get(right)) ||
        (order.get(left) || 0) - (order.get(right) || 0)
      );
      const canonical = component[0];
      component.forEach(id => canonicalById.set(id, canonical));
      if (component.length > 1) {
        reconciled.push({
          name: `${byId.get(canonical)?.name || "Товар"} — объединённые дубли`,
          ids: component
        });
      }
    }
    window.PRODUCT_DUPLICATE_GROUPS = reconciled;

    const canonical = id => canonicalById.get(Number(id)) || Number(id);
    const seenColorIds = new Set();
    const finalColors = [];
    for (const group of Array.isArray(window.PRODUCT_COLOR_GROUPS) ? window.PRODUCT_COLOR_GROUPS : []) {
      const ids = unique((group.ids || []).map(canonical));
      const nonOverlapping = ids.filter(id => !seenColorIds.has(id));
      if (nonOverlapping.length < 2) continue;
      nonOverlapping.forEach(id => seenColorIds.add(id));
      finalColors.push({ ...group, ids: nonOverlapping });
    }
    window.PRODUCT_COLOR_GROUPS = finalColors;

    const conflictingPrimaries = [];
    const primaryById = new Map();
    reconciled.forEach(group => group.ids.forEach(id => {
      const previous = primaryById.get(id);
      const primary = group.ids[0];
      if (previous && previous !== primary) conflictingPrimaries.push({ id, previous, primary });
      primaryById.set(id, primary);
    }));

    window.__CATALOG_GROUP_FINAL_AUDIT__ = {
      version: 1,
      duplicateComponents: reconciled.length,
      duplicateIds: reconciled.reduce((sum, group) => sum + group.ids.length, 0),
      colorGroups: finalColors.length,
      groupedColorIds: finalColors.reduce((sum, group) => sum + group.ids.length, 0),
      conflictingPrimaries,
      valid: conflictingPrimaries.length === 0
    };
    window.dispatchEvent(new CustomEvent("forma:product-groups-ready", {
      detail: window.__CATALOG_GROUP_FINAL_AUDIT__
    }));
  }

  document.write = function patchedWrite(...parts) {
    let html = parts.join("");
    if (typeof html === "string" && html.includes("</body>")) {
      html = html.replace("</body>", `<script>(${runtime.toString()})();<\/script></body>`);
      return originalWrite(html);
    }
    return originalWrite(...parts);
  };
})();
