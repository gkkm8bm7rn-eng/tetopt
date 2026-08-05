// Автономно подтверждённые очевидные варианты: одна модель и конструкция, различается цвет/материал.
(() => {
  "use strict";

  const additions = [
    { name: "Барный столик Андреа/Andrea", ids: [1291, 1292] },
    { name: "Комплект для отдыха Андреа/Andrea", ids: [1294, 1295] },
    { name: "Комплект обеденный Андреа Гранд/Andrea Grand", ids: [1296, 1297] },
    { name: "Комплект обеденный Андреа/Andrea", ids: [1298, 1299] },
    { name: "Комплект террасный Андреа/Andrea", ids: [1300, 1301] },
    { name: "Кресло-качалка Андреа Релакс Медиум/Andrea Relax Medium", ids: [1302, 1303] },
    { name: "Столик кофейный Андреа/Andrea", ids: [1304, 1305] },
    { name: "Комплект Пеланги/Pelangi 02/15", ids: [1306, 1307] },
    { name: "Кресло Пеланги/Pelangi 02/15B", ids: [1309, 1310] },
    { name: "Комплект террасный Пеланги/Pelangi", ids: [1311, 1312] },
    { name: "Комплект Нью Богота/New Bogota", ids: [1313, 1314] },
    { name: "Комплект террасный Нью Богота/New Bogota", ids: [1315, 1316] },
    { name: "Диван Мамасан/Mamasan 23/02 W без подушки", ids: [1317, 1318, 1319, 1320] },
    { name: "Кресло Папасан/Papasan 23/01 W без подушки — только нескрытые варианты", ids: [1365, 1366, 1367] },
    { name: "Кресло-качалка Милано/Milano без подушки", ids: [1370, 1371] },
    { name: "Кресло-качалка Папасан/Papasan W 23/01 B без подушки", ids: [1372, 1373, 1374, 1375] },
    { name: "Кресло-качалка Виенна/Vienna без подушки", ids: [1396, 1397] },
    { name: "Матрац для кресла Папасан/Papasan 23/01 — цвет и материал", ids: [1402, 1403, 1404, 1405] },
    { name: "Матрац для дивана Мамасан/Mamasan 23/02 — только нескрытые варианты", ids: [1407, 1410] },
    { name: "Матрац Виенна/Милано — только нескрытые варианты", ids: [1417, 1418] },
    { name: "Ремешок мебельный — цвет и материал", ids: [1422, 1423, 1424, 1425, 1426, 1427, 1428, 1429, 1430] }
  ];

  const current = Array.isArray(window.PRODUCT_COLOR_GROUPS)
    ? window.PRODUCT_COLOR_GROUPS
    : [];
  const seen = new Set(current.map(group =>
    [...new Set((group.ids || []).map(Number).filter(Number.isFinite))]
      .sort((a, b) => a - b)
      .join(",")
  ));

  for (const group of additions) {
    const ids = [...new Set(group.ids.map(Number).filter(Number.isFinite))];
    const key = [...ids].sort((a, b) => a - b).join(",");
    if (ids.length < 2 || seen.has(key)) continue;
    current.push({ name: group.name, ids });
    seen.add(key);
  }

  window.PRODUCT_COLOR_GROUPS = current;
  window.__OBVIOUS_PRODUCT_GROUP_AUDIT__ = {
    rule: "same purpose and construction; visible variants only; color/material differs; selected variant may change price",
    groupsAdded: additions.length,
    ids: additions.flatMap(group => group.ids)
  };
})();
