(() => {
  "use strict";

  const VARIANTS = new Map([
    [1402, { label: "Старт, ткань", css: "#c5b49b" }],
    [1403, { label: "Коричневый, ткань", css: "#76513c" }],
    [1404, { label: "Оранжевый, ткань", css: "#d97a32" }],
    [1405, { label: "Олива, флок", css: "#73764a" }]
  ]);
  const LABEL = "Цвет и материал матраца";
  let scheduled = false;

  function patchSelector(selector) {
    const buttons = [...selector.querySelectorAll("[data-color-product]")];
    if (!buttons.some(button => VARIANTS.has(Number(button.dataset.colorProduct)))) return;

    const label = selector.querySelector(".product-colors-label");
    if (label) label.textContent = LABEL;
    selector.setAttribute("aria-label", LABEL);

    for (const button of buttons) {
      const id = Number(button.dataset.colorProduct);
      const variant = VARIANTS.get(id);
      if (!variant) continue;
      button.style.background = variant.css;
      button.title = variant.label;
      button.setAttribute("aria-label", `${LABEL}: ${variant.label}`);
    }
  }

  function refresh() {
    scheduled = false;
    document.querySelectorAll("[data-color-swatches]").forEach(patchSelector);
    window.__MATTRESS_VARIANT_AUDIT__ = {
      group: "Матрац для кресла Папасан/Papasan (23/01)",
      ids: [...VARIANTS.keys()],
      hiddenExcluded: [1406],
      label: LABEL
    };
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(refresh);
  }

  new MutationObserver(schedule).observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["class", "data-product"]
  });
  window.addEventListener("forma:catalog-ready", schedule);
  window.addEventListener("forma:card-variant-changed", schedule);
  schedule();
})();
