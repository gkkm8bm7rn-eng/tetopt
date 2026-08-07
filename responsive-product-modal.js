(() => {
  "use strict";

  const originalWrite = document.write.bind(document);

  function responsiveProductModalRuntime() {
    "use strict";
    if (window.__FORMA_RESPONSIVE_PRODUCT_MODAL_V1__) return;
    window.__FORMA_RESPONSIVE_PRODUCT_MODAL_V1__ = true;

    const STYLE_ID = "forma-responsive-product-modal-style";
    let scheduled = false;

    function ensureStyle() {
      let style = document.getElementById(STYLE_ID);
      if (!style) {
        style = document.createElement("style");
        style.id = STYLE_ID;
      }

      const css = `
        #modal,
        #modal *{
          box-sizing:border-box;
        }

        #modal{
          overscroll-behavior:contain;
          -webkit-overflow-scrolling:touch;
        }

        #modal .modal-grid,
        #modal .gallery-panel,
        #modal .gallery-main,
        #modal .modal-content,
        #modal .journey-actions,
        #modal .journey-benefits,
        #modal .journey-recommendations{
          min-width:0!important;
          max-width:100%!important;
        }

        #modal .modal-content h2,
        #modal .modal-content h3,
        #modal .modal-specs,
        #modal .category,
        #modal .wholesale-label,
        #modal .retail-price,
        #modal .wholesale-price{
          max-width:100%!important;
          overflow-wrap:anywhere!important;
          word-break:normal!important;
        }

        #modal .modal-price-stack{
          display:grid!important;
          grid-template-columns:minmax(0,1fr)!important;
          justify-items:start!important;
          align-items:start!important;
          width:100%!important;
          min-width:0!important;
          max-width:100%!important;
        }

        #modal .modal-price-stack .wholesale-price{
          white-space:normal!important;
        }

        @media(max-width:700px){
          html.forma-product-modal-open,
          body.forma-product-modal-open{
            overflow:hidden!important;
            overscroll-behavior:none!important;
          }

          #modal{
            position:fixed!important;
            inset:max(8px,env(safe-area-inset-top)) 8px max(8px,env(safe-area-inset-bottom)) 8px!important;
            left:8px!important;
            right:8px!important;
            top:max(8px,env(safe-area-inset-top))!important;
            bottom:max(8px,env(safe-area-inset-bottom))!important;
            width:auto!important;
            max-width:none!important;
            height:auto!important;
            max-height:none!important;
            margin:0!important;
            padding:0!important;
            transform:none!important;
            border-radius:24px!important;
            overflow:hidden!important;
            background:var(--surface,#fff)!important;
            display:block!important;
            contain:layout paint!important;
          }

          #modal.show{
            transform:none!important;
          }

          #modal .modal-grid{
            display:flex!important;
            flex-direction:column!important;
            width:100%!important;
            height:100%!important;
            min-height:0!important;
            overflow-x:hidden!important;
            overflow-y:auto!important;
            overscroll-behavior:contain!important;
            -webkit-overflow-scrolling:touch!important;
            background:var(--surface,#fff)!important;
          }

          #modal .gallery-panel{
            flex:0 0 auto!important;
            width:100%!important;
            padding:12px!important;
            gap:10px!important;
            overflow:hidden!important;
          }

          #modal .gallery-main{
            width:100%!important;
            min-height:0!important;
            height:clamp(250px,48dvh,430px)!important;
            max-height:52dvh!important;
            aspect-ratio:auto!important;
            border-radius:18px!important;
            overflow:hidden!important;
          }

          #modal .gallery-main img{
            width:100%!important;
            height:100%!important;
            max-width:100%!important;
            max-height:100%!important;
            padding:12px!important;
            object-fit:contain!important;
          }

          #modal .gallery-thumbs{
            width:100%!important;
            min-height:58px!important;
            gap:8px!important;
            overflow-x:auto!important;
            overflow-y:hidden!important;
            padding:0 0 2px!important;
            scroll-snap-type:x proximity!important;
          }

          #modal .gallery-thumb{
            flex:0 0 58px!important;
            width:58px!important;
            height:58px!important;
            border-radius:12px!important;
            scroll-snap-align:start!important;
          }

          #modal .gallery-nav{
            width:40px!important;
            height:40px!important;
            font-size:24px!important;
          }

          #modal .gallery-prev{left:10px!important}
          #modal .gallery-next{right:10px!important}

          #modal .modal-content{
            flex:0 0 auto!important;
            width:100%!important;
            padding:22px 18px calc(24px + env(safe-area-inset-bottom))!important;
            overflow:visible!important;
          }

          #modal .modal-content h2{
            width:100%!important;
            margin:10px 0 14px!important;
            font-size:clamp(28px,8vw,42px)!important;
            line-height:1.04!important;
            letter-spacing:-.025em!important;
            white-space:normal!important;
          }

          #modal .category{
            font-size:11px!important;
            line-height:1.35!important;
            letter-spacing:.11em!important;
          }

          #modal .modal-specs{
            font-size:14px!important;
            line-height:1.5!important;
          }

          #modal .modal-price-stack{
            margin:16px 0 18px!important;
            gap:3px!important;
          }

          #modal .modal-price-stack .wholesale-label{
            font-size:10px!important;
            line-height:1.3!important;
          }

          #modal .modal-price-stack .retail-price{
            display:block!important;
            font-size:14px!important;
            line-height:1.35!important;
          }

          #modal .modal-price-stack .wholesale-price{
            display:block!important;
            width:100%!important;
            margin-top:4px!important;
            font-size:clamp(32px,10vw,46px)!important;
            line-height:1!important;
          }

          #modal .journey-actions,
          #modal.show .journey-actions{
            position:static!important;
            inset:auto!important;
            display:grid!important;
            grid-template-columns:minmax(0,1fr)!important;
            width:100%!important;
            margin:18px 0 0!important;
            padding:0!important;
            gap:10px!important;
            background:transparent!important;
            box-shadow:none!important;
            transform:none!important;
          }

          #modal .journey-actions .btn,
          #modal .modal-content>.btn{
            position:static!important;
            width:100%!important;
            max-width:100%!important;
            min-height:54px!important;
            margin:0!important;
            padding:14px 16px!important;
            border-radius:999px!important;
            white-space:normal!important;
            text-align:center!important;
            line-height:1.2!important;
          }

          #modal .journey-benefits{
            display:grid!important;
            grid-template-columns:minmax(0,1fr)!important;
            gap:8px!important;
            margin-top:12px!important;
          }

          #modal .journey-recommendations{
            flex:0 0 auto!important;
            width:100%!important;
            padding:20px 16px calc(24px + env(safe-area-inset-bottom))!important;
            overflow:hidden!important;
          }

          #modal .journey-row{
            width:100%!important;
            max-width:100%!important;
            overflow-x:auto!important;
            overflow-y:hidden!important;
          }

          #modal .journey-product{
            min-width:0!important;
          }

          #modal .close,
          #modal [data-close-modal],
          #modal [aria-label*="закры" i]{
            position:sticky!important;
            top:8px!important;
            margin-left:auto!important;
            z-index:30!important;
          }
        }

        @media(max-width:390px){
          #modal{
            inset:max(6px,env(safe-area-inset-top)) 6px max(6px,env(safe-area-inset-bottom)) 6px!important;
            left:6px!important;
            right:6px!important;
            top:max(6px,env(safe-area-inset-top))!important;
            bottom:max(6px,env(safe-area-inset-bottom))!important;
            border-radius:20px!important;
          }

          #modal .gallery-panel{padding:9px!important}
          #modal .gallery-main{height:clamp(230px,45dvh,370px)!important}
          #modal .modal-content{padding:18px 14px calc(20px + env(safe-area-inset-bottom))!important}
          #modal .modal-content h2{font-size:clamp(26px,8.4vw,36px)!important}
          #modal .modal-price-stack .wholesale-price{font-size:clamp(30px,10.5vw,40px)!important}
        }

        @media(max-height:700px) and (max-width:700px){
          #modal .gallery-main{height:clamp(210px,40dvh,300px)!important}
          #modal .gallery-thumb{flex-basis:52px!important;width:52px!important;height:52px!important}
          #modal .modal-content{padding-top:16px!important}
        }
      `;
      if (style.textContent !== css) style.textContent = css;

      if (!style.parentNode) document.head.appendChild(style);
    }

    function syncState() {
      scheduled = false;
      ensureStyle();
      const modal = document.getElementById("modal");
      const open = Boolean(modal?.classList.contains("show"));
      document.documentElement.classList.toggle("forma-product-modal-open", open);
      document.body?.classList.toggle("forma-product-modal-open", open);
      if (modal) {
        modal.setAttribute("aria-modal", "true");
        modal.setAttribute("role", "dialog");
        if (modal.style.maxWidth) modal.style.removeProperty("max-width");
      }
      window.__FORMA_PRODUCT_MODAL_LAYOUT__ = {
        open,
        width: modal?.getBoundingClientRect().width || 0,
        viewportWidth: window.innerWidth
      };
    }

    function schedule() {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(syncState);
    }

    new MutationObserver(schedule).observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "style"]
    });
    window.addEventListener("resize", schedule, { passive: true });
    window.addEventListener("orientationchange", () => setTimeout(schedule, 120), { passive: true });
    window.addEventListener("pageshow", schedule, { passive: true });
    window.addEventListener("forma:catalog-ready", schedule, { passive: true });
    document.addEventListener("DOMContentLoaded", schedule, { once: true });
    schedule();
  }

  if (document.getElementById("modal")) responsiveProductModalRuntime();

  document.write = function patchedWrite(...parts) {
    let html = parts.join("");
    if (typeof html === "string" && html.includes("</body>")) {
      html = html.replace("</body>", `<script>(${responsiveProductModalRuntime.toString()})();<\/script></body>`);
    }
    return originalWrite(html);
  };
})();
