(() => {
  "use strict";

  const originalWrite = document.write.bind(document);

  function colorSwatchesRuntime() {
    "use strict";

    const COLORS = [
      ["светло-серый", "#c9c9c5"], ["светло серый", "#c9c9c5"],
      ["темно-серый", "#555753"], ["тёмно-серый", "#555753"], ["темно серый", "#555753"], ["тёмно серый", "#555753"],
      ["серо-бежевый", "#a99f91"], ["серо бежевый", "#a99f91"], ["пыльно-розовый", "#c99b9c"], ["пыльно розовый", "#c99b9c"],
      ["темно-синий", "#23344d"], ["тёмно-синий", "#23344d"], ["темно-зеленый", "#284c3b"], ["тёмно-зелёный", "#284c3b"],
      ["горчичный", "#b8872f"], ["терракотовый", "#a75735"], ["бордовый", "#6f2638"], ["антрацит", "#343735"],
      ["графит", "#4b4d4b"], ["серый", "#8d8f8c"], ["черный", "#171715"], ["чёрный", "#171715"], ["белый", "#f5f3ed"],
      ["молочный", "#eee5d5"], ["кремовый", "#e8dcc5"], ["бежевый", "#c9b69c"], ["песочный", "#c5a979"],
      ["коричневый", "#76513c"], ["коньячный", "#985c32"], ["желтый", "#d5b23b"], ["жёлтый", "#d5b23b"],
      ["оранжевый", "#d97a32"], ["красный", "#b63d38"], ["розовый", "#d5a0aa"], ["пудровый", "#cfaaa5"],
      ["фиолетовый", "#70517d"], ["сиреневый", "#9b83aa"], ["синий", "#355d88"], ["голубой", "#78a9c4"],
      ["бирюзовый", "#3e9694"], ["зеленый", "#587454"], ["зелёный", "#587454"], ["оливковый", "#73764a"],
      ["хаки", "#77745a"], ["мятный", "#91b6a3"], ["натуральный", "#c7a978"], ["дуб", "#b98f5f"],
      ["орех", "#765438"], ["венге", "#3d2b24"], ["золотой", "#c6a052"], ["золото", "#c6a052"],
      ["серебро", "#b9bab7"], ["серебристый", "#b9bab7"], ["хром", "#c8c9c7"]
    ];

    const COLOR_WORDS = [...new Set(COLORS.map(([name]) => normalize(name)))].sort((a, b) => b.length - a.length);
    let scheduled = false;

    function normalize(value) {
      return String(value || "").toLowerCase().replace(/ё/g, "е").replace(/[^a-zа-я0-9]+/gi, " ").trim().replace(/\s+/g, " ");
    }

    function removeColors(value) {
      let text = ` ${normalize(value)} `;
      for (const color of COLOR_WORDS) text = text.replace(new RegExp(`\\s${color.replace(/\s+/g, "\\s+")}\\s`, "g"), " ");
      return text.replace(/\s+/g, " ").trim();
    }

    function exactArticle(product) {
      const direct = [product?.article, product?.sku, product?.vendorCode, product?.articleNumber, product?.productCode, product?.code]
        .find(value => String(value || "").trim());
      if (direct) return normalize(direct);
      const text = `${product?.name || ""} ${product?.specs || ""}`;
      const match = text.match(/(?:артикул|арт\.?|sku|код товара)\s*[:№#-]?\s*([a-zа-я0-9][a-zа-я0-9._\/-]{2,})/i);
      return match ? normalize(match[1]) : "";
    }

    function explicitFamilyArticle(product) {
      const value = [product?.baseArticle, product?.base_article, product?.modelArticle, product?.model_article, product?.parentArticle, product?.parent_article]
        .find(item => String(item || "").trim());
      return value ? normalize(value) : "";
    }

    function modelFingerprint(product) {
      return removeColors(product?.name)
        .replace(/\b(?:цвет|цвета|обивка|ткань)\b/g, " ")
        .replace(/\s+/g, " ").trim();
    }

    function constructionSignature(product) {
      const text = normalize(`${product?.name || ""} ${product?.specs || ""}`);
      const flags = [
        /(?:опора 360|360 градусов|поворотн|вращающ)/.test(text) ? "swivel" : "fixed",
        /колес|ролик/.test(text) ? "wheels" : "no-wheels",
        /подлокот/.test(text) ? "armrests" : "no-armrests",
        /подголов/.test(text) ? "headrest" : "no-headrest",
        /механизм качан|топ ган|top gun|мультиблок|синхромеханизм/.test(text) ? "mechanism" : "no-mechanism",
        /хром/.test(text) ? "chrome-base" : /дерев|массив|бук|дуб/.test(text) && /(?:нож|опор|основан)/.test(text) ? "wood-base" : /металл/.test(text) && /(?:нож|опор|основан)/.test(text) ? "metal-base" : "base-material-unspecified",
        /черн(?:ая|ые|ый).*?(?:опор|нож|основан)|(?:опор|нож|основан).*?черн/.test(text) ? "black-base" : /бел(?:ая|ые|ый).*?(?:опор|нож|основан)|(?:опор|нож|основан).*?бел/.test(text) ? "white-base" : "base-color-unspecified"
      ];
      const pack = text.match(/(\d+)\s*шт\.?\s*в\s*упаковк/);
      flags.push(pack ? `pack-${pack[1]}` : "pack-unspecified");
      const dimensions = [...text.matchAll(/(?:^|\s)(\d{2,4})\s*[xх×]\s*(\d{2,4})(?:\s*[xх×]\s*(\d{2,4}))?/g)]
        .map(match => match.slice(1).filter(Boolean).join("x")).sort().join(",");
      flags.push(dimensions ? `dims-${dimensions}` : "dims-unspecified");
      return flags.join("|");
    }

    function priceFor(product) {
      const raw = product?.price ?? product?.wholesalePrice ?? product?.wholesale_price;
      const value = Number(String(raw ?? "").replace(/[^0-9.,]/g, "").replace(",", "."));
      return Number.isFinite(value) && value > 0 ? value : 0;
    }

    function familyKey(product) {
      const family = explicitFamilyArticle(product);
      const article = exactArticle(product);
      const identity = family || article;
      if (!identity) return "";
      return [
        identity,
        normalize(product?.category),
        normalize(product?.collection),
        modelFingerprint(product),
        constructionSignature(product)
      ].join("|");
    }

    function colorFor(product) {
      const sources = [product?.specs, product?.name].map(normalize);
      for (const source of sources) {
        for (const [label, css] of COLORS) if (source.includes(normalize(label))) return { label, css };
      }
      return null;
    }

    function productsList() {
      if (Array.isArray(window.PRODUCTS)) return window.PRODUCTS;
      try { if (typeof PRODUCTS !== "undefined" && Array.isArray(PRODUCTS)) return PRODUCTS; } catch {}
      return [];
    }

    function auditGroups() {
      const candidates = new Map();
      const blocked = [];
      const accepted = [];

      for (const product of productsList()) {
        const color = colorFor(product);
        const key = familyKey(product);
        if (!color || !key) continue;
        if (!candidates.has(key)) candidates.set(key, []);
        candidates.get(key).push({ product, color });
      }

      const safe = new Map();
      for (const [key, variants] of candidates) {
        const unique = [...new Map(variants.map(item => [normalize(item.color.label), item])).values()];
        if (unique.length < 2) continue;

        const reasons = [];
        const articles = new Set(unique.map(item => exactArticle(item.product)).filter(Boolean));
        const familyArticles = new Set(unique.map(item => explicitFamilyArticle(item.product)).filter(Boolean));
        const models = new Set(unique.map(item => modelFingerprint(item.product)));
        const constructions = new Set(unique.map(item => constructionSignature(item.product)));
        const categories = new Set(unique.map(item => normalize(item.product?.category)));
        const collections = new Set(unique.map(item => normalize(item.product?.collection)));
        const prices = unique.map(item => priceFor(item.product)).filter(Boolean);

        if (models.size !== 1) reasons.push("different-model-name");
        if (constructions.size !== 1) reasons.push("different-construction");
        if (categories.size !== 1) reasons.push("different-category");
        if (collections.size !== 1) reasons.push("different-collection");
        if (familyArticles.size === 0 && articles.size !== 1) reasons.push("different-articles-without-base-article");
        if (familyArticles.size > 1) reasons.push("different-base-articles");
        if (prices.length > 1 && Math.max(...prices) / Math.min(...prices) > 1.35) reasons.push("price-gap-over-35-percent");

        const record = {
          key,
          ids: unique.map(item => item.product.id),
          names: unique.map(item => item.product.name),
          articles: unique.map(item => exactArticle(item.product)),
          colors: unique.map(item => item.color.label),
          reasons
        };

        if (reasons.length) blocked.push(record);
        else { safe.set(key, unique); accepted.push(record); }
      }

      window.__COLOR_VARIANT_AUDIT__ = {
        checkedAt: new Date().toISOString(),
        acceptedGroups: accepted,
        blockedGroups: blocked,
        acceptedCount: accepted.length,
        blockedCount: blocked.length
      };
      return safe;
    }

    function addStyles() {
      if (document.getElementById("colorSwatchesStyles")) return;
      const style = document.createElement("style");
      style.id = "colorSwatchesStyles";
      style.textContent = `.product-colors{margin:12px 0 2px;display:flex;align-items:center;gap:8px;flex-wrap:wrap}.product-colors-label{font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}.color-swatch{width:28px;height:28px;border-radius:50%;border:2px solid var(--surface);box-shadow:0 0 0 1px var(--line);padding:0;cursor:pointer;position:relative;flex:0 0 auto}.color-swatch:hover{transform:scale(1.08)}.color-swatch.active{box-shadow:0 0 0 2px var(--ink)}.color-swatch.active:after{content:"";position:absolute;inset:7px;border-radius:50%;border:2px solid rgba(255,255,255,.95);box-shadow:0 0 0 1px rgba(0,0,0,.22)}.modal-content .product-colors{margin:16px 0 4px}.modal-content .color-swatch{width:34px;height:34px}@media(max-width:700px){.product-colors{gap:7px;margin-top:10px}.color-swatch{width:30px;height:30px}.product-colors-label{width:100%}}`;
      document.head.appendChild(style);
    }

    function swatchesNode(product, variants) {
      const wrap = document.createElement("div");
      wrap.className = "product-colors";
      wrap.dataset.colorSwatches = String(product.id);
      const label = document.createElement("span");
      label.className = "product-colors-label";
      label.textContent = "Цвета";
      wrap.appendChild(label);
      for (const item of variants) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "color-swatch" + (Number(item.product.id) === Number(product.id) ? " active" : "");
        button.style.background = item.color.css;
        button.dataset.colorProduct = String(item.product.id);
        button.title = item.color.label;
        button.setAttribute("aria-label", `Выбрать цвет: ${item.color.label}`);
        button.setAttribute("aria-pressed", String(Number(item.product.id) === Number(product.id)));
        wrap.appendChild(button);
      }
      return wrap;
    }

    function productByCard(card) {
      const id = Number(card?.dataset?.product);
      try { return typeof productById === "function" ? productById(id) : null; } catch { return null; }
    }

    function addCardSwatches(groupMap) {
      document.querySelectorAll("[data-product]").forEach(card => {
        const product = productByCard(card);
        const variants = product ? groupMap.get(familyKey(product)) : null;
        const existing = card.querySelector("[data-color-swatches]");
        if (!variants) { existing?.remove(); return; }
        if (existing?.dataset.colorSwatches === String(product.id)) return;
        existing?.remove();
        const node = swatchesNode(product, variants);
        const specs = card.querySelector(".specs");
        const bottom = card.querySelector(".card-bottom");
        if (specs) specs.insertAdjacentElement("afterend", node);
        else if (bottom) bottom.insertAdjacentElement("beforebegin", node);
      });
    }

    function activeModalProduct() {
      try {
        const id = Number(activeGallery?.productId);
        return typeof productById === "function" ? productById(id) : null;
      } catch { return null; }
    }

    function addModalSwatches(groupMap) {
      const modal = document.getElementById("modal");
      const content = modal?.querySelector(".modal-content");
      if (!modal?.classList.contains("show") || !content) return;
      const product = activeModalProduct();
      const variants = product ? groupMap.get(familyKey(product)) : null;
      const existing = content.querySelector("[data-color-swatches]");
      if (!variants) { existing?.remove(); return; }
      if (existing?.dataset.colorSwatches === String(product.id)) return;
      existing?.remove();
      const node = swatchesNode(product, variants);
      const specs = content.querySelector(".modal-specs,.specs");
      const actions = content.querySelector(".journey-actions,.modal-actions");
      if (specs) specs.insertAdjacentElement("afterend", node);
      else if (actions) actions.insertAdjacentElement("beforebegin", node);
      else content.appendChild(node);
    }

    function refresh() {
      scheduled = false;
      addStyles();
      const groupMap = auditGroups();
      addCardSwatches(groupMap);
      addModalSwatches(groupMap);
    }

    function schedule() {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(refresh);
    }

    document.addEventListener("click", event => {
      const swatch = event.target.closest("[data-color-product]");
      if (!swatch) return;
      event.preventDefault();
      event.stopPropagation();
      const id = Number(swatch.dataset.colorProduct);
      try { if (typeof openProduct === "function") openProduct(id); } catch (error) { console.error("Не удалось открыть цветовой вариант", error); }
      schedule();
      setTimeout(schedule, 50);
    }, true);

    new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
    schedule();
  }

  document.write = function patchedWrite(...parts) {
    let html = parts.join("");
    if (typeof html === "string" && html.includes("</body>")) {
      const runtime = `<script>(${colorSwatchesRuntime.toString()})();<\/script>`;
      html = html.replace("</body>", `${runtime}</body>`);
    }
    return originalWrite(html);
  };
})();
