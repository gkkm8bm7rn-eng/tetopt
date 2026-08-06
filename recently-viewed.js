(() => {
  "use strict";

  const originalWrite = document.write.bind(document);

  function recentlyViewedRuntime() {
    "use strict";

    const STORAGE_KEY = "formaRecentlyViewedV1";
    const MAX_STORED = 12;
    const MAX_SHOWN = 8;
    const SWIPE_THRESHOLD = 42;
    const CLICK_BLOCK_MS = 560;
    let recentGesture = null;
    let suppressRecentOpenUntil = 0;

    function readIds() {
      try {
        const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
        if (!Array.isArray(value)) return [];
        return [...new Set(value.map(Number).filter(Number.isFinite))].slice(0, MAX_STORED);
      } catch (error) {
        console.warn("Не удалось прочитать недавно просмотренные товары", error);
        return [];
      }
    }

    function writeIds(ids) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(ids.slice(0, MAX_STORED)));
      } catch (error) {
        console.warn("Не удалось сохранить недавно просмотренные товары", error);
      }
    }

    function addStyles() {
      if (document.getElementById("recentlyViewedStyles")) return;
      const style = document.createElement("style");
      style.id = "recentlyViewedStyles";
      style.textContent = `
        .recently-viewed{padding:34px 0 76px;border-top:1px solid var(--line)}
        .recently-viewed[hidden]{display:none}
        .recently-viewed-head{display:flex;align-items:end;justify-content:space-between;gap:18px;margin-bottom:22px}
        .recently-viewed h2{font-family:Georgia,serif;font-size:38px;font-weight:500;margin:0}
        .recently-viewed p{margin:8px 0 0;color:var(--muted)}
        .recently-viewed-clear{border:1px solid var(--line);background:var(--surface);color:var(--muted);border-radius:999px;padding:10px 15px;font-weight:700;white-space:nowrap}
        .recently-viewed-clear:hover{border-color:var(--accent);color:var(--accent)}
        .recently-viewed-grid .visual{touch-action:pan-y pinch-zoom}
        .recently-viewed-grid .product-photo{user-select:none;-webkit-user-select:none;-webkit-user-drag:none}
        @media(max-width:640px){
          .recently-viewed{padding:28px 0 54px}
          .recently-viewed-head{align-items:flex-start;flex-direction:column}
          .recently-viewed h2{font-size:32px}
        }
      `;
      document.head.appendChild(style);
    }

    function ensureSection() {
      let section = document.getElementById("recentlyViewed");
      if (section) return section;
      const footer = document.querySelector("footer");
      if (!footer) return null;
      section = document.createElement("section");
      section.id = "recentlyViewed";
      section.className = "recently-viewed";
      section.hidden = true;
      footer.before(section);
      return section;
    }

    function getProduct(id) {
      try {
        return typeof productById === "function" ? productById(id) : null;
      } catch (error) {
        return null;
      }
    }

    function render() {
      addStyles();
      const section = ensureSection();
      if (!section) return;

      const products = readIds().map(getProduct).filter(Boolean).slice(0, MAX_SHOWN);
      if (!products.length || typeof cardHtml !== "function") {
        section.hidden = true;
        section.innerHTML = "";
        return;
      }

      section.hidden = false;
      section.innerHTML = `
        <div class="container">
          <div class="recently-viewed-head">
            <div>
              <h2>Недавно просмотренные</h2>
              <p>Вернитесь к товарам, которые привлекли ваше внимание.</p>
            </div>
            <button type="button" class="recently-viewed-clear" data-clear-recent>Очистить историю</button>
          </div>
          <div class="grid recently-viewed-grid" id="recentlyViewedGrid">
            ${products.map(cardHtml).join("")}
          </div>
        </div>`;

      const grid = document.getElementById("recentlyViewedGrid");
      if (grid && typeof observeProductImages === "function") observeProductImages(grid);
    }

    function remember(id) {
      const numericId = Number(id);
      if (!Number.isFinite(numericId) || !getProduct(numericId)) return;
      const ids = readIds().filter(item => item !== numericId);
      ids.unshift(numericId);
      writeIds(ids);
      render();
    }

    function pointFromEvent(event, changed = false) {
      if (changed && event.changedTouches?.[0]) return event.changedTouches[0];
      return event.touches?.[0] || event;
    }

    function startSwipe(event) {
      const target = event.target instanceof Element ? event.target : null;
      const visual = target?.closest("#recentlyViewedGrid .visual");
      if (!visual || target.closest("button,a,input,select,textarea,label")) return;
      if (event.pointerType === "mouse") return;
      const point = pointFromEvent(event);
      recentGesture = {
        visual,
        x: point.clientX,
        y: point.clientY,
        pointerId: event.pointerId,
        horizontal: false,
        vertical: false
      };
    }

    function moveSwipe(event) {
      if (!recentGesture) return;
      if (recentGesture.pointerId !== undefined && event.pointerId !== undefined &&
          recentGesture.pointerId !== event.pointerId) return;
      const point = pointFromEvent(event);
      const dx = point.clientX - recentGesture.x;
      const dy = point.clientY - recentGesture.y;
      if (recentGesture.horizontal || recentGesture.vertical) return;
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      if (Math.abs(dx) > Math.abs(dy) * 1.15) recentGesture.horizontal = true;
      else recentGesture.vertical = true;
    }

    function finishSwipe(event) {
      if (!recentGesture) return;
      if (recentGesture.pointerId !== undefined && event.pointerId !== undefined &&
          recentGesture.pointerId !== event.pointerId) return;
      const gesture = recentGesture;
      recentGesture = null;
      if (!gesture.horizontal) return;

      const point = pointFromEvent(event, true);
      const dx = point.clientX - gesture.x;
      const dy = point.clientY - gesture.y;
      if (Math.abs(dx) < SWIPE_THRESHOLD || Math.abs(dx) <= Math.abs(dy)) return;

      suppressRecentOpenUntil = Date.now() + CLICK_BLOCK_MS;
      try {
        if (typeof shiftCardPhoto === "function") shiftCardPhoto(gesture.visual, dx < 0 ? 1 : -1);
      } catch (error) {
        console.error(error);
      }
      event.preventDefault();

      window.__FORMA_RECENT_SWIPE_AUDIT__ = {
        version: 2,
        photoSwipeEnabled: true,
        accidentalOpenPrevented: true,
        verticalScrollPreserved: true
      };
    }

    function cancelSwipe() {
      recentGesture = null;
    }

    if ("PointerEvent" in window) {
      document.addEventListener("pointerdown", startSwipe, { passive: true, capture: true });
      document.addEventListener("pointermove", moveSwipe, { passive: true, capture: true });
      document.addEventListener("pointerup", finishSwipe, { passive: false, capture: true });
      document.addEventListener("pointercancel", cancelSwipe, { passive: true, capture: true });
    } else {
      document.addEventListener("touchstart", startSwipe, { passive: true, capture: true });
      document.addEventListener("touchmove", moveSwipe, { passive: true, capture: true });
      document.addEventListener("touchend", finishSwipe, { passive: false, capture: true });
      document.addEventListener("touchcancel", cancelSwipe, { passive: true, capture: true });
    }

    document.addEventListener("click", event => {
      const clear = event.target.closest("[data-clear-recent]");
      if (clear) {
        localStorage.removeItem(STORAGE_KEY);
        render();
        return;
      }

      const card = event.target.closest("[data-product]");
      if (!card) return;
      const id = Number(card.dataset.product);
      const recentSection = card.closest("#recentlyViewed");
      const photoNav = event.target.closest("[data-card-photo]");
      const addButton = event.target.closest("[data-add]");

      if (recentSection) {
        event.preventDefault();
        event.stopPropagation();
        if (Date.now() < suppressRecentOpenUntil) {
          event.stopImmediatePropagation();
          return;
        }
        if (photoNav) {
          if (typeof shiftCardPhoto === "function") shiftCardPhoto(photoNav, Number(photoNav.dataset.cardPhoto) || 0);
          return;
        }
        if (addButton) {
          if (typeof addToCart === "function") addToCart(addButton.dataset.add);
          return;
        }
        remember(id);
        if (typeof openProduct === "function") openProduct(id);
        return;
      }

      if (!photoNav && !addButton) remember(id);
    });

    render();
  }

  document.write = function patchedWrite(...parts) {
    let html = parts.join("");
    if (typeof html === "string" && html.includes("</body>")) {
      const runtime = `<script>(${recentlyViewedRuntime.toString()})();<\/script>`;
      html = html.replace("</body>", `${runtime}</body>`);
      return originalWrite(html);
    }
    return originalWrite(...parts);
  };
})();
