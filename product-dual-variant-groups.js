// Двухуровневые варианты: отдельный выбор обивки и основания.
window.PRODUCT_DUAL_VARIANT_GROUPS = [
  {
    name: "Диван Мамасан/Mamasan (23/02 W) с подушкой и ремешками",
    primaryId: 1325,
    labels: {
      cushion: "Цвет подушки",
      base: "Цвет основания (ротанг)"
    },
    cushions: [
      { key: "olive", label: "Олива, флок", css: "#73764a" },
      { key: "orange", label: "Оранжевый, ткань", css: "#d97a32" },
      { key: "brown", label: "Коричневый, ткань", css: "#76513c" },
      { key: "gray-beige", label: "Серо-бежевый, ткань", css: "#a99f91" },
      { key: "melange", label: "Меланж, рогожка", css: "linear-gradient(135deg,#81776d 0 50%,#b3a79a 50% 100%)" }
    ],
    bases: [
      { key: "cognac", label: "Коньячный", css: "#985c32" },
      { key: "antique", label: "Античный чёрно-коричневый", css: "#382923" },
      { key: "honey", label: "Медовый", css: "#c08a3d" },
      { key: "pecan", label: "Пекан-орех", css: "#765438" }
    ],
    variants: [
      { id: 1325, cushion: "olive", base: "cognac" },
      { id: 1330, cushion: "olive", base: "antique" },
      { id: 1333, cushion: "olive", base: "honey" },
      { id: 1336, cushion: "olive", base: "pecan" },

      { id: 1326, cushion: "orange", base: "cognac" },
      { id: 1328, cushion: "orange", base: "antique" },
      { id: 1331, cushion: "orange", base: "honey" },
      { id: 1334, cushion: "orange", base: "pecan" },

      { id: 1327, cushion: "brown", base: "cognac" },
      { id: 1329, cushion: "brown", base: "antique" },
      { id: 1332, cushion: "brown", base: "honey" },
      { id: 1335, cushion: "brown", base: "pecan" },

      { id: 1338, cushion: "gray-beige", base: "cognac" },
      { id: 1337, cushion: "gray-beige", base: "antique" },
      { id: 1339, cushion: "gray-beige", base: "honey" },
      { id: 1340, cushion: "gray-beige", base: "pecan" },

      { id: 1343, cushion: "melange", base: "cognac" },
      { id: 1341, cushion: "melange", base: "antique" },
      { id: 1342, cushion: "melange", base: "honey" },
      { id: 1344, cushion: "melange", base: "pecan" }
    ]
  }
];
