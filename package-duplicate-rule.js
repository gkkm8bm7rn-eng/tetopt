(() => {
  "use strict";

  const originalWrite = document.write.bind(document);

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

    function orderIds(ids) {
      return [...new Set(ids.map(Number).filter(id => byId.has(id)))]
        .sort((left, right) =>
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
        ids: [...new Set((group.ids || []).map(Number).filter(id => byId.has(id)))]
      }))
      .filter(group => group.ids.length > 1);

    // Сначала отмечаем группы с явной упаковочной пометкой. Затем расширяем набор
    // на любые пересекающиеся реестры дублей, чтобы не оставлять противоречащие группы.
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

    // Объединяем пересекающиеся упаковочные группы в компоненты, чтобы один ID
    // не оказался одновременно «оставляемым» в одной группе и скрываемым в другой.
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
    for (const group of packageGroups) {
      for (const id of group.ids) {
        const root = find(id);
        if (!components.has(root)) components.set(root, new Set());
        components.get(root).add(id);
      }
    }

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

    // Удаляем скрываемые упаковочные дубли из селекторов вариантов. Иначе карточка-хост
    // могла бы сохранить более дорогой ID несмотря на реестр дублей.
    window.PRODUCT_COLOR_GROUPS = (Array.isArray(window.PRODUCT_COLOR_GROUPS)
      ? window.PRODUCT_COLOR_GROUPS
      : []
    ).map(group => ({
      ...group,
      ids: (group.ids || []).map(Number).filter(id => !hiddenIds.has(id))
    })).filter(group => group.ids.length > 1);

    window.PRODUCT_EXPLICIT_VARIANT_GROUPS = (Array.isArray(window.PRODUCT_EXPLICIT_VARIANT_GROUPS)
      ? window.PRODUCT_EXPLICIT_VARIANT_GROUPS
      : []
    ).map(group => {
      const variants = (group.variants || []).filter(variant => !hiddenIds.has(Number(variant.id)));
      if (!variants.length) return null;
      const primaryId = hiddenIds.has(Number(group.primaryId))
        ? Number(variants[0].id)
        : Number(group.primaryId || variants[0].id);
      return { ...group, primaryId, variants };
    }).filter(group => group && group.variants.length > 1);

    window.PRODUCT_DUAL_VARIANT_GROUPS = (Array.isArray(window.PRODUCT_DUAL_VARIANT_GROUPS)
      ? window.PRODUCT_DUAL_VARIANT_GROUPS
      : []
    ).map(group => {
      const variants = (group.variants || []).filter(variant => !hiddenIds.has(Number(variant.id)));
      if (!variants.length) return null;
      const primaryId = hiddenIds.has(Number(group.primaryId))
        ? Number(variants[0].id)
        : Number(group.primaryId || variants[0].id);
      return { ...group, primaryId, variants };
    }).filter(group => group && group.variants.length > 1);

    window.__FORMA_PACKAGE_DUPLICATE_AUDIT__ = {
      enabled: true,
      version: 1,
      rule: "package quantity ignored; identical product variant keeps the lowest wholesale price",
      exactGroupsDiscovered: discovered.length,
      packageComponents: consolidated.map(group => ({
        name: group.name,
        keptId: group.ids[0],
        keptPrice: priceOf(byId.get(group.ids[0])),
        hiddenIds: group.ids.slice(1),
        hiddenPrices: group.ids.slice(1).map(id => priceOf(byId.get(id)))
      })),
      packageComponentCount: consolidated.length,
      keptIds: [...keptIds],
      hiddenIds: [...hiddenIds],
      hiddenCount: hiddenIds.size,
      preservesDimensionsColorMaterialAndConstruction: true
    };

    window.dispatchEvent(new CustomEvent("forma:product-groups-ready", {
      detail: { source: "package-duplicate-rule", hiddenCount: hiddenIds.size }
    }));
  }

  document.write = function patchedWrite(...parts) {
    let html = parts.join("");
    if (typeof html === "string" && html.includes("</body>")) {
      html = html.replace("</body>", `<script>(${runtime.toString()})();<\/script></body>`);
    }
    return originalWrite(html);
  };
})();
