// Финальная системная группировка каталога по одинаковому названию и конструкции.
// Не изменяет названия, цены, фотографии или исходные характеристики товаров.
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

    const normalize = value => String(value || "")
      .toLowerCase()
      .replace(/ё/g, "е")
      .replace(/[‐‑‒–—−]/g, "-")
      .replace(/×|\*/g, "х")
      .replace(/\s+/g, " ")
      .trim();

    const packagePatterns = [
      /(?:^|\s|\/|\()\d+\s*(?:шт|штук)\.?\s*в\s*(?:\d+\s*[-хx]?\s*)?упаковк[а-я]*\)?/gi,
      /(?:^|\s|\/|\()\d+\s*(?:шт|штук)\.?\s*(?:в\s*)?(?:уп\.?|упаковк[а-я]*)\)?/gi,
      /(?:^|\s|\/|\()(?:уп\.?|упаковк[а-я]*)\s*(?:по\s*)?\d+\s*(?:шт|штук)\.?\)?/gi,
      /(?:^|\s)по\s*\d+\s*(?:шт|штук)\.?\s*в\s*упаковк[а-я]*/gi
    ];

    const stripPackage = value => {
      let text = normalize(value);
      for (const pattern of packagePatterns) {
        pattern.lastIndex = 0;
        text = text.replace(pattern, " ");
      }
      return text.replace(/\s+/g, " ").replace(/^[\s/(),]+|[\s/(),]+$/g, "").trim();
    };

    const hasPackage = product => {
      const text = normalize(`${product?.name || ""} ${product?.specs || ""}`);
      return packagePatterns.some(pattern => {
        pattern.lastIndex = 0;
        return pattern.test(text);
      });
    };

    const idOf = (product, index = 0) => Number(product?.id) || index + 1;
    const byId = new Map(products.map((product, index) => [idOf(product, index), product]));
    const orderById = new Map(products.map((product, index) => [idOf(product, index), index]));
    const priceOf = product => {
      for (const key of ["wholesalePrice", "price", "retailPrice"]) {
        const value = Number(String(product?.[key] ?? "").replace(/\s+/g, "").replace(",", "."));
        if (Number.isFinite(value) && value >= 0) return value;
      }
      return Number.POSITIVE_INFINITY;
    };
    const uniqueIds = ids => [...new Set((ids || []).map(Number).filter(id => byId.has(id)))];

    const dimensionPattern = /(?<!\d)(\d+(?:[.,]\d+)?)\s*[xх]\s*(\d+(?:[.,]\d+)?)(?:\s*[xх]\s*(\d+(?:[.,]\d+)?))?(?:\s*[xх]\s*(\d+(?:[.,]\d+)?))?/gi;
    const dimensionsOf = value => {
      const result = [];
      const text = normalize(value);
      dimensionPattern.lastIndex = 0;
      let match;
      while ((match = dimensionPattern.exec(text))) {
        result.push(match.slice(1).filter(Boolean).map(part => part.replace(",", ".")).join("х"));
      }
      return result.join("|");
    };

    const dimensionSensitiveCategories = new Set([
      "столы", "спальня", "хранение", "декор", "комплектующие", "другое"
    ]);

    const structuralRules = [
      ["полубарный", /\bполу\s*-?\s*барн|\bполубарн|\bcounter\b/i],
      ["барный", /\bбарн|bar chair/i],
      ["качалка", /качалк|rocking/i],
      ["вращение", /вращ|поворот|swivel|(?:^|\D)360(?:\D|$)/i],
      ["складной", /складн|fold/i],
      ["раздвижной", /раздвиж|extend/i],
      ["раскладной", /расклад|трансформ/i],
      ["без подлокотников", /без\s+подлокот/i],
      ["с подлокотниками", /(?:^|\s)с\s+подлокот/i],
      ["без подушки", /без\s+подушк/i],
      ["с подушкой", /(?:^|\s)с\s+подушк/i],
      ["газлифт", /газлифт/i],
      ["колеса", /колес/i],
      ["левый", /(?:^|\s)лев(?:ый|ая|ое|осторон)/i],
      ["правый", /(?:^|\s)прав(?:ый|ая|ое|осторон)/i],
      ["угловой", /углов/i]
    ];

    const structuralKey = product => {
      const category = normalize(product?.category);
      const text = normalize(`${product?.name || ""} ${product?.specs || ""}`);
      const markers = structuralRules.filter(([, pattern]) => pattern.test(text)).map(([label]) => label);
      const dimensions = dimensionSensitiveCategories.has(category) ? dimensionsOf(product?.specs) : "";
      return `${category}\u0000${markers.join("|")}\u0000${dimensions}`;
    };

    const familyName = product => stripPackage(product?.name);
    const familyKey = product => `${normalize(product?.category)}\u0000${familyName(product)}\u0000${structuralKey(product)}`;
    const specKey = product => stripPackage(product?.specs)
      .replace(/[;,]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    const reservedIds = new Set([
      ...(window.PRODUCT_EXPLICIT_VARIANT_GROUPS || []).flatMap(group => (group.variants || []).map(variant => variant.id)),
      ...(window.PRODUCT_DUAL_VARIANT_GROUPS || []).flatMap(group => [
        ...(group.ids || []),
        ...(group.variants || []).map(variant => variant.id)
      ])
    ].map(Number).filter(Number.isFinite));

    const duplicateAdjacency = new Map();
    const connectDuplicate = (left, right) => {
      if (!duplicateAdjacency.has(left)) duplicateAdjacency.set(left, new Set());
      if (!duplicateAdjacency.has(right)) duplicateAdjacency.set(right, new Set());
      duplicateAdjacency.get(left).add(right);
      duplicateAdjacency.get(right).add(left);
    };
    for (const group of Array.isArray(window.PRODUCT_DUPLICATE_GROUPS) ? window.PRODUCT_DUPLICATE_GROUPS : []) {
      const ids = uniqueIds(group.ids);
      for (let index = 1; index < ids.length; index += 1) connectDuplicate(ids[0], ids[index]);
    }
    const duplicateCanonical = new Map();
    const visitedDuplicates = new Set();
    for (const start of duplicateAdjacency.keys()) {
      if (visitedDuplicates.has(start)) continue;
      const stack = [start];
      const component = [];
      visitedDuplicates.add(start);
      while (stack.length) {
        const id = stack.pop();
        component.push(id);
        for (const next of duplicateAdjacency.get(id) || []) {
          if (visitedDuplicates.has(next)) continue;
          visitedDuplicates.add(next);
          stack.push(next);
        }
      }
      component.sort((left, right) =>
        Number(hasPackage(byId.get(left))) - Number(hasPackage(byId.get(right))) ||
        priceOf(byId.get(left)) - priceOf(byId.get(right)) ||
        (orderById.get(left) || 0) - (orderById.get(right) || 0)
      );
      const canonical = component[0];
      component.forEach(id => duplicateCanonical.set(id, canonical));
    }
    const canonicalOf = id => duplicateCanonical.get(Number(id)) || Number(id);

    const buckets = new Map();
    products.forEach((product, index) => {
      const id = idOf(product, index);
      const key = familyKey(product);
      if (!familyName(product) || !key) return;
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push({ id, product });
    });

    const authoritativeGroups = [];
    const exactDuplicateGroups = [];
    const processedIds = new Set();
    const skippedReservedFamilies = [];

    for (const items of buckets.values()) {
      if (items.length < 2) continue;
      const familyIds = items.map(item => item.id);
      if (familyIds.some(id => reservedIds.has(id))) {
        skippedReservedFamilies.push({ name: items[0].product.name, ids: familyIds });
        continue;
      }

      const exactBuckets = new Map();
      for (const item of items) {
        const key = specKey(item.product);
        if (!exactBuckets.has(key)) exactBuckets.set(key, []);
        exactBuckets.get(key).push(item);
      }

      const representatives = [];
      for (const exactItems of exactBuckets.values()) {
        const mapped = [...new Set(exactItems.map(item => canonicalOf(item.id)))].filter(id => byId.has(id));
        mapped.sort((left, right) =>
          Number(hasPackage(byId.get(left))) - Number(hasPackage(byId.get(right))) ||
          priceOf(byId.get(left)) - priceOf(byId.get(right)) ||
          (orderById.get(left) || 0) - (orderById.get(right) || 0)
        );
        if (mapped.length) representatives.push(mapped[0]);
        const exactIds = uniqueIds(exactItems.map(item => item.id));
        if (exactIds.length > 1) {
          exactIds.sort((left, right) =>
            Number(hasPackage(byId.get(left))) - Number(hasPackage(byId.get(right))) ||
            priceOf(byId.get(left)) - priceOf(byId.get(right)) ||
            (orderById.get(left) || 0) - (orderById.get(right) || 0)
          );
          exactDuplicateGroups.push({ name: items[0].product.name, ids: exactIds });
        }
      }

      const ids = [...new Set(representatives.map(canonicalOf).filter(id => byId.has(id)))];
      ids.sort((left, right) => (orderById.get(left) || 0) - (orderById.get(right) || 0));
      if (ids.length < 2) continue;
      items.forEach(item => processedIds.add(item.id));
      ids.forEach(id => processedIds.add(id));
      authoritativeGroups.push({ name: items[0].product.name, ids });
    }

    const previousColorGroups = Array.isArray(window.PRODUCT_COLOR_GROUPS) ? window.PRODUCT_COLOR_GROUPS : [];
    const replacedPartialGroupCount = previousColorGroups.filter(group =>
      uniqueIds(group.ids).some(id => processedIds.has(id))
    ).length;
    const preservedColorGroups = previousColorGroups
      .filter(group => !uniqueIds(group.ids).some(id => processedIds.has(id)));
    window.PRODUCT_COLOR_GROUPS = [...preservedColorGroups, ...authoritativeGroups];

    const duplicateGroups = Array.isArray(window.PRODUCT_DUPLICATE_GROUPS) ? [...window.PRODUCT_DUPLICATE_GROUPS] : [];
    const duplicateKeys = new Set(duplicateGroups.map(group => uniqueIds(group.ids).sort((a, b) => a - b).join(",")));
    for (const group of exactDuplicateGroups) {
      const key = uniqueIds(group.ids).sort((a, b) => a - b).join(",");
      if (!key || duplicateKeys.has(key)) continue;
      duplicateKeys.add(key);
      duplicateGroups.push(group);
    }
    window.PRODUCT_DUPLICATE_GROUPS = duplicateGroups;

    window.__GLOBAL_NAME_GROUP_AUDIT__ = {
      version: 1,
      rule: "same normalized name + same construction; package quantity ignored; dimensions split only in size-sensitive categories",
      productsChecked: products.length,
      sameNameConstructionGroups: authoritativeGroups.length,
      groupedVariantIds: authoritativeGroups.reduce((sum, group) => sum + group.ids.length, 0),
      partialGroupsReplaced: replacedPartialGroupCount,
      exactDuplicateGroupsAdded: exactDuplicateGroups.length,
      reservedFamiliesLeftToSpecialSelectors: skippedReservedFamilies,
      examples: authoritativeGroups.filter(group => /луц|агнет|абруццо/i.test(group.name))
    };

    window.dispatchEvent(new CustomEvent("forma:product-groups-ready", {
      detail: window.__GLOBAL_NAME_GROUP_AUDIT__
    }));

    const COLOR_ENTRIES = [
      ["светло-бежевый", "#ddd0bd"], ["темно-бежевый", "#9f876d"],
      ["светло-серый", "#c9c9c5"], ["темно-серый", "#555753"], ["тёмно-серый", "#555753"],
      ["серо-бежевый", "#a99f91"], ["пыльно-розовый", "#c99b9c"], ["темно-синий", "#23344d"],
      ["тёмно-синий", "#23344d"], ["темно-зеленый", "#284c3b"], ["тёмно-зелёный", "#284c3b"],
      ["салатовый", "#cbdc2d"], ["лаймовый", "#cbdc2d"], ["лайм", "#cbdc2d"],
      ["горчичный", "#b8872f"], ["терракотовый", "#a75735"], ["коралловый", "#b76558"],
      ["бордовый", "#6f2638"], ["антрацит", "#343735"], ["графит", "#4b4d4b"],
      ["черный", "#171715"], ["чёрный", "#171715"], ["белый", "#f5f3ed"],
      ["молочный", "#eee5d5"], ["кремовый", "#e8dcc5"], ["бежевый", "#c9b69c"],
      ["песочный", "#c5a979"], ["коричневый", "#76513c"], ["какао", "#80665d"],
      ["капучино", "#a88f78"], ["коньячный", "#985c32"], ["желтый", "#d5b23b"],
      ["жёлтый", "#d5b23b"], ["оранжевый", "#d97a32"], ["красный", "#b63d38"],
      ["розовый", "#d5a0aa"], ["пудровый", "#cfaaa5"], ["фиолетовый", "#70517d"],
      ["сиреневый", "#9b83aa"], ["синий", "#355d88"], ["голубой", "#78a9c4"],
      ["бирюзовый", "#3e9694"], ["изумрудный", "#28715c"], ["зеленый", "#587454"],
      ["зелёный", "#587454"], ["оливковый", "#73764a"], ["хаки", "#77745a"],
      ["мятный", "#91b6a3"], ["натуральный", "#c7a978"], ["дуб", "#b98f5f"],
      ["орех", "#765438"], ["венге", "#3d2b24"], ["золотой", "#c6a052"],
      ["золото", "#c6a052"], ["серебро", "#b9bab7"], ["серебристый", "#b9bab7"],
      ["хром", "#c8c9c7"], ["серый", "#8d8f8c"], ["green", "#587454"],
      ["grey", "#8d8f8c"], ["gray", "#8d8f8c"], ["white", "#f5f3ed"], ["black", "#171715"]
    ];
    const MATERIALS = [
      "искусственный мех", "экокожа", "кожзам", "натуральная кожа", "букле", "велюр", "бархат",
      "вельвет", "рогожка", "ткань", "микровелюр", "шенилл", "керамика", "мрамор", "дерево"
    ];
    const colorTokens = product => {
      const text = normalize(product?.specs);
      const found = [];
      for (const [label, css] of COLOR_ENTRIES) {
        const key = normalize(label);
        const index = text.indexOf(key);
        if (index >= 0) found.push({ label, css, key, index });
      }
      return [...new Map(found.sort((a, b) => a.index - b.index || b.key.length - a.key.length)
        .map(item => [item.key, item])).values()];
    };
    const materialTokens = product => {
      const text = normalize(product?.specs);
      return MATERIALS.filter(material => text.includes(normalize(material)));
    };

    const fallbackGroups = new Map();
    const fallbackById = new Map();
    function rebuildFallbackGroups() {
      fallbackGroups.clear();
      fallbackById.clear();
      const acceptedKeys = new Set((window.__COLOR_VARIANT_AUDIT__?.acceptedGroups || []).map(group =>
        uniqueIds(group.ids).sort((a, b) => a - b).join(",")
      ));
      for (const group of authoritativeGroups) {
        const ids = uniqueIds(group.ids);
        const key = [...ids].sort((a, b) => a - b).join(",");
        if (ids.length < 2 || acceptedKeys.has(key)) continue;
        const variants = ids.map(id => ({ id, product: byId.get(id), colors: colorTokens(byId.get(id)), materials: materialTokens(byId.get(id)) }));
        const colorFrequency = new Map();
        variants.forEach(variant => new Set(variant.colors.map(color => color.key)).forEach(color => colorFrequency.set(color, (colorFrequency.get(color) || 0) + 1)));
        const materialFrequency = new Map();
        variants.forEach(variant => new Set(variant.materials).forEach(material => materialFrequency.set(material, (materialFrequency.get(material) || 0) + 1)));
        const labels = new Set();
        variants.forEach((variant, index) => {
          const color = variant.colors.find(item => colorFrequency.get(item.key) < variants.length) || variant.colors[0] || { label: "Вариант", css: "#d8d3ca" };
          const material = variant.materials.find(item => materialFrequency.get(item) < variants.length) || "";
          let label = color.label;
          if (material && [...labels].some(existing => normalize(existing) === normalize(label))) label = `${label} · ${material}`;
          if (labels.has(label)) {
            const code = String(variant.product?.specs || "").match(/\b(?:HLR|HYP|VT|LT|MD)\s*[- ]?\w+/i)?.[0];
            label = code ? `${label} · ${code}` : `${label} · вариант ${index + 1}`;
          }
          labels.add(label);
          variant.label = label;
          variant.css = color.css;
        });
        const info = { name: group.name, primaryId: ids[0], ids, variants };
        fallbackGroups.set(key, info);
        variants.forEach(variant => fallbackById.set(variant.id, info));
      }
    }

    function installStyles() {
      if (document.getElementById("globalVariantStyles")) return;
      const style = document.createElement("style");
      style.id = "globalVariantStyles";
      style.textContent = `.global-variant-duplicate-hidden{display:none!important}.global-product-variants{margin:12px 0 2px;display:flex;align-items:center;gap:8px;flex-wrap:wrap}.global-variant-label{width:100%;font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}.global-variant-button{width:30px;height:30px;border-radius:50%;border:2px solid var(--surface);box-shadow:0 0 0 1px var(--line);padding:0;cursor:pointer;position:relative;flex:0 0 auto;transition:transform .15s ease,box-shadow .15s ease}.global-variant-button:hover{transform:scale(1.08)}.global-variant-button.active{box-shadow:0 0 0 2px var(--ink)}.global-variant-button.active:after{content:"";position:absolute;inset:7px;border-radius:50%;border:2px solid rgba(255,255,255,.95);box-shadow:0 0 0 1px rgba(0,0,0,.22)}.modal-content .global-product-variants{margin:16px 0 4px}.modal-content .global-variant-button{width:34px;height:34px}@media(max-width:700px){.global-product-variants{gap:7px;margin-top:10px}}`;
      document.head.appendChild(style);
    }

    function variantNode(info, activeId, modal = false) {
      const wrap = document.createElement("div");
      wrap.className = "global-product-variants";
      wrap.dataset.globalVariants = String(info.primaryId);
      const label = document.createElement("span");
      label.className = "global-variant-label";
      label.textContent = "Варианты";
      wrap.appendChild(label);
      info.variants.forEach(variant => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = `global-variant-button${Number(activeId) === variant.id ? " active" : ""}`;
        button.style.background = variant.css;
        button.dataset.globalVariantId = String(variant.id);
        button.title = variant.label;
        button.setAttribute("aria-label", `Выбрать вариант: ${variant.label}`);
        button.setAttribute("aria-pressed", String(Number(activeId) === variant.id));
        if (modal) button.dataset.globalVariantModal = "1";
        wrap.appendChild(button);
      });
      return wrap;
    }

    function replacePrice(card, product) {
      const current = card.querySelector(".price-stack");
      if (!current) return;
      try {
        if (typeof priceHtml === "function") {
          const template = document.createElement("template");
          template.innerHTML = priceHtml(product);
          const replacement = template.content.firstElementChild;
          if (replacement) current.replaceWith(replacement);
        }
      } catch {}
    }

    function updateCard(card, product, info) {
      card.dataset.globalVariantHost = String(info.primaryId);
      card.dataset.product = String(product.id);
      card.classList.remove("global-variant-duplicate-hidden", "product-color-duplicate-hidden", "product-exact-duplicate-hidden");
      const title = card.querySelector("h3");
      const specs = card.querySelector(".specs");
      const category = card.querySelector(".category");
      if (title) title.textContent = product.name || "";
      if (specs) specs.textContent = product.specs || "";
      if (category) category.textContent = product.category || "";
      const add = card.querySelector("[data-add]");
      const favorite = card.querySelector("[data-favorite-toggle]");
      if (add) add.dataset.add = String(product.id);
      if (favorite) favorite.dataset.favoriteToggle = String(product.id);
      replacePrice(card, product);

      const visual = card.querySelector(".visual");
      const image = visual?.querySelector(".js-product-image,.product-photo");
      const photos = Array.isArray(product.images) ? product.images.filter(Boolean) : [];
      if (visual) {
        visual.dataset.photoIndex = "0";
        visual.dataset.photoCount = String(Math.max(1, photos.length));
      }
      if (image) {
        image.dataset.productImage = String(product.id);
        image.alt = product.name || "";
        image.classList.remove("loaded", "failed");
        image.removeAttribute("data-observed");
        const source = photos[0] || product.directImage || "";
        try {
          if (source && typeof applyPhoto === "function") applyPhoto(image, source, product);
          else if (source) image.src = source;
        } catch { if (source) image.src = source; }
      }
      const counter = visual?.querySelector(".card-photo-counter");
      if (counter) counter.textContent = `1 / ${Math.max(1, photos.length)}`;
      const existing = card.querySelector("[data-global-variants]");
      const node = variantNode(info, product.id);
      if (existing) existing.replaceWith(node);
      else if (specs) specs.insertAdjacentElement("afterend", node);
      window.dispatchEvent(new CustomEvent("forma:card-variant-changed", { detail: { hostId: info.primaryId, productId: Number(product.id) } }));
    }

    let rendering = false;
    function renderFallback() {
      if (rendering) return;
      rendering = true;
      try {
        installStyles();
        rebuildFallbackGroups();
        document.querySelectorAll("#grid [data-product]").forEach(card => {
          const id = Number(card.dataset.product);
          const info = fallbackById.get(id);
          const existing = card.querySelector("[data-global-variants]");
          if (!info) {
            existing?.remove();
            return;
          }
          const isHost = Number(card.dataset.globalVariantHost || id) === info.primaryId || Boolean(card.dataset.globalVariantHost);
          card.classList.toggle("global-variant-duplicate-hidden", id !== info.primaryId && !isHost);
          if (!isHost && id !== info.primaryId) return;
          card.dataset.globalVariantHost = String(info.primaryId);
          card.querySelector(".product-colors")?.remove();
          if (!existing || existing.dataset.globalVariants !== String(info.primaryId)) {
            const node = variantNode(info, id);
            const specs = card.querySelector(".specs");
            if (existing) existing.replaceWith(node);
            else if (specs) specs.insertAdjacentElement("afterend", node);
          }
        });

        const modal = document.getElementById("modal");
        if (modal?.classList.contains("show")) {
          let id = null;
          try { id = Number(activeGallery?.productId); } catch {}
          const info = fallbackById.get(id);
          const content = modal.querySelector(".modal-content");
          const existing = content?.querySelector("[data-global-variants]");
          if (!info) existing?.remove();
          else if (content) {
            content.querySelector(".product-colors")?.remove();
            const node = variantNode(info, id, true);
            const specs = content.querySelector(".modal-specs,.specs");
            if (existing) existing.replaceWith(node);
            else if (specs) specs.insertAdjacentElement("afterend", node);
          }
        }
      } finally {
        rendering = false;
      }
    }

    document.addEventListener("click", event => {
      const button = event.target.closest("[data-global-variant-id]");
      if (!button) return;
      event.preventDefault();
      event.stopPropagation();
      const id = Number(button.dataset.globalVariantId);
      const product = byId.get(id);
      const info = fallbackById.get(id);
      if (!product || !info) return;
      if (button.dataset.globalVariantModal === "1") {
        try { if (typeof openProduct === "function") openProduct(id); } catch {}
        setTimeout(renderFallback, 40);
        return;
      }
      const card = button.closest("[data-product]");
      if (card) updateCard(card, product, info);
    }, true);

    let scheduled = false;
    const schedule = () => {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(() => {
        scheduled = false;
        renderFallback();
      });
    };
    new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
    window.addEventListener("forma:catalog-ready", schedule);
    window.addEventListener("forma:product-groups-ready", schedule);
    window.addEventListener("forma:card-variant-changed", schedule);
    document.addEventListener("DOMContentLoaded", schedule);
    schedule();
    setTimeout(schedule, 120);
    setTimeout(schedule, 500);
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
