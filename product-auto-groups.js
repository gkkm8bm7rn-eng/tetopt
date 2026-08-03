// Автоматическая группировка непроверенных карточек.
// Правило: тип + подтип + название модели + размеры/конструкция.
// Упаковка не создаёт новую модель; среди точных дублей остаётся самый дешёвый.
(() => {
  "use strict";
  const originalWrite = document.write.bind(document);

  function runtime() {
    "use strict";
    const normalize = value => String(value || "").toLowerCase().replace(/ё/g,"е").replace(/\s+/g," ").trim();
    const baseName = value => normalize(value)
      .replace(/\s*\/\s*\d+\s*шт\.?\s*в\s*упаковке\s*$/i, "")
      .replace(/\s*\(\s*\d+\s*шт\.?\s*в\s*упаковке\s*\)\s*$/i, "")
      .replace(/\s*\/\s*\d+\s*шт\.?\s*в\s*уп\.?\s*$/i, "")
      .trim();
    const dimensions = value => {
      const text = normalize(value).replace(/[×x]/g,"х").replace(/,/g,".");
      return (text.match(/(?:д\s*)?\d+(?:\.\d+)?(?:\s*[-+]\s*\d+(?:\.\d+)?)*(?:\s*х\s*\d+(?:\.\d+)?(?:\s*[-+]\s*\d+(?:\.\d+)?)?){1,3}\s*см|d?\d{3,4}/gi) || [])
        .map(item => item.replace(/\s+/g,""))
        .join("|");
    };
    const construction = product => {
      const text = normalize(`${product.name || ""} ${product.specs || ""}`);
      const keys = [
        [/\b360\b/,"360"],[/поворот/,"поворот"],[/фиксир/,"фикс"],[/крестовин/,"крестовина"],
        [/колес/,"колеса"],[/газлифт/,"газлифт"],[/складн/,"складной"],[/раздвижн/,"раздвижной"],[/раскладн/,"раскладной"]
      ];
      return keys.filter(([pattern]) => pattern.test(text)).map(([,label]) => label).join("|");
    };
    const products = (() => {
      try { if (typeof PRODUCTS !== "undefined" && Array.isArray(PRODUCTS)) return PRODUCTS; } catch {}
      return Array.isArray(window.PRODUCTS) ? window.PRODUCTS : [];
    })();
    if (!products.length) return;

    const idOf = (product,index) => Number(product.id) || index + 1;
    const manualColorIds = new Set((window.PRODUCT_COLOR_GROUPS || []).flatMap(group => group.ids || []).map(Number));
    const manualDuplicateIds = new Set((window.PRODUCT_DUPLICATE_GROUPS || []).flatMap(group => group.ids || []).map(Number));
    const buckets = new Map();

    products.forEach((product,index) => {
      const id = idOf(product,index);
      const key = [baseName(product.name), dimensions(product.specs), construction(product)].join("||");
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push({ product, id });
    });

    const autoColors = [];
    const autoDuplicates = [];
    for (const items of buckets.values()) {
      if (items.length < 2) continue;
      const bySpecs = new Map();
      for (const item of items) {
        const signature = normalize(item.product.specs).replace(/\s+/g,"");
        if (!bySpecs.has(signature)) bySpecs.set(signature, []);
        bySpecs.get(signature).push(item);
      }
      const kept = [];
      for (const same of bySpecs.values()) {
        same.sort((a,b) => (Number(a.product.wholesalePrice) || Infinity) - (Number(b.product.wholesalePrice) || Infinity) || a.id - b.id);
        kept.push(same[0]);
        const newDuplicates = same.filter(item => !manualDuplicateIds.has(item.id));
        if (newDuplicates.length > 1) autoDuplicates.push({ name: baseName(same[0].product.name), ids: newDuplicates.map(item => item.id) });
      }
      kept.sort((a,b) => a.id - b.id);
      if (kept.length > 1 && !items.some(item => manualColorIds.has(item.id))) {
        autoColors.push({ name: baseName(items[0].product.name), ids: kept.map(item => item.id) });
      }
    }

    const merge = (current, additions) => {
      const result = Array.isArray(current) ? [...current] : [];
      const seen = new Set(result.map(group => [...new Set((group.ids || []).map(Number))].sort((a,b)=>a-b).join(",")));
      for (const group of additions) {
        const ids = [...new Set(group.ids.map(Number).filter(Number.isFinite))];
        const key = [...ids].sort((a,b)=>a-b).join(",");
        if (ids.length < 2 || seen.has(key)) continue;
        seen.add(key);
        result.push({ name: group.name, ids });
      }
      return result;
    };

    window.PRODUCT_COLOR_GROUPS = merge(window.PRODUCT_COLOR_GROUPS, autoColors);
    window.PRODUCT_DUPLICATE_GROUPS = merge(window.PRODUCT_DUPLICATE_GROUPS, autoDuplicates);
    window.__AUTO_PRODUCT_GROUP_AUDIT__ = {
      rule: "type+subtype+model+dimensions+construction; package ignored; cheapest exact duplicate kept",
      colorGroupsAdded: autoColors.length,
      duplicateGroupsAdded: autoDuplicates.length,
      duplicateCardsHidden: autoDuplicates.reduce((sum,group) => sum + group.ids.length - 1, 0)
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
