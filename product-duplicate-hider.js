(() => {
  "use strict";

  const hiddenIds = () => {
    const ids = new Set();
    for (const group of Array.isArray(window.PRODUCT_DUPLICATE_GROUPS) ? window.PRODUCT_DUPLICATE_GROUPS : []) {
      const members = [...new Set((group.ids || []).map(Number).filter(Number.isFinite))];
      members.slice(1).forEach(id => ids.add(id));
    }
    return ids;
  };

  function refresh() {
    const ids = hiddenIds();
    document.querySelectorAll("[data-product]").forEach(card => {
      card.classList.toggle("product-exact-duplicate-hidden", ids.has(Number(card.dataset.product)));
    });
    window.__EXACT_DUPLICATE_AUDIT__ = {
      groups: Array.isArray(window.PRODUCT_DUPLICATE_GROUPS) ? window.PRODUCT_DUPLICATE_GROUPS : [],
      hiddenIds: [...ids]
    };
  }

  const style = document.createElement("style");
  style.textContent = ".product-exact-duplicate-hidden{display:none!important}";
  document.head.appendChild(style);

  let scheduled = false;
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => { scheduled = false; refresh(); });
  };

  new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
  document.addEventListener("DOMContentLoaded", schedule);
  schedule();
})();
