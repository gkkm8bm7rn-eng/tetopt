(() => {
  "use strict";

  const originalWrite = document.write.bind(document);

  function initialImageFixRuntime() {
    "use strict";

    let scheduled = false;

    function firstImageFor(product) {
      const images = Array.isArray(product?.images) ? product.images.filter(Boolean) : [];
      return images[0] || product?.directImage || "";
    }

    function revealImage(image) {
      image.classList.add("loaded");
      image.closest(".visual")?.querySelector(".photo-loading")?.remove();
      image.closest(".visual")?.querySelector(".photo-placeholder")?.classList.add("hidden");
    }

    function hydrateCardImage(image) {
      if (!(image instanceof HTMLImageElement)) return;
      const id = Number(image.dataset.productImage || image.closest("[data-product]")?.dataset.product);
      if (!Number.isFinite(id) || typeof productById !== "function") return;
      const product = productById(id);
      const source = firstImageFor(product);
      if (!source) return;

      if (!image.getAttribute("src")) {
        image.addEventListener("load", () => revealImage(image), { once: true });
        image.addEventListener("error", () => {
          if (typeof markPhotoFailed === "function") markPhotoFailed(image);
        }, { once: true });
        image.src = source;
      }

      if (image.complete && image.naturalWidth > 0) revealImage(image);
    }

    function hydrateAll() {
      scheduled = false;
      document.querySelectorAll("img.js-product-image").forEach(hydrateCardImage);
    }

    function scheduleHydration() {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(hydrateAll);
    }

    const observer = new MutationObserver(scheduleHydration);
    observer.observe(document.body, { childList: true, subtree: true });

    document.addEventListener("DOMContentLoaded", scheduleHydration, { once: true });
    window.addEventListener("load", scheduleHydration, { once: true });
    scheduleHydration();
  }

  document.write = function patchedWrite(...parts) {
    let html = parts.join("");
    if (typeof html === "string" && html.includes("</body>")) {
      const runtime = `<script>(${initialImageFixRuntime.toString()})();<\/script>`;
      html = html.replace("</body>", `${runtime}</body>`);
      return originalWrite(html);
    }
    return originalWrite(...parts);
  };
})();
