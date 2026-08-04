(() => {
  "use strict";

  const originalWrite = document.write.bind(document);

  function runtime() {
    "use strict";

    const productList = () => {
      try {
        if (typeof PRODUCTS !== "undefined" && Array.isArray(PRODUCTS)) return PRODUCTS;
      } catch {}
      return Array.isArray(window.PRODUCTS) ? window.PRODUCTS : [];
    };

    function exactDuplicateIds() {
      const available = new Set(productList().map(product => Number(product.id)).filter(Number.isFinite));
      const ids = new Set();
      for (const group of Array.isArray(window.PRODUCT_DUPLICATE_GROUPS) ? window.PRODUCT_DUPLICATE_GROUPS : []) {
        const members = [...new Set((group.ids || []).map(Number).filter(Number.isFinite))]
          .filter(id => available.has(id));
        members.slice(1).forEach(id => ids.add(id));
      }
      return ids;
    }

    function colorVariantIds() {
      return new Set(
        (window.__COLOR_VARIANT_AUDIT__?.hiddenDuplicateIds || [])
          .map(Number)
          .filter(Number.isFinite)
      );
    }

    function updateCatalogCount(exactIds, colorIds) {
      const products = productList();
      if (!products.length) return;
      const available = new Set(products.map(product => Number(product.id)).filter(Number.isFinite));
      const removed = new Set(
        [...exactIds, ...colorIds].filter(id => available.has(Number(id))).map(Number)
      );
      const finalCards = Math.max(0, available.size - removed.size);
      const formatted = new Intl.NumberFormat("ru-RU").format(finalCards);

      const targets = [
        document.querySelector(".forma-hero-stat:first-child strong"),
        document.querySelector(".hero-side .stat-card:first-child .stat-number")
      ].filter(Boolean);
      targets.forEach(target => { target.textContent = formatted; });

      window.__FINAL_CARD_AUDIT__ = {
        productsAfterHiddenList: available.size,
        hiddenExactDuplicateIds: [...exactIds],
        hiddenColorVariantIds: [...colorIds],
        removedUniqueIds: [...removed],
        finalUniqueCards: finalCards
      };
    }

    function refresh() {
      const exactIds = exactDuplicateIds();
      const colorIds = colorVariantIds();
      document.querySelectorAll("[data-product]").forEach(card => {
        card.classList.toggle(
          "product-exact-duplicate-hidden",
          exactIds.has(Number(card.dataset.product))
        );
      });
      window.__EXACT_DUPLICATE_AUDIT__ = {
        groups: Array.isArray(window.PRODUCT_DUPLICATE_GROUPS) ? window.PRODUCT_DUPLICATE_GROUPS : [],
        hiddenIds: [...exactIds]
      };
      updateCatalogCount(exactIds, colorIds);
    }

    const style = document.createElement("style");
    style.textContent = ".product-exact-duplicate-hidden{display:none!important}";
    document.head.appendChild(style);

    let scheduled = false;
    const schedule = () => {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(() => {
        scheduled = false;
        refresh();
      });
    };

    new MutationObserver(schedule).observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class"]
    });
    document.addEventListener("DOMContentLoaded", schedule);
    window.addEventListener("forma:product-groups-ready", schedule);
    window.addEventListener("forma:catalog-ready", schedule);
    schedule();

    let attempts = 0;
    const poll = setInterval(() => {
      schedule();
      attempts += 1;
      if (attempts >= 24) clearInterval(poll);
    }, 250);
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
