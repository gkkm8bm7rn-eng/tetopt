(() => {
  "use strict";

  const originalWrite = document.write.bind(document);

  function gallerySwipeWheelRuntime() {
    "use strict";
    if (window.__FORMA_GALLERY_SWIPE_V2__) return;
    window.__FORMA_GALLERY_SWIPE_V2__ = true;

    const SWIPE_MIN = 42;
    const SWIPE_MAX_VERTICAL = 90;
    let start = null;
    let lastWheel = 0;
    let scheduled = false;

    function visible(element) {
      if (!(element instanceof Element)) return false;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== "none" &&
        style.visibility !== "hidden" &&
        Number(style.opacity) !== 0 &&
        rect.width > 0 && rect.height > 0;
    }

    function galleryRoot(target) {
      const element = target instanceof Element ? target : null;
      if (!element) return null;

      const explicit = element.closest(
        "#modal.show,.gallery-lightbox.show,.product-lightbox.show,[role='dialog'][aria-modal='true']"
      );
      if (explicit && visible(explicit) && explicit.querySelector("img")) return explicit;

      let node = element;
      while (node && node !== document.body) {
        const style = getComputedStyle(node);
        const rect = node.getBoundingClientRect();
        const coversViewport = style.position === "fixed" &&
          rect.width >= window.innerWidth * 0.85 &&
          rect.height >= window.innerHeight * 0.8;
        if (coversViewport && node.querySelector("img") && visible(node)) return node;
        node = node.parentElement;
      }
      return null;
    }

    function galleryButtons(root) {
      const buttons = [...root.querySelectorAll("button,[role='button']")].filter(visible);
      const prev = buttons.find(element =>
        /prev|previous|назад|предыдущ|‹|❮|←/i.test(
          `${element.className} ${element.getAttribute("aria-label") || ""} ${element.textContent || ""}`
        )
      );
      const next = buttons.find(element =>
        /next|следующ|далее|›|❯|→/i.test(
          `${element.className} ${element.getAttribute("aria-label") || ""} ${element.textContent || ""}`
        )
      );
      return { prev, next };
    }

    function move(root, direction) {
      const { prev, next } = galleryButtons(root);
      const button = direction > 0 ? next : prev;
      if (!button) return false;
      button.click();
      return true;
    }

    function fit(root) {
      if (!root) return;
      root.style.overscrollBehavior = "contain";

      const gestureArea = root.querySelector(".gallery-main,.gallery-panel") || root;
      gestureArea.style.touchAction = "pan-y pinch-zoom";

      root.querySelectorAll("img").forEach(image => {
        image.style.maxWidth = "calc(100vw - 24px)";
        image.style.maxHeight = "calc(100dvh - 150px)";
        image.style.width = "auto";
        image.style.height = "auto";
        image.style.objectFit = "contain";
        image.style.userSelect = "none";
        image.style.webkitUserDrag = "none";
        image.style.touchAction = "pan-y pinch-zoom";
        image.draggable = false;
      });
    }

    function pointFromEvent(event, changed = false) {
      if (changed && event.changedTouches?.[0]) return event.changedTouches[0];
      if (event.touches?.[0]) return event.touches[0];
      return event;
    }

    function onDown(event) {
      const root = galleryRoot(event.target);
      if (!root) return;
      fit(root);
      const point = pointFromEvent(event);
      start = {
        x: point.clientX,
        y: point.clientY,
        time: Date.now(),
        root,
        pointerId: event.pointerId
      };
    }

    function onUp(event) {
      if (!start) return;
      if (start.pointerId !== undefined && event.pointerId !== undefined &&
          start.pointerId !== event.pointerId) return;

      const point = pointFromEvent(event, true);
      const dx = point.clientX - start.x;
      const dy = point.clientY - start.y;
      const elapsed = Date.now() - start.time;
      const root = start.root;
      start = null;

      if (elapsed > 900 ||
          Math.abs(dx) < SWIPE_MIN ||
          Math.abs(dy) > SWIPE_MAX_VERTICAL ||
          Math.abs(dx) <= Math.abs(dy)) return;

      if (move(root, dx < 0 ? 1 : -1)) event.preventDefault();
    }

    function cancelGesture() {
      start = null;
    }

    function onWheel(event) {
      const root = galleryRoot(event.target);
      if (!root) return;
      fit(root);

      const overGallery = event.target instanceof Element && Boolean(
        event.target.closest(".gallery-main,.gallery-panel,.gallery-thumbs,img")
      );
      const horizontalGesture = Math.abs(event.deltaX) > Math.abs(event.deltaY) &&
        Math.abs(event.deltaX) >= 18;
      if (!overGallery || !horizontalGesture) return;

      const now = Date.now();
      if (now - lastWheel < 420) {
        event.preventDefault();
        return;
      }
      lastWheel = now;
      if (move(root, Math.sign(event.deltaX) || 1)) event.preventDefault();
    }

    function refresh() {
      scheduled = false;
      document.querySelectorAll(
        "#modal.show,.gallery-lightbox.show,.product-lightbox.show,[role='dialog'][aria-modal='true']"
      ).forEach(root => {
        if (visible(root) && root.querySelector("img")) fit(root);
      });

      window.__FORMA_GALLERY_GESTURE_AUDIT__ = {
        enabled: true,
        version: 2,
        verticalPageScrollPreserved: true,
        horizontalSwipeEnabled: true,
        wheelNavigation: "horizontal-only"
      };
    }

    function schedule() {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(refresh);
    }

    if ("PointerEvent" in window) {
      document.addEventListener("pointerdown", onDown, { passive: true, capture: true });
      document.addEventListener("pointerup", onUp, { passive: false, capture: true });
      document.addEventListener("pointercancel", cancelGesture, { passive: true, capture: true });
    } else {
      document.addEventListener("touchstart", onDown, { passive: true, capture: true });
      document.addEventListener("touchend", onUp, { passive: false, capture: true });
      document.addEventListener("touchcancel", cancelGesture, { passive: true, capture: true });
    }

    document.addEventListener("wheel", onWheel, { passive: false, capture: true });
    new MutationObserver(schedule).observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "aria-hidden"]
    });
    window.addEventListener("forma:catalog-ready", schedule, { passive: true });
    window.addEventListener("resize", schedule, { passive: true });
    window.addEventListener("orientationchange", () => setTimeout(schedule, 120), { passive: true });
    schedule();
  }

  if (document.getElementById("modal")) gallerySwipeWheelRuntime();

  document.write = function patchedWrite(...parts) {
    let html = parts.join("");
    if (typeof html === "string" && html.includes("</body>")) {
      html = html.replace("</body>", `<script>(${gallerySwipeWheelRuntime.toString()})();<\/script></body>`);
    }
    return originalWrite(html);
  };
})();
