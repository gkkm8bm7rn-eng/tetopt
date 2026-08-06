(() => {
  "use strict";

  const originalWrite = document.write.bind(document);

  function installLogicalFilterRuntime() {
    "use strict";

    const productList = () => {
      try {
        if (typeof PRODUCTS !== "undefined" && Array.isArray(PRODUCTS)) return PRODUCTS;
      } catch {}
      return Array.isArray(window.PRODUCTS) ? window.PRODUCTS : [];
    };

    const numericPrice = value => {
      if (typeof value === "number") return value;
      const normalized = String(value ?? "")
        .replace(/\s+/g, "")
        .replace(",", ".");
      return Number(normalized);
    };

    const priceOf = product => {
      for (const key of ["wholesalePrice", "price", "retailPrice"]) {
        const value = numericPrice(product?.[key]);
        if (Number.isFinite(value) && value >= 0) return value;
      }
      return Number.POSITIVE_INFINITY;
    };

    const idOf = (product, index = 0) => Number(product?.id) || index + 1;
    const uniqueIds = ids => [...new Set((ids || []).map(Number).filter(Number.isFinite))];

    function canonicalResolver(products) {
      const byId = new Map(products.map((product, index) => [idOf(product, index), product]));
      const duplicateCanonical = new Map();

      for (const group of Array.isArray(window.PRODUCT_DUPLICATE_GROUPS)
        ? window.PRODUCT_DUPLICATE_GROUPS
        : []) {
        const ids = uniqueIds(group.ids).filter(id => byId.has(id));
        if (ids.length < 2) continue;
        ids.sort((left, right) =>
          priceOf(byId.get(left)) - priceOf(byId.get(right)) || left - right
        );
        const keptId = ids[0];
        ids.forEach(id => duplicateCanonical.set(id, keptId));
      }

      const throughDuplicate = id => duplicateCanonical.get(Number(id)) || Number(id);
      const familyCanonical = new Map();
      const familyGroups = [];

      for (const group of Array.isArray(window.PRODUCT_COLOR_GROUPS)
        ? window.PRODUCT_COLOR_GROUPS
        : []) {
        const ids = uniqueIds(group.ids).map(throughDuplicate).filter(id => byId.has(id));
        if (ids.length > 1) familyGroups.push(ids);
      }

      for (const group of Array.isArray(window.PRODUCT_EXPLICIT_VARIANT_GROUPS)
        ? window.PRODUCT_EXPLICIT_VARIANT_GROUPS
        : []) {
        const ids = uniqueIds((group.variants || []).map(variant => variant.id))
          .map(throughDuplicate)
          .filter(id => byId.has(id));
        if (ids.length > 1) familyGroups.push(ids);
      }

      for (const group of Array.isArray(window.PRODUCT_DUAL_VARIANT_GROUPS)
        ? window.PRODUCT_DUAL_VARIANT_GROUPS
        : []) {
        const ids = uniqueIds((group.variants || []).map(variant => variant.id))
          .map(throughDuplicate)
          .filter(id => byId.has(id));
        if (ids.length > 1) familyGroups.push(ids);
      }

      for (const ids of familyGroups) {
        const canonicalIds = uniqueIds(ids);
        const hostId = canonicalIds[0];
        canonicalIds.forEach(id => familyCanonical.set(id, hostId));
      }

      return id => {
        const duplicateId = throughDuplicate(id);
        return familyCanonical.get(duplicateId) || duplicateId;
      };
    }

    window.__FORMA_LOGICAL_FILTER_RESULTS__ = rawProducts => {
      const products = productList();
      if (!Array.isArray(rawProducts) || !products.length) return rawProducts || [];

      const byId = new Map(products.map((product, index) => [idOf(product, index), product]));
      const canonicalOf = canonicalResolver(products);
      const seen = new Set();
      const result = [];

      rawProducts.forEach((product, index) => {
        const sourceId = idOf(product, index);
        const canonicalId = canonicalOf(sourceId);
        if (seen.has(canonicalId)) return;
        seen.add(canonicalId);
        result.push(byId.get(canonicalId) || product);
      });

      window.__FORMA_LOGICAL_RESULT_AUDIT__ = {
        rawCount: rawProducts.length,
        logicalCount: result.length,
        removedCount: Math.max(0, rawProducts.length - result.length),
        at: Date.now()
      };
      return result;
    };
  }

  function runtime() {
    "use strict";

    const products = (() => {
      try {
        if (typeof PRODUCTS !== "undefined" && Array.isArray(PRODUCTS)) return PRODUCTS;
      } catch {}
      return Array.isArray(window.PRODUCTS) ? window.PRODUCTS : [];
    })();
    if (!products.length) return;

    const normalize = value => String(value || "")
      .toLowerCase()
      .replace(/ё/g, "е")
      .replace(/[‐‑‒–—−]/g, "-")
      .replace(/×/g, "х")
      .replace(/\*/g, "х")
      .replace(/[^a-zа-я0-9]+/gi, " ")
      .replace(/\s+/g, " ")
      .trim();

    // После normalize() распознаются записи:
    // "1 шт. в упаковке", "2шт.в упаковке", "4 шт. в 2-х упаковках",
    // "2 шт/уп", "упаковка по 2 шт" и аналогичные варианты.
    const packagePatterns = [
      /(?:^|\s)\d+\s*шт\s*в\s*(?:\d+\s*(?:х\s*)?)?упаковк[а-я]*(?=\s|$)/gi,
      /(?:^|\s)\d+\s*шт\s*(?:в\s*)?(?:упаковк[а-я]*|уп)(?=\s|$)/gi,
      /(?:^|\s)упаковк[а-я]*\s*(?:по\s*)?\d+\s*шт(?=\s|$)/gi,
      /(?:^|\s)по\s*\d+\s*шт\s*в\s*упаковк[а-я]*(?=\s|$)/gi
    ];

    const idOf = (product, index = 0) => Number(product?.id) || index + 1;
    const byId = new Map(products.map((product, index) => [idOf(product, index), product]));

    function hasPackageQuantity(product) {
      const text = normalize(`${product?.name || ""} ${product?.specs || ""}`);
      return packagePatterns.some(pattern => {
        pattern.lastIndex = 0;
        return pattern.test(text);
      });
    }

    function stripPackageQuantity(value) {
      let text = normalize(value);
      for (const pattern of packagePatterns) {
        pattern.lastIndex = 0;
        text = text.replace(pattern, " ");
      }
      return text.replace(/\s+/g, " ").trim();
    }

    function specsKey(value) {
      return stripPackageQuantity(value)
        .split(" ")
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b, "ru"))
        .join(" ");
    }

    function numericPrice(value) {
      if (typeof value === "number") return value;
      const normalized = String(value ?? "")
        .replace(/\s+/g, "")
        .replace(",", ".");
      return Number(normalized);
    }

    function priceOf(product) {
      for (const key of ["wholesalePrice", "price", "retailPrice"]) {
        const value = numericPrice(product?.[key]);
        if (Number.isFinite(value) && value >= 0) return value;
      }
      return Number.POSITIVE_INFINITY;
    }

    function uniqueIds(ids) {
      return [...new Set((ids || []).map(Number).filter(id => byId.has(id)))];
    }

    const currentGroups = Array.isArray(window.PRODUCT_DUPLICATE_GROUPS)
      ? window.PRODUCT_DUPLICATE_GROUPS
      : [];

    const replacementById = new Map();
    const replacementSource = new Map();

    function registerReplacement(packageId, cheaperId, source) {
      const hiddenId = Number(packageId);
      const keptId = Number(cheaperId);
      const hiddenProduct = byId.get(hiddenId);
      const keptProduct = byId.get(keptId);

      if (!hiddenProduct || !keptProduct) return;
      if (!hasPackageQuantity(hiddenProduct) || hasPackageQuantity(keptProduct)) return;
      if (!(priceOf(keptProduct) < priceOf(hiddenProduct))) return;

      const existingId = replacementById.get(hiddenId);
      if (
        existingId &&
        priceOf(byId.get(existingId)) <= priceOf(keptProduct)
      ) return;

      replacementById.set(hiddenId, keptId);
      replacementSource.set(hiddenId, source);
    }

    // 1. Автоматическая строгая проверка:
    // одинаковая модель после удаления пометки упаковки + одинаковые характеристики.
    const exactBuckets = new Map();

    products.forEach((product, index) => {
      const id = idOf(product, index);
      const family = stripPackageQuantity(product.name);
      const specifications = specsKey(product.specs);
      if (!family || !specifications) return;

      const key = `${family}\u0000${specifications}`;
      if (!exactBuckets.has(key)) exactBuckets.set(key, []);
      exactBuckets.get(key).push({ id, product });
    });

    let exactGroupCount = 0;

    for (const items of exactBuckets.values()) {
      const packageItems = items.filter(item => hasPackageQuantity(item.product));
      const ordinaryItems = items
        .filter(item => !hasPackageQuantity(item.product))
        .sort((left, right) =>
          priceOf(left.product) - priceOf(right.product) || left.id - right.id
        );

      if (!packageItems.length || !ordinaryItems.length) continue;
      const cheapestOrdinary = ordinaryItems[0];
      let changed = false;

      for (const item of packageItems) {
        const before = replacementById.size;
        registerReplacement(item.id, cheapestOrdinary.id, "strict-name-and-specs");
        if (replacementById.size > before) changed = true;
      }
      if (changed) exactGroupCount += 1;
    }

    // 2. Используем вручную проверенный реестр дублей.
    // Он покрывает случаи, где в прайсе у одной строки пропущен цвет ножек,
    // отличается написание ткани или есть другая несущественная опечатка.
    let registryGroupCount = 0;

    for (const group of currentGroups) {
      const items = uniqueIds(group.ids).map(id => ({ id, product: byId.get(id) }));
      const packageItems = items.filter(item => hasPackageQuantity(item.product));
      const ordinaryItems = items
        .filter(item => !hasPackageQuantity(item.product))
        .sort((left, right) =>
          priceOf(left.product) - priceOf(right.product) || left.id - right.id
        );

      if (!packageItems.length || !ordinaryItems.length) continue;
      const cheapestOrdinary = ordinaryItems[0];
      let changed = false;

      for (const item of packageItems) {
        const before = replacementById.size;
        registerReplacement(item.id, cheapestOrdinary.id, "verified-duplicate-registry");
        if (replacementById.size > before) changed = true;
      }
      if (changed) registryGroupCount += 1;
    }

    const hiddenIds = new Set(replacementById.keys());
    const keptIds = new Set(replacementById.values());

    const groupedByKept = new Map();
    for (const [hiddenId, keptId] of replacementById) {
      if (!groupedByKept.has(keptId)) groupedByKept.set(keptId, []);
      groupedByKept.get(keptId).push(hiddenId);
    }

    const conditionalPackageGroups = [...groupedByKept].map(([keptId, hidden]) => ({
      name: `${stripPackageQuantity(byId.get(keptId)?.name || "Товар")} — скрыты более дорогие варианты упаковки`,
      ids: [keptId, ...hidden.sort((a, b) => a - b)]
    }));

    // Сохраняем остальные ранее проверенные группы и добавляем только пары,
    // для которых обычная карточка действительно дешевле упаковочной.
    window.PRODUCT_DUPLICATE_GROUPS = [...currentGroups, ...conditionalPackageGroups];

    const replacementId = id => replacementById.get(Number(id)) || Number(id);
    const remapIds = ids => [...new Set((ids || [])
      .map(replacementId)
      .filter(id => byId.has(id)))];

    // Если скрытая упаковочная строка была представителем цвета,
    // подставляем дешёвую обычную строку того же варианта, а не удаляем цвет.
    window.PRODUCT_COLOR_GROUPS = (Array.isArray(window.PRODUCT_COLOR_GROUPS)
      ? window.PRODUCT_COLOR_GROUPS
      : []
    ).map(group => ({ ...group, ids: remapIds(group.ids) }))
      .filter(group => group.ids.length > 0);

    function remapVariantGroup(group) {
      const seen = new Set();
      const variants = [];

      for (const variant of group.variants || []) {
        const id = replacementId(variant.id);
        if (!byId.has(id) || seen.has(id)) continue;
        seen.add(id);
        variants.push({ ...variant, id });
      }

      if (!variants.length) return null;

      const mappedPrimary = replacementId(group.primaryId || variants[0].id);
      const primaryId = variants.some(variant => Number(variant.id) === mappedPrimary)
        ? mappedPrimary
        : Number(variants[0].id);

      return { ...group, primaryId, variants };
    }

    window.PRODUCT_EXPLICIT_VARIANT_GROUPS = (Array.isArray(window.PRODUCT_EXPLICIT_VARIANT_GROUPS)
      ? window.PRODUCT_EXPLICIT_VARIANT_GROUPS
      : []
    ).map(remapVariantGroup).filter(Boolean);

    window.PRODUCT_DUAL_VARIANT_GROUPS = (Array.isArray(window.PRODUCT_DUAL_VARIANT_GROUPS)
      ? window.PRODUCT_DUAL_VARIANT_GROUPS
      : []
    ).map(remapVariantGroup).filter(Boolean);

    const allPackageIds = products
      .map((product, index) => ({ id: idOf(product, index), product }))
      .filter(item => hasPackageQuantity(item.product))
      .map(item => item.id);

    window.__FORMA_PACKAGE_DUPLICATE_AUDIT__ = {
      enabled: true,
      version: 3,
      rule: "hide a package-labelled product only when a verified non-package analogue has a strictly lower wholesale price",
      packageLabelledCount: allPackageIds.length,
      hiddenCount: hiddenIds.size,
      hiddenIds: [...hiddenIds],
      keptIds: [...keptIds],
      exactGroupCount,
      registryGroupCount,
      replacements: [...replacementById].map(([hiddenId, keptId]) => ({
        hiddenId,
        hiddenPrice: priceOf(byId.get(hiddenId)),
        keptId,
        keptPrice: priceOf(byId.get(keptId)),
        source: replacementSource.get(hiddenId)
      })),
      untouchedPackageIds: allPackageIds.filter(id => !hiddenIds.has(id)),
      strictLowerPriceRequired: true,
      preservesUniqueColorsMaterialsDimensionsAndConstruction: true,
      remapsColorVariantIdsInsteadOfRemovingColors: true
    };

    window.dispatchEvent(new CustomEvent("forma:product-groups-ready", {
      detail: {
        source: "conditional-package-price-rule",
        hiddenCount: hiddenIds.size
      }
    }));

    const rerender = () => {
      if (typeof window.__FORMA_RENDER_CATALOG__ === "function") {
        window.__FORMA_RENDER_CATALOG__();
      }
    };

    if (typeof queueMicrotask === "function") queueMicrotask(rerender);
    else setTimeout(rerender, 0);
  }

  document.write = function patchedWrite(...parts) {
    let html = parts.join("");

    if (typeof html === "string" && html.includes("</body>")) {
      const originalRenderLine = "const all=filtered(), shown=all.slice(0,state.visible);";
      const logicalRenderLine = "const rawAll=filtered(), all=typeof window.__FORMA_LOGICAL_FILTER_RESULTS__===\"function\"?window.__FORMA_LOGICAL_FILTER_RESULTS__(rawAll):rawAll, shown=all.slice(0,state.visible);";

      html = html.replace(/<body([^>]*)>/i, match =>
        `${match}<script>(${installLogicalFilterRuntime.toString()})();<\/script>`
      );
      html = html.replace(originalRenderLine, logicalRenderLine);
      html = html.replace(
        "function render(){",
        "function render(){window.__FORMA_RENDER_CATALOG__=render;"
      );
      html = html.replace("</body>", `<script>(${runtime.toString()})();<\/script></body>`);
      return originalWrite(html);
    }

    return originalWrite(...parts);
  };
})();