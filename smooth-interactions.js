(() => {
  "use strict";

  const originalWrite = document.write.bind(document);

  function smoothInteractionsRuntime() {
    "use strict";
    if (window.__FORMA_SMOOTH_INTERACTIONS_V1__) return;
    window.__FORMA_SMOOTH_INTERACTIONS_V1__ = true;

    const STYLE_ID = "forma-smooth-interactions-style";
    const DRAG_THRESHOLD = 8;
    const CLICK_BLOCK_MS = 520;
    let touchGesture = null;
    let mouseGesture = null;
    let suppressRecommendationClickUntil = 0;
    let scheduled = false;

    function recommendationRow(target) {
      const element = target instanceof Element ? target : null;
      return element?.closest(".journey-row") || null;
    }

    function ensureStyle() {
      let style = document.getElementById(STYLE_ID);
      if (!style) {
        style = document.createElement("style");
        style.id = STYLE_ID;
      }

      const css = `
        .journey-row{
          overflow-x:auto!important;
          overflow-y:hidden!important;
          scroll-behavior:smooth!important;
          scroll-snap-type:none!important;
          scroll-padding-inline:0!important;
          overscroll-behavior-x:contain!important;
          overscroll-behavior-y:auto!important;
          touch-action:pan-x pan-y pinch-zoom!important;
          -webkit-overflow-scrolling:touch!important;
          scrollbar-width:none!important;
          user-select:none!important;
          -webkit-user-select:none!important;
          cursor:grab!important;
        }
        .journey-row::-webkit-scrollbar{display:none!important}
        .journey-row.is-horizontal-dragging,
        .journey-row.forma-mouse-dragging{
          scroll-snap-type:none!important;
          scroll-behavior:auto!important;
          cursor:grabbing!important;
        }

        .journey-product{
          scroll-snap-align:none!important;
          scroll-snap-stop:normal!important;
          touch-action:pan-x pan-y pinch-zoom!important;
          -webkit-tap-highlight-color:transparent!important;
          border:1px solid var(--line,#ded8cc)!important;
          border-radius:16px!important;
          outline:none!important;
          box-shadow:none!important;
          overflow:hidden!important;
          transform:translateZ(0)!important;
          backface-visibility:hidden!important;
          transition:background-color .16s ease,box-shadow .16s ease!important;
        }
        .journey-product:hover,
        .journey-product:active,
        .journey-product:focus,
        .journey-product:focus-visible{
          border-color:var(--line,#ded8cc)!important;
          outline:none!important;
          box-shadow:none!important;
          transform:translateZ(0)!important;
        }
        .journey-product:focus-visible{
          background:var(--surface-2,#eee9df)!important;
        }
        .journey-product img,
        .journey-product img:focus,
        .journey-product img:active{
          display:block!important;
          border:0!important;
          outline:none!important;
          box-shadow:none!important;
          transform:translateZ(0)!important;
          backface-visibility:hidden!important;
          pointer-events:none!important;
          user-select:none!important;
          -webkit-user-select:none!important;
          -webkit-user-drag:none!important;
        }

        .gallery-thumbs{
          scroll-behavior:smooth!important;
          overscroll-behavior-x:contain!important;
          touch-action:pan-x pan-y pinch-zoom!important;
          -webkit-overflow-scrolling:touch!important;
        }
        .gallery-thumb,
        .gallery-thumb:focus,
        .gallery-thumb:focus-visible,
        .gallery-thumb:active{
          outline:none!important;
          box-shadow:none!important;
          transform:none!important;
          -webkit-tap-highlight-color:transparent!important;
        }
        .gallery-thumb:not(.active):focus,
        .gallery-thumb:not(.active):focus-visible,
        .gallery-thumb:not(.active):active{
          border-color:transparent!important;
        }
        .gallery-thumb img{
          border:0!important;
          outline:none!important;
          box-shadow:none!important;
          transform:translateZ(0)!important;
          backface-visibility:hidden!important;
        }

        @media(hover:hover) and (pointer:fine){
          .journey-product:hover{
            background:var(--surface,#fff)!important;
          }
        }
        @media(prefers-reduced-motion:reduce){
          .journey-row,
          .gallery-thumbs{scroll-behavior:auto!important}
          .journey-product{transition:none!important}
        }
      `;
      if (style.textContent !== css) style.textContent = css;

      if (!style.parentNode) document.head.appendChild(style);
    }

    function touchPoint(event, changed = false) {
      if (changed && event.changedTouches?.[0]) return event.changedTouches[0];
      return event.touches?.[0] || event;
    }

    function beginNativeTouch(event) {
      const row = recommendationRow(event.target);
      if (!row) return;
      const point = touchPoint(event);
      touchGesture = {
        row,
        x: point.clientX,
        y: point.clientY,
        horizontal: false,
        vertical: false
      };

      event.stopImmediatePropagation();
    }

    function continueNativeTouch(event) {
      if (!touchGesture) return;
      const point = touchPoint(event);
      const dx = point.clientX - touchGesture.x;
      const dy = point.clientY - touchGesture.y;

      if (!touchGesture.horizontal && !touchGesture.vertical &&
          (Math.abs(dx) >= DRAG_THRESHOLD || Math.abs(dy) >= DRAG_THRESHOLD)) {
        if (Math.abs(dx) > Math.abs(dy) * 1.08) {
          touchGesture.horizontal = true;
          suppressRecommendationClickUntil = Date.now() + CLICK_BLOCK_MS;
        } else {
          touchGesture.vertical = true;
        }
      }

      event.stopImmediatePropagation();
    }

    function finishNativeTouch(event) {
      if (!touchGesture) return;
      if (touchGesture.horizontal) {
        suppressRecommendationClickUntil = Date.now() + CLICK_BLOCK_MS;
      }
      touchGesture = null;
      event.stopImmediatePropagation();
    }

    function cancelNativeTouch(event) {
      if (!touchGesture) return;
      if (touchGesture.horizontal) {
        suppressRecommendationClickUntil = Date.now() + CLICK_BLOCK_MS;
      }
      touchGesture = null;
      event.stopImmediatePropagation();
    }

    function beginMouseDrag(event) {
      if (event.pointerType !== "mouse" || event.button !== 0) return;
      const row = recommendationRow(event.target);
      if (!row) return;
      mouseGesture = {
        row,
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        scrollLeft: row.scrollLeft,
        dragging: false
      };
    }

    function continueMouseDrag(event) {
      if (!mouseGesture || event.pointerId !== mouseGesture.pointerId) return;
      const dx = event.clientX - mouseGesture.x;
      const dy = event.clientY - mouseGesture.y;
      if (!mouseGesture.dragging) {
        if (Math.abs(dx) < DRAG_THRESHOLD || Math.abs(dx) <= Math.abs(dy)) return;
        mouseGesture.dragging = true;
        mouseGesture.row.classList.add("forma-mouse-dragging");
        mouseGesture.row.setPointerCapture?.(event.pointerId);
      }
      mouseGesture.row.scrollLeft = mouseGesture.scrollLeft - dx;
      suppressRecommendationClickUntil = Date.now() + CLICK_BLOCK_MS;
      event.preventDefault();
    }

    function finishMouseDrag(event) {
      if (!mouseGesture || event.pointerId !== mouseGesture.pointerId) return;
      const gesture = mouseGesture;
      mouseGesture = null;
      gesture.row.classList.remove("forma-mouse-dragging");
      if (gesture.dragging) {
        suppressRecommendationClickUntil = Date.now() + CLICK_BLOCK_MS;
        gesture.row.releasePointerCapture?.(event.pointerId);
        event.preventDefault();
      }
    }

    function cancelMouseDrag(event) {
      if (!mouseGesture || (event.pointerId !== undefined && event.pointerId !== mouseGesture.pointerId)) return;
      mouseGesture.row.classList.remove("forma-mouse-dragging");
      if (mouseGesture.dragging) suppressRecommendationClickUntil = Date.now() + CLICK_BLOCK_MS;
      mouseGesture = null;
    }

    function blockClickAfterDrag(event) {
      if (Date.now() >= suppressRecommendationClickUntil) return;
      const target = event.target instanceof Element ? event.target : null;
      if (!target?.closest(".journey-product")) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    }

    function smoothShiftWheel(event) {
      const row = recommendationRow(event.target);
      if (!row || !event.shiftKey || !event.deltaY) return;
      if (row.scrollWidth <= row.clientWidth + 2) return;
      event.preventDefault();
      const multiplier = event.deltaMode === 1 ? 18 : 1;
      row.scrollBy({ left: event.deltaY * multiplier, behavior: "smooth" });
    }

    function refresh() {
      scheduled = false;
      ensureStyle();
      document.querySelectorAll(".journey-row").forEach(row => {
        row.setAttribute("data-forma-native-scroll", "true");
      });
      window.__FORMA_SMOOTH_INTERACTIONS_AUDIT__ = {
        enabled: true,
        version: 1,
        recommendationScroll: "native-momentum",
        forcedSnapDisabled: true,
        touchHighlightRemoved: true,
        activeBlackOutlineRemoved: true,
        mouseDragEnabled: true,
        shiftWheelEnabled: true,
        galleryThumbnailScrollSmoothed: true
      };
    }

    function schedule() {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(refresh);
    }

    document.addEventListener("touchstart", beginNativeTouch, { passive: true, capture: true });
    document.addEventListener("touchmove", continueNativeTouch, { passive: true, capture: true });
    document.addEventListener("touchend", finishNativeTouch, { passive: true, capture: true });
    document.addEventListener("touchcancel", cancelNativeTouch, { passive: true, capture: true });
    document.addEventListener("pointerdown", beginMouseDrag, { passive: true, capture: true });
    document.addEventListener("pointermove", continueMouseDrag, { passive: false, capture: true });
    document.addEventListener("pointerup", finishMouseDrag, { passive: false, capture: true });
    document.addEventListener("pointercancel", cancelMouseDrag, { passive: true, capture: true });
    document.addEventListener("click", blockClickAfterDrag, { capture: true });
    document.addEventListener("wheel", smoothShiftWheel, { passive: false, capture: true });

    new MutationObserver(schedule).observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class"]
    });
    window.addEventListener("forma:catalog-ready", schedule, { passive: true });
    window.addEventListener("resize", schedule, { passive: true });
    window.addEventListener("orientationchange", () => setTimeout(schedule, 120), { passive: true });
    document.addEventListener("DOMContentLoaded", schedule, { once: true });
    schedule();
  }

  if (document.querySelector(".journey-row,.gallery-thumbs")) smoothInteractionsRuntime();

  document.write = function patchedWrite(...parts) {
    let html = parts.join("");
    if (typeof html === "string" && html.includes("</body>")) {
      html = html.replace("</body>", `<script>(${smoothInteractionsRuntime.toString()})();<\/script></body>`);
    }
    return originalWrite(html);
  };
})();
