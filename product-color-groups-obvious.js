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
    { name: "Ремешок мебельный — цвет и материал", ids: [1422, 1423, 1424, 1425, 1426, 1427, 1428, 1429, 1430] },
    { name: "Лаундж сет 210013 А — цвет ротанга и ткани", ids: [1442, 1443] },
    { name: "Комплект Амальфи/Amalfi — цвет металла", ids: [1444, 1445] },
    { name: "Стол Ромео/Romeo — цвет металла и рисунок плитки", ids: [1450, 1451, 1452] },
    { name: "Стул Виченза/Vicenza PL08-7451RV — цвет металла", ids: [1459, 1460] },
    { name: "Стул Вилла/Villa — цвет металла", ids: [1467, 1468, 1469] },
    { name: "Этажерка Шарлотта/Charlotte — цвет металла", ids: [1470, 1471] },
    { name: "Этажерка Эмма/Emma — цвет металла", ids: [1474, 1475] },
    { name: "Этажерка угловая Селин/Celine — цвет металла", ids: [1476, 1477] },
    { name: "Комплект Романс/Romance — цвет металла", ids: [1479, 1480, 1481] },
    { name: "Комплект Вальс Цветов/Waltz of Flowers — цвет металла", ids: [1482, 1483] },
    { name: "Скамья Штраус/Strauss — цвет металла", ids: [1484, 1485, 1486] },
    { name: "Скамья Симфония/Symphonie — цвет металла", ids: [1487, 1488, 1489] },
    { name: "Стул Моцарт/Mozart — цвет металла", ids: [1490, 1491, 1492] }
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

  // Kavanto подтверждён как точный дубль. Одноэлементные записи резервируют оба ID
  // от автоматической цветовой группировки, но сами не создают переключатели.
  const reservedKavantoIds = [1436, 1437];
  for (const id of reservedKavantoIds) {
    const alreadyReserved = current.some(group =>
      (group.ids || []).map(Number).includes(id)
    );
    if (!alreadyReserved) {
      current.push({ name: `Кресло Каванто/Kavanto — резерв дубля ${id}`, ids: [id] });
    }
  }

  const duplicateGroups = Array.isArray(window.PRODUCT_DUPLICATE_GROUPS)
    ? window.PRODUCT_DUPLICATE_GROUPS
    : [];
  const kavantoDuplicateKey = [1436, 1437].sort((a, b) => a - b).join(",");
  const duplicateExists = duplicateGroups.some(group =>
    [...new Set((group.ids || []).map(Number).filter(Number.isFinite))]
      .sort((a, b) => a - b)
      .join(",") === kavantoDuplicateKey
  );
  if (!duplicateExists) {
    // Первым указан вариант с более полным описанием; он остаётся видимой карточкой.
    duplicateGroups.push({
      name: "Кресло Каванто/Kavanto — точный дубль",
      ids: [1437, 1436]
    });
  }

  window.PRODUCT_COLOR_GROUPS = current;
  window.PRODUCT_DUPLICATE_GROUPS = duplicateGroups;
  window.__OBVIOUS_PRODUCT_GROUP_AUDIT__ = {
    rule: "same purpose and construction; visible variants only; color/material/finish differs; selected variant may change price",
    groupsAdded: additions.length,
    ids: additions.flatMap(group => group.ids),
    duplicateGroupsAdded: duplicateExists ? 0 : 1,
    duplicatePrimaryIds: [1437],
    duplicateHiddenIds: [1436]
  };
})();
