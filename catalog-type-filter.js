(() => {
  "use strict";

  // Не позволяем старому модулю дополнительных фильтров запускаться повторно.
  window.__FORMA_COMPACT_FILTERS_V6__ = true;
  window.__FORMA_COMPACT_FILTERS_DISABLED__ = true;

  const originalWrite = document.write.bind(document);

  function catalogTypeFilterRuntime() {
    "use strict";
    if (window.__FORMA_CATALOG_TYPE_FILTER_V3__) return;
    window.__FORMA_CATALOG_TYPE_FILTER_V3__ = true;

    const STYLE_ID = "forma-catalog-type-filter-style";
    const FIELD_ATTR = "data-forma-type-filter";
    const LEGACY_LABELS = new Set([
      "тип товара",
      "цвет",
      "материал",
      "ширина",
      "высота",
      "наличие",
      "модель",
      "артикул",
      "модель или артикул"
    ]);
    let scheduled = false;

    const norm = value => String(value || "")
      .toLowerCase()
      .replace(/ё/g, "е")
      .replace(/[−–—]/g, "-")
      .replace(/\s+/g, " ")
      .trim();

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
        .filter-panel [data-forma-extra-toggle],
        .filter-panel .compact-extra-filters-body,
        .filter-panel [data-filter-body-version]{
          display:none!important;
        }
        #catalogControls [${FIELD_ATTR}]{
          min-width:0;
        }
        #catalogControls [${FIELD_ATTR}]>span{
          display:block;
          margin:0 0 7px;
          font-size:13px;
          font-weight:800;
          color:var(--ink,#201f1b);
        }
        #catalogControls [${FIELD_ATTR}] select{
          width:100%;
          min-width:0;
        }
        @media(min-width:981px){
          #catalogControls .filter-row{
            grid-template-columns:minmax(150px,.8fr) minmax(240px,1.8fr) minmax(180px,1fr) minmax(160px,.85fr) minmax(180px,1fr)!important;
            align-items:end!important;
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
      if (style.textContent !== css) style.textContent = css;
    }

    function fieldLabel(field) {
      const label = field.querySelector("label,.field-label,.filter-label,strong,b,span");
      if (label) return norm(label.textContent);
      const control = field.querySelector("select,input");
      return norm(
        control?.getAttribute("aria-label") ||
        control?.getAttribute("name") ||
        control?.getAttribute("placeholder") ||
        ""
      );
    }

    function isLegacyField(field) {
      const label = fieldLabel(field);
      for (const name of LEGACY_LABELS) {
        if (label === name || label.startsWith(`${name} `)) return true;
      }
      return false;
    }

    function removeLegacyExtraFilters(panel) {
      if (!panel) return;

      document.getElementById("forma-compact-extra-filters-style")?.remove();
      document.body?.classList.remove("compact-extra-filters-body");
      panel.removeAttribute("data-compact-extra-filters");

      panel.querySelectorAll(
        "[data-forma-extra-toggle],.compact-extra-filters-body,[data-filter-body-version]"
      ).forEach(node => node.remove());

      [...panel.querySelectorAll("button,h2,h3,h4,strong")].forEach(node => {
        const text = norm(node.textContent).replace(/[+\-]\s*$/, "").trim();
        if (text === "дополнительные фильтры") node.remove();
      });

      const mainRow = panel.querySelector(".filter-row");
      panel.querySelectorAll(".field,.filter-field,.form-field,[data-filter-field]").forEach(field => {
        if (field.hasAttribute(FIELD_ATTR)) return;
        if (mainRow?.contains(field)) return;
        if (isLegacyField(field)) field.remove();
      });
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

      const panel = document.getElementById("catalogControls") ||
        document.querySelector(".filter-panel");
      const chips = document.getElementById("chips");
      const row = panel?.querySelector(".filter-row");
      if (!panel || !chips || !row) return false;

      if (!panel.id) panel.id = "catalogControls";
      removeLegacyExtraFilters(panel);

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
        version: 3,
        label: "Тип",
        values: buttons.map(button => button.dataset.category).filter(Boolean),
        selected: select.value,
        legacyExtraFiltersRemoved: true,
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
        /<script\s+[^>]*src=["']compact-extra-filters\.js\?v=\d+["'][^>]*><\/script>/gi,
        ""
      );
      html = html.replace("</body>", `<script>(${catalogTypeFilterRuntime.toString()})();<\/script></body>`);
    }
    return originalWrite(html);
  };
})();
