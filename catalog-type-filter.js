(() => {
  "use strict";

  const originalWrite = document.write.bind(document);

  function catalogTypeFilterRuntime() {
    "use strict";
    if (window.__FORMA_CATALOG_TYPE_FILTER_V1__) return;
    window.__FORMA_CATALOG_TYPE_FILTER_V1__ = true;

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

      style.textContent = `
        #catalogControls #chips{
          display:none!important;
        }
        #catalogControls [${FIELD_ATTR}]{
          min-width:0;
        }
        #catalogControls [${FIELD_ATTR}] select{
          width:100%;
          min-width:0;
        }
        @media(min-width:981px){
          #catalogControls .filter-row{
            grid-template-columns:repeat(4,minmax(0,1fr))!important;
          }
        }
        @media(min-width:641px) and (max-width:980px){
          #catalogControls .filter-row{
            grid-template-columns:repeat(2,minmax(0,1fr))!important;
          }
        }
        @media(max-width:640px){
          #catalogControls .filter-row{
            grid-template-columns:minmax(0,1fr)!important;
          }
        }
      `;
    }

    function removeLegacyExtraFilters() {
      document.querySelectorAll(
        "[data-forma-extra-toggle],.compact-extra-filters-body,[data-filter-body-version]"
      ).forEach(node => node.remove());
      document.getElementById("forma-compact-extra-filters-style")?.remove();
      document.body?.classList.remove("compact-extra-filters-body");
    }

    function categoryButtons(chips) {
      return [...chips.querySelectorAll("[data-category]")];
    }

    function activeCategory(chips) {
      const active = chips.querySelector("[data-category].active");
      return active?.dataset.category || "Все";
    }

    function optionSignature(buttons) {
      return buttons.map(button => button.dataset.category || "").join("|");
    }

    function fillOptions(select, buttons) {
      const signature = optionSignature(buttons);
      if (select.dataset.optionSignature === signature) return;

      select.innerHTML = "";
      for (const button of buttons) {
        const value = button.dataset.category || "";
        if (!value) continue;
        const option = document.createElement("option");
        option.value = value;
        option.textContent = value === "Все" ? "Все типы" : value;
        select.appendChild(option);
      }
      select.dataset.optionSignature = signature;
    }

    function syncSelect(select, chips) {
      const value = activeCategory(chips);
      if ([...select.options].some(option => option.value === value)) {
        select.value = value;
      } else {
        select.value = "Все";
      }
    }

    function createField(row) {
      const field = document.createElement("label");
      field.className = "field";
      field.setAttribute(FIELD_ATTR, "true");
      field.innerHTML = `
        <span>Тип</span>
        <select id="type" aria-label="Тип мебели"></select>
      `;
      row.insertBefore(field, row.firstElementChild);
      return field;
    }

    function bindSelect(select, chips) {
      if (select.dataset.typeFilterBound === "true") return;
      select.dataset.typeFilterBound = "true";

      select.addEventListener("change", () => {
        const targetValue = select.value || "Все";
        const button = categoryButtons(chips).find(item =>
          item.dataset.category === targetValue
        );
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
      removeLegacyExtraFilters();

      const panel = document.getElementById("catalogControls") ||
        document.querySelector(".filter-panel");
      const chips = document.getElementById("chips");
      const row = panel?.querySelector(".filter-row");
      if (!panel || !chips || !row) return false;

      const buttons = categoryButtons(chips);
      if (!buttons.length) return false;

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
        label: "Тип",
        values: buttons.map(button => button.dataset.category).filter(Boolean),
        selected: select.value,
        legacyExtraFiltersRemoved: true
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
      attributeFilter: ["class"]
    });

    document.addEventListener("DOMContentLoaded", schedule, { once: true });
    window.addEventListener("pageshow", schedule, { passive: true });
    window.addEventListener("forma:catalog-ready", schedule, { passive: true });
    schedule();
  }

  if (document.getElementById("catalogControls")) catalogTypeFilterRuntime();

  document.write = function patchedWrite(...parts) {
    let html = parts.join("");
    if (typeof html === "string" && html.includes("</body>")) {
      html = html.replace("</body>", `<script>(${catalogTypeFilterRuntime.toString()})();<\/script></body>`);
    }
    return originalWrite(html);
  };
})();
