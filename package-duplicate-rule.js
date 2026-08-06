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

    const priceOf = product => {
      const wholesale = Number(product?.wholesalePrice);
      if (Number.isFinite(wholesale) && wholesale >= 0) return wholesale;
      const selling = Number(product?.price);
      if (Number.isFinite(selling) && selling >= 0) return selling;
      const retail = Number(product?.retailPrice);
      if (Number.isFinite(retail) && retail >= 0) return retail;
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

    const packagePatterns = [
      /(?:^|\s)\d+\s*шт\s*в\s*\d+\s*х\s*упаковк[а-я]*(?=\s|$)/gi,
      /(?:^|\s)\d+\s*шт\s*в\s*(?:упаковк[а-я]*|уп)(?=\s|$)/gi,
      /(?:^|\s)упаковк[а-я]*\s*(?:по\s*)?\d+\s*шт(?=\s|$)/gi,
      /(?:^|\s)\d+\s*шт\s*\/\s*уп(?=\s|$)/gi
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
      return normalize(value)
        .split(" ")
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b, "ru"))
        .join(" ");
    }

    function priceOf(product) {
      const wholesale = Number(product?.wholesalePrice);
      if (Number.isFinite(wholesale) && wholesale >= 0) return wholesale;
      const selling = Number(product?.price);
      if (Number.isFinite(selling) && selling >= 0) return selling;
      const retail = Number(product?.retailPrice);
      if (Number.isFinite(retail) && retail >= 0) return retail;
      return Number.POSITIVE_INFINITY;
    }

    function uniqueIds(ids) {
      return [...new Set((ids || []).map(Number).filter(id => byId.has(id)))];
    }

    function orderIds(ids) {
      return uniqueIds(ids).sort((left, right) =>
        priceOf(byId.get(left)) - priceOf(byId.get(right)) || left - right
      );
    }

    const discovered = [];
    const exactBuckets = new Map();

    products.forEach((product, index) => {
      const id = idOf(product, index);
      const family = stripPackageQuantity(product.name);
      if (!family) return;
      const key = `${family}\u0000${specsKey(product.specs)}`;
      if (!exactBuckets.has(key)) exactBuckets.set(key, []);
      exactBuckets.get(key).push({ id, product });
    });

    for (const items of exactBuckets.values()) {
      if (items.length < 2 || !items.some(item => hasPackageQuantity(item.product))) continue;
      const ids = orderIds(items.map(item => item.id));
      if (ids.length < 2) continue;
      discovered.push({
        name: `${stripPackageQuantity(items[0].product.name)} — дубль упаковки`,
        ids
      });
    }

    const currentGroups = Array.isArray(window.PRODUCT_DUPLICATE_GROUPS)
      ? window.PRODUCT_DUPLICATE_GROUPS
      : [];
    const allGroups = [...currentGroups, ...discovered]
      .map(group => ({
        name: group.name || "Дубли товара",
        ids: uniqueIds(group.ids)
      }))
      .filter(group => group.ids.length > 1);

    const packageIds = new Set();
    allGroups.forEach(group => {
      if (group.ids.some(id => hasPackageQuantity(byId.get(id)))) {
        group.ids.forEach(id => packageIds.add(id));
      }
    });

    let expanded = true;
    while (expanded) {
      expanded = false;
      for (const group of allGroups) {
        if (!group.ids.some(id => packageIds.has(id))) continue;
        for (const id of group.ids) {
          if (packageIds.has(id)) continue;
          packageIds.add(id);
          expanded = true;
        }
      }
    }

    const packageGroups = allGroups.filter(group => group.ids.some(id => packageIds.has(id)));
    const untouchedGroups = allGroups.filter(group => !group.ids.some(id => packageIds.has(id)));

    const parent = new Map();
    const find = id => {
      if (!parent.has(id)) parent.set(id, id);
      const root = parent.get(id);
      if (root !== id) parent.set(id, find(root));
      return parent.get(id);
    };
    const union = (left, right) => {
      const a = find(left);
      const b = find(right);
      if (a !== b) parent.set(b, a);
    };

    packageGroups.forEach(group => {
      group.ids.forEach(id => find(id));
      for (let index = 1; index < group.ids.length; index += 1) {
        union(group.ids[0], group.ids[index]);
      }
    });

    const components = new Map();
    packageGroups.forEach(group => {
      group.ids.forEach(id => {
        const root = find(id);
        if (!components.has(root)) components.set(root, new Set());
        components.get(root).add(id);
      });
    });

    const consolidated = [...components.values()]
      .map(ids => orderIds([...ids]))
      .filter(ids => ids.length > 1)
      .map(ids => ({
        name: `${stripPackageQuantity(byId.get(ids[0])?.name || "Товар")} — упаковочный дубль`,
        ids
      }));

    const componentIds = new Set(consolidated.flatMap(group => group.ids));
    const safeUntouched = untouchedGroups.filter(group =>
      !(group.ids || []).some(id => componentIds.has(Number(id)))
    );

    window.PRODUCT_DUPLICATE_GROUPS = [...safeUntouched, ...consolidated];

    const hiddenIds = new Set(consolidated.flatMap(group => group.ids.slice(1)));
    const keptIds = new Set(consolidated.map(group => group.ids[0]));
    const replacementById = new Map();
    consolidated.forEach(group => {
      const keptId = Number(group.ids[0]);
      group.ids.slice(1).forEach(id => replacementById.set(Number(id), keptId));
    });

    const replacementId = id => replacementById.get(Number(id)) || Number(id);
    const remapIds = ids => [...new Set((ids || [])
      .map(replacementId)
      .filter(id => byId.has(id)))];

    // Не удаляем цвет из семейства, когда его прежний ID оказался дорогим дублем.
    // Подставляем вместо него выбранный дешёвый ID того же цвета и характеристик.
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

    window.__FORMA_PACKAGE_DUPLICATE_AUDIT__ = {
      enabled: true,
      version: 2,
      rule: "package quantity ignored; identical product variant keeps the lowest wholesale price",
      exactGroupsDiscovered: discovered.length,
      packageComponents: consolidated.map(group => ({
        name: group.name,
        keptId: group.ids[0],
        keptPrice: priceOf(byId.get(group.ids[0])),
        hiddenIds: group.ids.slice(1),
        hiddenPrices: group.ids.slice(1).map(id => priceOf(byId.get(id)))
      })),
      replacements: [...replacementById].map(([hiddenId, keptId]) => ({ hiddenId, keptId })),
      packageComponentCount: consolidated.length,
      keptIds: [...keptIds],
      hiddenIds: [...hiddenIds],
      hiddenCount: hiddenIds.size,
      preservesDimensionsColorMaterialAndConstruction: true,
      remapsColorVariantIdsInsteadOfRemovingThem: true
    };

    window.dispatchEvent(new CustomEvent("forma:product-groups-ready", {
      detail: { source: "package-duplicate-rule", hiddenCount: hiddenIds.size }
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
