(() => {
  "use strict";

  function configureBarChairColorGroups() {
    const explicitGroups = [
      { name: "Стул барный Вимта/Vimta 4021S", primaryId: 133, label: "Цвет сиденья", variants: [
        { id: 133, label: "Белый, экокожа", css: "#f5f3ed" },
        { id: 134, label: "Бежевый, ткань", css: "#c9b69c" }
      ]},
      { name: "Стул барный Чилли/Chilly 7095б", primaryId: 155, label: "Цвет обивки", variants: [
        { id: 155, label: "Тёмно-серый бархат", css: "#555753" },
        { id: 156, label: "Коричневый бархат", css: "#76513c" }
      ]},
      { name: "Стул барный Синди Бар Чаир/Cindy Bar Chair 80-1", primaryId: 157, label: "Цвет сиденья", variants: [
        { id: 157, label: "Чёрный", css: "#171715" },
        { id: 160, label: "Белый", css: "#f5f3ed" }
      ]},
      { name: "Стул полубарный Чилли/Chilly 7095пб", primaryId: 173, label: "Цвет обивки", variants: [
        { id: 173, label: "Коричневый бархат", css: "#76513c" },
        { id: 174, label: "Бежевый бархат", css: "#c9b69c" }
      ]}
    ];

    const targetIds = new Set(explicitGroups.flatMap(group => group.variants.map(variant => Number(variant.id))));
    window.PRODUCT_COLOR_GROUPS = (Array.isArray(window.PRODUCT_COLOR_GROUPS) ? window.PRODUCT_COLOR_GROUPS : [])
      .filter(group => !(group.ids || []).some(id => targetIds.has(Number(id))));

    const current = Array.isArray(window.PRODUCT_EXPLICIT_VARIANT_GROUPS) ? window.PRODUCT_EXPLICIT_VARIANT_GROUPS : [];
    const existingIds = new Set(current.flatMap(group => (group.variants || []).map(variant => Number(variant.id))));
    for (const group of explicitGroups) {
      if (group.variants.some(variant => existingIds.has(Number(variant.id)))) continue;
      current.push(group);
      group.variants.forEach(variant => existingIds.add(Number(variant.id)));
    }
    window.PRODUCT_EXPLICIT_VARIANT_GROUPS = current;
  }

  configureBarChairColorGroups();

  function allCatalogGroupingRuntime() {
    "use strict";
    if (window.__FORMA_ALL_CATALOG_GROUPING_V1__) return;
    window.__FORMA_ALL_CATALOG_GROUPING_V1__ = true;

    const normalize = value => String(value || "")
      .toLowerCase().replace(/ё/g, "е")
      .replace(/[×]/g, "х")
      .replace(/[^a-zа-я0-9х.,+\/-]+/gi, " ")
      .replace(/\s+/g, " ").trim();

    const cleanPackaging = value => String(value || "")
      .replace(/[/(]?\s*\d+\s*шт\.?\s*(?:в|\/)?\s*(?:упаковке|уп\.?|упаковках)?\s*[)]?/gi, " ")
      .replace(/упаковка\s*(?:по\s*)?\d+\s*шт\.?/gi, " ")
      .replace(/\s+/g, " ").replace(/\s*\/\s*$/, "").trim();

    const products = (() => {
      try { if (typeof PRODUCTS !== "undefined" && Array.isArray(PRODUCTS)) return PRODUCTS; } catch {}
      return Array.isArray(window.PRODUCTS) ? window.PRODUCTS : [];
    })();
    if (!products.length) return;

    const price = product => {
      const values = [product?.wholesalePrice, product?.price, product?.retailPrice];
      for (const raw of values) {
        const number = Number(String(raw ?? "").replace(/[^0-9.,]/g, "").replace(",", "."));
        if (Number.isFinite(number) && number > 0) return number;
      }
      return Number.MAX_SAFE_INTEGER;
    };

    const existingColorGroups = Array.isArray(window.PRODUCT_COLOR_GROUPS) ? window.PRODUCT_COLOR_GROUPS : [];
    const existingExplicitGroups = Array.isArray(window.PRODUCT_EXPLICIT_VARIANT_GROUPS) ? window.PRODUCT_EXPLICIT_VARIANT_GROUPS : [];
    const existingDuplicateGroups = Array.isArray(window.PRODUCT_DUPLICATE_GROUPS) ? window.PRODUCT_DUPLICATE_GROUPS : [];

    const occupied = new Set();
    existingColorGroups.forEach(group => (group.ids || []).forEach(id => occupied.add(Number(id))));
    existingExplicitGroups.forEach(group => (group.variants || []).forEach(variant => occupied.add(Number(variant.id))));

    const dimensions = product => {
      const text = normalize(`${product?.name || ""} ${product?.specs || ""}`);
      return [...text.matchAll(/\b\d{2,4}(?:[.,]\d+)?\s*х\s*\d{2,4}(?:[.,]\d+)?(?:\s*(?:-|\+)\s*\d{1,4}(?:[.,]\d+)?)?(?:\s*х\s*\d{2,4}(?:[.,]\d+)?)?/g)]
        .map(match => match[0].replace(/\s+/g, ""))
        .sort().join("|");
    };

    const constructionSignature = product => {
      const text = normalize(`${product?.name || ""} ${product?.specs || ""}`);
      return [
        /полубарн/.test(text) ? "counter" : /барн/.test(text) ? "bar" : "standard",
        /(?:опора 360|360 градусов|поворотн|вращающ)/.test(text) ? "swivel" : "fixed",
        /колес|ролик/.test(text) ? "wheels" : "no-wheels",
        /подлокот/.test(text) ? "armrests" : "no-armrests",
        /подголов/.test(text) ? "headrest" : "no-headrest",
        /раскладн|раздвижн/.test(text) ? "extendable" : "fixed-size",
        dimensions(product) || "no-dimensions"
      ].join("|");
    };

    const familyName = product => normalize(cleanPackaging(product?.name));
    const familyKey = product => [normalize(product?.category), familyName(product), constructionSignature(product)].join("||");
    const exactVariantKey = product => normalize(cleanPackaging(product?.specs));

    const candidates = new Map();
    for (const product of products) {
      const id = Number(product.id);
      if (!Number.isFinite(id) || occupied.has(id)) continue;
      const name = familyName(product);
      if (!name) continue;
      const key = familyKey(product);
      if (!candidates.has(key)) candidates.set(key, []);
      candidates.get(key).push(product);
    }

    const addedColorGroups = [];
    const addedDuplicateGroups = [];
    for (const items of candidates.values()) {
      if (items.length < 2) continue;
      const sameVariant = new Map();
      for (const product of items) {
        const key = exactVariantKey(product) || `id-${product.id}`;
        if (!sameVariant.has(key)) sameVariant.set(key, []);
        sameVariant.get(key).push(product);
      }

      const representatives = [];
      for (const duplicates of sameVariant.values()) {
        duplicates.sort((a, b) => price(a) - price(b) || Number(a.id) - Number(b.id));
        representatives.push(duplicates[0]);
        if (duplicates.length > 1) {
          addedDuplicateGroups.push({
            name: `Авто-дубли: ${cleanPackaging(duplicates[0].name)}`,
            ids: duplicates.map(product => Number(product.id))
          });
        }
      }

      representatives.sort((a, b) => Number(a.id) - Number(b.id));
      if (representatives.length >= 2) {
        addedColorGroups.push({
          name: cleanPackaging(representatives[0].name),
          ids: representatives.map(product => Number(product.id)),
          source: "all-catalog-same-name-and-construction"
        });
      }
    }

    const dedupeGroups = groups => {
      const seen = new Set();
      return groups.filter(group => {
        const ids = [...new Set((group.ids || []).map(Number).filter(Number.isFinite))];
        if (ids.length < 2) return false;
        const key = ids.slice().sort((a, b) => a - b).join(",");
        if (seen.has(key)) return false;
        seen.add(key);
        group.ids = ids;
        return true;
      });
    };

    window.PRODUCT_COLOR_GROUPS = dedupeGroups([...existingColorGroups, ...addedColorGroups]);
    window.PRODUCT_DUPLICATE_GROUPS = dedupeGroups([...existingDuplicateGroups, ...addedDuplicateGroups]);
    window.__FORMA_ALL_CATALOG_GROUPING_AUDIT__ = {
      version: 1,
      productsChecked: products.length,
      manualColorGroupsPreserved: existingColorGroups.length,
      explicitGroupsPreserved: existingExplicitGroups.length,
      automaticColorGroupsAdded: addedColorGroups.length,
      automaticDuplicateGroupsAdded: addedDuplicateGroups.length,
      groupedIds: addedColorGroups.reduce((sum, group) => sum + group.ids.length, 0),
      rules: {
        sameNormalizedNameRequired: true,
        sameCategoryRequired: true,
        sameConstructionSignatureRequired: true,
        dimensionsSeparated: true,
        barAndCounterSeparated: true,
        swivelAndFixedSeparated: true,
        cheapestExactDuplicateKept: true,
        productNamesChanged: false
      },
      samples: addedColorGroups.slice(0, 25)
    };

    window.dispatchEvent(new CustomEvent("forma:catalog-groups-ready", { detail: window.__FORMA_ALL_CATALOG_GROUPING_AUDIT__ }));
    const marker = document.createElement("span");
    marker.hidden = true;
    marker.dataset.formaGroupingRefresh = "1";
    document.body.appendChild(marker);
    marker.remove();
  }

  function rainbowLimeSwatchRuntime() {
    "use strict";
    if (window.__FORMA_RAINBOW_LIME_SWATCH_V1__) return;
    window.__FORMA_RAINBOW_LIME_SWATCH_V1__ = true;
    const LIME_COLOR = "#cbdc2d";
    let scheduled = false;
    const normalize = value => String(value || "").toLowerCase().replace(/ё/g, "е").replace(/[^a-zа-я0-9]+/gi, " ").replace(/\s+/g, " ").trim();
    function productByIdSafe(id) {
      const numericId = Number(id);
      try { if (typeof productById === "function") return productById(numericId); } catch {}
      try { if (typeof PRODUCTS !== "undefined" && Array.isArray(PRODUCTS)) return PRODUCTS.find(product => Number(product.id) === numericId) || null; } catch {}
      return Array.isArray(window.PRODUCTS) ? window.PRODUCTS.find(product => Number(product.id) === numericId) || null : null;
    }
    function isRainbowLime(product) {
      const name = normalize(product?.name);
      const specs = normalize(product?.specs);
      return (name.includes("рейнбоу") || name.includes("rainbow")) &&
        (specs.includes("салатов") || specs.includes("lime") || specs.includes("лайм") || specs.includes("green")) &&
        !(specs.includes("серый") || specs.includes("grey") || specs.includes("gray"));
    }
    function apply() {
      scheduled = false;
      document.querySelectorAll(".color-swatch[data-color-product]").forEach(button => {
        if (!isRainbowLime(productByIdSafe(button.dataset.colorProduct))) return;
        button.style.setProperty("background", LIME_COLOR, "important");
        button.title = "Салатовый";
        button.setAttribute("aria-label", "Выбрать цвет: салатовый");
      });
    }
    function schedule() { if (!scheduled) { scheduled = true; requestAnimationFrame(apply); } }
    new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "data-product", "data-color-swatches"] });
    window.addEventListener("forma:catalog-groups-ready", schedule, { passive: true });
    window.addEventListener("pageshow", schedule, { passive: true });
    document.addEventListener("DOMContentLoaded", schedule, { once: true });
    schedule();
  }

  if (document.querySelector(".color-swatch,[data-product]")) {
    allCatalogGroupingRuntime();
    rainbowLimeSwatchRuntime();
  }

  const originalWrite = document.write.bind(document);
  document.write = function patchedWrite(...parts) {
    let html = parts.join("");
    if (typeof html === "string" && html.includes("</body>")) {
      html = html.replace("</body>", `<script>(${allCatalogGroupingRuntime.toString()})();<\/script><script>(${rainbowLimeSwatchRuntime.toString()})();<\/script></body>`);
    }
    return originalWrite(html);
  };
})();
