(() => {
  "use strict";
  const originalWrite = document.write.bind(document);

  function paginationRecoveryRuntime() {
    "use strict";
    let scheduled = false;

    function totalProducts() {
      try {
        return typeof filtered === "function" ? filtered().length : 0;
      } catch {
        return 0;
      }
    }

    function pageItems(current, total) {
      if (total <= 5) return Array.from({ length: total }, (_, index) => index + 1);
      const items = [1];
      const start = Math.max(2, current - 1);
      const end = Math.min(total - 1, current + 1);
      if (start > 2) items.push("ellipsis-start");
      for (let page = start; page <= end; page += 1) items.push(page);
      if (end < total - 1) items.push("ellipsis-end");
      items.push(total);
      return items;
    }

    function ensurePagination() {
      const grid = document.getElementById("grid");
      if (!grid) return null;
      let pagination = document.getElementById("pagination");
      if (!pagination) {
        pagination = document.createElement("nav");
        pagination.id = "pagination";
        pagination.className = "pagination-wrap";
        pagination.setAttribute("aria-label", "Страницы каталога");
        grid.insertAdjacentElement("afterend", pagination);
      }
      return pagination;
    }

    function currentPage() {
      try {
        const value = Number(state?.page || 1);
        return Number.isFinite(value) && value > 0 ? value : 1;
      } catch {
        return 1;
      }
    }

    function renderControls() {
      scheduled = false;
      const pagination = ensurePagination();
      if (!pagination) return;
      const count = totalProducts();
      const size = typeof PAGE_SIZE === "number" && PAGE_SIZE > 0 ? PAGE_SIZE : 48;
      const totalPages = Math.max(1, Math.ceil(count / size));
      const page = Math.min(currentPage(), totalPages);

      if (totalPages <= 1) {
        pagination.hidden = true;
        pagination.innerHTML = "";
        return;
      }

      pagination.hidden = false;
      const numbers = pageItems(page, totalPages).map(item => {
        if (typeof item !== "number") return '<span class="page-ellipsis" aria-hidden="true">…</span>';
        const active = item === page;
        return `<button class="page-btn${active ? " active" : ""}" type="button" data-page="${item}"${active ? ' aria-current="page"' : ""} aria-label="Страница ${item}">${item}</button>`;
      }).join("");

      pagination.innerHTML =
        `<button class="page-btn" type="button" data-page="${page - 1}"${page === 1 ? " disabled" : ""} aria-label="Предыдущая страница">←</button>` +
        numbers +
        `<button class="page-btn" type="button" data-page="${page + 1}"${page === totalPages ? " disabled" : ""} aria-label="Следующая страница">→</button>`;
    }

    function schedule() {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(renderControls);
    }

    document.addEventListener("click", event => {
      const button = event.target.closest("#pagination [data-page]");
      if (!button || button.disabled) return;
      event.preventDefault();
      const page = Number(button.dataset.page);
      try {
        if (typeof goToPage === "function") {
          goToPage(page);
        } else if (typeof state !== "undefined") {
          state.page = page;
          if (typeof render === "function") render();
        }
      } catch (error) {
        console.error("Не удалось перейти на страницу каталога", error);
      }
      schedule();
    }, true);

    const gridObserver = new MutationObserver(schedule);
    const start = () => {
      const grid = document.getElementById("grid");
      if (grid) gridObserver.observe(grid, { childList: true });
      schedule();
      setTimeout(schedule, 100);
      setTimeout(schedule, 500);
    };

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
    else start();
  }

  document.write = function patchedWrite(...parts) {
    let html = parts.join("");
    if (typeof html === "string" && html.includes("</body>")) {
      const runtime = `<script>(${paginationRecoveryRuntime.toString()})();<\/script>`;
      html = html.replace("</body>", `${runtime}</body>`);
    }
    return originalWrite(html);
  };
})();
