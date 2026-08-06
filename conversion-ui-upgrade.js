(() => {
  "use strict";

  const originalWrite = document.write.bind(document);

  function conversionUiUpgradeRuntime() {
    "use strict";
    if (window.__FORMA_CONVERSION_UI_UPGRADE_V1__) return;
    window.__FORMA_CONVERSION_UI_UPGRADE_V1__ = true;

    const STYLE_ID = "forma-conversion-ui-upgrade-style";
    const BAR_ID = "formaStickyPurchase";
    let scheduled = false;
    let restoreTimer = 0;

    function ensureStyle() {
      let style = document.getElementById(STYLE_ID);
      if (!style) {
        style = document.createElement("style");
        style.id = STYLE_ID;
        document.head.appendChild(style);
      }

      const css = `
        #modal .journey-benefits{display:none!important}

        .forma-trust-block{
          display:grid;
          grid-template-columns:repeat(2,minmax(0,1fr));
          gap:8px;
          margin:14px 0 16px;
        }
        .forma-trust-item{
          min-width:0;
          padding:11px 12px;
          border:1px solid var(--line,#ded8cc);
          border-radius:13px;
          background:var(--surface-2,#eee9df);
        }
        .forma-trust-item strong{
          display:block;
          margin:0 0 3px;
          color:var(--ink,#201f1b);
          font-size:12px;
          line-height:1.25;
        }
        .forma-trust-item span{
          display:block;
          color:var(--muted,#706d65);
          font-size:11px;
          line-height:1.35;
        }

        .forma-sticky-purchase{
          display:none;
          position:fixed;
          left:14px;
          right:14px;
          bottom:max(10px,env(safe-area-inset-bottom));
          z-index:190;
          align-items:center;
          gap:12px;
          min-height:66px;
          padding:9px 10px 9px 14px;
          border:1px solid rgba(222,216,204,.95);
          border-radius:20px;
          background:rgba(255,255,255,.96);
          -webkit-backdrop-filter:blur(18px);
          backdrop-filter:blur(18px);
          box-shadow:0 14px 42px rgba(32,31,27,.24);
        }
        .forma-sticky-purchase-price{
          flex:1 1 auto;
          min-width:0;
        }
        .forma-sticky-purchase-price span{
          display:block;
          color:var(--accent,#5d6b4f);
          font-size:9px;
          font-weight:850;
          letter-spacing:.09em;
          line-height:1.2;
          text-transform:uppercase;
        }
        .forma-sticky-purchase-price strong{
          display:block;
          margin-top:2px;
          color:var(--ink,#201f1b);
          font-size:22px;
          font-weight:900;
          line-height:1;
          white-space:nowrap;
        }
        .forma-sticky-purchase button{
          flex:0 0 auto;
          min-height:48px;
          max-width:62%;
          padding:11px 18px;
          border:0;
          border-radius:999px;
          background:var(--ink,#201f1b);
          color:#fff;
          font:inherit;
          font-size:14px;
          font-weight:850;
          line-height:1.15;
          text-align:center;
          white-space:normal;
        }
        .forma-sticky-purchase button:active{transform:translateY(1px)}
        .forma-sticky-purchase button[disabled]{opacity:.7}

        @media(max-width:760px){
          .announcement{
            padding:6px 12px!important;
            font-size:10.5px!important;
            line-height:1.3!important;
          }
          header .container.nav{
            width:calc(100% - 16px)!important;
            min-height:58px!important;
            height:auto!important;
            padding:6px 0!important;
            gap:7px!important;
          }
          header .logo{
            flex:0 1 auto!important;
            min-width:0!important;
            font-size:17px!important;
            letter-spacing:.075em!important;
          }
          header .icon-btn{
            min-height:42px!important;
            padding:7px 9px!important;
            gap:5px!important;
            font-size:12px!important;
            white-space:nowrap!important;
          }
          header .badge{
            min-width:22px!important;
            height:22px!important;
            padding:0 6px!important;
            font-size:11px!important;
          }

          html.forma-header-compact .announcement,
          html.forma-product-modal-open .announcement{
            display:none!important;
          }
          html.forma-header-compact header,
          html.forma-product-modal-open header{
            top:0!important;
          }
          html.forma-header-compact header .container.nav,
          html.forma-product-modal-open header .container.nav{
            min-height:50px!important;
            padding:4px 0!important;
          }
          html.forma-header-compact header .logo,
          html.forma-product-modal-open header .logo{
            font-size:15px!important;
            letter-spacing:.065em!important;
          }
          html.forma-header-compact header .icon-btn,
          html.forma-product-modal-open header .icon-btn{
            min-height:40px!important;
            padding:6px 9px!important;
          }
          html.forma-header-compact header .favorites-nav>span:not(.badge),
          html.forma-product-modal-open header .favorites-nav>span:not(.badge){display:none!important}
          html.forma-header-compact header .favorites-nav,
          html.forma-product-modal-open header .favorites-nav{
            font-size:20px!important;
          }
          html.forma-header-compact header #openCart,
          html.forma-product-modal-open header #openCart{
            font-size:0!important;
          }
          html.forma-header-compact header #openCart:before,
          html.forma-product-modal-open header #openCart:before{
            content:"Корзина";
            font-size:11px;
            font-weight:800;
          }

          html.forma-product-modal-open .forma-sticky-purchase{display:flex}
          html.forma-product-modal-open #modal .modal-grid{
            padding-bottom:calc(88px + env(safe-area-inset-bottom))!important;
          }
          #modal .forma-trust-block{grid-template-columns:minmax(0,1fr)!important}
        }

        @media(max-width:390px){
          header .container.nav{width:calc(100% - 12px)!important;gap:5px!important}
          header .logo{font-size:15.5px!important}
          header .icon-btn{padding:6px 8px!important}
          .forma-sticky-purchase{
            left:10px;
            right:10px;
            gap:9px;
            min-height:62px;
            padding:8px 8px 8px 12px;
            border-radius:18px;
          }
          .forma-sticky-purchase-price strong{font-size:20px}
          .forma-sticky-purchase button{
            min-height:46px;
            max-width:60%;
            padding:10px 14px;
            font-size:13px;
          }
        }

        @media(min-width:761px){
          #modal .forma-trust-block{max-width:560px}
        }

        @media(prefers-reduced-motion:reduce){
          .forma-sticky-purchase button{transition:none!important}
        }
      `;
      if (style.textContent !== css) style.textContent = css;
    }

    function currentProduct() {
      let id = null;
      try { id = Number(activeGallery?.productId); } catch {}
      if (!Number.isFinite(id)) return null;
      try {
        if (typeof productById === "function") return productById(id);
      } catch {}
      try {
        if (typeof PRODUCTS !== "undefined" && Array.isArray(PRODUCTS)) {
          return PRODUCTS.find(product => Number(product.id) === id) || null;
        }
      } catch {}
      return null;
    }

    function priceText(product) {
      try {
        if (product && typeof sellingPrice === "function" && typeof formatPrice === "function") {
          return formatPrice(sellingPrice(product));
        }
      } catch {}
      return document.querySelector("#modal .wholesale-price")?.textContent?.trim() || "";
    }

    function ensureTrustBlock() {
      const modal = document.getElementById("modal");
      if (!modal?.classList.contains("show")) return;
      const content = modal.querySelector(".modal-content");
      if (!content) return;

      let block = content.querySelector("[data-forma-trust-block]");
      if (!block) {
        block = document.createElement("section");
        block.className = "forma-trust-block";
        block.dataset.formaTrustBlock = "true";
        block.setAttribute("aria-label", "Условия заказа");
        block.innerHTML = `
          <div class="forma-trust-item"><strong>✓ Наличие</strong><span>Менеджер подтвердит при заказе</span></div>
          <div class="forma-trust-item"><strong>✓ Без регистрации</strong><span>Контакты заполняются только при оформлении</span></div>
          <div class="forma-trust-item"><strong>✓ Удобная связь</strong><span>WhatsApp, Telegram или телефон</span></div>
          <div class="forma-trust-item"><strong>✓ Ежедневно</strong><span>Отвечаем с 10:00 до 20:00</span></div>`;

        const price = content.querySelector(".modal-price-stack");
        const specs = content.querySelector(".modal-specs,.specs");
        if (price) price.insertAdjacentElement("afterend", block);
        else if (specs) specs.insertAdjacentElement("beforebegin", block);
        else content.prepend(block);
      }
    }

    function ensureStickyBar() {
      let bar = document.getElementById(BAR_ID);
      if (!bar) {
        bar = document.createElement("div");
        bar.id = BAR_ID;
        bar.className = "forma-sticky-purchase";
        bar.setAttribute("role", "region");
        bar.setAttribute("aria-label", "Быстрое добавление товара в корзину");
        bar.innerHTML = `
          <div class="forma-sticky-purchase-price"><span>Оптовая цена</span><strong data-forma-sticky-price></strong></div>
          <button type="button" data-forma-sticky-add>Добавить в корзину</button>`;
        document.body.appendChild(bar);
      }
      return bar;
    }

    function updateStickyBar() {
      const bar = ensureStickyBar();
      const modal = document.getElementById("modal");
      const product = modal?.classList.contains("show") ? currentProduct() : null;
      const id = Number(product?.id);
      const price = priceText(product);

      if (!Number.isFinite(id) || !price) {
        bar.removeAttribute("data-product-id");
        return;
      }

      bar.dataset.productId = String(id);
      bar.querySelector("[data-forma-sticky-price]").textContent = price;
      const button = bar.querySelector("[data-forma-sticky-add]");
      if (button && !button.disabled) button.textContent = "Добавить в корзину";
    }

    function addStickyProduct() {
      const bar = document.getElementById(BAR_ID);
      const id = Number(bar?.dataset.productId);
      const button = bar?.querySelector("[data-forma-sticky-add]");
      if (!Number.isFinite(id) || !button) return;

      try {
        if (typeof addToCart === "function") addToCart(id);
        else return;
      } catch (error) {
        console.error(error);
        return;
      }

      clearTimeout(restoreTimer);
      button.disabled = true;
      button.textContent = "Добавлено ✓";
      restoreTimer = window.setTimeout(() => {
        button.disabled = false;
        button.textContent = "Добавить в корзину";
      }, 900);
    }

    function updateHeaderMode() {
      const modalOpen = Boolean(document.getElementById("modal")?.classList.contains("show"));
      const drawerOpen = Boolean(
        document.getElementById("drawer")?.classList.contains("show") ||
        document.getElementById("favoritesDrawer")?.classList.contains("show")
      );
      const compact = modalOpen || drawerOpen || window.scrollY > 72;
      document.documentElement.classList.toggle("forma-header-compact", compact);
    }

    function refresh() {
      scheduled = false;
      ensureStyle();
      ensureTrustBlock();
      updateStickyBar();
      updateHeaderMode();

      const modal = document.getElementById("modal");
      const product = currentProduct();
      window.__FORMA_CONVERSION_UI_AUDIT__ = {
        enabled: true,
        version: 1,
        viewportWidth: window.innerWidth,
        compactHeader: document.documentElement.classList.contains("forma-header-compact"),
        modalOpen: Boolean(modal?.classList.contains("show")),
        productId: Number(product?.id) || null,
        trustBlock: Boolean(modal?.querySelector("[data-forma-trust-block]")),
        stickyPurchase: Boolean(document.getElementById(BAR_ID)?.dataset.productId)
      };
    }

    function schedule() {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(refresh);
    }

    document.addEventListener("click", event => {
      if (event.target.closest?.("[data-forma-sticky-add]")) addStickyProduct();
    });

    new MutationObserver(schedule).observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "data-product", "data-color-swatches"]
    });

    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule, { passive: true });
    window.addEventListener("orientationchange", () => setTimeout(schedule, 140), { passive: true });
    window.addEventListener("pageshow", schedule, { passive: true });
    window.addEventListener("forma:catalog-ready", schedule, { passive: true });
    window.addEventListener("forma:card-variant-changed", schedule, { passive: true });
    document.addEventListener("DOMContentLoaded", schedule, { once: true });
    schedule();
  }

  if (document.querySelector("header,#modal")) conversionUiUpgradeRuntime();

  document.write = function patchedWrite(...parts) {
    let html = parts.join("");
    if (typeof html === "string" && html.includes("</body>")) {
      html = html.replace("</body>", `<script>(${conversionUiUpgradeRuntime.toString()})();<\/script></body>`);
    }
    return originalWrite(html);
  };
})();
