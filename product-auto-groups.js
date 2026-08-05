// Автоматическая группировка непроверенных карточек по названию товара.
// Упаковка не создаёт новую модель; разные цвета остаются вариантами;
// среди точных дублей одного цвета остаётся карточка с минимальной оптовой ценой.
(() => {
  "use strict";
  const originalWrite = document.write.bind(document);

  function runtime() {
    "use strict";
    const normalize = value => String(value || "")
      .toLowerCase()
      .replace(/ё/g, "е")
      .replace(/[‐‑‒–—−]/g, "-")
      .replace(/\s+/g, " ")
      .trim();

    const baseName = value => normalize(value)
      .replace(/\s*\/\s*\d+\s*шт\.?\s*в\s*упаковке\s*$/i, "")
      .replace(/\s*\(\s*\d+\s*шт\.?\s*в\s*упаковке\s*\)\s*$/i, "")
      .replace(/\s*\/\s*\d+\s*шт\.?\s*в\s*уп\.?\s*$/i, "")
      .replace(/\s*\(\s*\d+\s*шт\.?\s*в\s*уп\.?\s*\)\s*$/i, "")
      .replace(/\s+/g, " ")
      .trim();

    const specsSignature = value => normalize(value)
      .replace(/[×x]/g, "х")
      .replace(/\s+/g, "")
      .trim();

    const products = (() => {
      try {
        if (typeof PRODUCTS !== "undefined" && Array.isArray(PRODUCTS)) return PRODUCTS;
      } catch {}
      return Array.isArray(window.PRODUCTS) ? window.PRODUCTS : [];
    })();
    if (!products.length) return;

    // Вручную подтверждённые пользователем группы из прайса от 24.07.2026.
    // В группы включаются только нескрытые карточки. Скрытый реестр не изменяется.
    // Конструктивно разные модели остаются отдельными группами.
    const confirmedColorGroups = [
      { name: "Кресло Итон/Eton хром 5Д", ids: [999, 1000, 1001] },
      { name: "Кресло Итон-Лоу/Eton-Low хром 3Д", ids: [1002, 1003, 1004] },
      { name: "Кресло Гарда/Garda", ids: [1011, 1012, 1013] },
      { name: "Кресло Интер/Inter (24)", ids: [1014, 1015, 1016] },
      { name: "Кресло Лидер/Leader (22)", ids: [1017, 1018, 1019] },
      { name: "Кресло Луц/Lutz хром", ids: [1023, 1024, 1025] },
      { name: "Кресло Линкольн Металбл/Lincoln Metalbl", ids: [1020, 1021, 1022] },
      { name: "Кресло Мурано/Murano хром", ids: [1037, 1038] },
      { name: "Кресло Ореон Металбл/Oreon Metalbl", ids: [1039, 1040] },
      { name: "Кресло Оксфорд/Oxford хром", ids: [1041, 1042] },
      { name: "Кресло Пилот/Pilot (24)", ids: [1047, 1048] },
      { name: "Кресло Рейсер Гт Нью/Racer Gt New", ids: [1052, 1053] },
      { name: "Кресло Рио Пл/Rio Pl", ids: [1054, 1055] },
      { name: "Кресло Селфи/Selfi", ids: [1056, 1057, 1058] },
      { name: "Кресло Софти Люкс/Softy Lux", ids: [1060, 1061, 1062, 1063, 1064, 1065, 1066, 1067, 1068, 1069] },
      { name: "Кресло Стайл/Style — только нескрытые варианты", ids: [1071, 1072, 1073, 1075, 1076, 1077] },
      { name: "Кресло Сван/Swan — только нескрытые варианты", ids: [1078, 1080, 1081, 1082, 1083] },
      { name: "Кресло Тренди/Trendy (22)", ids: [1084, 1085, 1086, 1087, 1088, 1089, 1090, 1091] }
    ];
    const currentManualGroups = Array.isArray(window.PRODUCT_COLOR_GROUPS)
      ? window.PRODUCT_COLOR_GROUPS
      : [];
    const currentManualKeys = new Set(currentManualGroups.map(group =>
      [...new Set((group.ids || []).map(Number).filter(Number.isFinite))]
        .sort((a, b) => a - b)
        .join(",")
    ));
    window.PRODUCT_COLOR_GROUPS = [
      ...currentManualGroups,
      ...confirmedColorGroups.filter(group => {
        const key = [...group.ids].sort((a, b) => a - b).join(",");
        return !currentManualKeys.has(key);
      })
    ];

    const idOf = (product, index) => Number(product.id) || index + 1;
    const dualVariantIds = (window.PRODUCT_DUAL_VARIANT_GROUPS || []).flatMap(group => [
      ...(group.ids || []),
      ...(group.variants || []).map(variant => variant.id)
    ]);
    const manualColorIds = new Set([
      ...(window.PRODUCT_COLOR_GROUPS || []).flatMap(group => group.ids || []),
      ...dualVariantIds
    ].map(Number));
    const manualDuplicateIds = new Set(
      (window.PRODUCT_DUPLICATE_GROUPS || []).flatMap(group => group.ids || []).map(Number)
    );

    const buckets = new Map();
    products.forEach((product, index) => {
      const id = idOf(product, index);
      const key = baseName(product.name);
      if (!key) return;
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push({ product, id });
    });

    const autoColors = [];
    const autoDuplicates = [];

    for (const [name, items] of buckets.entries()) {
      if (items.length < 2) continue;

      const bySpecs = new Map();
      for (const item of items) {
        const signature = specsSignature(item.product.specs);
        if (!bySpecs.has(signature)) bySpecs.set(signature, []);
        bySpecs.get(signature).push(item);
      }

      const kept = [];
      for (const same of bySpecs.values()) {
        same.sort((a, b) =>
          (Number(a.product.wholesalePrice) || Infinity) -
          (Number(b.product.wholesalePrice) || Infinity) ||
          a.id - b.id
        );

        kept.push(same[0]);
        const candidates = same.filter(item => !manualDuplicateIds.has(item.id));
        if (candidates.length > 1) {
          autoDuplicates.push({
            name,
            ids: candidates.map(item => item.id)
          });
        }
      }

      kept.sort((a, b) => a.id - b.id);
      if (kept.length > 1 && !items.some(item => manualColorIds.has(item.id))) {
        autoColors.push({
          name,
          ids: kept.map(item => item.id)
        });
      }
    }

    const merge = (current, additions) => {
      const result = Array.isArray(current) ? [...current] : [];
      const seen = new Set(
        result.map(group => [...new Set((group.ids || []).map(Number))]
          .sort((a, b) => a - b)
          .join(","))
      );

      for (const group of additions) {
        const ids = [...new Set(group.ids.map(Number).filter(Number.isFinite))];
        const key = [...ids].sort((a, b) => a - b).join(",");
        if (ids.length < 2 || seen.has(key)) continue;
        seen.add(key);
        result.push({ name: group.name, ids });
      }
      return result;
    };

    window.PRODUCT_COLOR_GROUPS = merge(window.PRODUCT_COLOR_GROUPS, autoColors);
    window.PRODUCT_DUPLICATE_GROUPS = merge(window.PRODUCT_DUPLICATE_GROUPS, autoDuplicates);
    window.__AUTO_PRODUCT_GROUP_AUDIT__ = {
      rule: "normalized product name; package ignored; colors merged; cheapest exact duplicate kept",
      confirmedGroupsAdded: confirmedColorGroups.filter(group => {
        const key = [...group.ids].sort((a, b) => a - b).join(",");
        return !currentManualKeys.has(key);
      }).length,
      visibleOnlyConfirmedGroups: true,
      dualVariantGroupsReserved: (window.PRODUCT_DUAL_VARIANT_GROUPS || []).length,
      colorGroupsAdded: autoColors.length,
      duplicateGroupsAdded: autoDuplicates.length,
      duplicateCardsHidden: autoDuplicates.reduce((sum, group) => sum + group.ids.length - 1, 0)
    };
  }

  document.write = function patchedWrite(...parts) {
    let html = parts.join("");
    if (typeof html === "string" && html.includes("</body>")) {
      html = html.replace("</body>", `<script>(${runtime.toString()})();<\/script></body>`);
    }
    return originalWrite(html);
  };
})();
