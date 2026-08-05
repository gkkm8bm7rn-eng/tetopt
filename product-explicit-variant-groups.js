// Очевидные варианты, которым нужны явные подписи и цвета вместо автоматического распознавания.
(() => {
  "use strict";

  const groups = [
    {
      name: "Модуль мягкий Миракл/Miracle",
      primaryId: 1508,
      label: "Цвет и материал обивки",
      variants: [
        { id: 1508, label: "Бежевый, искусственный мех", css: "#c9b69c" },
        { id: 1509, label: "Серый, искусственный мех", css: "#8d8f8c" },
        { id: 1510, label: "Серый, велюр/букле", css: "linear-gradient(135deg,#777a77 0 50%,#b0aaa1 50% 100%)" }
      ]
    },
    {
      name: "Модуль мягкий прямой Миракл/Miracle",
      primaryId: 1511,
      label: "Цвет и материал обивки",
      variants: [
        { id: 1511, label: "Серый, велюр/букле", css: "linear-gradient(135deg,#777a77 0 50%,#b0aaa1 50% 100%)" },
        { id: 1512, label: "Бежевый, искусственный мех", css: "#c9b69c" },
        { id: 1513, label: "Серый, искусственный мех", css: "#8d8f8c" }
      ]
    },
    {
      name: "Модуль мягкий угловой Миракл/Miracle",
      primaryId: 1514,
      label: "Цвет и материал обивки",
      variants: [
        { id: 1514, label: "Бежевый, искусственный мех", css: "#c9b69c" },
        { id: 1515, label: "Серый, искусственный мех", css: "#8d8f8c" },
        { id: 1516, label: "Серый, велюр/букле", css: "linear-gradient(135deg,#777a77 0 50%,#b0aaa1 50% 100%)" }
      ]
    },
    {
      name: "Ложка для обуви Дракон1/Dragon1",
      primaryId: 1532,
      label: "Цвет металла",
      variants: [
        { id: 1532, label: "Серебряный", css: "#b9bab7" },
        { id: 1533, label: "Античная латунь", css: "#9a7742" }
      ]
    },
    {
      name: "Поднос Мапле2/Maple2",
      primaryId: 1546,
      label: "Цвет металла",
      variants: [
        { id: 1546, label: "Серебряный", css: "#b9bab7" },
        { id: 1547, label: "Золотой", css: "#c6a052" }
      ]
    },
    {
      name: "Стакан Лионалс/Lyonnals",
      primaryId: 1582,
      label: "Цвет стекла",
      variants: [
        { id: 1582, label: "Прозрачный", css: "linear-gradient(135deg,#ffffff 0 45%,#dbe7eb 45% 55%,#ffffff 55% 100%)" },
        { id: 1583, label: "Аметист", css: "#76517f" }
      ]
    },
    {
      name: "Модуль мягкий Личи/Lici",
      primaryId: 1586,
      label: "Цвет и ткань обивки",
      variants: [
        { id: 1586, label: "Оливковый/пудровый", css: "linear-gradient(135deg,#73764a 0 50%,#cfaaa5 50% 100%)" },
        { id: 1587, label: "Гризайль", css: "linear-gradient(135deg,#696a68 0 50%,#b6b4af 50% 100%)" },
        { id: 1588, label: "Минерал шелл", css: "#b7afa5" },
        { id: 1589, label: "Мунстоун", css: "#a8abb0" }
      ]
    },
    {
      name: "Модуль мягкий прямой Личи/Lici",
      primaryId: 1591,
      label: "Коллекция и цвет ткани",
      variants: [
        { id: 1591, label: "Скандинавия Марис 9", css: "#687b7d" },
        { id: 1592, label: "Скандинавия Марис 5", css: "#a69d8e" },
        { id: 1593, label: "Смальта 2", css: "#5f7f89" },
        { id: 1594, label: "Смальта 4", css: "#887b71" },
        { id: 1595, label: "Бокс 02", css: "#77726c" }
      ]
    },
    {
      name: "Модуль мягкий угловой Личи/Lici",
      primaryId: 1596,
      label: "Коллекция и цвет ткани",
      variants: [
        { id: 1596, label: "Скандинавия Марис 9", css: "#687b7d" },
        { id: 1597, label: "Скандинавия Марис 5", css: "#a69d8e" },
        { id: 1598, label: "Смальта 2", css: "#5f7f89" },
        { id: 1599, label: "Смальта 4", css: "#887b71" },
        { id: 1600, label: "Бокс 02", css: "#77726c" }
      ]
    }
  ];

  window.PRODUCT_EXPLICIT_VARIANT_GROUPS = groups;

  // Резервируем ID от автоматической группировки. Одноэлементные записи не создают
  // обычные цветовые кружки, но не дают автоматике смешать эти карточки повторно.
  const current = Array.isArray(window.PRODUCT_COLOR_GROUPS)
    ? window.PRODUCT_COLOR_GROUPS
    : [];
  const reserved = new Set(
    current.flatMap(group => group.ids || []).map(Number).filter(Number.isFinite)
  );

  for (const group of groups) {
    for (const variant of group.variants || []) {
      const id = Number(variant.id);
      if (!Number.isFinite(id) || reserved.has(id)) continue;
      current.push({ name: `${group.name} — резерв явного варианта ${id}`, ids: [id] });
      reserved.add(id);
    }
  }

  window.PRODUCT_COLOR_GROUPS = current;
  window.__EXPLICIT_VARIANT_CONFIG_AUDIT__ = {
    groups: groups.map(group => ({
      name: group.name,
      primaryId: Number(group.primaryId),
      ids: group.variants.map(variant => Number(variant.id))
    })),
    visibleOnly: true,
    reservedIds: groups.flatMap(group => group.variants.map(variant => Number(variant.id)))
  };
})();
