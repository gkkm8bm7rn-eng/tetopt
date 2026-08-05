(() => {
  "use strict";

  const makeGroup = (name, label, variants, hiddenExcluded = []) => ({
    name,
    label,
    hiddenExcluded,
    variants: new Map(variants)
  });

  const GROUPS = [
    makeGroup(
      "Матрац для кресла Папасан/Papasan (23/01)",
      "Цвет и материал матраца",
      [
        [1402, { label: "Старт, ткань", css: "#c5b49b" }],
        [1403, { label: "Коричневый, ткань", css: "#76513c" }],
        [1404, { label: "Оранжевый, ткань", css: "#d97a32" }],
        [1405, { label: "Олива, флок", css: "#73764a" }]
      ],
      [1406]
    ),
    makeGroup(
      "Матрац для дивана Мамасан/Mamasan подушка (23/02)",
      "Цвет и материал матраца",
      [
        [1407, { label: "Оранжевый, ткань", css: "#d97a32" }],
        [1410, { label: "Серо-бежевый, ткань", css: "#a99f91" }]
      ],
      [1408, 1409, 1411]
    ),
    makeGroup(
      "Матрац Виенна/Милано",
      "Цвет и материал матраца",
      [
        [1417, { label: "Серо-бежевый, ткань", css: "#a99f91" }],
        [1418, { label: "Меланж, рогожка", css: "linear-gradient(135deg,#81776d 0 50%,#b3a79a 50% 100%)" }]
      ],
      [1416]
    ),
    makeGroup(
      "Ремешок мебельный",
      "Цвет и материал ремешка",
      [
        [1422, { label: "Светло-коричневый, натуральная кожа", css: "#a66f43" }],
        [1423, { label: "Тёмно-коричневый, натуральная кожа", css: "#4f3428" }],
        [1424, { label: "Старт, ткань", css: "#c5b49b" }],
        [1425, { label: "Коричневый, экошерсть", css: "linear-gradient(135deg,#6e594b 0 50%,#9a8573 50% 100%)" }],
        [1426, { label: "Олива, флок", css: "#73764a" }],
        [1427, { label: "Оранжевый, ткань", css: "#d97a32" }],
        [1428, { label: "Коричневый, ткань", css: "#76513c" }],
        [1429, { label: "Серо-бежевый, ткань", css: "#a99f91" }],
        [1430, { label: "Меланж, рогожка", css: "linear-gradient(135deg,#81776d 0 50%,#b3a79a 50% 100%)" }]
      ]
    ),
    makeGroup(
      "Лаундж сет 210013 А",
      "Цвет ротанга и ткани",
      [
        [1442, { label: "Тёмно-коричневый ротанг, серая ткань", css: "linear-gradient(135deg,#4f3428 0 50%,#8d8f8c 50% 100%)" }],
        [1443, { label: "Серый ротанг, светло-серая ткань", css: "linear-gradient(135deg,#8d8f8c 0 50%,#c9c9c5 50% 100%)" }]
      ]
    ),
    makeGroup(
      "Комплект Амальфи/Amalfi",
      "Цвет металла",
      [
        [1444, { label: "Античный белый", css: "#eee9dc" }],
        [1445, { label: "Чёрный", css: "#171715" }]
      ]
    ),
    makeGroup(
      "Стол Ромео/Romeo",
      "Цвет металла и рисунок плитки",
      [
        [1450, { label: "Чёрный металл, плитка «Астра»", css: "linear-gradient(135deg,#171715 0 45%,#c6a979 45% 68%,#6e5643 68% 100%)" }],
        [1451, { label: "Чёрный металл, плитка «Калейдоскоп»", css: "conic-gradient(#171715 0 25%,#b98f5f 25% 50%,#6f2638 50% 75%,#355d88 75% 100%)" }],
        [1452, { label: "Белый металл, плитка «Калейдоскоп»", css: "conic-gradient(#eee9dc 0 25%,#b98f5f 25% 50%,#6f2638 50% 75%,#355d88 75% 100%)" }]
      ]
    ),
    makeGroup(
      "Стул Виченза/Vicenza PL08-7451RV",
      "Цвет металла и рисунок плитки",
      [
        [1459, { label: "Чёрный металл, плитка «Калейдоскоп»", css: "conic-gradient(#171715 0 25%,#b98f5f 25% 50%,#6f2638 50% 75%,#355d88 75% 100%)" }],
        [1460, { label: "Белый металл, плитка «Калейдоскоп»", css: "conic-gradient(#eee9dc 0 25%,#b98f5f 25% 50%,#6f2638 50% 75%,#355d88 75% 100%)" }]
      ]
    ),
    makeGroup(
      "Стул Вилла/Villa",
      "Цвет металла",
      [
        [1467, { label: "Зелёный", css: "#587454" }],
        [1468, { label: "Античный белый", css: "#eee9dc" }],
        [1469, { label: "Чёрный", css: "#171715" }]
      ]
    ),
    makeGroup(
      "Этажерка Шарлотта/Charlotte",
      "Цвет металла",
      [
        [1470, { label: "Античный белый", css: "#eee9dc" }],
        [1471, { label: "Чёрный", css: "#171715" }]
      ]
    ),
    makeGroup(
      "Этажерка Эмма/Emma",
      "Цвет металла",
      [
        [1474, { label: "Античный белый", css: "#eee9dc" }],
        [1475, { label: "Чёрный", css: "#171715" }]
      ]
    ),
    makeGroup(
      "Этажерка угловая Селин/Celine",
      "Цвет металла",
      [
        [1476, { label: "Античный белый", css: "#eee9dc" }],
        [1477, { label: "Чёрный", css: "#171715" }]
      ]
    ),
    makeGroup(
      "Комплект Романс/Romance",
      "Цвет металла",
      [
        [1479, { label: "Чёрный", css: "#171715" }],
        [1480, { label: "Античный белый", css: "#eee9dc" }],
        [1481, { label: "Бронзовый", css: "#927044" }]
      ]
    ),
    makeGroup(
      "Комплект Вальс Цветов/Waltz of Flowers",
      "Цвет металла",
      [
        [1482, { label: "Бронзовый", css: "#927044" }],
        [1483, { label: "Античный белый", css: "#eee9dc" }]
      ]
    ),
    makeGroup(
      "Скамья Штраус/Strauss",
      "Цвет металла",
      [
        [1484, { label: "Чёрный", css: "#171715" }],
        [1485, { label: "Античный белый", css: "#eee9dc" }],
        [1486, { label: "Бронзовый", css: "#927044" }]
      ]
    ),
    makeGroup(
      "Скамья Симфония/Symphonie",
      "Цвет металла",
      [
        [1487, { label: "Чёрный", css: "#171715" }],
        [1488, { label: "Античный белый", css: "#eee9dc" }],
        [1489, { label: "Бронзовый", css: "#927044" }]
      ]
    ),
    makeGroup(
      "Стул Моцарт/Mozart",
      "Цвет металла",
      [
        [1490, { label: "Чёрный", css: "#171715" }],
        [1491, { label: "Античный белый", css: "#eee9dc" }],
        [1492, { label: "Бронзовый", css: "#927044" }]
      ]
    )
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
