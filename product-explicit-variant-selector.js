(() => {
  "use strict";
  const originalWrite = document.write.bind(document);

  function runtime() {
    "use strict";

    let scheduled = false;
    const selections = new Map();

    const groups = () => Array.isArray(window.PRODUCT_EXPLICIT_VARIANT_GROUPS)
      ? window.PRODUCT_EXPLICIT_VARIANT_GROUPS
      : [];

    const productList = () => {
      try {
        if (typeof PRODUCTS !== "undefined" && Array.isArray(PRODUCTS)) return PRODUCTS;
      } catch {}
      return Array.isArray(window.PRODUCTS) ? window.PRODUCTS : [];
    };

    const productByIdSafe = id => {
      try {
        if (typeof productById === "function") return productById(Number(id));
      } catch {}
      return productList().find(product => Number(product.id) === Number(id)) || null;
    };

    const groupMaps = () => {
      const byId = new Map();
      const byPrimary = new Map();

      for (const group of groups()) {
        const primaryId = Number(group.primaryId || group.variants?.[0]?.id);
        if (!Number.isFinite(primaryId)) continue;
        byPrimary.set(primaryId, group);

        for (const variant of group.variants || []) {
          const id = Number(variant.id);
          if (Number.isFinite(id)) byId.set(id, group);
        }
      }
      return { byId, byPrimary };
    };

    const variantForId = (group, id) =>
      (group?.variants || []).find(variant => Number(variant.id) === Number(id)) || null;

    function addStyles() {
      if (document.getElementById("explicitVariantStyles")) return;
      const style = document.createElement("style");
      style.id = "explicitVariantStyles";
      style.textContent = `
        .product-explicit-variant-hidden{display:none!important}
        .explicit-variant-selector{margin:12px 0 2px;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
        .explicit-variant-label{font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}
        .explicit-variant-swatch{width:28px;height:28px;border-radius:50%;border:2px solid var(--surface);box-shadow:0 0 0 1px var(--line);padding:0;cursor:pointer;position:relative;flex:0 0 auto;transition:transform .15s ease,box-shadow .15s ease;background:var(--explicit-swatch)}
        .explicit-variant-swatch:hover{transform:scale(1.08)}
        .explicit-variant-swatch.active{box-shadow:0 0 0 2px var(--ink)}
        .explicit-variant-swatch.active:after{content:"";position:absolute;inset:7px;border-radius:50%;border:2px solid rgba(255,255,255,.95);box-shadow:0 0 0 1px rgba(0,0,0,.22)}
        .modal-content .explicit-variant-selector{margin:16px 0 4px}
        .modal-content .explicit-variant-swatch{width:34px;height:34px}
        @media(max-width:700px){
          .explicit-variant-selector{gap:7px;margin-top:10px}
          .explicit-variant-swatch{width:30px;height:30px}
          .explicit-variant-label{width:100%}
        }
      `;
      document.head.appendChild(style);
    }

    function selectorNode(product, group) {
      if (!product || !group || !variantForId(group, product.id)) return null;

      const wrap = document.createElement("div");
      wrap.className = "explicit-variant-selector";
      wrap.dataset.explicitVariantSelector = String(group.primaryId);
      wrap.dataset.explicitVariantProduct = String(product.id);
      wrap.setAttribute("aria-label", group.label || "Вариант товара");

      const label = document.createElement("span");
      label.className = "explicit-variant-label";
      label.textContent = group.label || "Варианты";
      wrap.appendChild(label);

      for (const variant of group.variants || []) {
        const id = Number(variant.id);
        if (!productByIdSafe(id)) continue;

        const active = id === Number(product.id);
        const button = document.createElement("button");
        button.type = "button";
        button.className = `explicit-variant-swatch${active ? " active" : ""}`;
        button.style.setProperty("--explicit-swatch", variant.css || "#d8d3ca");
        button.dataset.explicitProduct = String(id);
        button.dataset.explicitGroup = String(group.primaryId);
        button.title = variant.label || "Вариант";
        button.setAttribute(
          "aria-label",
          `${group.label || "Вариант товара"}: ${variant.label || "Вариант"}`
        );
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
          retail.textContent = product.retailPrice
            ? `Розничная: ${formatPrice(Number(product.retailPrice))}`
            : "";
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
      visual.querySelector(".photo-placeholder")?.removeAttribute("hidden");

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
        } catch {
          image.src = firstPhoto;
        }
      } else {
        try {
          if (typeof queueProductPhoto === "function") queueProductPhoto(image);
          else if (typeof observeProductImages === "function") observeProductImages(card);
        } catch {}
      }
    }

    function mountSelector(container, product, group) {
      const existing = container.querySelector("[data-explicit-variant-selector]");
      if (!product || !group) {
        existing?.remove();
        return;
      }
      if (existing?.dataset.explicitVariantProduct === String(product.id)) return;

      const node = selectorNode(product, group);
      if (!node) {
        existing?.remove();
        return;
      }

      existing?.remove();
      const specs = container.querySelector(".modal-specs,.specs");
      const actions = container.querySelector(".journey-actions,.modal-actions,.card-bottom");

      if (specs) specs.insertAdjacentElement("afterend", node);
      else if (actions) actions.insertAdjacentElement("beforebegin", node);
      else container.appendChild(node);
    }

    function switchCatalogCard(card, product, group) {
      if (!card || !product || !group) return;

      const primaryId = Number(group.primaryId);
      card.dataset.explicitHost = String(primaryId);
      card.dataset.product = String(product.id);
      card.classList.remove("product-explicit-variant-hidden");

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
      mountSelector(card, product, group);
      selections.set(primaryId, Number(product.id));

      window.__LAST_EXPLICIT_VARIANT_SWITCH__ = {
        hostId: primaryId,
        productId: Number(product.id),
        at: Date.now()
      };
      window.dispatchEvent(new CustomEvent("forma:card-variant-changed", {
        detail: { hostId: primaryId, productId: Number(product.id), mode: "explicit" }
      }));
      window.dispatchEvent(new Event("forma:favorites-changed"));
    }

    function currentModalProductId() {
      try {
        const id = Number(openProductId);
        if (Number.isFinite(id) && id > 0) return id;
      } catch {}
      try {
        const id = Number(activeGallery?.productId);
        if (Number.isFinite(id) && id > 0) return id;
      } catch {}
      return null;
    }

    function refresh() {
      scheduled = false;
      addStyles();

      const { byId, byPrimary } = groupMaps();
      const hiddenIds = new Set();

      for (const group of groups()) {
        const primaryId = Number(group.primaryId);
        for (const variant of group.variants || []) {
          const id = Number(variant.id);
          if (Number.isFinite(id) && id !== primaryId) hiddenIds.add(id);
        }
      }

      document.querySelectorAll("#grid [data-product]").forEach(card => {
        const currentId = Number(card.dataset.product);
        const hostId = Number(card.dataset.explicitHost);
        const hostGroup = Number.isFinite(hostId) ? byPrimary.get(hostId) : null;
        const group = hostGroup || byId.get(currentId);

        if (!group) {
          card.classList.remove("product-explicit-variant-hidden");
          card.querySelector("[data-explicit-variant-selector]")?.remove();
          return;
        }

        const primaryId = Number(group.primaryId);
        const isHost = hostGroup === group || currentId === primaryId;
        card.classList.toggle("product-explicit-variant-hidden", !isHost);
        if (!isHost) return;

        card.dataset.explicitHost = String(primaryId);
        const selectedId = selections.get(primaryId);
        const desiredId = Number.isFinite(selectedId) ? selectedId : currentId;

        if (desiredId !== currentId) {
          const desiredProduct = productByIdSafe(desiredId);
          if (desiredProduct) {
            switchCatalogCard(card, desiredProduct, group);
            return;
          }
        }

        mountSelector(card, productByIdSafe(currentId), group);
      });

      const modal = document.getElementById("modal");
      const content = modal?.querySelector(".modal-content");

      if (modal?.classList.contains("show") && content) {
        const productId = currentModalProductId();
        const group = byId.get(Number(productId));
        const product = group ? productByIdSafe(productId) : null;
        mountSelector(content, product, group);
      } else {
        content?.querySelector("[data-explicit-variant-selector]")?.remove();
      }

      window.__EXPLICIT_VARIANT_AUDIT__ = {
        mode: "explicit-labeled-variants",
        groups: groups().map(group => ({
          name: group.name,
          primaryId: Number(group.primaryId),
          ids: (group.variants || []).map(variant => Number(variant.id)),
          label: group.label
        })),
        hiddenDuplicateIds: [...hiddenIds]
      };
    }

    function schedule() {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(refresh);
    }

    document.addEventListener("click", event => {
      const swatch = event.target.closest?.("[data-explicit-product]");
      if (!swatch) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      const productId = Number(swatch.dataset.explicitProduct);
      const product = productByIdSafe(productId);
      if (!product) return;

      const { byId } = groupMaps();
      const group = byId.get(productId);
      if (!group) return;

      const card = swatch.closest("#grid [data-product]");
      if (card) {
        switchCatalogCard(card, product, group);
        setTimeout(schedule, 40);
        return;
      }

      try {
        if (typeof openProduct === "function") openProduct(productId);
      } catch (error) {
        console.error(error);
      }
      setTimeout(schedule, 40);
    }, true);

    new MutationObserver(schedule).observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "data-product"]
    });

    window.addEventListener("forma:catalog-ready", schedule);
    window.addEventListener("forma:card-variant-changed", schedule);
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
