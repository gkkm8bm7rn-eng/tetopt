(() => {
  "use strict";

  const GROUPS = [
    {
      name: "Матрац для кресла Папасан/Papasan (23/01)",
      label: "Цвет и материал матраца",
      hiddenExcluded: [1406],
      variants: new Map([
        [1402, { label: "Старт, ткань", css: "#c5b49b" }],
        [1403, { label: "Коричневый, ткань", css: "#76513c" }],
        [1404, { label: "Оранжевый, ткань", css: "#d97a32" }],
        [1405, { label: "Олива, флок", css: "#73764a" }]
      ])
    },
    {
      name: "Матрац для дивана Мамасан/Mamasan подушка (23/02)",
      label: "Цвет и материал матраца",
      hiddenExcluded: [1408, 1409, 1411],
      variants: new Map([
        [1407, { label: "Оранжевый, ткань", css: "#d97a32" }],
        [1410, { label: "Серо-бежевый, ткань", css: "#a99f91" }]
      ])
    },
    {
      name: "Матрац Виенна/Милано",
      label: "Цвет и материал матраца",
      hiddenExcluded: [1416],
      variants: new Map([
        [1417, { label: "Серо-бежевый, ткань", css: "#a99f91" }],
        [1418, { label: "Меланж, рогожка", css: "linear-gradient(135deg,#81776d 0 50%,#b3a79a 50% 100%)" }]
      ])
    },
    {
      name: "Ремешок мебельный",
      label: "Цвет и материал ремешка",
      hiddenExcluded: [],
      variants: new Map([
        [1422, { label: "Светло-коричневый, натуральная кожа", css: "#a66f43" }],
        [1423, { label: "Тёмно-коричневый, натуральная кожа", css: "#4f3428" }],
        [1424, { label: "Старт, ткань", css: "#c5b49b" }],
        [1425, { label: "Коричневый, экошерсть", css: "linear-gradient(135deg,#6e594b 0 50%,#9a8573 50% 100%)" }],
        [1426, { label: "Олива, флок", css: "#73764a" }],
        [1427, { label: "Оранжевый, ткань", css: "#d97a32" }],
        [1428, { label: "Коричневый, ткань", css: "#76513c" }],
        [1429, { label: "Серо-бежевый, ткань", css: "#a99f91" }],
        [1430, { label: "Меланж, рогожка", css: "linear-gradient(135deg,#81776d 0 50%,#b3a79a 50% 100%)" }]
      ])
    }
  ];
  let scheduled = false;

  function groupForSelector(selector) {
    const ids = [...selector.querySelectorAll("[data-color-product]")]
      .map(button => Number(button.dataset.colorProduct));
    return GROUPS.find(group => ids.some(id => group.variants.has(id))) || null;
  }

  function patchSelector(selector) {
    const group = groupForSelector(selector);
    if (!group) return;

    const label = selector.querySelector(".product-colors-label");
    if (label) label.textContent = group.label;
    selector.setAttribute("aria-label", group.label);

    for (const button of selector.querySelectorAll("[data-color-product]")) {
      const id = Number(button.dataset.colorProduct);
      const variant = group.variants.get(id);
      if (!variant) continue;
      button.style.background = variant.css;
      button.title = variant.label;
      button.setAttribute("aria-label", `${group.label}: ${variant.label}`);
    }
  }

  function refresh() {
    scheduled = false;
    document.querySelectorAll("[data-color-swatches]").forEach(patchSelector);
    const audit = {
      groups: GROUPS.map(group => ({
        name: group.name,
        label: group.label,
        ids: [...group.variants.keys()],
        hiddenExcluded: group.hiddenExcluded
      }))
    };
    window.__SPECIAL_VARIANT_AUDIT__ = audit;
    window.__MATTRESS_VARIANT_AUDIT__ = audit;
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
