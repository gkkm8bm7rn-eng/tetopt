(() => {
  "use strict";

  const originalWrite = document.write.bind(document);

  function fixedHeaderCompatibilityRuntime() {
    "use strict";

    const LEGACY_STYLE_ID = "forma-fixed-site-header-style";
    const LEGACY_SPACER_ID = "forma-fixed-site-header-spacer";
    let attempts = 0;

    function cleanup() {
      document.getElementById(LEGACY_STYLE_ID)?.remove();
      document.getElementById(LEGACY_SPACER_ID)?.remove();
      attempts += 1;

      window.__FORMA_FIXED_HEADER_COMPATIBILITY__ = {
        duplicateRuntimeDisabled: true,
        activeRuntime: document.getElementById("sticky-header-hero-redesign-style")
          ? "sticky-header-hero-redesign"
          : "catalog-default"
      };
    }

    cleanup();
    document.addEventListener("DOMContentLoaded", cleanup, { once: true });
    window.addEventListener("pageshow", cleanup, { passive: true });
    window.addEventListener("forma:catalog-ready", cleanup, { passive: true });

    const observer = new MutationObserver(() => {
      cleanup();
      if (document.getElementById("sticky-header-hero-redesign-style") || attempts >= 40) {
        observer.disconnect();
      }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    setTimeout(() => observer.disconnect(), 12000);
  }

  document.write = function patchedWrite(...parts) {
    let html = parts.join("");
    if (typeof html === "string" && html.includes("</body>")) {
      html = html.replace("</body>", `<script>(${fixedHeaderCompatibilityRuntime.toString()})();<\/script></body>`);
    }
    return originalWrite(html);
  };
})();
