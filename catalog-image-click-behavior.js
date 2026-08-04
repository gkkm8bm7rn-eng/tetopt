(() => {
  "use strict";

  function openCatalogProductFromEvent(event) {
    const target = event.target instanceof Element ? event.target : null;
    const image = target?.closest("#grid .product-photo,#grid .js-product-image");
    if (!image) return;
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
  }

  document.write = function patchedWrite(...parts) {
    let html = parts.join("");
    if (typeof html === "string" && html.includes("</body>")) {
      html = html.replace("</body>", `<script>(${runtime.toString()})();<\/script></body>`);
    }
    return originalWrite(html);
  };
})();
