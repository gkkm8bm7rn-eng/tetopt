(() => {
  "use strict";
  const originalWrite = document.write.bind(document);

  function runtime() {
    "use strict";
    const COLORS = [
      ["светло-серый","#c9c9c5"],["темно-серый","#555753"],["тёмно-серый","#555753"],["серо-бежевый","#a99f91"],
      ["пыльно-розовый","#c99b9c"],["темно-синий","#23344d"],["тёмно-синий","#23344d"],["темно-зеленый","#284c3b"],
      ["тёмно-зелёный","#284c3b"],["горчичный","#b8872f"],["терракотовый","#a75735"],["бордовый","#6f2638"],
      ["антрацит","#343735"],["графит","#4b4d4b"],["черный","#171715"],["чёрный","#171715"],["белый","#f5f3ed"],
      ["молочный","#eee5d5"],["кремовый","#e8dcc5"],["бежевый","#c9b69c"],["песочный","#c5a979"],
      ["коричневый","#76513c"],["коньячный","#985c32"],["желтый","#d5b23b"],["жёлтый","#d5b23b"],
      ["оранжевый","#d97a32"],["красный","#b63d38"],["розовый","#d5a0aa"],["пудровый","#cfaaa5"],
      ["фиолетовый","#70517d"],["сиреневый","#9b83aa"],["синий","#355d88"],["голубой","#78a9c4"],
      ["бирюзовый","#3e9694"],["зеленый","#587454"],["зелёный","#587454"],["оливковый","#73764a"],
      ["хаки","#77745a"],["мятный","#91b6a3"],["натуральный","#c7a978"],["дуб","#b98f5f"],
      ["орех","#765438"],["венге","#3d2b24"],["золотой","#c6a052"],["золото","#c6a052"],
      ["серебро","#b9bab7"],["серебристый","#b9bab7"],["хром","#c8c9c7"],["серый","#8d8f8c"]
    ];
    let scheduled = false;

    const normalize = value => String(value || "").toLowerCase().replace(/ё/g,"е").replace(/[^a-zа-я0-9]+/gi," ").trim();
    const productList = () => {
      try { if (typeof PRODUCTS !== "undefined" && Array.isArray(PRODUCTS)) return PRODUCTS; } catch {}
      return Array.isArray(window.PRODUCTS) ? window.PRODUCTS : [];
    };
    const productByIdSafe = id => {
      try { if (typeof productById === "function") return productById(Number(id)); } catch {}
      return productList().find(p => Number(p.id) === Number(id)) || null;
    };
    const colorFor = product => {
      const text = normalize(`${product?.specs || ""} ${product?.name || ""}`);
      for (const [label, css] of COLORS) if (text.includes(normalize(label))) return { label, css };
      return { label: "Вариант", css: "#d8d3ca" };
    };

    function verifiedGroups() {
      const byId = new Map();
      const accepted = [];
      for (const group of Array.isArray(window.PRODUCT_COLOR_GROUPS) ? window.PRODUCT_COLOR_GROUPS : []) {
        const variants = [...new Set((group.ids || []).map(Number).filter(Number.isFinite))]
          .map(productByIdSafe).filter(Boolean)
          .map(product => ({ product, color: colorFor(product) }));
        const uniqueProducts = [...new Map(variants.map(item => [Number(item.product.id), item])).values()];
        const uniqueColors = new Set(uniqueProducts.map(item => normalize(item.color.label)));
        if (uniqueProducts.length < 2 || uniqueColors.size < 2) continue;
        uniqueProducts.forEach(item => byId.set(Number(item.product.id), uniqueProducts));
        accepted.push({ name: group.name || "", ids: uniqueProducts.map(item => Number(item.product.id)), colors: uniqueProducts.map(item => item.color.label) });
      }
      window.__COLOR_VARIANT_AUDIT__ = { mode: "explicit-registry", acceptedGroups: accepted, acceptedCount: accepted.length };
      return byId;
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

    function refresh() {
      scheduled = false;
      addStyles();
      const groups = verifiedGroups();
      document.querySelectorAll("[data-product]").forEach(card => {
        const product = productByIdSafe(card.dataset.product);
        const variants = product ? groups.get(Number(product.id)) : null;
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

      const modal = document.getElementById("modal");
      const content = modal?.querySelector(".modal-content");
      if (modal?.classList.contains("show") && content) {
        let product = null;
        try { product = productByIdSafe(activeGallery?.productId); } catch {}
        const variants = product ? groups.get(Number(product.id)) : null;
        const existing = content.querySelector("[data-color-swatches]");
        if (!variants) existing?.remove();
        else if (existing?.dataset.colorSwatches !== String(product.id)) {
          existing?.remove();
          const node = swatchesNode(product, variants);
          const specs = content.querySelector(".modal-specs,.specs");
          const actions = content.querySelector(".journey-actions,.modal-actions");
          if (specs) specs.insertAdjacentElement("afterend", node);
          else if (actions) actions.insertAdjacentElement("beforebegin", node);
          else content.appendChild(node);
        }
      }
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
      try { if (typeof openProduct === "function") openProduct(Number(swatch.dataset.colorProduct)); } catch (error) { console.error(error); }
      setTimeout(schedule, 40);
    }, true);

    new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
    schedule();
  }

  document.write = function patchedWrite(...parts) {
    let html = parts.join("");
    if (typeof html === "string" && html.includes("</body>")) html = html.replace("</body>", `<script>(${runtime.toString()})();<\/script></body>`);
    return originalWrite(html);
  };
})();
