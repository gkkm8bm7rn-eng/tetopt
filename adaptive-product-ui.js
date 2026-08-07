(() => {
  "use strict";

  const originalWrite = document.write.bind(document);

  function adaptiveProductUiRuntime() {
    "use strict";
    if (window.__FORMA_ADAPTIVE_PRODUCT_UI_V1__) return;
    window.__FORMA_ADAPTIVE_PRODUCT_UI_V1__ = true;

    const STYLE_ID = "forma-adaptive-product-ui-style";
    let scheduled = false;

    function ensureStyle() {
      let style = document.getElementById(STYLE_ID);
      if (!style) {
        style = document.createElement("style");
        style.id = STYLE_ID;
      }

      const css = `
        #modal{
          --forma-modal-inline-gap:clamp(6px,2vw,18px);
          --forma-modal-radius:clamp(18px,5vw,30px);
          max-inline-size:calc(100vw - (var(--forma-modal-inline-gap) * 2))!important;
        }

        #modal .modal-grid,
        #modal .gallery-panel,
        #modal .gallery-main,
        #modal .modal-content,
        #modal .modal-price-stack,
        #modal .journey-actions,
        #modal .journey-benefits,
        #modal .journey-recommendations{
          inline-size:100%!important;
          min-inline-size:0!important;
          max-inline-size:100%!important;
        }

        #modal .modal-content{
          container-type:inline-size;
        }

        #modal .modal-content h2{
          max-inline-size:100%!important;
          font-size:clamp(27px,8cqw,48px)!important;
          line-height:1.03!important;
          overflow-wrap:anywhere!important;
          word-break:normal!important;
          text-wrap:balance!important;
        }

        #modal .modal-specs,
        #modal .category,
        #modal .modal-price-stack,
        #modal .wholesale-price,
        #modal .retail-price{
          max-inline-size:100%!important;
          overflow-wrap:anywhere!important;
        }

        #modal .gallery-main img,
        #modal .gallery-thumb img,
        #modal .journey-product img{
          max-inline-size:100%!important;
          block-size:100%!important;
          object-fit:contain!important;
        }

        #modal .favorite-toggle.modal-favorite{
          position:static!important;
          inset:auto!important;
          display:inline-flex!important;
          align-items:center!important;
          justify-content:center!important;
          gap:9px!important;
          inline-size:auto!important;
          min-inline-size:0!important;
          max-inline-size:100%!important;
          block-size:auto!important;
          min-block-size:46px!important;
          margin:2px 0 16px!important;
          padding:11px 17px!important;
          border:1px solid var(--line,#ded8cc)!important;
          border-radius:999px!important;
          background:var(--surface,#fff)!important;
          box-shadow:none!important;
          color:var(--ink,#201f1b)!important;
          font-size:15px!important;
          font-weight:800!important;
          line-height:1.2!important;
          white-space:nowrap!important;
          transform:none!important;
        }

        #modal .favorite-toggle.modal-favorite.active{
          background:var(--ink,#201f1b)!important;
          border-color:var(--ink,#201f1b)!important;
          color:#fff!important;
        }

        #modal .journey-actions{
          align-items:stretch!important;
        }

        #modal .journey-actions .btn,
        #modal .modal-content>.btn.btn-primary{
          min-inline-size:0!important;
          max-inline-size:100%!important;
          overflow-wrap:anywhere!important;
          text-wrap:balance!important;
        }

        #modal .journey-benefits{
          grid-template-columns:repeat(2,minmax(0,1fr))!important;
        }

        @media(max-width:700px){
          #modal{
            inline-size:auto!important;
            max-inline-size:none!important;
            border-radius:var(--forma-modal-radius)!important;
          }

          #modal .gallery-main{
            block-size:clamp(230px,44dvh,430px)!important;
            min-block-size:0!important;
            max-block-size:50dvh!important;
          }

          #modal .modal-content{
            padding-inline:clamp(14px,4.5vw,24px)!important;
          }

          #modal .modal-content h2{
            font-size:clamp(27px,8.2cqw,40px)!important;
          }

          #modal .favorite-toggle.modal-favorite{
            inline-size:fit-content!important;
            max-inline-size:100%!important;
            min-block-size:48px!important;
          }

          #modal .journey-actions,
          #modal.show .journey-actions{
            position:static!important;
            inset:auto!important;
            grid-template-columns:minmax(0,1fr)!important;
            padding:0!important;
            box-shadow:none!important;
            background:transparent!important;
          }

          #modal .journey-benefits{
            grid-template-columns:minmax(0,1fr)!important;
          }
        }

        @media(max-width:420px){
          #modal .favorite-toggle.modal-favorite{
            inline-size:100%!important;
            white-space:normal!important;
          }

          #modal .modal-content h2{
            font-size:clamp(25px,8.5cqw,35px)!important;
          }

          #modal .modal-price-stack .wholesale-price{
            font-size:clamp(30px,10cqw,40px)!important;
          }
        }

        @media(max-width:340px){
          #modal .gallery-panel{padding:8px!important}
          #modal .gallery-main{block-size:clamp(205px,40dvh,300px)!important}
          #modal .modal-content{padding-inline:12px!important}
          #modal .modal-content h2{font-size:clamp(23px,8.6cqw,31px)!important}
          #modal .journey-actions .btn{font-size:15px!important;padding-inline:12px!important}
        }

        @media(max-height:620px) and (max-width:900px){
          #modal .gallery-main{
            block-size:clamp(180px,38dvh,270px)!important;
            max-block-size:42dvh!important;
          }
          #modal .gallery-thumbs{min-block-size:48px!important}
          #modal .gallery-thumb{inline-size:48px!important;block-size:48px!important;flex-basis:48px!important}
          #modal .modal-content{padding-block:14px calc(18px + env(safe-area-inset-bottom))!important}
        }

        @media(min-width:701px) and (max-width:1050px){
          #modal{width:min(900px,calc(100vw - 28px))!important}
          #modal .modal-grid{grid-template-columns:minmax(0,.95fr) minmax(0,1.05fr)!important}
          #modal .modal-content{padding:clamp(22px,3vw,32px)!important}
          #modal .modal-content h2{font-size:clamp(29px,5cqw,40px)!important}
        }

        @media(min-width:1051px){
          #modal{width:min(980px,calc(100vw - 48px))!important}
          #modal .modal-grid{grid-template-columns:minmax(0,1fr) minmax(0,1fr)!important}
        }

        @media(prefers-reduced-motion:reduce){
          #modal,#modal *{scroll-behavior:auto!important;transition-duration:.01ms!important}
        }
      `;
      if (style.textContent !== css) style.textContent = css;

      if (!style.parentNode) document.head.appendChild(style);
    }

    function updateVisualViewport() {
      const viewport = window.visualViewport;
      const height = Math.round(viewport?.height || window.innerHeight);
      const width = Math.round(viewport?.width || window.innerWidth);
      const root = document.documentElement;
      const heightValue = `${height}px`;
      const widthValue = `${width}px`;
      if (root.style.getPropertyValue("--forma-visual-viewport-height") !== heightValue) {
        root.style.setProperty("--forma-visual-viewport-height", heightValue);
      }
      if (root.style.getPropertyValue("--forma-visual-viewport-width") !== widthValue) {
        root.style.setProperty("--forma-visual-viewport-width", widthValue);
      }
    }

    function polishModal() {
      scheduled = false;
      ensureStyle();
      updateVisualViewport();

      const modal = document.getElementById("modal");
      if (!modal?.classList.contains("show")) return;

      const content = modal.querySelector(".modal-content");
      const addButton = content?.querySelector(".journey-actions .btn.btn-primary:not(.journey-fast), :scope>.btn.btn-primary");
      if (addButton && addButton.textContent.trim() !== "Добавить в корзину") {
        addButton.textContent = "Добавить в корзину";
        addButton.setAttribute("aria-label", "Добавить товар в корзину");
      }

      modal.querySelectorAll(".journey-benefit").forEach(item => {
        const text = String(item.textContent || "").toLowerCase();
        if (text.includes("контакт") && text.includes("браузер")) item.remove();
      });

      const benefits = modal.querySelector(".journey-benefits");
      if (benefits && !benefits.children.length) benefits.remove();

      const favorite = modal.querySelector(".favorite-toggle.modal-favorite");
      if (favorite) {
        favorite.setAttribute("data-adaptive-favorite", "true");
        favorite.title = favorite.getAttribute("aria-label") || "Избранное";
      }

      window.__FORMA_PRODUCT_UI_AUDIT__ = {
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        modalWidth: modal.getBoundingClientRect().width,
        addButtonText: addButton?.textContent.trim() || "",
        benefitCount: modal.querySelectorAll(".journey-benefit").length,
        favoriteWidth: favorite?.getBoundingClientRect().width || 0
      };
    }

    function schedule() {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(polishModal);
    }

    new MutationObserver(schedule).observe(document.documentElement, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["class", "style", "aria-pressed"]
    });

    window.addEventListener("resize", schedule, { passive: true });
    window.addEventListener("orientationchange", () => setTimeout(schedule, 140), { passive: true });
    window.addEventListener("pageshow", schedule, { passive: true });
    window.addEventListener("forma:catalog-ready", schedule, { passive: true });
    window.visualViewport?.addEventListener("resize", schedule, { passive: true });
    window.visualViewport?.addEventListener("scroll", schedule, { passive: true });
    document.addEventListener("DOMContentLoaded", schedule, { once: true });
    schedule();
  }

  if (document.getElementById("modal")) adaptiveProductUiRuntime();

  document.write = function patchedWrite(...parts) {
    let html = parts.join("");
    if (typeof html === "string" && html.includes("</body>")) {
      html = html.replace("</body>", `<script>(${adaptiveProductUiRuntime.toString()})();<\/script></body>`);
    }
    return originalWrite(html);
  };
})();
