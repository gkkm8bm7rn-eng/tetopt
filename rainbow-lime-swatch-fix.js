(() => {
  "use strict";

  function configureBarChairColorGroups() {
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
  }

  configureBarChairColorGroups();

  function rainbowLimeSwatchRuntime() {
    "use strict";
    if (window.__FORMA_RAINBOW_LIME_SWATCH_V1__) return;
    window.__FORMA_RAINBOW_LIME_SWATCH_V1__ = true;

    const LIME_COLOR = "#cbdc2d";
    let scheduled = false;

    function normalize(value) {
      return String(value || "")
        .toLowerCase()
        .replace(/ё/g, "е")
        .replace(/[^a-zа-я0-9]+/gi, " ")
        .replace(/\s+/g, " ")
        .trim();
    }

    function productByIdSafe(id) {
      const numericId = Number(id);
      if (!Number.isFinite(numericId)) return null;
      try {
        if (typeof productById === "function") return productById(numericId);
      } catch {}
      try {
        if (typeof PRODUCTS !== "undefined" && Array.isArray(PRODUCTS)) {
          return PRODUCTS.find(product => Number(product.id) === numericId) || null;
        }
      } catch {}
      return Array.isArray(window.PRODUCTS)
        ? window.PRODUCTS.find(product => Number(product.id) === numericId) || null
        : null;
    }

    function isRainbowLime(product) {
      if (!product) return false;
      const name = normalize(product.name);
      const specs = normalize(product.specs);
      const isRainbow = name.includes("рейнбоу") || name.includes("rainbow");
      const isLime = specs.includes("салатов") || specs.includes("lime") || specs.includes("лайм") || specs.includes("green");
      const isGrey = specs.includes("серый") || specs.includes("grey") || specs.includes("gray");
      return isRainbow && isLime && !isGrey;
    }

    function apply() {
      scheduled = false;
      let corrected = 0;

      document.querySelectorAll(".color-swatch[data-color-product]").forEach(button => {
        const product = productByIdSafe(button.dataset.colorProduct);
        if (!isRainbowLime(product)) return;

        button.style.setProperty("background", LIME_COLOR, "important");
        button.title = "Салатовый";
        button.setAttribute("aria-label", "Выбрать цвет: салатовый");
        button.dataset.formaColorCorrected = "rainbow-lime";
        corrected += 1;
      });

      window.__FORMA_RAINBOW_LIME_SWATCH_AUDIT__ = {
        enabled: true,
        version: 1,
        color: LIME_COLOR,
        corrected
      };
    }

    function schedule() {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(apply);
    }

    new MutationObserver(schedule).observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "data-product", "data-color-swatches"]
    });

    window.addEventListener("forma:catalog-ready", schedule, { passive: true });
    window.addEventListener("forma:card-variant-changed", schedule, { passive: true });
    window.addEventListener("pageshow", schedule, { passive: true });
    document.addEventListener("DOMContentLoaded", schedule, { once: true });
    schedule();
  }

  if (document.querySelector(".color-swatch,[data-product]")) rainbowLimeSwatchRuntime();

  const originalWrite = document.write.bind(document);
  document.write = function patchedWrite(...parts) {
    let html = parts.join("");
    if (typeof html === "string" && html.includes("</body>")) {
      html = html.replace("</body>", `<script>(${rainbowLimeSwatchRuntime.toString()})();<\/script></body>`);
    }
    return originalWrite(html);
  };
})();
