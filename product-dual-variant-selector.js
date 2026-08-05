(() => {
  "use strict";
  const originalWrite = document.write.bind(document);

  function runtime() {
    "use strict";

    let scheduled = false;
    const selections = new Map();

    const groups = () => Array.isArray(window.PRODUCT_DUAL_VARIANT_GROUPS)
      ? window.PRODUCT_DUAL_VARIANT_GROUPS
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

    const variantForKeys = (group, cushion, base) =>
      (group?.variants || []).find(variant => variant.cushion === cushion && variant.base === base) || null;

    function addStyles() {
      if (document.getElementById("dualVariantStyles")) return;
      const style = document.createElement("style");
      style.id = "dualVariantStyles";
      style.textContent = `
        .product-dual-variant-hidden{display:none!important}
        .dual-variant-selector{margin:13px 0 4px;padding:12px;border:1px solid var(--line);border-radius:14px;background:rgba(255,255,255,.52);display:grid;gap:12px}
        .dual-variant-row{display:grid;gap:8px}
        .dual-variant-label{display:flex;align-items:center;gap:7px;font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--muted)}
        .dual-variant-shape{display:inline-block;width:12px;height:12px;background:var(--ink);flex:0 0 auto}
        .dual-variant-shape.cushion{border-radius:50%}
        .dual-variant-shape.base{border-radius:2px}
        .dual-variant-options{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
        .dual-variant-swatch{width:30px;height:30px;border:2px solid var(--surface);box-shadow:0 0 0 1px var(--line);padding:0;cursor:pointer;position:relative;flex:0 0 auto;transition:transform .15s ease,box-shadow .15s ease,opacity .15s ease;background:var(--dual-swatch)}
        .dual-variant-swatch.cushion{border-radius:50%}
        .dual-variant-swatch.base{border-radius:6px}
        .dual-variant-swatch:hover:not(:disabled){transform:scale(1.08)}
        .dual-variant-swatch.active{box-shadow:0 0 0 2px var(--ink)}
        .dual-variant-swatch.active:after{content:"✓";position:absolute;inset:0;display:grid;place-items:center;color:#fff;font-size:16px;font-weight:900;text-shadow:0 1px 3px rgba(0,0,0,.75)}
        .dual-variant-swatch:disabled{opacity:.28;cursor:not-allowed}
        .modal-content .dual-variant-selector{margin:16px 0 6px;padding:14px}
        .modal-content .dual-variant-swatch{width:36px;height:36px}
        @media(max-width:700px){
          .dual-variant-selector{padding:11px;gap:11px}
          .dual-variant-options{gap:9px}
          .dual-variant-swatch{width:32px;height:32px}
        }
      `;
      document.head.appendChild(style);
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

    function selectorNode(product, group) {
      const current = variantForId(group, product?.id) || variantForId(group, group.primaryId);
      if (!current) return null;

      const wrap = document.createElement("div");
      wrap.className = "dual-variant-selector";
      wrap.dataset.dualVariantSelector = String(group.primaryId);
      wrap.setAttribute("aria-label", "Выбор цвета подушки и основания");

      const makeRow = (axis, items, shape, labelText) => {
        const row = document.createElement("div");
        row.className = "dual-variant-row";

        const label = document.createElement("div");
        label.className = "dual-variant-label";
        const icon = document.createElement("span");
        icon.className = `dual-variant-shape ${shape}`;
        icon.setAttribute("aria-hidden", "true");
        const text = document.createElement("span");
        text.textContent = labelText;
        label.append(icon, text);

        const options = document.createElement("div");
        options.className = "dual-variant-options";
        options.setAttribute("role", "group");
        options.setAttribute("aria-label", labelText);

        for (const item of items || []) {
          const otherAxis = axis === "cushion" ? "base" : "cushion";
          const otherKey = current[otherAxis];
          const available = (group.variants || []).some(variant =>
            variant[axis] === item.key && variant[otherAxis] === otherKey
          );
          const active = current[axis] === item.key;
          const button = document.createElement("button");
          button.type = "button";
          button.className = `dual-variant-swatch ${shape}${active ? " active" : ""}`;
          button.style.setProperty("--dual-swatch", item.css || "#d8d3ca");
          button.dataset.dualGroup = String(group.primaryId);
          button.dataset.dualAxis = axis;
          button.dataset.dualKey = item.key;
          button.title = item.label;
          button.disabled = !available;
          button.setAttribute("aria-label", `${labelText}: ${item.label}`);
          button.setAttribute("aria-pressed", String(active));
          options.appendChild(button);
        }

        row.append(label, options);
        return row;
      };

      wrap.append(
        makeRow("cushion", group.cushions, "cushion", group.labels?.cushion || "Цвет подушки"),
        makeRow("base", group.bases, "base", group.labels?.base || "Цвет основания (ротанг)")
      );
      return wrap;
    }

    function mountSelector(container, product, group) {
      const existing = container.querySelector("[data-dual-variant-selector]");
      if (!product || !group) {
        existing?.remove();
        return;
      }
      if (existing?.dataset.dualVariantProduct === String(product.id)) return;

      const node = selectorNode(product, group);
      if (!node) return;
      node.dataset.dualVariantProduct = String(product.id);
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
      card.dataset.dualVariantHost = String(primaryId);
      card.dataset.product = String(product.id);
      card.classList.remove("product-dual-variant-hidden");

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

      window.__LAST_DUAL_VARIANT_SWITCH__ = {
        hostId: primaryId,
        productId: Number(product.id),
        at: Date.now()
      };
      window.dispatchEvent(new CustomEvent("forma:card-variant-changed", {
        detail: { hostId: primaryId, productId: Number(product.id), mode: "dual" }
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
        const hostId = Number(card.dataset.dualVariantHost);
        const hostGroup = Number.isFinite(hostId) ? byPrimary.get(hostId) : null;
        const group = hostGroup || byId.get(currentId);
        if (!group) {
          card.classList.remove("product-dual-variant-hidden");
          card.querySelector("[data-dual-variant-selector]")?.remove();
          return;
        }

        const primaryId = Number(group.primaryId);
        const isHost = hostGroup === group || currentId === primaryId;
        card.classList.toggle("product-dual-variant-hidden", !isHost);
        if (!isHost) return;

        card.dataset.dualVariantHost = String(primaryId);
        const selectedId = selections.get(primaryId);
        const desiredId = Number.isFinite(selectedId) ? selectedId : currentId;
        if (desiredId !== currentId) {
          const desiredProduct = productByIdSafe(desiredId);
          if (desiredProduct) {
            switchCatalogCard(card, desiredProduct, group);
            return;
          }
        }
        const product = productByIdSafe(currentId);
        mountSelector(card, product, group);
      });

      const modal = document.getElementById("modal");
      const content = modal?.querySelector(".modal-content");
      if (modal?.classList.contains("show") && content) {
        const productId = currentModalProductId();
        const group = byId.get(Number(productId));
        const product = group ? productByIdSafe(productId) : null;
        mountSelector(content, product, group);
      } else {
        content?.querySelector("[data-dual-variant-selector]")?.remove();
      }

      window.__DUAL_VARIANT_AUDIT__ = {
        mode: "independent-cushion-and-base-selection",
        groups: groups().map(group => ({
          name: group.name,
          primaryId: Number(group.primaryId),
          ids: (group.variants || []).map(variant => Number(variant.id))
        })),
        hiddenDuplicateIds: [...hiddenIds],
        labels: {
          circle: "Цвет подушки",
          square: "Цвет основания (ротанг)"
        }
      };
      window.dispatchEvent(new Event("forma:dual-variants-ready"));
    }

    function schedule() {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(refresh);
    }

    document.addEventListener("click", event => {
      const button = event.target.closest?.("[data-dual-axis]");
      if (!button) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      const { byPrimary } = groupMaps();
      const group = byPrimary.get(Number(button.dataset.dualGroup));
      if (!group) return;

      const card = button.closest("#grid [data-product]");
      const currentId = card ? Number(card.dataset.product) : currentModalProductId();
      const current = variantForId(group, currentId) || variantForId(group, group.primaryId);
      if (!current) return;

      const axis = button.dataset.dualAxis;
      const nextCushion = axis === "cushion" ? button.dataset.dualKey : current.cushion;
      const nextBase = axis === "base" ? button.dataset.dualKey : current.base;
      const target = variantForKeys(group, nextCushion, nextBase);
      if (!target) return;

      const product = productByIdSafe(target.id);
      if (!product) return;
      selections.set(Number(group.primaryId), Number(target.id));

      if (card) {
        switchCatalogCard(card, product, group);
        setTimeout(schedule, 40);
        return;
      }

      try {
        if (typeof openProduct === "function") openProduct(Number(product.id));
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
    window.addEventListener("forma:product-groups-ready", schedule);
    schedule();

    let attempts = 0;
    const poll = setInterval(() => {
      schedule();
      attempts += 1;
      if (attempts >= 24) clearInterval(poll);
    }, 250);
  }

  document.write = function patchedWrite(...parts) {
    let html = parts.join("");
    if (typeof html === "string" && html.includes("</body>")) {
      html = html.replace("</body>", `<script>(${runtime.toString()})();<\/script></body>`);
    }
    return originalWrite(html);
  };
})();
