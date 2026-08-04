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
      return productList().find(product => Number(product.id) === Number(id)) || null;
    };
    const colorFor = product => {
      const text = normalize(`${product?.specs || ""} ${product?.name || ""}`);
      for (const [label, css] of COLORS) if (text.includes(normalize(label))) return { label, css };
      return { label: "Вариант", css: "#d8d3ca" };
    };

    function verifiedGroups() {
      const byId = new Map();
      const duplicateIds = new Set();
      const accepted = [];
      for (const group of Array.isArray(window.PRODUCT_COLOR_GROUPS) ? window.PRODUCT_COLOR_GROUPS : []) {
        const variants = [...new Set((group.ids || []).map(Number).filter(Number.isFinite))]
          .map(productByIdSafe).filter(Boolean)
          .map(product => ({ product, color: colorFor(product) }));
        const uniqueProducts = [...new Map(variants.map(item => [Number(item.product.id), item])).values()];
        const uniqueColors = new Set(uniqueProducts.map(item => normalize(item.color.label)));
        if (uniqueProducts.length < 2 || uniqueColors.size < 2) continue;
        const primaryId = Number(uniqueProducts[0].product.id);
        uniqueProducts.forEach(item => {
          const id = Number(item.product.id);
          byId.set(id, uniqueProducts);
          if (id !== primaryId) duplicateIds.add(id);
        });
        accepted.push({
          name: group.name || "",
          primaryId,
          ids: uniqueProducts.map(item => Number(item.product.id)),
          colors: uniqueProducts.map(item => item.color.label)
        });
      }
      window.__COLOR_VARIANT_AUDIT__ = {
        mode: "explicit-registry-with-card-switching",
        acceptedGroups: accepted,
        acceptedCount: accepted.length,
        hiddenDuplicateIds: [...duplicateIds]
      };
      return { byId, duplicateIds };
    }

    function addStyles() {
      if (document.getElementById("colorSwatchesStyles")) return;
      const style = document.createElement("style");
      style.id = "colorSwatchesStyles";
      style.textContent = `.product-color-duplicate-hidden{display:none!important}.product-colors{margin:12px 0 2px;display:flex;align-items:center;gap:8px;flex-wrap:wrap}.product-colors-label{font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}.color-swatch{width:28px;height:28px;border-radius:50%;border:2px solid var(--surface);box-shadow:0 0 0 1px var(--line);padding:0;cursor:pointer;position:relative;flex:0 0 auto;transition:transform .15s ease,box-shadow .15s ease}.color-swatch:hover{transform:scale(1.08)}.color-swatch.active{box-shadow:0 0 0 2px var(--ink)}.color-swatch.active:after{content:"";position:absolute;inset:7px;border-radius:50%;border:2px solid rgba(255,255,255,.95);box-shadow:0 0 0 1px rgba(0,0,0,.22)}.modal-content .product-colors{margin:16px 0 4px}.modal-content .color-swatch{width:34px;height:34px}@media(max-width:700px){.product-colors{gap:7px;margin-top:10px}.color-swatch{width:30px;height:30px}.product-colors-label{width:100%}}`;
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
        const active = Number(item.product.id) === Number(product.id);
        button.type = "button";
        button.className = "color-swatch" + (active ? " active" : "");
        button.style.background = item.color.css;
        button.dataset.colorProduct = String(item.product.id);
        button.title = item.color.label;
        button.setAttribute("aria-label", `Выбрать цвет: ${item.color.label}`);
        button.setAttribute("aria-pressed", String(active));
        wrap.appendChild(button);
      }
      return wrap;
    }

    function productPhotos(product) {
      return Array.isArray(product?.images) ? product.images.filter(Boolean) : [];
    }

    function replacePrice(card, product) {
      const current = card.querySelector(".price-stack");
      if (!current) return;
      try {
        if (typeof priceHtml === "function") {
          const template = document.createElement("template");
          template.innerHTML = priceHtml(product);
          const replacement = template.content.firstElementChild;
          if (replacement) current.replaceWith(replacement);
          return;
        }
      } catch {}

      const wholesale = current.querySelector(".wholesale-price");
      const retail = current.querySelector(".retail-price");
      try {
        if (wholesale && typeof formatPrice === "function" && typeof sellingPrice === "function") {
          wholesale.textContent = formatPrice(sellingPrice(product));
        }
        if (retail && typeof formatPrice === "function") {
          retail.textContent = product.retailPrice ? `Розничная: ${formatPrice(Number(product.retailPrice))}` : "";
          retail.hidden = !product.retailPrice;
        }
      } catch {}
    }

    function rebuildPhotoNavigation(visual, product) {
      const photos = productPhotos(product);
      visual.dataset.photoIndex = "0";
      visual.dataset.photoCount = String(Math.max(1, photos.length));
      visual.querySelectorAll(".card-photo-nav,.card-photo-counter").forEach(node => node.remove());
      if (photos.length < 2) return;

      const previous = document.createElement("button");
      previous.type = "button";
      previous.className = "card-photo-nav card-photo-prev";
      previous.dataset.cardPhoto = "-1";
      previous.setAttribute("aria-label", "Предыдущее фото");
      previous.textContent = "‹";

      const next = document.createElement("button");
      next.type = "button";
      next.className = "card-photo-nav card-photo-next";
      next.dataset.cardPhoto = "1";
      next.setAttribute("aria-label", "Следующее фото");
      next.textContent = "›";

      const counter = document.createElement("span");
      counter.className = "card-photo-counter";
      counter.textContent = `1 / ${photos.length}`;
      visual.append(previous, next, counter);
    }

    function updateCardImage(card, product) {
      const visual = card.querySelector(".visual");
      const image = visual?.querySelector(".js-product-image,.product-photo");
      if (!visual || !image) return;

      rebuildPhotoNavigation(visual, product);
      const placeholder = visual.querySelector(".photo-placeholder");
      placeholder?.removeAttribute("hidden");
      if (!visual.querySelector(".photo-loading")) {
        const loading = document.createElement("span");
        loading.className = "photo-loading";
        loading.textContent = "загрузка фото…";
        visual.appendChild(loading);
      }

      image.dataset.productImage = String(product.id);
      image.alt = product.name || "";
      image.classList.remove("loaded", "failed");
      image.removeAttribute("data-observed");
      image.removeAttribute("src");

      const firstPhoto = productPhotos(product)[0] || product.directImage || "";
      if (firstPhoto) {
        try {
          if (typeof applyPhoto === "function") applyPhoto(image, firstPhoto, product);
          else image.src = firstPhoto;
        } catch { image.src = firstPhoto; }
      } else {
        try {
          if (typeof queueProductPhoto === "function") queueProductPhoto(image);
          else if (typeof observeProductImages === "function") observeProductImages(card);
        } catch {}
      }
    }

    function switchCatalogCard(card, product, variants) {
      if (!card || !product || !variants?.length) return;
      const hostId = Number(card.dataset.colorHost || card.dataset.product);
      card.dataset.colorHost = String(Number.isFinite(hostId) ? hostId : variants[0].product.id);
      card.dataset.product = String(product.id);
      card.classList.remove("product-color-duplicate-hidden");

      const collection = card.querySelector(".collection-tag");
      const category = card.querySelector(".category");
      const title = card.querySelector("h3");
      const specs = card.querySelector(".specs");
      if (collection) collection.textContent = product.collection || "";
      if (category) category.textContent = product.category || "";
      if (title) title.textContent = product.name || "";
      if (specs) specs.textContent = product.specs || "";

      const addButton = card.querySelector("[data-add]");
      if (addButton) addButton.dataset.add = String(product.id);
      const favoriteButton = card.querySelector("[data-favorite-toggle]");
      if (favoriteButton) favoriteButton.dataset.favoriteToggle = String(product.id);

      replacePrice(card, product);
      updateCardImage(card, product);

      const existing = card.querySelector("[data-color-swatches]");
      const replacement = swatchesNode(product, variants);
      if (existing) existing.replaceWith(replacement);
      else if (specs) specs.insertAdjacentElement("afterend", replacement);

      window.__LAST_COLOR_CARD_SWITCH__ = {
        hostId: Number(card.dataset.colorHost),
        productId: Number(product.id),
        at: Date.now()
      };
      window.dispatchEvent(new CustomEvent("forma:card-variant-changed", {
        detail: { hostId: Number(card.dataset.colorHost), productId: Number(product.id) }
      }));
      window.dispatchEvent(new Event("forma:favorites-changed"));
    }

    function refresh() {
      scheduled = false;
      addStyles();
      const { byId, duplicateIds } = verifiedGroups();
      document.querySelectorAll("[data-product]").forEach(card => {
        const currentId = Number(card.dataset.product);
        const variants = byId.get(currentId);
        const primaryId = variants?.length ? Number(variants[0].product.id) : null;
        const isCatalogCard = Boolean(card.closest("#grid"));

        if (isCatalogCard && primaryId === currentId && !card.dataset.colorHost) {
          card.dataset.colorHost = String(primaryId);
        }
        const isVisibleHost = isCatalogCard && Boolean(card.dataset.colorHost);
        card.classList.toggle("product-color-duplicate-hidden", duplicateIds.has(currentId) && !isVisibleHost);

        const product = productByIdSafe(currentId);
        const existing = card.querySelector("[data-color-swatches]");
        if (!product || !variants || (duplicateIds.has(currentId) && !isVisibleHost)) {
          existing?.remove();
          return;
        }
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
        const variants = product ? byId.get(Number(product.id)) : null;
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
      const swatch = event.target.closest?.("[data-color-product]");
      if (!swatch) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      const product = productByIdSafe(swatch.dataset.colorProduct);
      if (!product) return;
      const card = swatch.closest("#grid [data-product]");
      if (card) {
        const variants = verifiedGroups().byId.get(Number(product.id));
        switchCatalogCard(card, product, variants);
        setTimeout(schedule, 40);
        return;
      }

      try { if (typeof openProduct === "function") openProduct(Number(product.id)); }
      catch (error) { console.error(error); }
      setTimeout(schedule, 40);
    }, true);

    new MutationObserver(schedule).observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class"]
    });
    window.addEventListener("forma:catalog-ready", schedule);
    schedule();
  }

  document.write = function patchedWrite(...parts) {
    let html = parts.join("");
    if (typeof html === "string" && html.includes("</body>")) {
      html = html.replace("</body>", `<script>(${runtime.toString()})();<\/script></body>`);
    }
    return originalWrite(html);
  };
})();
