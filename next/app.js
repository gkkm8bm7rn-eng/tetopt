(() => {
  'use strict';

  const PAGE_SIZE = 24;
  const FIRST_EAGER_IMAGES = 4;
  const INITIAL_THUMBS = 3;
  const state = {
    models: [],
    filtered: [],
    rendered: 0,
    favorites: loadSet('forma-next-favorites'),
    cart: loadSet('forma-next-cart'),
    view: 'all',
    activeModel: null,
    activeVariant: null,
    activeImageIndex: 0,
  };

  const els = {
    grid: document.querySelector('#product-grid'),
    status: document.querySelector('#catalog-status'),
    count: document.querySelector('#result-count'),
    modelCount: document.querySelector('#model-count'),
    variantCount: document.querySelector('#variant-count'),
    search: document.querySelector('#search'),
    category: document.querySelector('#category-filter'),
    categoryField: document.querySelector('#category-field'),
    collection: document.querySelector('#collection-filter'),
    price: document.querySelector('#price-filter'),
    loadMore: document.querySelector('#load-more'),
    empty: document.querySelector('#empty-state'),
    emptyTitle: document.querySelector('#empty-title'),
    emptyCopy: document.querySelector('#empty-copy'),
    reset: document.querySelector('#reset-filters'),
    template: document.querySelector('#product-template'),
    dialog: document.querySelector('#product-dialog'),
    dialogContent: document.querySelector('#dialog-content'),
    dialogClose: document.querySelector('#dialog-close'),
    favCount: document.querySelector('#favorite-count'),
    cartCount: document.querySelector('#cart-count'),
    favoritesButton: document.querySelector('[data-action="favorites"]'),
    cartButton: document.querySelector('[data-action="cart"]'),
    allButton: document.querySelector('[data-action="all"]'),
  };

  init();

  async function init() {
    bindEvents();
    updateCounters();
    try {
      const response = await fetch('../catalog.json', { cache: 'no-cache' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const raw = await response.json();
      const products = Array.isArray(raw) ? raw : raw.products;
      if (!Array.isArray(products) || products.length === 0) throw new Error('В catalog.json не найден непустой массив products');

      state.models = products.map(normalizeModel).filter(model => model.variants.length > 0);
      assertClientCatalog(state.models);
      els.modelCount.textContent = formatNumber(state.models.length);
      els.variantCount.textContent = formatNumber(state.models.reduce((sum, model) => sum + model.variants.length, 0));
      buildFilters();
      els.status.hidden = true;
      applyFilters();
    } catch (error) {
      console.error('[next-catalog] Failed to load catalog', error);
      els.status.hidden = true;
      els.grid.innerHTML = `<div class="error-box"><strong>Каталог не загрузился</strong><p>Параллельная версия не затрагивает основной сайт. Ошибка: ${escapeHtml(error.message)}</p></div>`;
    }
  }

  function normalizeModel(model, index) {
    const colors = Array.isArray(model.colors) ? model.colors : [];
    const variants = [];
    const colorGroups = [];

    colors.forEach((color, colorIndex) => {
      const colorVariants = Array.isArray(color.variants) ? color.variants : [];
      const normalized = colorVariants.map((variant, variantIndex) => ({
        ...variant,
        colorLabel: color.label || variant.color || '',
        colorHex: color.hex || '',
        colorKey: `color-${colorIndex}`,
        variantKey: String(variant.sourceId ?? `${colorIndex}-${variantIndex}`),
        images: normalizeImages(variant),
      }));
      if (normalized.length) {
        colorGroups.push({
          key: `color-${colorIndex}`,
          label: color.label || normalized[0].colorLabel || `Цвет ${colorIndex + 1}`,
          hex: color.hex || normalized[0].colorHex || '',
          variants: normalized,
        });
        variants.push(...normalized);
      }
    });

    if (!variants.length && Array.isArray(model.variants)) {
      model.variants.forEach((variant, variantIndex) => {
        const normalized = {
          ...variant,
          colorLabel: variant.color || '',
          colorHex: variant.colorHex || '',
          colorKey: 'color-0',
          variantKey: String(variant.sourceId ?? variantIndex),
          images: normalizeImages(variant),
        };
        variants.push(normalized);
      });
      if (variants.length) colorGroups.push({ key: 'color-0', label: variants[0].colorLabel || 'Основной вариант', hex: variants[0].colorHex || '', variants });
    }

    const collections = uniqueStrings(Array.isArray(model.collection) ? model.collection : [model.collection]);
    const categories = uniqueStrings([
      ...(Array.isArray(model.category) ? model.category : [model.category]),
      ...variants.map(variant => variant.category),
    ]);
    const first = variants[0] || {};
    return {
      ...model,
      id: String(model.id || `model-${index + 1}`),
      name: model.name || first.name || `Модель ${index + 1}`,
      collections,
      categories,
      colorGroups,
      variants,
      minWholesalePrice: positiveNumber(model.minWholesalePrice) ?? minPrice(variants, 'wholesalePrice'),
      minRetailPrice: positiveNumber(model.minRetailPrice) ?? minPrice(variants, 'retailPrice'),
      searchable: normalizeText([
        model.name,
        collections.join(' '),
        categories.join(' '),
        variants.map(v => `${v.specs || ''} ${v.colorLabel || ''}`).join(' '),
      ].join(' ')),
    };
  }

  function normalizeImages(variant) {
    const candidates = [];
    if (Array.isArray(variant.images)) candidates.push(...variant.images);
    if (variant.image) candidates.push(variant.image);
    if (variant.directImage) candidates.push(variant.directImage);
    return uniqueStrings(candidates.filter(isLocalImagePath));
  }

  function assertClientCatalog(models) {
    const modelIds = new Set();
    const sourceIds = new Set();
    for (const model of models) {
      if (modelIds.has(model.id)) throw new Error(`Повторяется model id: ${model.id}`);
      modelIds.add(model.id);
      if (!model.name) throw new Error(`У модели ${model.id} отсутствует название`);
      for (const variant of model.variants) {
        if (variant.sourceId == null) continue;
        const sourceId = String(variant.sourceId);
        if (sourceIds.has(sourceId)) throw new Error(`Повторяется sourceId: ${sourceId}`);
        sourceIds.add(sourceId);
      }
    }
  }

  function buildFilters() {
    fillSelect(els.collection, uniqueSorted(state.models.flatMap(model => model.collections)));
    const categories = uniqueSorted(state.models.flatMap(model => model.categories));
    if (categories.length) fillSelect(els.category, categories);
    else els.categoryField.hidden = true;
  }

  function fillSelect(select, values) {
    values.forEach(value => {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = value;
      select.append(option);
    });
  }

  function bindEvents() {
    let searchTimer = 0;
    els.search.addEventListener('input', () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(applyFilters, 120);
    });
    els.category.addEventListener('change', applyFilters);
    els.collection.addEventListener('change', applyFilters);
    els.price.addEventListener('change', applyFilters);
    els.loadMore.addEventListener('click', renderNextPage);
    els.reset.addEventListener('click', resetFilters);
    els.favoritesButton.addEventListener('click', () => setView(state.view === 'favorites' ? 'all' : 'favorites'));
    els.cartButton.addEventListener('click', () => setView(state.view === 'cart' ? 'all' : 'cart'));
    els.allButton.addEventListener('click', () => setView('all'));
    els.dialogClose.addEventListener('click', closeDialog);
    els.dialog.addEventListener('click', event => {
      if (event.target === els.dialog) closeDialog();
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && els.dialog.open) closeDialog();
    });
  }

  function resetFilters() {
    els.search.value = '';
    els.category.value = '';
    els.collection.value = '';
    els.price.value = '';
    setView('all', false);
    applyFilters();
  }

  function setView(view, reapply = true) {
    state.view = view;
    els.favoritesButton.classList.toggle('active', view === 'favorites');
    els.cartButton.classList.toggle('active', view === 'cart');
    els.allButton.classList.toggle('active', view === 'all');
    els.favoritesButton.setAttribute('aria-pressed', String(view === 'favorites'));
    els.cartButton.setAttribute('aria-pressed', String(view === 'cart'));
    els.allButton.setAttribute('aria-pressed', String(view === 'all'));
    if (reapply) {
      applyFilters();
      document.querySelector('#catalog')?.scrollIntoView({ block: 'start' });
    }
  }

  function applyFilters() {
    const query = normalizeText(els.search.value);
    const category = els.category.value;
    const collection = els.collection.value;
    const priceRange = parsePriceRange(els.price.value);

    state.filtered = state.models.filter(model => {
      if (state.view === 'favorites' && !state.favorites.has(model.id)) return false;
      if (state.view === 'cart' && !model.variants.some(variant => state.cart.has(String(variant.sourceId ?? model.id)))) return false;
      if (query && !model.searchable.includes(query)) return false;
      if (category && !model.categories.includes(category)) return false;
      if (collection && !model.collections.includes(collection)) return false;
      if (priceRange && !withinPrice(model.minWholesalePrice, priceRange)) return false;
      return true;
    });

    state.rendered = 0;
    els.grid.replaceChildren();
    els.empty.hidden = state.filtered.length !== 0;
    updateEmptyState();
    els.count.textContent = resultCountText();
    renderNextPage();
  }

  function resultCountText() {
    const prefix = state.view === 'favorites' ? 'Избранное: ' : state.view === 'cart' ? 'В заказе: ' : '';
    return `${prefix}${formatNumber(state.filtered.length)} ${plural(state.filtered.length, 'модель', 'модели', 'моделей')}`;
  }

  function updateEmptyState() {
    if (state.view === 'favorites') {
      els.emptyTitle.textContent = 'В избранном пока пусто';
      els.emptyCopy.textContent = 'Отмечайте понравившиеся модели сердцем — они останутся здесь.';
    } else if (state.view === 'cart') {
      els.emptyTitle.textContent = 'В заказе пока ничего нет';
      els.emptyCopy.textContent = 'Откройте товар и добавьте подходящий вариант в заказ.';
    } else {
      els.emptyTitle.textContent = 'Ничего не нашли';
      els.emptyCopy.textContent = 'Измените запрос или сбросьте фильтры.';
    }
  }

  function renderNextPage() {
    if (!state.filtered.length) {
      els.loadMore.hidden = true;
      return;
    }
    const start = state.rendered;
    const end = Math.min(start + PAGE_SIZE, state.filtered.length);
    const fragment = document.createDocumentFragment();
    for (let i = start; i < end; i += 1) fragment.append(createCard(state.filtered[i], i));
    els.grid.append(fragment);
    state.rendered = end;
    els.loadMore.hidden = state.rendered >= state.filtered.length;
  }

  function createCard(model, position) {
    const node = els.template.content.firstElementChild.cloneNode(true);
    const variant = chooseDisplayVariant(model);
    const image = variant?.images?.[0] || '';
    const img = node.querySelector('.card-image');
    if (position < FIRST_EAGER_IMAGES) {
      img.loading = 'eager';
      img.fetchPriority = 'high';
    } else {
      img.loading = 'lazy';
      img.fetchPriority = 'low';
    }
    img.src = image ? relativeAsset(image) : fallbackSvg();
    img.alt = model.name;
    img.addEventListener('error', () => { img.src = fallbackSvg(); }, { once: true });
    node.querySelector('.card-collection').textContent = model.collections[0] || model.categories[0] || 'FORMA HOME';
    node.querySelector('.card-name').textContent = model.name;
    node.querySelector('.card-meta').textContent = `${model.variants.length} ${plural(model.variants.length, 'вариант', 'варианта', 'вариантов')}${model.colorGroups.length > 1 ? ` · ${model.colorGroups.length} ${plural(model.colorGroups.length, 'цвет', 'цвета', 'цветов')}` : ''}`;
    node.querySelector('.card-price').textContent = priceText(model.minWholesalePrice);
    node.querySelector('.card-open').addEventListener('click', () => openModel(model));

    const favorite = node.querySelector('.favorite-button');
    syncFavoriteButton(favorite, model.id);
    favorite.addEventListener('click', () => toggleFavorite(model.id, favorite));
    return node;
  }

  function openModel(model) {
    state.activeModel = model;
    state.activeVariant = chooseDisplayVariant(model);
    state.activeImageIndex = 0;
    renderDialog();
    if (typeof els.dialog.showModal === 'function') els.dialog.showModal();
    else els.dialog.setAttribute('open', '');
  }

  function renderDialog() {
    const model = state.activeModel;
    const variant = state.activeVariant;
    if (!model || !variant) return;
    const images = variant.images.length ? variant.images : [''];
    state.activeImageIndex = Math.min(state.activeImageIndex, images.length - 1);
    const activeImage = images[state.activeImageIndex] || '';
    const currentGroup = model.colorGroups.find(group => group.variants.some(item => sameVariant(item, variant))) || model.colorGroups[0];

    const colorsHtml = model.colorGroups.length > 1 ? model.colorGroups.map(group => {
      const active = group === currentGroup ? ' active' : '';
      const swatch = validHex(group.hex) ? `<span class="swatch" style="--swatch:${escapeAttr(group.hex)}"></span>` : '';
      return `<button class="color-pill${active}" type="button" data-color-key="${escapeAttr(group.key)}">${swatch}<span>${escapeHtml(group.label)}</span></button>`;
    }).join('') : '';

    const trueVariants = currentGroup?.variants || [variant];
    const variantsHtml = trueVariants.length > 1 ? trueVariants.map((item, index) => {
      const active = sameVariant(item, variant) ? ' active' : '';
      return `<button class="variant-pill${active}" type="button" data-variant-key="${escapeAttr(item.variantKey)}">${escapeHtml(variantLabel(item, index))}</button>`;
    }).join('') : '';

    const thumbs = images.map((src, index) => {
      const imageSrc = index < INITIAL_THUMBS && src ? ` src="${escapeAttr(relativeAsset(src))}"` : '';
      const dataSrc = src ? ` data-src="${escapeAttr(relativeAsset(src))}"` : '';
      return `<button class="thumb${index === state.activeImageIndex ? ' active' : ''}" type="button" data-image-index="${index}" aria-label="Фото ${index + 1} из ${images.length}"><img${imageSrc}${dataSrc} alt="" loading="lazy" decoding="async"></button>`;
    }).join('');

    els.dialogContent.innerHTML = `
      <div class="dialog-layout">
        <div class="dialog-gallery">
          <div class="main-image-wrap">
            <img class="dialog-main-image" id="dialog-main-image" src="${escapeAttr(activeImage ? relativeAsset(activeImage) : fallbackSvg())}" alt="${escapeAttr(model.name)}">
            ${images.length > 1 ? `<button class="gallery-arrow prev" type="button" data-gallery-step="-1" aria-label="Предыдущее фото">‹</button><button class="gallery-arrow next" type="button" data-gallery-step="1" aria-label="Следующее фото">›</button>` : ''}
          </div>
          ${images.length > 1 ? `<div class="thumb-row" aria-label="Фотографии товара">${thumbs}</div>` : ''}
        </div>
        <div class="dialog-info">
          <p class="eyebrow">${escapeHtml(model.collections[0] || model.categories[0] || 'FORMA HOME')}</p>
          <h2>${escapeHtml(model.name)}</h2>
          <strong class="dialog-price">${escapeHtml(priceText(variant.wholesalePrice || model.minWholesalePrice))}</strong>
          ${positiveNumber(variant.retailPrice) ? `<span class="dialog-retail">Розничная цена: ${formatPrice(variant.retailPrice)}</span>` : ''}
          ${colorsHtml ? `<p class="variant-title">Цвет</p><div class="color-pills">${colorsHtml}</div>` : ''}
          ${variantsHtml ? `<p class="variant-title">Исполнение</p><div class="variant-pills">${variantsHtml}</div>` : ''}
          ${variant.specs ? `<div class="specs">${escapeHtml(String(variant.specs))}</div>` : ''}
          <div class="dialog-actions">
            <button class="add-cart" type="button" data-cart-id="${escapeAttr(String(variant.sourceId ?? model.id))}">${state.cart.has(String(variant.sourceId ?? model.id)) ? 'В заказе ✓' : 'Добавить в заказ'}</button>
            <button class="dialog-favorite" type="button" aria-label="${state.favorites.has(model.id) ? 'Убрать модель из избранного' : 'Добавить модель в избранное'}">${state.favorites.has(model.id) ? '♥' : '♡'}</button>
          </div>
        </div>
      </div>`;

    bindDialogEvents(images, currentGroup);
    hydrateThumbs();
  }

  function bindDialogEvents(images, currentGroup) {
    els.dialogContent.querySelectorAll('.color-pill').forEach(button => {
      button.addEventListener('click', () => {
        const group = state.activeModel.colorGroups.find(item => item.key === button.dataset.colorKey);
        if (!group?.variants?.length) return;
        state.activeVariant = group.variants.find(item => item.images.length) || group.variants[0];
        state.activeImageIndex = 0;
        renderDialog();
      });
    });

    els.dialogContent.querySelectorAll('.variant-pill').forEach(button => {
      button.addEventListener('click', () => {
        const variant = currentGroup?.variants.find(item => item.variantKey === button.dataset.variantKey);
        if (!variant) return;
        state.activeVariant = variant;
        state.activeImageIndex = 0;
        renderDialog();
      });
    });

    els.dialogContent.querySelectorAll('.thumb').forEach(button => {
      button.addEventListener('click', () => showDialogImage(Number(button.dataset.imageIndex), images));
    });
    els.dialogContent.querySelectorAll('[data-gallery-step]').forEach(button => {
      button.addEventListener('click', () => stepDialogImage(Number(button.dataset.galleryStep), images));
    });

    const mainWrap = els.dialogContent.querySelector('.main-image-wrap');
    if (mainWrap && images.length > 1) bindSwipe(mainWrap, images);

    els.dialogContent.querySelector('.add-cart')?.addEventListener('click', event => {
      const id = event.currentTarget.dataset.cartId;
      if (state.cart.has(id)) state.cart.delete(id);
      else state.cart.add(id);
      saveSet('forma-next-cart', state.cart);
      updateCounters();
      event.currentTarget.textContent = state.cart.has(id) ? 'В заказе ✓' : 'Добавить в заказ';
      if (state.view === 'cart' && !state.cart.has(id)) applyFilters();
    });
    els.dialogContent.querySelector('.dialog-favorite')?.addEventListener('click', event => {
      toggleFavorite(state.activeModel.id, event.currentTarget, true);
      event.currentTarget.textContent = state.favorites.has(state.activeModel.id) ? '♥' : '♡';
      event.currentTarget.setAttribute('aria-label', state.favorites.has(state.activeModel.id) ? 'Убрать модель из избранного' : 'Добавить модель в избранное');
      if (state.view === 'favorites' && !state.favorites.has(state.activeModel.id)) applyFilters();
    });
  }

  function hydrateThumbs() {
    const row = els.dialogContent.querySelector('.thumb-row');
    if (!row) return;
    const pending = [...row.querySelectorAll('img[data-src]')].filter(img => !img.getAttribute('src'));
    if (!pending.length) return;
    if (!('IntersectionObserver' in window)) {
      pending.forEach(loadThumb);
      return;
    }
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        loadThumb(entry.target);
        observer.unobserve(entry.target);
      });
    }, { root: row, rootMargin: '80px' });
    pending.forEach(img => observer.observe(img));
  }

  function loadThumb(img) {
    if (!img.getAttribute('src') && img.dataset.src) img.src = img.dataset.src;
  }

  function showDialogImage(index, images) {
    if (!images.length) return;
    const safeIndex = (index + images.length) % images.length;
    state.activeImageIndex = safeIndex;
    const main = els.dialogContent.querySelector('#dialog-main-image');
    if (main) main.src = images[safeIndex] ? relativeAsset(images[safeIndex]) : fallbackSvg();
    els.dialogContent.querySelectorAll('.thumb').forEach((item, itemIndex) => {
      item.classList.toggle('active', itemIndex === safeIndex);
      if (itemIndex === safeIndex) {
        const img = item.querySelector('img');
        if (img) loadThumb(img);
        item.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      }
    });
  }

  function stepDialogImage(step, images) {
    showDialogImage(state.activeImageIndex + step, images);
  }

  function bindSwipe(target, images) {
    let startX = 0;
    let startY = 0;
    target.addEventListener('touchstart', event => {
      const touch = event.changedTouches[0];
      startX = touch.clientX;
      startY = touch.clientY;
    }, { passive: true });
    target.addEventListener('touchend', event => {
      const touch = event.changedTouches[0];
      const dx = touch.clientX - startX;
      const dy = touch.clientY - startY;
      if (Math.abs(dx) < 44 || Math.abs(dx) <= Math.abs(dy) * 1.15) return;
      stepDialogImage(dx < 0 ? 1 : -1, images);
    }, { passive: true });
  }

  function closeDialog() {
    if (typeof els.dialog.close === 'function') els.dialog.close();
    else els.dialog.removeAttribute('open');
  }

  function toggleFavorite(id, button, dialogButton = false) {
    if (state.favorites.has(id)) state.favorites.delete(id);
    else state.favorites.add(id);
    saveSet('forma-next-favorites', state.favorites);
    updateCounters();
    if (!dialogButton) syncFavoriteButton(button, id);
    if (state.view === 'favorites' && !state.favorites.has(id)) applyFilters();
  }

  function syncFavoriteButton(button, id) {
    const active = state.favorites.has(id);
    button.classList.toggle('active', active);
    button.textContent = active ? '♥' : '♡';
    button.setAttribute('aria-label', active ? 'Убрать из избранного' : 'Добавить в избранное');
  }

  function updateCounters() {
    els.favCount.textContent = state.favorites.size;
    els.cartCount.textContent = state.cart.size;
  }

  function chooseDisplayVariant(model) {
    return model.variants.find(variant => variant.images.length) || model.variants[0];
  }

  function sameVariant(a, b) {
    return a && b && a.variantKey === b.variantKey;
  }

  function variantLabel(variant, index) {
    const price = positiveNumber(variant.wholesalePrice);
    if (price) return `Вариант ${index + 1} · ${formatPrice(price)}`;
    return `Вариант ${index + 1}`;
  }

  function parsePriceRange(value) {
    if (!value) return null;
    const [min, max] = value.split('-');
    return { min: Number(min) || 0, max: max === 'inf' ? Infinity : Number(max) };
  }

  function withinPrice(price, range) {
    const value = positiveNumber(price);
    return value !== null && value >= range.min && value < range.max;
  }

  function minPrice(items, key) {
    const values = items.map(item => positiveNumber(item[key])).filter(value => value !== null);
    return values.length ? Math.min(...values) : null;
  }

  function positiveNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : null;
  }

  function priceText(value) {
    const price = positiveNumber(value);
    return price ? `от ${formatPrice(price)}` : 'Цена по запросу';
  }

  function formatPrice(value) {
    return `${new Intl.NumberFormat('ru-RU').format(Number(value))} ₽`;
  }

  function formatNumber(value) {
    return new Intl.NumberFormat('ru-RU').format(value);
  }

  function plural(number, one, few, many) {
    const n = Math.abs(number) % 100;
    const n1 = n % 10;
    if (n > 10 && n < 20) return many;
    if (n1 > 1 && n1 < 5) return few;
    if (n1 === 1) return one;
    return many;
  }

  function normalizeText(value) {
    return String(value || '').toLocaleLowerCase('ru').replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
  }

  function uniqueStrings(values) {
    return [...new Set(values.filter(Boolean).map(value => String(value).trim()).filter(Boolean))];
  }

  function uniqueSorted(values) {
    return uniqueStrings(values).sort((a, b) => a.localeCompare(b, 'ru'));
  }

  function isLocalImagePath(value) {
    const path = String(value || '').trim();
    return path && !/^(?:https?:)?\/\//i.test(path) && !/^data:/i.test(path) && /\.(?:avif|webp|png|jpe?g|gif)(?:\?.*)?$/i.test(path);
  }

  function relativeAsset(path) {
    const clean = String(path).replace(/^\.\//, '').replace(/^\//, '');
    return `../${clean}`;
  }

  function validHex(value) {
    return /^#[0-9a-f]{3,8}$/i.test(String(value || '').trim());
  }

  function fallbackSvg() {
    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800"><rect width="100%" height="100%" fill="#eeebe4"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#777168" font-family="Arial" font-size="28">FORMA HOME</text></svg>')}`;
  }

  function loadSet(key) {
    try { return new Set(JSON.parse(localStorage.getItem(key) || '[]').map(String)); }
    catch { return new Set(); }
  }

  function saveSet(key, value) {
    try { localStorage.setItem(key, JSON.stringify([...value])); } catch {}
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));
  }

  function escapeAttr(value) {
    return escapeHtml(value);
  }
})();
