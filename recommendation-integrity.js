(() => {
  "use strict";

  const originalWrite = document.write.bind(document);

  function recommendationIntegrityRuntime() {
    "use strict";
    if (window.__FORMA_RECOMMENDATION_INTEGRITY_V1__) return;
    window.__FORMA_RECOMMENDATION_INTEGRITY_V1__ = true;

    const MAX_ITEMS = 4;
    let scheduled = false;

    function products() {
      try {
        return typeof PRODUCTS !== "undefined" && Array.isArray(PRODUCTS) ? PRODUCTS : [];
      } catch {
        return [];
      }
    }

    function numericIds(values) {
      return [...new Set((values || []).map(Number).filter(Number.isFinite))];
    }

    function allFamilies() {
      const families = [];

      for (const group of Array.isArray(window.PRODUCT_COLOR_GROUPS) ? window.PRODUCT_COLOR_GROUPS : []) {
        const ids = numericIds(group.ids);
        if (ids.length > 1) families.push({ primaryId: ids[0], ids });
      }

      for (const group of Array.isArray(window.PRODUCT_DUPLICATE_GROUPS) ? window.PRODUCT_DUPLICATE_GROUPS : []) {
        const ids = numericIds(group.ids);
        if (ids.length > 1) families.push({ primaryId: ids[0], ids });
      }

      for (const group of Array.isArray(window.PRODUCT_EXPLICIT_VARIANT_GROUPS) ? window.PRODUCT_EXPLICIT_VARIANT_GROUPS : []) {
        const ids = numericIds((group.variants || []).map(variant => variant.id));
        const primaryId = Number(group.primaryId || ids[0]);
        if (ids.length > 1 && Number.isFinite(primaryId)) families.push({ primaryId, ids });
      }

      for (const group of Array.isArray(window.PRODUCT_DUAL_VARIANT_GROUPS) ? window.PRODUCT_DUAL_VARIANT_GROUPS : []) {
        const ids = numericIds((group.variants || []).map(variant => variant.id));
        const primaryId = Number(group.primaryId || ids[0]);
        if (ids.length > 1 && Number.isFinite(primaryId)) families.push({ primaryId, ids });
      }

      return families;
    }

    function secondaryIds() {
      const ids = new Set();
      allFamilies().forEach(family => {
        family.ids.filter(id => id !== family.primaryId).forEach(id => ids.add(id));
      });
      return ids;
    }

    function familyIdsFor(productId) {
      const id = Number(productId);
      const family = allFamilies().find(item => item.ids.includes(id));
      return new Set(family ? family.ids : [id]);
    }

    function visiblePrimaryProducts() {
      const secondary = secondaryIds();
      return products().filter(product => !secondary.has(Number(product.id)));
    }

    function productByIdSafe(id) {
      try {
        if (typeof productById === "function") return productById(Number(id));
      } catch {}
      return products().find(product => Number(product.id) === Number(id)) || null;
    }

    function price(product) {
      try {
        return Number(typeof sellingPrice === "function" ? sellingPrice(product) : product?.wholesalePrice || 0);
      } catch {
        return Number(product?.wholesalePrice || 0);
      }
    }

    function money(value) {
      try {
        return typeof formatPrice === "function"
          ? formatPrice(value)
          : `${new Intl.NumberFormat("ru-RU").format(Number(value) || 0)} ₽`;
      } catch {
        return `${Number(value) || 0} ₽`;
      }
    }

    function safe(value) {
      try {
        if (typeof esc === "function") return esc(value);
      } catch {}
      return String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
    }

    function imageFor(product) {
      const images = Array.isArray(product?.images) ? product.images.filter(Boolean) : [];
      return images[0] || product?.directImage || "";
    }

    function recommendationCard(product) {
      const image = imageFor(product);
      return `<button type="button" class="journey-product" data-journey-open="${product.id}">${image ? `<img src="${safe(image)}" alt="" loading="lazy" decoding="async" draggable="false">` : ""}<span class="journey-product-body"><span class="journey-product-name">${safe(product.name)}</span><span class="journey-product-price">${money(price(product))}</span></span></button>`;
    }

    function recommendationSets(active) {
      const excluded = familyIdsFor(active.id);
      const available = visiblePrimaryProducts().filter(product => !excluded.has(Number(product.id)));
      const currentPrice = price(active);
      const sameCollection = available
        .filter(product => active.collection && product.collection === active.collection)
        .slice(0, MAX_ITEMS);
      const used = new Set(sameCollection.map(product => Number(product.id)));
      const similar = available
        .filter(product => product.category === active.category && !used.has(Number(product.id)))
        .map(product => ({
          product,
          distance: currentPrice > 0 ? Math.abs(price(product) - currentPrice) / currentPrice : 2
        }))
        .sort((a, b) => a.distance - b.distance)
        .slice(0, MAX_ITEMS)
        .map(item => item.product);
      return { sameCollection, similar };
    }

    function rebuildModalRecommendations() {
      const modal = document.getElementById("modal");
      if (!modal?.classList.contains("show")) return;

      let activeId = null;
      try { activeId = Number(activeGallery?.productId); } catch {}
      const active = productByIdSafe(activeId);
      if (!active) return;

      const sets = recommendationSets(active);
      modal.querySelectorAll(".journey-section").forEach(section => {
        const heading = String(section.querySelector("h3")?.textContent || "").toLowerCase();
        const row = section.querySelector(".journey-row");
        if (!row) return;
        const items = heading.includes("этой же серии") ? sets.sameCollection :
          heading.includes("похожие") ? sets.similar : null;
        if (!items) return;

        const signature = items.map(product => Number(product.id)).join("|");
        if (row.dataset.integritySignature === signature) return;
        row.dataset.integritySignature = signature;
        row.innerHTML = items.map(recommendationCard).join("");
        section.hidden = items.length === 0;
      });
    }

    function rebuildCartRecommendations() {
      const drawer = document.getElementById("drawer");
      const list = drawer?.querySelector(".cart-journey-list");
      if (!drawer?.classList.contains("show") || !list) return;

      let entries = [];
      try {
        entries = Object.entries(cart)
          .map(([id, quantity]) => ({ product: productByIdSafe(id), quantity: Number(quantity) || 0 }))
          .filter(entry => entry.product && entry.quantity > 0);
      } catch {}
      if (!entries.length) return;

      const excluded = new Set();
      entries.forEach(entry => familyIdsFor(entry.product.id).forEach(id => excluded.add(id)));
      const categories = new Set(entries.map(entry => entry.product.category));
      const collections = new Set(entries.map(entry => entry.product.collection).filter(Boolean));
      const candidates = visiblePrimaryProducts()
        .filter(product => !excluded.has(Number(product.id)))
        .map(product => ({
          product,
          score: (collections.has(product.collection) ? 0 : 3) +
            (categories.has(product.category) ? 0 : 2)
        }))
        .sort((a, b) => a.score - b.score)
        .slice(0, 3)
        .map(item => item.product);

      const signature = candidates.map(product => Number(product.id)).join("|");
      if (list.dataset.integritySignature === signature) return;
      list.dataset.integritySignature = signature;
      list.innerHTML = candidates.map(product => {
        const image = imageFor(product);
        return `<div class="cart-journey-item">${image ? `<img src="${safe(image)}" alt="" loading="lazy" decoding="async">` : ""}<div><div class="cart-journey-name">${safe(product.name)}</div><div class="cart-journey-price">${money(price(product))}</div></div><button type="button" class="cart-journey-add" data-cart-recommendation-add="${product.id}" aria-label="Добавить ${safe(product.name)}">+</button></div>`;
      }).join("");
    }

    function refresh() {
      scheduled = false;
      rebuildModalRecommendations();
      rebuildCartRecommendations();
      window.__FORMA_RECOMMENDATION_INTEGRITY_AUDIT__ = {
        enabled: true,
        familyCount: allFamilies().length,
        suppressedSecondaryIds: [...secondaryIds()],
        primaryProductCount: visiblePrimaryProducts().length
      };
    }

    function schedule() {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(refresh);
    }

    new MutationObserver(schedule).observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "data-product"]
    });
    window.addEventListener("forma:catalog-ready", schedule, { passive: true });
    window.addEventListener("forma:product-groups-ready", schedule, { passive: true });
    window.addEventListener("forma:dual-variants-ready", schedule, { passive: true });
    window.addEventListener("forma:card-variant-changed", schedule, { passive: true });
    schedule();
  }

  document.write = function patchedWrite(...parts) {
    let html = parts.join("");
    if (typeof html === "string" && html.includes("</body>")) {
      html = html.replace("</body>", `<script>(${recommendationIntegrityRuntime.toString()})();<\/script></body>`);
    }
    return originalWrite(html);
  };
})();
