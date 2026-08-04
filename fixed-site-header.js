(() => {
  "use strict";

  const originalWrite = document.write.bind(document);

  function fixedHeaderRuntime() {
    "use strict";
    const STYLE_ID = "forma-fixed-site-header-style";
    const SPACER_ID = "forma-fixed-site-header-spacer";
    let scheduled = false;
    let resizeObserver = null;

    function ensureStyle() {
      let style = document.getElementById(STYLE_ID);
      if (!style) {
        style = document.createElement("style");
        style.id = STYLE_ID;
      }
      style.textContent = `
        :root{--forma-announcement-h:0px;--forma-fixed-header-h:0px}
        body>.announcement,.announcement{
          position:fixed!important;top:0!important;left:0!important;right:0!important;
          width:100%!important;margin:0!important;transform:none!important;z-index:70!important
        }
        body>header,header{
          position:fixed!important;top:var(--forma-announcement-h)!important;left:0!important;right:0!important;
          width:100%!important;margin:0!important;transform:none!important;z-index:69!important;
          box-shadow:0 10px 28px rgba(32,31,27,.11)!important
        }
        #${SPACER_ID}{
          display:block!important;width:100%!important;height:var(--forma-fixed-header-h)!important;
          min-height:var(--forma-fixed-header-h)!important;visibility:hidden!important;pointer-events:none!important
        }
        #catalog,.results-line{scroll-margin-top:calc(var(--forma-fixed-header-h) + 16px)!important}
        @media(max-width:760px){
          header{background:rgba(245,242,236,.98)!important;-webkit-backdrop-filter:blur(16px)!important;backdrop-filter:blur(16px)!important}
        }
        @media print{.announcement,header{position:static!important}#${SPACER_ID}{display:none!important}}
      `;
      if (style.parentNode !== document.head || style !== document.head.lastElementChild) {
        document.head.appendChild(style);
      }
    }

    function nodes() {
      return {
        announcement: document.querySelector(".announcement"),
        header: document.querySelector("header")
      };
    }

    function ensureSpacer() {
      const { announcement, header } = nodes();
      const anchor = announcement || header;
      if (!anchor?.parentNode) return null;
      let spacer = document.getElementById(SPACER_ID);
      if (!spacer) {
        spacer = document.createElement("div");
        spacer.id = SPACER_ID;
        spacer.setAttribute("aria-hidden", "true");
      }
      if (spacer.parentNode !== anchor.parentNode || spacer.nextElementSibling !== anchor) {
        anchor.parentNode.insertBefore(spacer, anchor);
      }
      return spacer;
    }

    function measure() {
      scheduled = false;
      ensureStyle();
      ensureSpacer();
      const { announcement, header } = nodes();
      const announcementHeight = announcement ? Math.ceil(announcement.getBoundingClientRect().height) : 0;
      const headerHeight = header ? Math.ceil(header.getBoundingClientRect().height) : 0;
      const totalHeight = announcementHeight + headerHeight;
      document.documentElement.style.setProperty("--forma-announcement-h", `${announcementHeight}px`);
      document.documentElement.style.setProperty("--forma-fixed-header-h", `${totalHeight}px`);
      window.__FORMA_FIXED_HEADER__ = { announcementHeight, headerHeight, totalHeight };

      if ("ResizeObserver" in window) {
        const targets = [announcement, header].filter(Boolean);
        if (!resizeObserver && targets.length) {
          resizeObserver = new ResizeObserver(schedule);
          targets.forEach(target => resizeObserver.observe(target));
        }
      }
    }

    function schedule() {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(measure);
    }

    new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
    window.addEventListener("resize", schedule, { passive: true });
    window.addEventListener("orientationchange", () => setTimeout(schedule, 120), { passive: true });
    window.addEventListener("pageshow", schedule, { passive: true });
    document.addEventListener("DOMContentLoaded", schedule, { once: true });
    schedule();

    let attempts = 0;
    const poll = setInterval(() => {
      schedule();
      attempts += 1;
      if (attempts >= 24 && nodes().header) clearInterval(poll);
    }, 250);
  }

  document.write = function patchedWrite(...parts) {
    let html = parts.join("");
    if (typeof html === "string" && html.includes("</body>")) {
      html = html.replace("</body>", `<script>(${fixedHeaderRuntime.toString()})();<\/script></body>`);
    }
    return originalWrite(html);
  };
})();
