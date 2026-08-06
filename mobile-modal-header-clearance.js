(() => {
  "use strict";

  const originalWrite = document.write.bind(document);

  function mobileModalHeaderClearanceRuntime() {
    "use strict";
    if (window.__FORMA_MOBILE_MODAL_HEADER_CLEARANCE_V1__) return;
    window.__FORMA_MOBILE_MODAL_HEADER_CLEARANCE_V1__ = true;

    const STYLE_ID = "forma-mobile-modal-header-clearance-style";
    const OFFSET_PROPERTY = "--forma-product-modal-header-offset";
    let scheduled = false;
    let resizeObserver = null;

    function isVisible(element) {
      if (!(element instanceof Element)) return false;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== "none" &&
        style.visibility !== "hidden" &&
        Number(style.opacity) !== 0 &&
        rect.width > 0 && rect.height > 0;
    }

    function ensureStyle() {
      let style = document.getElementById(STYLE_ID);
      if (!style) {
        style = document.createElement("style");
        style.id = STYLE_ID;
        document.head.appendChild(style);
      }

      style.textContent = `
        :root{${OFFSET_PROPERTY}:0px}

        @media(max-width:700px){
          html.forma-product-modal-open body #modal.show{
            top:calc(var(${OFFSET_PROPERTY},var(--forma-fixed-header-h,0px)) + 8px)!important;
            inset-block-start:calc(var(${OFFSET_PROPERTY},var(--forma-fixed-header-h,0px)) + 8px)!important;
            bottom:max(8px,env(safe-area-inset-bottom))!important;
            inset-block-end:max(8px,env(safe-area-inset-bottom))!important;
            height:auto!important;
            max-height:none!important;
          }
        }

        @media(max-width:390px){
          html.forma-product-modal-open body #modal.show{
            top:calc(var(${OFFSET_PROPERTY},var(--forma-fixed-header-h,0px)) + 6px)!important;
            inset-block-start:calc(var(${OFFSET_PROPERTY},var(--forma-fixed-header-h,0px)) + 6px)!important;
            bottom:max(6px,env(safe-area-inset-bottom))!important;
            inset-block-end:max(6px,env(safe-area-inset-bottom))!important;
          }
        }
      `;
    }

    function fixedHeaderBottom() {
      let bottom = 0;
      const rootStyle = getComputedStyle(document.documentElement);
      const declaredHeight = Number.parseFloat(rootStyle.getPropertyValue("--forma-fixed-header-h")) || 0;
      bottom = Math.max(bottom, declaredHeight);

      document.querySelectorAll(".announcement,header,.boot-sticky").forEach(element => {
        if (!isVisible(element)) return;
        const position = getComputedStyle(element).position;
        if (position !== "fixed" && position !== "sticky") return;
        const rect = element.getBoundingClientRect();
        if (rect.top > 4 || rect.bottom <= 0) return;
        bottom = Math.max(bottom, rect.bottom);
      });

      return Math.max(0, Math.ceil(bottom));
    }

    function observeHeaderSize() {
      if (!("ResizeObserver" in window)) return;
      const targets = [
        document.querySelector(".announcement"),
        document.querySelector("header"),
        document.querySelector(".boot-sticky")
      ].filter(Boolean);

      if (!targets.length) return;
      resizeObserver?.disconnect();
      resizeObserver = new ResizeObserver(schedule);
      targets.forEach(target => resizeObserver.observe(target));
    }

    function synchronize() {
      scheduled = false;
      ensureStyle();
      observeHeaderSize();

      const offset = fixedHeaderBottom();
      document.documentElement.style.setProperty(OFFSET_PROPERTY, `${offset}px`);

      const modal = document.getElementById("modal");
      const open = Boolean(modal?.classList.contains("show"));
      const rect = open ? modal.getBoundingClientRect() : null;

      window.__FORMA_MOBILE_MODAL_HEADER_CLEARANCE_AUDIT__ = {
        enabled: true,
        version: 1,
        open,
        headerBottom: offset,
        modalTop: rect ? Math.round(rect.top) : null,
        modalBottom: rect ? Math.round(rect.bottom) : null,
        viewportHeight: Math.round(window.visualViewport?.height || window.innerHeight),
        clearsFixedHeader: rect ? rect.top >= offset : true
      };
    }

    function schedule() {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(synchronize);
    }

    new MutationObserver(schedule).observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "style", "aria-hidden"]
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

  if (document.getElementById("modal") || document.querySelector("header,.announcement")) {
    mobileModalHeaderClearanceRuntime();
  }

  document.write = function patchedWrite(...parts) {
    let html = parts.join("");
    if (typeof html === "string" && html.includes("</body>")) {
      html = html.replace("</body>", `<script>(${mobileModalHeaderClearanceRuntime.toString()})();<\/script></body>`);
    }
    return originalWrite(html);
  };
})();
