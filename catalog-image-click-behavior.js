(() => {
  "use strict";

  const SWIPE_THRESHOLD = 10;
  const CLICK_BLOCK_MS = 620;
  let catalogGesture = null;
  let suppressCatalogOpenUntil = 0;

  function pointFromEvent(event, changed = false) {
    if (changed && event.changedTouches?.[0]) return event.changedTouches[0];
    return event.touches?.[0] || event;
  }

  function startCatalogGesture(event) {
    const target = event.target instanceof Element ? event.target : null;
    const visual = target?.closest("#grid .visual");
    if (!visual || target.closest("button,a,input,select,textarea,label")) return;
    if (event.pointerType === "mouse") return;
    const point = pointFromEvent(event);
    catalogGesture = {
      x: point.clientX,
      y: point.clientY,
      pointerId: event.pointerId,
      horizontal: false,
      vertical: false
    };
  }

  function moveCatalogGesture(event) {
    if (!catalogGesture) return;
    if (catalogGesture.pointerId !== undefined && event.pointerId !== undefined &&
        catalogGesture.pointerId !== event.pointerId) return;
    const point = pointFromEvent(event);
    const dx = point.clientX - catalogGesture.x;
    const dy = point.clientY - catalogGesture.y;
    if (catalogGesture.horizontal || catalogGesture.vertical) return;
    if (Math.abs(dx) < SWIPE_THRESHOLD && Math.abs(dy) < SWIPE_THRESHOLD) return;
    if (Math.abs(dx) > Math.abs(dy) * 1.15) {
      catalogGesture.horizontal = true;
      suppressCatalogOpenUntil = Date.now() + CLICK_BLOCK_MS;
    } else {
      catalogGesture.vertical = true;
    }
  }

  function finishCatalogGesture(event) {
    if (!catalogGesture) return;
    if (catalogGesture.pointerId !== undefined && event.pointerId !== undefined &&
        catalogGesture.pointerId !== event.pointerId) return;
    if (catalogGesture.horizontal) suppressCatalogOpenUntil = Date.now() + CLICK_BLOCK_MS;
    catalogGesture = null;
  }

  function cancelCatalogGesture() {
    if (catalogGesture?.horizontal) suppressCatalogOpenUntil = Date.now() + CLICK_BLOCK_MS;
    catalogGesture = null;
  }

  if ("PointerEvent" in window) {
    window.addEventListener("pointerdown", startCatalogGesture, { passive: true, capture: true });
    window.addEventListener("pointermove", moveCatalogGesture, { passive: true, capture: true });
    window.addEventListener("pointerup", finishCatalogGesture, { passive: true, capture: true });
    window.addEventListener("pointercancel", cancelCatalogGesture, { passive: true, capture: true });
  } else {
    window.addEventListener("touchstart", startCatalogGesture, { passive: true, capture: true });
    window.addEventListener("touchmove", moveCatalogGesture, { passive: true, capture: true });
    window.addEventListener("touchend", finishCatalogGesture, { passive: true, capture: true });
    window.addEventListener("touchcancel", cancelCatalogGesture, { passive: true, capture: true });
  }

  function openCatalogProductFromEvent(event) {
    const target = event.target instanceof Element ? event.target : null;
    const image = target?.closest("#grid .product-photo,#grid .js-product-image");
    if (!image) return;

    if (Date.now() < suppressCatalogOpenUntil) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      return;
    }

    const card = image.closest("[data-product]");
    const id = Number(card?.dataset.product);
    if (!Number.isFinite(id)) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    try {
      if (typeof openProduct === "function") openProduct(id);
    } catch (error) {
      console.error(error);
    }
  }

  // The window capture listener runs before document-level legacy zoom handlers.
  // It also protects users who still have the previous image-zoom.js in cache.
  window.addEventListener("click", openCatalogProductFromEvent, true);

  const originalWrite = document.write.bind(document);

  function runtime() {
    "use strict";

    function openCatalogProduct(card) {
      const id = Number(card?.dataset.product);
      if (!Number.isFinite(id)) return;
      try {
        if (typeof openProduct === "function") openProduct(id);
      } catch (error) {
        console.error(error);
      }
    }

    function shiftCatalogPhoto(control) {
      const step = Number(control?.dataset.cardPhoto || 0);
      if (!step) return;
      try {
        if (typeof shiftCardPhoto === "function") shiftCardPhoto(control, step);
      } catch (error) {
        console.error(error);
      }
    }

    function isIndependentControl(target) {
      return Boolean(target.closest(
        "[data-color-product],[data-favorite-toggle],[data-favorite],.favorite-toggle,.favorite-btn,[data-add]"
      ));
    }

    function addStyles() {
      if (document.getElementById("catalogCardClickStyles")) return;
      const style = document.createElement("style");
      style.id = "catalogCardClickStyles";
      style.textContent = "#grid .card,#grid .product-photo{cursor:pointer}#grid .card button,#grid .color-swatch{cursor:pointer}";
      document.head.appendChild(style);
    }

    document.addEventListener("click", event => {
      const target = event.target instanceof Element ? event.target : null;
      const card = target?.closest("#grid [data-product]");
      if (!card) return;

      if (Date.now() < suppressCatalogOpenUntil) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        return;
      }

      const photoControl = target.closest("[data-card-photo]");
      if (photoControl) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        shiftCatalogPhoto(photoControl);
        return;
      }

      if (isIndependentControl(target)) return;
      if (target.closest("button,a,input,select,textarea,label")) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      openCatalogProduct(card);
    }, true);

    addStyles();
    window.__FORMA_CATALOG_CARD_GESTURE_AUDIT__ = {
      version: 4,
      swipeClickSuppression: true,
      verticalScrollPreserved: true
    };
  }

  document.write = function patchedWrite(...parts) {
    let html = parts.join("");
    if (typeof html === "string" && html.includes("</body>")) {
      html = html.replace("</body>", `<script>(${runtime.toString()})();<\/script></body>`);
    }
    return originalWrite(html);
  };
})();
