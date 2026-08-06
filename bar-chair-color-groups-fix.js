(() => {
  "use strict";

  const explicitGroups = [
    {
      name: "Стул барный Вимта/Vimta 4021S",
      primaryId: 133,
      label: "Цвет сиденья",
      variants: [
        { id: 133, label: "Белый, экокожа", css: "#f5f3ed" },
        { id: 134, label: "Бежевый, ткань", css: "#c9b69c" }
      ]
    },
    {
      name: "Стул барный Чилли/Chilly 7095б",
      primaryId: 155,
      label: "Цвет обивки",
      variants: [
        { id: 155, label: "Тёмно-серый бархат", css: "#555753" },
        { id: 156, label: "Коричневый бархат", css: "#76513c" }
      ]
    },
    {
      name: "Стул барный Синди Бар Чаир/Cindy Bar Chair 80-1",
      primaryId: 157,
      label: "Цвет сиденья",
      variants: [
        { id: 157, label: "Чёрный", css: "#171715" },
        { id: 160, label: "Белый", css: "#f5f3ed" }
      ]
    },
    {
      name: "Стул полубарный Чилли/Chilly 7095пб",
      primaryId: 173,
      label: "Цвет обивки",
      variants: [
        { id: 173, label: "Коричневый бархат", css: "#76513c" },
        { id: 174, label: "Бежевый бархат", css: "#c9b69c" }
      ]
    }
  ];

  const targetIds = new Set(
    explicitGroups.flatMap(group => group.variants.map(variant => Number(variant.id)))
  );

  // Эти модели переводятся на явный селектор: автоматический анализ ошибочно
  // выбирал цвет ножек/основания ("хром", "натуральный", "чёрный").
  window.PRODUCT_COLOR_GROUPS = (Array.isArray(window.PRODUCT_COLOR_GROUPS)
    ? window.PRODUCT_COLOR_GROUPS
    : []
  ).filter(group => !(group.ids || []).some(id => targetIds.has(Number(id))));

  const current = Array.isArray(window.PRODUCT_EXPLICIT_VARIANT_GROUPS)
    ? window.PRODUCT_EXPLICIT_VARIANT_GROUPS
    : [];
  const existingIds = new Set(
    current.flatMap(group => (group.variants || []).map(variant => Number(variant.id)))
  );

  for (const group of explicitGroups) {
    if (group.variants.some(variant => existingIds.has(Number(variant.id)))) continue;
    current.push(group);
    group.variants.forEach(variant => existingIds.add(Number(variant.id)));
  }

  window.PRODUCT_EXPLICIT_VARIANT_GROUPS = current;
  window.__FORMA_BAR_CHAIR_COLOR_GROUPS_AUDIT__ = {
    enabled: true,
    version: 1,
    groups: explicitGroups.map(group => ({
      name: group.name,
      primaryId: group.primaryId,
      ids: group.variants.map(variant => variant.id),
      labels: group.variants.map(variant => variant.label)
    })),
    separatesBarAndCounterHeight: true,
    automaticLegColorDetectionDisabled: true
  };
})();
