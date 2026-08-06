(() => {
  "use strict";

  const originalWrite = document.write.bind(document);

  function mobileNextPageCardRuntime() {
    "use strict";
    if (window.__FORMA_MOBILE_NEXT_PAGE_CARD_V1__) return;
    window.__FORMA_MOBILE_NEXT_PAGE_CARD_V1__ = true;

    const STYLE_ID = "forma-mobile-next-page-card-style";
    const CARD_SELECTOR = "[data-forma-next-page-card]";
    const media = window.matchMedia("(max-width: 932px)");
    let scheduled = false;

    function ensureStyle() {
      let style = document.getElementById(STYLE_ID);
      if (!style) {
        style = document.createElement("style");
        style.id = STYLE_ID;
        document.head.appendChild(style);
      }

      const css = `
        .forma-next-page-card{display:none}
        @media(max-width:932px){
          #grid>.forma-next-page-card{
            appearance:none!important;
            -webkit-appearance:none!important;
            display:flex!important;
            flex-direction:column!important;
            align-self:stretch!important;
            width:100%!important;
            min-width:0!important;
            min-height:100%!important;
            padding:0!important;
            overflow:hidden!important;
            border:1px solid var(--line,#ded8cc)!important;
            border-radius:8px!important;
            background:var(--surface,#fff)!important;
            color:var(--ink,#201f1b)!important;
            text-align:left!important;
            cursor:pointer!important;
            box-shadow:none!important;
            -webkit-tap-highlight-color:transparent!important;
          }
          .forma-next-page-card__visual{
            position:relative!important;
            display:grid!important;
            place-items:center!important;
            width:100%!important;
            aspect-ratio:1/1.04!important;
            min-height:0!important;
            overflow:hidden!important;
            background:radial-gradient(circle at 72% 22%,rgba(255,255,255,.55),transparent 25%),linear-gradient(145deg,#e7eadf 0%,#cad4bd 55%,#9ead8f 100%)!important;
          }
          .forma-next-page-card__visual:before,.forma-next-page-card__visual:after{
            content:"";position:absolute;border-radius:50%;border:18px solid rgba(255,255,255,.28);pointer-events:none;
          }
          .forma-next-page-card__visual:before{width:120px;height:120px;right:-40px;top:-34px}
          .forma-next-page-card__visual:after{width:78px;height:78px;left:-24px;bottom:-28px}
          .forma-next-page-card__arrow{
            position:relative!important;z-index:1!important;display:grid!important;place-items:center!important;
            width:64px!important;height:64px!important;border-radius:50%!important;background:var(--ink,#201f1b)!important;
            color:#fff!important;font-size:38px!important;font-weight:500!important;line-height:1!important;
            box-shadow:0 14px 30px rgba(32,31,27,.2)!important;transition:transform .18s ease!important;
          }
          .forma-next-page-card__body{
            display:flex!important;flex:1 1 auto!important;flex-direction:column!important;justify-content:flex-end!important;
            min-width:0!important;padding:12px 11px 14px!important;
          }
          .forma-next-page-card__eyebrow{
            display:block!important;margin-bottom:7px!important;color:var(--accent,#5d6b4f)!important;
            font-size:8px!important;font-weight:850!important;line-height:1.25!important;letter-spacing:.1em!important;text-transform:uppercase!important;
          }
          .forma-next-page-card__title{
            display:block!important;margin:0!important;color:var(--ink,#201f1b)!important;
            font-size:clamp(16px,4.7vw,23px)!important;font-weight:900!important;line-height:1.08!important;letter-spacing:-.02em!important;
          }
          .forma-next-page-card__page{
            display:block!important;margin-top:10px!important;color:var(--muted,#706d65)!important;
            font-size:10px!important;font-weight:700!important;line-height:1.3!important;
          }
          .forma-next-page-card:active .forma-next-page-card__arrow{transform:translateX(4px)!important}
        }
        @media(hover:hover) and (pointer:fine){
          #grid>.forma-next-page-card:hover{border-color:var(--accent,#5d6b4f)!important;box-shadow:0 16px 34px rgba(47,42,33,.1)!important}
          .forma-next-page-card:hover .forma-next-page-card__arrow{transform:translateX(5px)!important}
        }
        @media(prefers-reduced-motion:reduce){.forma-next-page-card__arrow{transition:none!important}}
      `;
      if (style.textContent !== css) style.textContent = css;
    }

    function isVisibleProductCard(element) {
      if (!(element instanceof HTMLElement) || !element.matches(".card[data-product]")) return false;
      if (element.hidden || element.classList.contains("product-color-duplicate-hidden")) return false;
      const style = getComputedStyle(element);
      return style.display !== "none" && style.visibility !== "hidden";
    }

    function nextPageButton() {
      const pagination = document.getElementById("pagination");
      if (!pagination || pagination.hidden) return null;
      const exact = pagination.querySelector('button[aria-label="Следующая страница"]');
      if (exact && !exact.disabled) return exact;
      const buttons = [...pagination.querySelectorAll("button[data-page]")].filter(button => !button.disabled);
      const active = pagination.querySelector('[aria-current="page"],.page-btn.active');
      const current = Number(active?.dataset.page || active?.textContent) || 1;
      return buttons.find(button => Number(button.dataset.page) === current + 1) || null;
    }

    function buildCard(nextButton) {
      const page = Number(nextButton.dataset.page) || null;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "forma-next-page-card";
      button.setAttribute("data-forma-next-page-card", "");
      button.setAttribute("aria-label", page ? `Перейти на страницу ${page}` : "Перейти на следующую страницу");
      if (page) button.dataset.nextPage = String(page);
      button.innerHTML = `
        <span class="forma-next-page-card__visual" aria-hidden="true"><span class="forma-next-page-card__arrow">→</span></span>
        <span class="forma-next-page-card__body">
          <span class="forma-next-page-card__eyebrow">Каталог продолжается</span>
          <strong class="forma-next-page-card__title">Смотреть ещё товары</strong>
          <span class="forma-next-page-card__page">${page ? `Перейти на страницу ${page}` : "Следующая страница"}</span>
        </span>`;
      return button;
    }

    function synchronize() {
      scheduled = false;
      ensureStyle();
      const grid = document.getElementById("grid");
      const outsideCard = document.querySelector(CARD_SELECTOR);
      if (!media.matches || !grid) { outsideCard?.remove(); return; }

      const existing = grid.querySelector(CARD_SELECTOR);
      const visibleCards = [...grid.children].filter(isVisibleProductCard);
      const nextButton = nextPageButton();
      const needsCard = Boolean(nextButton) && visibleCards.length > 0 && visibleCards.length % 2 === 1;

      if (!needsCard) {
        existing?.remove();
        window.__FORMA_MOBILE_NEXT_PAGE_CARD_AUDIT__ = {enabled:true,inserted:false,visibleProducts:visibleCards.length,hasNextPage:Boolean(nextButton)};
        return;
      }

      const nextPage = String(nextButton.dataset.page || "");
      if (!existing || existing.dataset.nextPage !== nextPage) {
        existing?.remove();
        grid.appendChild(buildCard(nextButton));
      } else if (existing !== grid.lastElementChild) {
        grid.appendChild(existing);
      }

      window.__FORMA_MOBILE_NEXT_PAGE_CARD_AUDIT__ = {
        enabled:true,inserted:true,visibleProducts:visibleCards.length,nextPage:Number(nextButton.dataset.page)||null,fillsOddGridCell:true
      };
    }

    function schedule() {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(synchronize);
    }

    document.addEventListener("click", event => {
      const card = event.target.closest?.(CARD_SELECTOR);
      if (!card) return;
      event.preventDefault();
      event.stopPropagation();
      nextPageButton()?.click();
    }, true);

    new MutationObserver(schedule).observe(document.documentElement, {
      childList:true,subtree:true,attributes:true,attributeFilter:["class","style","hidden","aria-current","disabled"]
    });
    media.addEventListener?.("change", schedule);
    window.addEventListener("resize", schedule, {passive:true});
    window.addEventListener("orientationchange", () => setTimeout(schedule,120), {passive:true});
    window.addEventListener("forma:catalog-ready", schedule, {passive:true});
    window.addEventListener("forma:card-variant-changed", schedule, {passive:true});
    document.addEventListener("DOMContentLoaded", schedule, {once:true});
    schedule();
  }

  if (document.getElementById("grid")) mobileNextPageCardRuntime();

  document.write = function patchedWrite(...parts) {
    let html = parts.join("");
    if (typeof html === "string" && html.includes("</body>")) {
      html = html.replace("</body>", `<script>(${mobileNextPageCardRuntime.toString()})();<\/script></body>`);
    }
    return originalWrite(html);
  };
})();
