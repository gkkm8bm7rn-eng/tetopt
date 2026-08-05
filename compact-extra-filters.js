(() => {
  "use strict";

  window.__FORMA_COMPACT_FILTERS_V6__ = true;
  window.__FORMA_COMPACT_FILTERS_DISABLED__ = true;

  function removeLegacyExtraFilters() {
    document.getElementById("forma-compact-extra-filters-style")?.remove();
    document.body?.classList.remove("compact-extra-filters-body");

    document.querySelectorAll(
      "[data-forma-extra-toggle],.compact-extra-filters-body,[data-filter-body-version]"
    ).forEach(node => node.remove());

    document.querySelectorAll(".filter-panel,.filters-panel,.catalog-filters,[data-filter-panel]").forEach(panel => {
      [...panel.querySelectorAll("button,h2,h3,h4,strong")].forEach(node => {
        const text = String(node.textContent || "")
          .toLowerCase()
          .replace(/ё/g, "е")
          .replace(/[−–—]/g, "-")
          .replace(/[+\-]\s*$/, "")
          .replace(/\s+/g, " ")
          .trim();
        if (text === "дополнительные фильтры") node.remove();
      });
    });
  }

  removeLegacyExtraFilters();
  document.addEventListener("DOMContentLoaded", removeLegacyExtraFilters, { once: true });
  window.addEventListener("pageshow", removeLegacyExtraFilters, { passive: true });
  window.addEventListener("forma:catalog-ready", removeLegacyExtraFilters, { passive: true });

  new MutationObserver(removeLegacyExtraFilters).observe(document.documentElement, {
    childList: true,
    subtree: true
  });
})();
