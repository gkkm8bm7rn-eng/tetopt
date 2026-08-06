(() => {
  "use strict";

  window.__FORMA_ADVANCED_FILTERS_DISABLED__ = true;

  function removeAdvancedFilters() {
    document.querySelectorAll(
      ".advanced-filter-box,.advanced-filter-grid,.active-filters,#activeFilters,[data-advanced-filter-box]"
    ).forEach(node => node.remove());

    document.querySelectorAll("style").forEach(style => {
      const css = String(style.textContent || "");
      if (css.includes(".advanced-filter-box") && css.includes(".advanced-filter-grid")) {
        style.remove();
      }
    });
  }

  removeAdvancedFilters();
  document.addEventListener("DOMContentLoaded", removeAdvancedFilters, { once: true });
  window.addEventListener("pageshow", removeAdvancedFilters, { passive: true });
  window.addEventListener("forma:catalog-ready", removeAdvancedFilters, { passive: true });

  new MutationObserver(removeAdvancedFilters).observe(document.documentElement, {
    childList: true,
    subtree: true
  });
})();
