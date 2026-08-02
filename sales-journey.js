(() => {
  "use strict";

  const originalWrite = document.write.bind(document);

  function salesJourneyRuntime() {
    "use strict";

    const MAX_RECOMMENDATIONS = 4;

    function addStyles() {
      if (document.getElementById("salesJourneyStyles")) return;
      const style = document.createElement("style");
      style.id = "salesJourneyStyles";
      style.textContent = `
        .journey-actions{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:22px}
        .journey-actions .btn{width:100%;min-height:48px;padding:13px 15px}
        .journey-fast{background:var(--accent);color:#fff}
        .journey-recommendations{grid-column:1/-1;border-top:1px solid var(--line);padding:24px 28px 30px;background:var(--bg)}
        .journey-recommendations h3{font-family:Georgia,serif;font-size:25px;font-weight:500;margin:0 0 4px}
        .journey-recommendations p{margin:0 0 14px;color:var(--muted);font-size:13px}
        .journey-row{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}
        .journey-product{border:1px solid var(--line);background:var(--surface);border-radius:16px;padding:0;overflow:hidden;text-align:left;min-width:0;cursor:pointer}
        .journey-product:hover{border-color:var(--accent);transform:translateY(-2px)}
        .journey-product img{width:100%;aspect-ratio:1.1;object-fit:contain;background:#fff;display:block}
        .journey-product-body{padding:10px}
        .journey-product-name{font-size:12px;font-weight:800;line-height:1.3;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;min-height:32px}
        .journey-product-price{font-size:13px;font-weight:900;margin-top:7px}
        .journey-section+.journey-section{margin-top:22px}
        .cart-journey{padding:16px 22px;border-top:1px solid var(--line);background:var(--bg)}
        .cart-journey h3{font-family:Georgia,serif;font-size:20px;font-weight:500;margin:0 0 10px}
        .cart-journey-list{display:grid;gap:8px}
        .cart-journey-item{display:grid;grid-template-columns:54px 1fr auto;gap:10px;align-items:center;background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:8px}
        .cart-journey-item img{width:54px;height:54px;object-fit:contain;background:#fff;border-radius:9px}
        .cart-journey-name{font-size:12px;font-weight:800;line-height:1.25}
        .cart-journey-price{font-size:11px;color:var(--muted);margin-top:4px}
        .cart-journey-add{width:38px;height:38px;border:0;border-radius:50%;background:var(--ink);color:#fff;font-size:20px}
        .journey-benefits{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:14px}
        .journey-benefit{background:var(--surface-2);border-radius:12px;padding:9px;text-align:center;font-size:11px;line-height:1.35;color:var(--muted)}
        @media(max-width:700px){
          .journey-actions{grid-template-columns:1fr;margin-bottom:6px}
          .journey-recommendations{padding:22px 16px 26px}
          .journey-row{display:flex;overflow-x:auto;scroll-snap-type:x mandatory;padding-bottom:7px}
          .journey-product{flex:0 0 46%;scroll-snap-align:start}
          .modal.show .journey-actions{position:sticky;bottom:0;z-index:12;background:var(--surface);padding:10px 0 calc(10px + env(safe-area-inset-bottom));box-shadow:0 -10px 24px rgba(32,31,27,.08)}
          .journey-benefits{grid-template-columns:1fr}
        }
      `;
      document.head.appendChild(style);
    }

    function imageFor(product) {
      const images = Array.isArray(product?.images) ? product.images.filter(Boolean) : [];
      return images[0] || product?.directImage || "";
    }

    function uniqueProducts(items) {
      const seen = new Set();
      return items.filter(product => {
        const id = Number(product?.id);
        if (!Number.isFinite(id) || seen.has(id)) return false;
        seen.add(id);
        return true;
      });
    }

    function recommendationSets(product) {
      const price = Number(typeof sellingPrice === "function" ? sellingPrice(product) : product.wholesalePrice || 0);
      const others = PRODUCTS.filter(item => Number(item.id) !== Number(product.id));
      const sameCollection = uniqueProducts(others.filter(item => product.collection && item.collection === product.collection)).slice(0, MAX_RECOMMENDATIONS);
      const similar = others
        .filter(item => item.category === product.category && !sameCollection.some(saved => Number(saved.id) === Number(item.id)))
        .map(item => {
          const itemPrice = Number(typeof sellingPrice === "function" ? sellingPrice(item) : item.wholesalePrice || 0);
          const priceDistance = price > 0 && itemPrice > 0 ? Math.abs(itemPrice - price) / price : 2;
          const collectionBonus = item.collection === product.collection ? -2 : 0;
          return { item, score: priceDistance + collectionBonus };
        })
        .sort((a, b) => a.score - b.score)
        .map(entry => entry.item)
        .slice(0, MAX_RECOMMENDATIONS);
      return { sameCollection, similar };
    }

    function recommendationCard(product) {
      const image = imageFor(product);
      const price = typeof sellingPrice === "function" ? sellingPrice(product) : product.wholesalePrice;
      return `<button type="button" class="journey-product" data-journey-open="${product.id}">
        ${image ? `<img src="${image}" alt="" loading="lazy" decoding="async">` : ""}
        <span class="journey-product-body">
          <span class="journey-product-name">${esc(product.name)}</span>
          <span class="journey-product-price">${formatPrice(price)}</span>
        </span>
      </button>`;
    }

    function enhanceModal() {
      const modal = document.getElementById("modal");
      if (!modal?.classList.contains("show")) return;
      const id = Number(typeof activeGallery === "object" ? activeGallery?.productId : NaN);
      const product = typeof productById === "function" ? productById(id) : null;
      if (!product) return;

      const content = modal.querySelector(".modal-content");
      const originalButton = content?.querySelector(".btn.btn-primary");
      if (content && originalButton && !content.querySelector(".journey-actions")) {
        const actions = document.createElement("div");
        actions.className = "journey-actions";
        originalButton.replaceWith(actions);
        originalButton.style.marginTop = "0";
        actions.appendChild(originalButton);
        const fast = document.createElement("button");
        fast.type = "button";
        fast.className = "btn journey-fast";
        fast.dataset.fastBuy = String(product.id);
        fast.textContent = "Купить быстро";
        actions.appendChild(fast);
        const benefits = document.createElement("div");
        benefits.className = "journey-benefits";
        benefits.innerHTML = `<span class="journey-benefit">Без регистрации</span><span class="journey-benefit">Заказ через мессенджер</span><span class="journey-benefit">Контакты сохранятся в браузере</span>`;
        content.appendChild(benefits);
      }

      if (!modal.querySelector(".journey-recommendations")) {
        const sets = recommendationSets(product);
        const sections = [];
        if (sets.sameCollection.length) sections.push(`<div class="journey-section"><h3>Из этой же серии</h3><p>Товары одной коллекции для целостного интерьера.</p><div class="journey-row">${sets.sameCollection.map(recommendationCard).join("")}</div></div>`);
        if (sets.similar.length) sections.push(`<div class="journey-section"><h3>Похожие товары</h3><p>Близкие варианты по категории и цене.</p><div class="journey-row">${sets.similar.map(recommendationCard).join("")}</div></div>`);
        if (sections.length) {
          const recommendations = document.createElement("section");
          recommendations.className = "journey-recommendations";
          recommendations.innerHTML = sections.join("");
          modal.querySelector(".modal-grid")?.appendChild(recommendations);
        }
      }
    }

    function cartEntries() {
      try {
        return Object.entries(cart).map(([id, qty]) => ({ product: productById(id), qty: Number(qty) || 0 })).filter(entry => entry.product && entry.qty > 0);
      } catch (error) {
        return [];
      }
    }

    function enhanceCart() {
      const drawer = document.getElementById("cartDrawer");
      if (!drawer?.classList.contains("show")) return;
      drawer.querySelector(".cart-journey")?.remove();
      const entries = cartEntries();
      if (!entries.length) return;
      const inCart = new Set(entries.map(entry => Number(entry.product.id)));
      const categories = new Set(entries.map(entry => entry.product.category));
      const collections = new Set(entries.map(entry => entry.product.collection).filter(Boolean));
      const candidates = PRODUCTS
        .filter(product => !inCart.has(Number(product.id)))
        .map(product => ({
          product,
          score: (collections.has(product.collection) ? 0 : 3) + (categories.has(product.category) ? 0 : 2)
        }))
        .sort((a, b) => a.score - b.score)
        .slice(0, 3)
        .map(entry => entry.product);
      if (!candidates.length) return;
      const block = document.createElement("section");
      block.className = "cart-journey";
      block.innerHTML = `<h3>Дополнить заказ</h3><div class="cart-journey-list">${candidates.map(product => {
        const image = imageFor(product);
        return `<div class="cart-journey-item">${image ? `<img src="${image}" alt="" loading="lazy" decoding="async">` : ""}<div><div class="cart-journey-name">${esc(product.name)}</div><div class="cart-journey-price">${formatPrice(sellingPrice(product))}</div></div><button type="button" class="cart-journey-add" data-journey-add="${product.id}" aria-label="Добавить ${esc(product.name)}">+</button></div>`;
      }).join("")}</div>`;
      drawer.querySelector(".drawer-foot")?.before(block);
    }

    function prioritizeVisibleImages() {
      const images = [...document.querySelectorAll("#grid .js-product-image")].slice(0, 4);
      images.forEach((image, index) => {
        image.fetchPriority = index === 0 ? "high" : "auto";
        image.decoding = "async";
      });
    }

    document.addEventListener("click", event => {
      const fast = event.target.closest("[data-fast-buy]");
      if (fast) {
        const id = Number(fast.dataset.fastBuy);
        addToCart(id);
        closeAll();
        openCart();
        setTimeout(() => document.getElementById("checkoutOrder")?.click(), 80);
        return;
      }
      const open = event.target.closest("[data-journey-open]");
      if (open) {
        openProduct(open.dataset.journeyOpen);
        setTimeout(enhanceModal, 0);
        return;
      }
      const add = event.target.closest("[data-journey-add]");
      if (add) {
        addToCart(add.dataset.journeyAdd);
        setTimeout(enhanceCart, 0);
      }
    });

    const observer = new MutationObserver(() => {
      enhanceModal();
      enhanceCart();
      prioritizeVisibleImages();
    });
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });

    addStyles();
    prioritizeVisibleImages();
  }

  document.write = function patchedWrite(...parts) {
    let html = parts.join("");
    if (typeof html === "string" && html.includes("</body>")) {
      const runtime = `<script>(${salesJourneyRuntime.toString()})();<\/script>`;
      html = html.replace("</body>", `${runtime}</body>`);
      return originalWrite(html);
    }
    return originalWrite(...parts);
  };
})();
