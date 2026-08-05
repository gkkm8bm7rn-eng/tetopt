(() => {
  "use strict";

  const originalWrite = document.write.bind(document);

  function catalogScrollTouchRuntime() {
    "use strict";
    if (window.__FORMA_SCROLL_TOUCH_FIX_V1__) return;
    window.__FORMA_SCROLL_TOUCH_FIX_V1__ = true;

    const STYLE_ID = "forma-scroll-touch-fix-style";
    const UNLOCK_CLASS = "forma-page-scroll-unlocked";
    const LOCK_CLASSES = [
      "forma-product-modal-open",
      "modal-open",
      "no-scroll",
      "scroll-locked",
      "overflow-hidden"
    ];
    let scheduled = false;
    let wheelFallbackTimer = 0;

    function ensureStyle() {
      let style = document.getElementById(STYLE_ID);
      if (!style) {
        style = document.createElement("style");
        style.id = STYLE_ID;
        document.head.appendChild(style);
      }

      style.textContent = `
        html.${UNLOCK_CLASS},
        body.${UNLOCK_CLASS}{
          overflow-x:hidden!important;
          overflow-y:auto!important;
          max-height:none!important;
          overscroll-behavior-y:auto!important;
          touch-action:pan-y pinch-zoom!important;
          -webkit-overflow-scrolling:touch!important;
        }
        body.${UNLOCK_CLASS}{
          min-height:100%!important;
        }
        body.${UNLOCK_CLASS} .announcement,
        body.${UNLOCK_CLASS} header,
        body.${UNLOCK_CLASS} .hero,
        body.${UNLOCK_CLASS} .hero-main,
        body.${UNLOCK_CLASS} main,
        body.${UNLOCK_CLASS} #catalog,
        body.${UNLOCK_CLASS} #catalogSection,
        body.${UNLOCK_CLASS} #catalogControls,
        body.${UNLOCK_CLASS} #grid{
          touch-action:pan-y pinch-zoom!important;
        }
        #modal.show,
        #modal.show .modal-grid,
        [role="dialog"][aria-modal="true"]{
          -webkit-overflow-scrolling:touch;
        }
      `;
    }

    function isVisible(element) {
      if (!(element instanceof Element)) return false;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== "none" &&
        style.visibility !== "hidden" &&
        Number(style.opacity) !== 0 &&
        rect.width > 0 && rect.height > 0;
    }

    function overlayOpen() {
      const candidates = document.querySelectorAll(
        "#modal.show,[role='dialog'][aria-modal='true'].show,.drawer.open,.drawer.show,.cart-drawer.open,.cart-drawer.show,[data-drawer].open,[data-drawer].show"
      );
      return [...candidates].some(isVisible);
    }

    function parseLockedScrollTop() {
      const top = document.body?.style.top || "";
      const match = top.match(/^(-?\d+(?:\.\d+)?)px$/);
      if (!match) return null;
      const value = Math.abs(Number(match[1]));
      return Number.isFinite(value) ? value : null;
    }

    function clearLockStyles(element) {
      if (!element) return;
      const style = element.style;
      if (style.position === "fixed") style.removeProperty("position");
      if (style.overflow === "hidden") style.removeProperty("overflow");
      if (style.overflowY === "hidden") style.removeProperty("overflow-y");
      if (style.height === "100%" || style.height === "100vh" || style.height === "100dvh") {
        style.removeProperty("height");
      }
      if (style.maxHeight === "100%" || style.maxHeight === "100vh" || style.maxHeight === "100dvh") {
        style.removeProperty("max-height");
      }
      style.removeProperty("top");
      style.removeProperty("left");
      style.removeProperty("right");
      style.removeProperty("width");
      style.removeProperty("touch-action");
      style.removeProperty("overscroll-behavior");
    }

    function releaseStaleScrollLock() {
      scheduled = false;
      ensureStyle();

      const open = overlayOpen();
      const html = document.documentElement;
      const body = document.body;
      if (!html || !body) return;

      if (open) {
        html.classList.remove(UNLOCK_CLASS);
        body.classList.remove(UNLOCK_CLASS);
        window.__FORMA_SCROLL_TOUCH_AUDIT__ = {
          enabled: true,
          overlayOpen: true,
          pageUnlocked: false,
          passiveTouchListeners: true,
          wheelFallback: true
        };
        return;
      }

      const lockedScrollTop = parseLockedScrollTop();
      LOCK_CLASSES.forEach(className => {
        html.classList.remove(className);
        body.classList.remove(className);
      });
      clearLockStyles(html);
      clearLockStyles(body);
      html.classList.add(UNLOCK_CLASS);
      body.classList.add(UNLOCK_CLASS);

      if (lockedScrollTop !== null && Math.abs(window.scrollY - lockedScrollTop) > 2) {
        window.scrollTo(0, lockedScrollTop);
      }

      window.__FORMA_SCROLL_TOUCH_AUDIT__ = {
        enabled: true,
        overlayOpen: false,
        pageUnlocked: true,
        passiveTouchListeners: true,
        wheelFallback: true,
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight
        }
      };
    }

    function schedule() {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(releaseStaleScrollLock);
    }

    function canScrollElement(element, deltaY) {
      let node = element instanceof Element ? element : null;
      while (node && node !== document.body && node !== document.documentElement) {
        const style = getComputedStyle(node);
        if (/(auto|scroll)/.test(style.overflowY) && node.scrollHeight > node.clientHeight + 2) {
          if (deltaY > 0 && node.scrollTop + node.clientHeight < node.scrollHeight - 1) return true;
          if (deltaY < 0 && node.scrollTop > 1) return true;
        }
        node = node.parentElement;
      }
      return false;
    }

    function onWheel(event) {
      schedule();
      if (overlayOpen() || !event.deltaY || canScrollElement(event.target, event.deltaY)) return;

      const before = window.scrollY;
      const delta = event.deltaMode === 1 ? event.deltaY * 18 : event.deltaY;
      clearTimeout(wheelFallbackTimer);
      wheelFallbackTimer = window.setTimeout(() => {
        if (overlayOpen()) return;
        if (Math.abs(window.scrollY - before) > 1) return;
        window.scrollBy({ top: delta, left: 0, behavior: "auto" });
      }, 34);
    }

    function onTouchActivity() {
      schedule();
    }

    new MutationObserver(schedule).observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "style", "aria-hidden"]
    });

    document.addEventListener("touchstart", onTouchActivity, { passive: true, capture: true });
    document.addEventListener("touchmove", onTouchActivity, { passive: true, capture: true });
    document.addEventListener("touchend", onTouchActivity, { passive: true, capture: true });
    document.addEventListener("wheel", onWheel, { passive: true, capture: true });
    window.addEventListener("resize", schedule, { passive: true });
    window.addEventListener("orientationchange", () => setTimeout(schedule, 120), { passive: true });
    window.addEventListener("pageshow", schedule, { passive: true });
    window.addEventListener("forma:catalog-ready", schedule, { passive: true });
    document.addEventListener("DOMContentLoaded", schedule, { once: true });
    schedule();
  }

  if (document.body) catalogScrollTouchRuntime();

  document.write = function patchedWrite(...parts) {
    let html = parts.join("");
    if (typeof html === "string" && html.includes("</body>")) {
      html = html.replace("</body>", `<script>(${catalogScrollTouchRuntime.toString()})();<\/script></body>`);
    }
    return originalWrite(html);
  };
})();
