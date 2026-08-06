(() => {
  "use strict";

  window.__FORMA_COMPACT_FILTERS_V6__ = true;
  window.__FORMA_COMPACT_FILTERS_DISABLED__ = true;
  window.__FORMA_ADVANCED_FILTERS_DISABLED__ = true;

  const originalWrite = document.write.bind(document);

  function catalogTypeFilterRuntime() {
    "use strict";
    if (window.__FORMA_CATALOG_TYPE_FILTER_V4__) return;
    window.__FORMA_CATALOG_TYPE_FILTER_V4__ = true;

    const STYLE_ID = "forma-catalog-type-filter-style";
    const FIELD_ATTR = "data-forma-type-filter";
    let scheduled = false;

    function ensureStyle() {
      let style = document.getElementById(STYLE_ID);
      if (!style) {
        style = document.createElement("style");
        style.id = STYLE_ID;
        document.head.appendChild(style);
      }

      const css = `
        #catalogControls #chips,
        #catalogControls>.chips,
        #catalogControls [data-forma-extra-toggle],
        #catalogControls .compact-extra-filters-body,
        #catalogControls [data-filter-body-version],
        #catalogControls .advanced-filter-box,
        #catalogControls .advanced-filter-grid,
        #catalogControls .active-filters,
        .filter-panel [data-forma-extra-toggle],
        .filter-panel .compact-extra-filters-body,
        .filter-panel [data-filter-body-version],
        .filter-panel .advanced-filter-box,
        .filter-panel .advanced-filter-grid,
        .filter-panel .active-filters{
          display:none!important;
        }
        #catalogControls [${FIELD_ATTR}]{min-width:0}
        #catalogControls [${FIELD_ATTR}]>span{
          display:block;margin:0 0 7px;font-size:13px;font-weight:800;color:var(--ink,#201f1b)
        }
        #catalogControls [${FIELD_ATTR}] select{width:100%;min-width:0}
        @media(min-width:981px){
          #catalogControls .filter-row{
            grid-template-columns:minmax(150px,.8fr) minmax(240px,1.8fr) minmax(180px,1fr) minmax(160px,.85fr) minmax(180px,1fr)!important;
            align-items:end!important;
          }
        }
        @media(min-width:641px) and (max-width:980px){
          #catalogControls .filter-row{grid-template-columns:repeat(2,minmax(0,1fr))!important}
        }
        @media(max-width:640px){
          #catalogControls .filter-row{grid-template-columns:minmax(0,1fr)!important}
        }
      `;
      if (style.textContent !== css) style.textContent = css;
    }

    function normalized(value) {
      return String(value || "")
        .toLowerCase()
        .replace(/ё/g, "е")
        .replace(/[−–—]/g, "-")
        .replace(/\s+/g, " ")
        .trim();
    }

    function removeLegacyFilters(panel) {
      document.getElementById("forma-compact-extra-filters-style")?.remove();
      document.body?.classList.remove("compact-extra-filters-body");

      document.querySelectorAll(
        "[data-forma-extra-toggle],.compact-extra-filters-body,[data-filter-body-version]," +
        ".advanced-filter-box,.advanced-filter-grid,.active-filters,#activeFilters"
      ).forEach(node => node.remove());

      document.querySelectorAll("style").forEach(style => {
        const css = String(style.textContent || "");
        if ((css.includes(".advanced-filter-box") && css.includes(".advanced-filter-grid")) ||
            css.includes(".compact-extra-filters-body")) {
          if (style.id !== STYLE_ID) style.remove();
        }
      });

      panel?.querySelectorAll("button,h2,h3,h4,strong,summary").forEach(node => {
        const text = normalized(node.textContent).replace(/[+\-]\s*$/, "").trim();
        if (text === "дополнительные фильтры") node.closest("details")?.remove() || node.remove();
      });
    }

    function categoryButtons(chips) {
      return [...chips.querySelectorAll("[data-category]")];
    }

    function activeCategory(chips) {
      const active = chips.querySelector("[data-category].active");
      return active?.dataset.category || "Все";
    }

    function fillOptions(select, buttons) {
      const signature = buttons.map(button => button.dataset.category || "").join("|");
      if (select.dataset.optionSignature === signature) return;
      select.innerHTML = "";
      buttons.forEach(button => {
        const value = button.dataset.category || "";
        if (!value) return;
        const option = document.createElement("option");
        option.value = value;
        option.textContent = value === "Все" ? "Все типы" : value;
        select.appendChild(option);
      });
      select.dataset.optionSignature = signature;
    }

    function syncSelect(select, chips) {
      const value = activeCategory(chips);
      select.value = [...select.options].some(option => option.value === value) ? value : "Все";
    }

    function createField(row) {
      const field = document.createElement("label");
      field.className = "field";
      field.setAttribute(FIELD_ATTR, "true");
      field.innerHTML = '<span>Тип</span><select id="type" aria-label="Тип мебели"></select>';
      row.insertBefore(field, row.firstElementChild);
      return field;
    }

    function bindSelect(select, chips) {
      if (select.dataset.typeFilterBound === "true") return;
      select.dataset.typeFilterBound = "true";
      select.addEventListener("change", () => {
        const targetValue = select.value || "Все";
        const button = categoryButtons(chips).find(item => item.dataset.category === targetValue);
        if (!button) return;
        button.click();
        requestAnimationFrame(() => syncSelect(select, chips));
      });
    }

    function bindReset(panel, select, chips) {
      const reset = panel.querySelector("#clear");
      if (!reset || reset.dataset.typeFilterResetBound === "true") return;
      reset.dataset.typeFilterResetBound = "true";
      reset.addEventListener("click", () => {
        requestAnimationFrame(() => syncSelect(select, chips));
        setTimeout(() => syncSelect(select, chips), 40);
      });
    }

    function setup() {
      scheduled = false;
      ensureStyle();

      const panel = document.getElementById("catalogControls") || document.querySelector(".filter-panel");
      const chips = document.getElementById("chips");
      const row = panel?.querySelector(".filter-row");
      if (!panel || !chips || !row) return false;

      if (!panel.id) panel.id = "catalogControls";
      removeLegacyFilters(panel);

      const buttons = categoryButtons(chips);
      if (!buttons.length) return false;
      chips.hidden = true;
      chips.setAttribute("aria-hidden", "true");
      chips.dataset.formaCategorySource = "type-filter";

      let field = panel.querySelector(`[${FIELD_ATTR}]`);
      if (!field) field = createField(row);
      else if (field.parentElement !== row) row.insertBefore(field, row.firstElementChild);

      const select = field.querySelector("select");
      if (!select) return false;
      fillOptions(select, buttons);
      syncSelect(select, chips);
      bindSelect(select, chips);
      bindReset(panel, select, chips);

      window.__FORMA_TYPE_FILTER__ = {
        enabled: true,
        version: 4,
        label: "Тип",
        values: buttons.map(button => button.dataset.category).filter(Boolean),
        selected: select.value,
        legacyExtraFiltersRemoved: true,
        advancedFiltersRemoved: true,
        legacyCategoryChipsHidden: true
      };
      return true;
    }

    function schedule() {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(setup);
    }

    new MutationObserver(schedule).observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "hidden", "aria-expanded"]
    });
    document.addEventListener("DOMContentLoaded", schedule, { once: true });
    window.addEventListener("pageshow", schedule, { passive: true });
    window.addEventListener("forma:catalog-ready", schedule, { passive: true });
    schedule();
  }

  if (document.querySelector(".filter-panel,#grid")) catalogTypeFilterRuntime();

  document.write = function patchedWrite(...parts) {
    let html = parts.join("");
    if (typeof html === "string" && html.includes("</body>")) {
      html = html.replace(
        /<script\s+[^>]*src=["'](?:compact-extra-filters|advanced-filters)\.js\?v=\d+["'][^>]*><\/script>/gi,
        ""
      );
      html = html.replace("</body>", `<script>(${catalogTypeFilterRuntime.toString()})();<\/script></body>`);
    }
    return originalWrite(html);
  };
})();
