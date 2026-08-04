(() => {
  "use strict";

  const originalWrite = document.write.bind(document);

  function compactFiltersRuntime() {
    "use strict";
    if (window.__FORMA_COMPACT_FILTERS_V6__) return;
    window.__FORMA_COMPACT_FILTERS_V6__ = true;

    const VERSION = "6";
    const STYLE_ID = "forma-compact-extra-filters-style";
    const BODY_CLASS = "compact-extra-filters-body";
    const KEEP = ["тип товара", "цвет", "материал"];
    const EXTRA_LABELS = [
      "тип товара", "цвет", "материал", "ширина", "высота",
      "наличие", "модель или артикул", "артикул", "модель"
    ];
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
      }
      style.textContent = `
        [data-forma-extra-toggle]{
          width:100%!important;display:flex!important;align-items:center!important;
          justify-content:space-between!important;gap:16px!important;border:0!important;
          padding:15px 0!important;background:transparent!important;color:var(--ink,#201f1b)!important;
          text-align:left!important;font:inherit!important;font-weight:850!important;cursor:pointer!important
        }
        [data-forma-extra-toggle] [data-filter-symbol]{
          flex:0 0 auto!important;font-size:22px!important;line-height:1!important
        }
        .${BODY_CLASS}[hidden]{display:none!important}
        .${BODY_CLASS}{display:grid!important;gap:14px!important;padding:4px 0 2px!important}
        .${BODY_CLASS}>.field,.${BODY_CLASS}>.filter-field,.${BODY_CLASS}>.form-field,
        .${BODY_CLASS}>[data-filter-field]{margin:0!important}
        @media(max-width:760px){
          [data-forma-extra-toggle]{padding:13px 0!important}
          .${BODY_CLASS}{gap:12px!important}
        }
      `;
      if (style.parentNode !== document.head || style !== document.head.lastElementChild) {
        document.head.appendChild(style);
      }
    }

    function labelText(field) {
      const label = field.querySelector("label,.field-label,.filter-label,strong,b");
      if (label) return norm(label.textContent);
      const control = field.querySelector("select,input");
      return norm(
        control?.getAttribute("aria-label") ||
        control?.getAttribute("name") ||
        control?.getAttribute("placeholder") ||
        ""
      );
    }

    function labelKind(field) {
      const label = labelText(field);
      return EXTRA_LABELS.find(name => label === name || label.startsWith(`${name} `)) || "";
    }

    function fieldWrappers(root) {
      const selectors = ".field,.filter-field,.form-field,[data-filter-field]";
      const explicit = [...root.querySelectorAll(selectors)];
      const topLevel = explicit.filter((field, index, list) =>
        !list.some((other, otherIndex) => otherIndex !== index && other.contains(field))
      );
      if (topLevel.length) return topLevel;

      return [...root.querySelectorAll("select,input")]
        .map(control => control.closest("label,div,section"))
        .filter(Boolean)
        .filter((field, index, list) => list.indexOf(field) === index);
    }

    function headingCandidate() {
      const existing = document.querySelector("[data-forma-extra-toggle]");
      if (existing) return existing;
      return [...document.querySelectorAll("button,h2,h3,h4,strong,div")].find(node => {
        const text = norm(node.textContent).replace(/[+\-]\s*$/, "").trim();
        return text === "дополнительные фильтры";
      }) || null;
    }

    function filterPanelFor(heading) {
      return heading?.closest(".filter-panel,.filters-panel,.catalog-filters,[data-filter-panel]") ||
        heading?.parentElement || null;
    }

    function followsHeading(node, heading) {
      return Boolean(heading.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING);
    }

    function resetControl(panel, heading) {
      return [...panel.querySelectorAll("button,a")].find(node =>
        node !== heading && norm(node.textContent).includes("сбросить все фильтры")
      ) || null;
    }

    function removeObsoleteContent(panel, heading, body) {
      fieldWrappers(panel).forEach(field => {
        if (body.contains(field) || !followsHeading(field, heading)) return;
        const kind = labelKind(field);
        if (!kind) return;
        if (KEEP.includes(kind)) body.appendChild(field);
        else field.remove();
      });

      [...panel.querySelectorAll("p,small,.hint,.note")].forEach(node => {
        if (body.contains(node)) return;
        const text = norm(node.textContent);
        if (text.includes("статуса склада") || text.includes("уточнить наличие")) node.remove();
      });
    }

    function cleanBody(body) {
      fieldWrappers(body).forEach(field => {
        const kind = labelKind(field);
        if (!KEEP.includes(kind)) field.remove();
      });

      const unique = new Set();
      fieldWrappers(body).forEach(field => {
        const kind = labelKind(field);
        if (!kind || unique.has(kind)) field.remove();
        else unique.add(kind);
      });
    }

    function setOpen(toggle, body, open) {
      toggle.setAttribute("aria-expanded", String(open));
      body.hidden = !open;
      const symbol = toggle.querySelector("[data-filter-symbol]");
      if (symbol) symbol.textContent = open ? "−" : "+";
    }

    function replaceHeading(heading) {
      if (heading.matches("button[data-forma-extra-toggle]") && heading.dataset.filterVersion === VERSION) {
        return heading;
      }
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.formaExtraToggle = "true";
      button.dataset.filterVersion = VERSION;
      button.className = heading.className || "";
      button.innerHTML = '<span>Дополнительные фильтры</span><span data-filter-symbol aria-hidden="true">+</span>';
      heading.replaceWith(button);
      return button;
    }

    function setup() {
      scheduled = false;
      ensureStyle();

      let heading = headingCandidate();
      const panel = filterPanelFor(heading);
      if (!heading || !panel) return false;
      heading = replaceHeading(heading);

      let body = panel.querySelector(`:scope > .${BODY_CLASS}`);
      if (!body) {
        body = document.createElement("div");
        body.className = BODY_CLASS;
        body.dataset.filterBodyVersion = VERSION;
        heading.insertAdjacentElement("afterend", body);
      }

      removeObsoleteContent(panel, heading, body);
      cleanBody(body);

      const reset = resetControl(panel, heading);
      if (reset && !body.contains(reset)) body.appendChild(reset);

      if (heading.dataset.compactBound !== VERSION) {
        heading.dataset.compactBound = VERSION;
        heading.addEventListener("click", event => {
          event.preventDefault();
          event.stopPropagation();
          event.stopImmediatePropagation();
          const nextOpen = heading.getAttribute("aria-expanded") !== "true";
          heading.dataset.userOpened = String(nextOpen);
          setOpen(heading, body, nextOpen);
        }, true);
      }

      const hasUserState = heading.dataset.userOpened === "true" || heading.dataset.userOpened === "false";
      const open = hasUserState ? heading.dataset.userOpened === "true" : false;
      setOpen(heading, body, open);

      panel.dataset.compactExtraFilters = VERSION;
      window.__FORMA_EXTRA_FILTERS__ = {
        version: VERSION,
        open,
        fields: fieldWrappers(body).map(labelKind).filter(Boolean)
      };
      return true;
    }

    function schedule() {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(setup);
    }

    new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
    document.addEventListener("DOMContentLoaded", schedule, { once: true });
    window.addEventListener("pageshow", schedule, { passive: true });
    window.addEventListener("forma:catalog-ready", schedule, { passive: true });
    schedule();

    let attempts = 0;
    const poll = setInterval(() => {
      schedule();
      attempts += 1;
      if (attempts >= 40 && document.querySelector("[data-forma-extra-toggle]")) clearInterval(poll);
    }, 250);
  }

  if (document.querySelector(".filter-panel,#grid")) compactFiltersRuntime();

  document.write = function patchedWrite(...parts) {
    let html = parts.join("");
    if (typeof html === "string" && html.includes("</body>")) {
      html = html.replace(/compact-extra-filters\.js\?v=\d+/g, "compact-extra-filters.js?v=6");
      html = html.replace("</body>", `<script>(${compactFiltersRuntime.toString()})();<\/script></body>`);
    }
    return originalWrite(html);
  };
})();
