(() => {
  "use strict";

  const originalWrite = document.write.bind(document);

  function colorSwatchesRuntime() {
    "use strict";

    const COLORS = [
      ["светло-серый", "#c9c9c5"], ["светло серый", "#c9c9c5"],
      ["темно-серый", "#555753"], ["тёмно-серый", "#555753"], ["темно серый", "#555753"], ["тёмно серый", "#555753"],
      ["серо-бежевый", "#a99f91"], ["серо бежевый", "#a99f91"],
      ["пыльно-розовый", "#c99b9c"], ["пыльно розовый", "#c99b9c"],
      ["темно-синий", "#23344d"], ["тёмно-синий", "#23344d"],
      ["темно-зеленый", "#284c3b"], ["тёмно-зелёный", "#284c3b"],
      ["горчичный", "#b8872f"], ["терракотовый", "#a75735"], ["бордовый", "#6f2638"],
      ["антрацит", "#343735"], ["графит", "#4b4d4b"], ["серый", "#8d8f8c"],
      ["черный", "#171715"], ["чёрный", "#171715"], ["белый", "#f5f3ed"],
      ["молочный", "#eee5d5"], ["кремовый", "#e8dcc5"], ["бежевый", "#c9b69c"], ["песочный", "#c5a979"],
      ["коричневый", "#76513c"], ["коньячный", "#985c32"], ["желтый", "#d5b23b"], ["жёлтый", "#d5b23b"],
      ["оранжевый", "#d97a32"], ["красный", "#b63d38"], ["розовый", "#d5a0aa"], ["пудровый", "#cfaaa5"],
      ["фиолетовый", "#70517d"], ["сиреневый", "#9b83aa"], ["синий", "#355d88"], ["голубой", "#78a9c4"],
      ["бирюзовый", "#3e9694"], ["зеленый", "#587454"], ["зелёный", "#587454"], ["оливковый", "#73764a"],
      ["хаки", "#77745a"], ["мятный", "#91b6a3"], ["натуральный", "#c7a978"], ["дуб", "#b98f5f"],
      ["орех", "#765438"], ["венге", "#3d2b24"], ["золотой", "#c6a052"], ["золото", "#c6a052"],
      ["серебро", "#b9bab7"], ["серебристый", "#b9bab7"], ["хром", "#c8c9c7"]
    ];

    let scheduled = false;

    function normalize(value) {
      return String(value || "").toLowerCase().replace(/ё/g, "е").replace(/[^a-zа-я0-9]+/gi, " ").trim().replace(/\s+/g, " ");
    }

    function articleFor(product) {
      const direct = [
        product?.baseArticle, product?.modelArticle, product?.parentArticle, product?.groupArticle,
        product?.article, product?.sku, product?.vendorCode, product?.articleNumber,
        product?.productCode, product?.code
      ].find(value => String(value || "").trim());
      if (direct) return normalize(direct);
      const text = `${product?.name || ""} ${product?.specs || ""}`;
      const match = text.match(/(?:артикул|арт\.?|sku)\s*[:№#-]?\s*([a-zа-я0-9][a-zа-я0-9._\/-]{2,})/i);
      return match ? normalize(match[1]) : "";
    }

    function constructionSignature(product) {
      const text = normalize(`${product?.name || ""} ${product?.specs || ""}`);
      const swivel = /(?:опора 360|360 градусов|поворотн|вращающ)/.test(text) ? "swivel" : "fixed";
      const base = /хром/.test(text) ? "chrome" : /черн(?:ая|ые|ый).*?(?:опор|нож|основан)/.test(text) ? "black-base" : /бел(?:ая|ые|ый).*?(?:опор|нож|основан)/.test(text) ? "white-base" : "base-unspecified";
      const wheels = /колес|ролик/.test(text) ? "wheels" : "no-wheels";
      const pack = text.match(/(\d+)\s*шт\.?\s*в\s*упаковк/);
      return [swivel, base, wheels, pack ? `pack-${pack[1]}` : "pack-unspecified"].join("|");
    }

    function modelKey(product) {
      const article = articleFor(product);
      if (!article) return "";
      return [article, constructionSignature(product), normalize(product?.category), normalize(product?.collection)].join("|");
    }

    function colorFor(product) {
      const sources = [product?.specs, product?.name].map(normalize);
      for (const source of sources) {
        for (const [label, css] of COLORS) {
          if (source.includes(normalize(label))) return { label, css };
        }
      }
      return null;
    }

    function productsList() {
      if (Array.isArray(window.PRODUCTS)) return window.PRODUCTS;
      try { if (typeof PRODUCTS !== "undefined" && Array.isArray(PRODUCTS)) return PRODUCTS; } catch {}
      return [];
    }

    function groups() {
      const map = new Map();
      for (const product of productsList()) {
        const color = colorFor(product);
        const key = modelKey(product);
        if (!color || !key) continue;
        if (!map.has(key)) map.set(key, []);
        map.get(key).push({ product, color });
      }
      for (const [key, variants] of map) {
        const uniqueColors = [...new Map(variants.map(item => [normalize(item.color.label), item])).values()];
        const exactConstruction = new Set(uniqueColors.map(item => constructionSignature(item.product)));
        const exactArticles = new Set(uniqueColors.map(item => articleFor(item.product)));
        if (uniqueColors.length < 2 || exactConstruction.size !== 1 || exactArticles.size !== 1) map.delete(key);
        else map.set(key, uniqueColors);
      }
      return map;
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
        card.querySelector("[data-color-swatches]")?.remove();
        const product = productByCard(card);
        if (!product) return;
        const variants = groupMap.get(modelKey(product));
        if (!variants) return;
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
      content.querySelector("[data-color-swatches]")?.remove();
      const product = activeModalProduct();
      if (!product) return;
      const variants = groupMap.get(modelKey(product));
      if (!variants) return;
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
      const groupMap = groups();
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
