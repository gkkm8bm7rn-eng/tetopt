(() => {
  "use strict";
  const originalWrite = document.write.bind(document);

  function favoritesRuntime() {
    "use strict";
    const STORAGE_KEY = "formaFavoritesV1";
    const SHARE_PARAM = "favorites";
    const MAX_FAVORITES = 60;
    let scheduled = false;

    function readIds() {
      try {
        const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
        return Array.isArray(value) ? [...new Set(value.map(Number).filter(Number.isFinite))].slice(0, MAX_FAVORITES) : [];
      } catch { return []; }
    }

    function writeIds(ids) {
      const clean = [...new Set(ids.map(Number).filter(Number.isFinite))].slice(0, MAX_FAVORITES);
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(clean)); } catch {}
      window.dispatchEvent(new CustomEvent("forma:favorites-changed", { detail: clean }));
      return clean;
    }

    function product(id) {
      try { return typeof productById === "function" ? productById(id) : null; } catch { return null; }
    }

    function importSharedSelection() {
      const raw = new URL(location.href).searchParams.get(SHARE_PARAM);
      if (!raw) return false;
      const imported = raw.split(",").map(Number).filter(id => Number.isFinite(id) && product(id));
      if (!imported.length) return false;
      writeIds([...imported, ...readIds()]);
      return true;
    }

    function toggle(id) {
      const numericId = Number(id);
      if (!product(numericId)) return;
      const ids = readIds();
      const exists = ids.includes(numericId);
      writeIds(exists ? ids.filter(item => item !== numericId) : [numericId, ...ids]);
      if (typeof showToast === "function") showToast(exists ? "Удалено из избранного" : "Добавлено в избранное");
      refresh();
    }

    function addStyles() {
      if (document.getElementById("favoritesStyles")) return;
      const style = document.createElement("style");
      style.id = "favoritesStyles";
      style.textContent = `
        .favorite-toggle{position:absolute;top:11px;right:11px;z-index:7;width:42px;height:42px;border:0;border-radius:50%;background:rgba(255,255,255,.92);box-shadow:0 5px 18px rgba(0,0,0,.13);display:grid;place-items:center;font-size:23px;line-height:1;color:var(--ink);padding:0}.favorite-toggle.active{background:var(--ink);color:#fff}.favorite-toggle:hover{transform:scale(1.05)}
        .modal-favorite{position:static;width:auto;height:46px;border:1px solid var(--line);box-shadow:none;border-radius:999px;padding:0 16px;display:inline-flex;gap:8px;font-size:15px;font-weight:800;margin-top:12px}.favorites-nav{position:relative}.favorites-nav .badge{margin-left:2px}
        .favorites-overlay{position:fixed;inset:0;background:rgba(20,19,17,.52);backdrop-filter:blur(5px);z-index:135;opacity:0;pointer-events:none;transition:.2s}.favorites-overlay.show{opacity:1;pointer-events:auto}
        .favorites-drawer{position:fixed;right:0;top:0;height:100%;width:min(560px,100%);background:var(--surface);z-index:140;transform:translateX(100%);transition:.28s;display:flex;flex-direction:column;box-shadow:-20px 0 70px rgba(0,0,0,.18)}.favorites-drawer.show{transform:none}
        .favorites-head{padding:20px 22px;border-bottom:1px solid var(--line);display:flex;align-items:center;justify-content:space-between;gap:14px}.favorites-head h2{font-family:Georgia,serif;font-size:29px;font-weight:500;margin:0}.favorites-head p{margin:5px 0 0;color:var(--muted);font-size:12px}.favorites-close{border:0;background:var(--surface-2);border-radius:50%;width:42px;height:42px;font-size:22px}
        .favorites-body{padding:16px 22px;overflow:auto;flex:1}.favorites-empty{padding:42px 18px;text-align:center;color:var(--muted);line-height:1.55}.favorites-list{display:grid;gap:11px}.favorites-item{display:grid;grid-template-columns:88px 1fr auto;gap:12px;align-items:center;border:1px solid var(--line);border-radius:16px;padding:9px;background:var(--surface)}.favorites-item-image{width:88px;height:88px;object-fit:contain;background:#fff;border-radius:11px;cursor:pointer}.favorites-item-name{font-weight:800;font-size:14px;line-height:1.3;cursor:pointer}.favorites-item-price{font-size:13px;color:var(--muted);margin-top:7px}.favorites-item-actions{display:flex;flex-direction:column;gap:7px}.favorites-item-actions button{width:38px;height:38px;border:0;border-radius:50%;font-size:18px}.favorites-add{background:var(--ink);color:#fff}.favorites-remove{background:var(--surface-2);color:var(--danger)}
        .favorites-foot{padding:16px 22px calc(16px + env(safe-area-inset-bottom));border-top:1px solid var(--line);display:grid;grid-template-columns:1fr 1fr;gap:9px}.favorites-foot button{border:0;border-radius:999px;padding:13px 15px;font-weight:800}.favorites-foot button:disabled{opacity:.45}.favorites-share{background:var(--accent);color:#fff}.favorites-clear{background:var(--surface-2);color:var(--ink)}
        @media(max-width:700px){.favorite-toggle{width:44px;height:44px}.favorites-item{grid-template-columns:74px 1fr auto}.favorites-item-image{width:74px;height:74px}.favorites-foot{grid-template-columns:1fr}}
      `;
      document.head.appendChild(style);
    }

    function ensureInterface() {
      let overlay = document.getElementById("favoritesOverlay");
      if (!overlay) {
        overlay = document.createElement("div");
        overlay.className = "favorites-overlay";
        overlay.id = "favoritesOverlay";
        document.body.appendChild(overlay);
      }
      let drawer = document.getElementById("favoritesDrawer");
      if (!drawer) {
        drawer = document.createElement("aside");
        drawer.className = "favorites-drawer";
        drawer.id = "favoritesDrawer";
        drawer.setAttribute("aria-hidden", "true");
        drawer.innerHTML = `<div class="favorites-head"><div><h2>Избранное</h2><p>Сохраняется в этом браузере без регистрации</p></div><button type="button" class="favorites-close" aria-label="Закрыть">×</button></div><div class="favorites-body" id="favoritesBody"></div><div class="favorites-foot"><button type="button" class="favorites-share" data-favorites-share>Отправить подборку</button><button type="button" class="favorites-clear" data-favorites-clear>Очистить</button></div>`;
        document.body.appendChild(drawer);
      }
      return { overlay, drawer };
    }

    function imageFor(item) {
      const images = Array.isArray(item?.images) ? item.images.filter(Boolean) : [];
      return images[0] || item?.directImage || "";
    }

    function renderDrawer() {
      const { drawer } = ensureInterface();
      const body = drawer.querySelector("#favoritesBody");
      const products = readIds().map(product).filter(Boolean);
      body.innerHTML = products.length ? `<div class="favorites-list">${products.map(item => {
        const image = imageFor(item);
        return `<article class="favorites-item">${image ? `<img class="favorites-item-image" src="${image}" alt="${esc(item.name)}" loading="lazy" decoding="async" data-favorite-open="${item.id}">` : `<div class="favorites-item-image" data-favorite-open="${item.id}"></div>`}<div><div class="favorites-item-name" data-favorite-open="${item.id}">${esc(item.name)}</div><div class="favorites-item-price">${formatPrice(sellingPrice(item))}</div></div><div class="favorites-item-actions"><button type="button" class="favorites-add" data-favorite-add="${item.id}" aria-label="Добавить в корзину">+</button><button type="button" class="favorites-remove" data-favorite-remove="${item.id}" aria-label="Удалить из избранного">×</button></div></article>`;
      }).join("")}</div>` : `<div class="favorites-empty"><strong>В избранном пока ничего нет</strong><br><br>Нажимайте на сердечко у товаров, чтобы сохранить их и вернуться позже.</div>`;
      const count = products.length;
      document.querySelectorAll("[data-favorites-count]").forEach(node => { node.textContent = String(count); });
      drawer.querySelector("[data-favorites-share]").disabled = count === 0;
      drawer.querySelector("[data-favorites-clear]").disabled = count === 0;
    }

    function addHeaderButton() {
      if (document.querySelector("[data-open-favorites]")) return;
      const nav = document.querySelector("header .nav") || document.querySelector(".nav");
      if (!nav) return;
      const cartButton = nav.querySelector("[data-open-cart],#cartButton,.icon-btn:last-of-type");
      const button = document.createElement("button");
      button.type = "button";
      button.className = "icon-btn favorites-nav";
      button.dataset.openFavorites = "";
      button.setAttribute("aria-label", "Открыть избранное");
      button.innerHTML = `♡ <span>Избранное</span> <span class="badge" data-favorites-count>0</span>`;
      if (cartButton) nav.insertBefore(button, cartButton); else nav.appendChild(button);
    }

    function addCardButtons() {
      document.querySelectorAll("[data-product]").forEach(card => {
        const visual = card.querySelector(".visual");
        if (!visual || visual.querySelector("[data-favorite-toggle]")) return;
        const button = document.createElement("button");
        button.type = "button";
        button.className = "favorite-toggle";
        button.dataset.favoriteToggle = card.dataset.product;
        visual.appendChild(button);
      });
    }

    function addModalButton() {
      const modal = document.getElementById("modal");
      if (!modal?.classList.contains("show")) return;
      const id = Number(activeGallery?.productId);
      const content = modal.querySelector(".modal-content");
      if (!content || !product(id) || content.querySelector(".modal-favorite")) return;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "favorite-toggle modal-favorite";
      button.dataset.favoriteToggle = String(id);
      const anchor = content.querySelector(".journey-actions") || content.querySelector(".btn.btn-primary");
      if (anchor?.parentNode) anchor.parentNode.insertBefore(button, anchor); else content.appendChild(button);
    }

    function updateHearts() {
      const favorites = new Set(readIds());
      document.querySelectorAll("[data-favorite-toggle]").forEach(button => {
        const active = favorites.has(Number(button.dataset.favoriteToggle));
        button.classList.toggle("active", active);
        button.setAttribute("aria-pressed", String(active));
        button.setAttribute("aria-label", active ? "Удалить из избранного" : "Добавить в избранное");
        button.innerHTML = button.classList.contains("modal-favorite") ? `${active ? "♥" : "♡"} ${active ? "В избранном" : "В избранное"}` : (active ? "♥" : "♡");
      });
      document.querySelectorAll("[data-favorites-count]").forEach(node => { node.textContent = String(favorites.size); });
    }

    function openDrawer() {
      const { overlay, drawer } = ensureInterface();
      renderDrawer();
      overlay.classList.add("show");
      drawer.classList.add("show");
      drawer.setAttribute("aria-hidden", "false");
      document.body.style.overflow = "hidden";
    }

    function closeDrawer() {
      document.getElementById("favoritesOverlay")?.classList.remove("show");
      const drawer = document.getElementById("favoritesDrawer");
      drawer?.classList.remove("show");
      drawer?.setAttribute("aria-hidden", "true");
      document.body.style.overflow = "";
    }

    async function shareSelection() {
      const ids = readIds();
      if (!ids.length) return;
      const url = new URL(location.href);
      url.searchParams.delete("product");
      url.searchParams.set(SHARE_PARAM, ids.join(","));
      const data = { title: "Подборка FORMA HOME", text: `Моя подборка товаров FORMA HOME (${ids.length})`, url: url.toString() };
      if (navigator.share) {
        try { await navigator.share(data); return; } catch (error) { if (error?.name === "AbortError") return; }
      }
      try { await navigator.clipboard.writeText(data.url); }
      catch {
        const area = document.createElement("textarea");
        area.value = data.url; area.style.position = "fixed"; area.style.opacity = "0";
        document.body.appendChild(area); area.select(); document.execCommand("copy"); area.remove();
      }
      if (typeof showToast === "function") showToast("Ссылка на подборку скопирована");
    }

    function refresh() {
      scheduled = false;
      addHeaderButton();
      addCardButtons();
      addModalButton();
      updateHearts();
    }

    function scheduleRefresh() {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(refresh);
    }

    document.addEventListener("click", event => {
      const favoriteButton = event.target.closest("[data-favorite-toggle]");
      if (favoriteButton) {
        event.preventDefault();
        event.stopPropagation();
        toggle(favoriteButton.dataset.favoriteToggle);
        return;
      }
      if (event.target.closest("[data-open-favorites]")) { openDrawer(); return; }
      if (event.target.closest(".favorites-close") || event.target.id === "favoritesOverlay") { closeDrawer(); return; }
      const remove = event.target.closest("[data-favorite-remove]");
      if (remove) { toggle(remove.dataset.favoriteRemove); renderDrawer(); return; }
      const add = event.target.closest("[data-favorite-add]");
      if (add) { addToCart(add.dataset.favoriteAdd); return; }
      const open = event.target.closest("[data-favorite-open]");
      if (open) { closeDrawer(); openProduct(open.dataset.favoriteOpen); scheduleRefresh(); return; }
      if (event.target.closest("[data-favorites-share]")) { shareSelection(); return; }
      if (event.target.closest("[data-favorites-clear]")) { writeIds([]); renderDrawer(); refresh(); }
    }, true);

    document.addEventListener("keydown", event => { if (event.key === "Escape") closeDrawer(); });
    window.addEventListener("forma:favorites-changed", scheduleRefresh);
    const observer = new MutationObserver(scheduleRefresh);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });

    addStyles();
    ensureInterface();
    const imported = importSharedSelection();
    scheduleRefresh();
    if (imported) setTimeout(() => {
      openDrawer();
      if (typeof showToast === "function") showToast("Подборка добавлена в избранное");
    }, 250);
  }

  document.write = function patchedWrite(...parts) {
    let html = parts.join("");
    if (typeof html === "string" && html.includes("</body>")) {
      const runtime = `<script>(${favoritesRuntime.toString()})();<\/script>`;
      html = html.replace("</body>", `${runtime}</body>`);
      return originalWrite(html);
    }
    return originalWrite(...parts);
  };
})();
