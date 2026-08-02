(() => {
  "use strict";
  const originalWrite = document.write.bind(document);

  function cartRecommendationsRuntime() {
    "use strict";
    let scheduled = false;

    function imageFor(product) {
      const images = Array.isArray(product?.images) ? product.images.filter(Boolean) : [];
      return images[0] || product?.directImage || "";
    }

    function cartEntries() {
      try {
        return Object.entries(cart)
          .map(([id, qty]) => ({ product: productById(id), qty: Number(qty) || 0 }))
          .filter(entry => entry.product && entry.qty > 0);
      } catch {
        return [];
      }
    }

    function render() {
      scheduled = false;
      const drawer = document.getElementById("drawer");
      if (!drawer?.classList.contains("show")) return;
      const entries = cartEntries();
      const signature = entries.map(entry => `${entry.product.id}:${entry.qty}`).sort().join("|");
      const existing = drawer.querySelector(".cart-journey");
      if (drawer.dataset.cartRecommendationSignature === signature && existing) return;
      drawer.dataset.cartRecommendationSignature = signature;
      existing?.remove();
      if (!entries.length) return;

      const inCart = new Set(entries.map(entry => Number(entry.product.id)));
      const categories = new Set(entries.map(entry => entry.product.category));
      const collections = new Set(entries.map(entry => entry.product.collection).filter(Boolean));
      const candidates = PRODUCTS
        .filter(product => !inCart.has(Number(product.id)))
        .map(product => ({ product, score: (collections.has(product.collection) ? 0 : 3) + (categories.has(product.category) ? 0 : 2) }))
        .sort((a, b) => a.score - b.score)
        .slice(0, 3)
        .map(entry => entry.product);
      if (!candidates.length) return;

      const block = document.createElement("section");
      block.className = "cart-journey";
      block.innerHTML = `<h3>Дополнить заказ</h3><div class="cart-journey-list">${candidates.map(product => {
        const image = imageFor(product);
        return `<div class="cart-journey-item">${image ? `<img src="${image}" alt="" loading="lazy" decoding="async">` : ""}<div><div class="cart-journey-name">${esc(product.name)}</div><div class="cart-journey-price">${formatPrice(sellingPrice(product))}</div></div><button type="button" class="cart-journey-add" data-cart-recommendation-add="${product.id}" aria-label="Добавить ${esc(product.name)}">+</button></div>`;
      }).join("")}</div>`;
      drawer.querySelector(".drawer-foot")?.before(block);
    }

    function schedule() {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(render);
    }

    document.addEventListener("click", event => {
      const button = event.target.closest("[data-cart-recommendation-add]");
      if (!button) return;
      addToCart(button.dataset.cartRecommendationAdd);
      schedule();
    });

    new MutationObserver(schedule).observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class"]
    });
    schedule();
  }

  document.write = function patchedWrite(...parts) {
    let html = parts.join("");
    if (typeof html === "string" && html.includes("</body>")) {
      const runtime = `<script>(${cartRecommendationsRuntime.toString()})();<\/script>`;
      html = html.replace("</body>", `${runtime}</body>`);
      return originalWrite(html);
    }
    return originalWrite(...parts);
  };
})();
