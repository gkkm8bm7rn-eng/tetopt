(() => {
  "use strict";

  let scheduled = false;

  function groups() {
    return Array.isArray(window.PRODUCT_EXPLICIT_VARIANT_GROUPS)
      ? window.PRODUCT_EXPLICIT_VARIANT_GROUPS
      : [];
  }

  function addStyles() {
    if (document.getElementById("explicitTextVariantStyles")) return;

    const style = document.createElement("style");
    style.id = "explicitTextVariantStyles";
    style.textContent = `
      .explicit-variant-selector--text .explicit-variant-label{width:100%}
      .explicit-variant-selector--text .explicit-variant-swatch--text{
        width:auto;
        min-width:92px;
        height:36px;
        padding:0 12px;
        border-radius:10px;
        background:var(--surface);
        color:var(--ink);
        font-size:12px;
        line-height:1;
        font-weight:800;
        white-space:nowrap;
      }
      .explicit-variant-selector--text .explicit-variant-swatch--text:hover{
        transform:translateY(-1px);
      }
      .explicit-variant-selector--text .explicit-variant-swatch--text.active{
        background:var(--ink);
        color:var(--surface);
        box-shadow:0 0 0 1px var(--ink);
      }
      .explicit-variant-selector--text .explicit-variant-swatch--text.active:after{
        content:none;
      }
      .modal-content .explicit-variant-selector--text .explicit-variant-swatch--text{
        width:auto;
        min-width:110px;
        height:40px;
      }
      @media(max-width:700px){
        .explicit-variant-selector--text .explicit-variant-swatch--text{
          width:auto;
          min-width:108px;
          height:38px;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function groupForSelector(selector) {
    const primaryId = Number(selector.dataset.explicitVariantSelector);
    return groups().find(group =>
      Number(group.primaryId) === primaryId && group.display === "text"
    ) || null;
  }

  function patchSelector(selector) {
    const group = groupForSelector(selector);
    if (!group) return;

    selector.classList.add("explicit-variant-selector--text");

    for (const button of selector.querySelectorAll("[data-explicit-product]")) {
      const productId = Number(button.dataset.explicitProduct);
      const variant = (group.variants || []).find(item => Number(item.id) === productId);
      if (!variant) continue;

      button.classList.add("explicit-variant-swatch--text");
      button.style.removeProperty("--explicit-swatch");
      button.textContent = variant.buttonLabel || variant.label || "Вариант";
    }
  }

  function refresh() {
    scheduled = false;
    addStyles();
    document.querySelectorAll("[data-explicit-variant-selector]").forEach(patchSelector);

    window.__EXPLICIT_TEXT_VARIANT_AUDIT__ = {
      groups: groups()
        .filter(group => group.display === "text")
        .map(group => ({
          name: group.name,
          primaryId: Number(group.primaryId),
          ids: (group.variants || []).map(variant => Number(variant.id)),
          labels: (group.variants || []).map(variant => variant.buttonLabel || variant.label)
        }))
    };
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(refresh);
  }

  new MutationObserver(schedule).observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["class", "data-product"]
  });

  window.addEventListener("forma:catalog-ready", schedule);
  window.addEventListener("forma:card-variant-changed", schedule);
  schedule();
})();
