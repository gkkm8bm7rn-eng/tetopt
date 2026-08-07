(() => {
  'use strict';

  const PAGE_SIZE = 24;
  const state = {
    models: [],
    filtered: [],
    rendered: 0,
    favorites: loadSet('forma-next-favorites'),
    cart: loadSet('forma-next-cart'),
    activeModel: null,
    activeVariant: null,
  };

  const els = {
    grid: document.querySelector('#product-grid'),
    status: document.querySelector('#catalog-status'),
    count: document.querySelector('#result-count'),
    modelCount: document.querySelector('#model-count'),
    variantCount: document.querySelector('#variant-count'),
    search: document.querySelector('#search'),
    collection: document.querySelector('#collection-filter'),
    price: document.querySelector('#price-filter'),
    loadMore: document.querySelector('#load-more'),
    empty: document.querySelector('#empty-state'),
    reset: document.querySelector('#reset-filters'),
    template: document.querySelector('#product-template'),
    dialog: document.querySelector('#product-dialog'),
    dialogContent: document.querySelector('#dialog-content'),
    dialogClose: document.querySelector('#dialog-close'),
    favCount: document.querySelector('#favorite-count'),
    cartCount: document.querySelector('#cart-count'),
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
      if (!Array.isArray(products)) throw new Error('В catalog.json не найден массив products');

      state.models = products.map(normalizeModel).filter(model => model.variants.length > 0);
      state.filtered = state.models.slice();
      els.modelCount.textContent = formatNumber(state.models.length);
      els.variantCount.textContent = formatNumber(state.models.reduce((sum, model) => sum + model.variants.length, 0));
      buildCollectionFilter();
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
    for (const color of colors) {
      const colorVariants = Array.isArray(color.variants) ? color.variants : [];
      for (const variant of colorVariants) {
        variants.push({
          ...variant,
          colorLabel: color.label || variant.color || '',
          colorHex: color.hex || '',
          images: normalizeImages(variant),
        });
      }
    }
    if (!variants.length && Array.isArray(model.variants)) {
      for (const variant of model.variants) variants.push({ ...variant, images: normalizeImages(variant) });
    }
    const collections = uniqueStrings(Array.isArray(model.collection) ? model.collection : [model.collection]);
    const first = variants[0] || {};
    return {
      ...model,
      id: String(model.id || `model-${index + 1}`),
      name: model.name || first.name || `Модель ${index + 1}`,
      collections,
      variants,
      minWholesalePrice: positiveNumber(model.minWholesalePrice) ?? minPrice(variants, 'wholesalePrice'),
      minRetailPrice: positiveNumber(model.minRetailPrice) ?? minPrice(variants, 'retailPrice'),
      searchable: normalizeText([model.name, collections.join(' '), variants.map(v => `${v.specs || ''} ${v.colorLabel || ''}`).join(' ')].join(' ')),
    };
  }

  function normalizeImages(variant) {
    const candidates = [];
    if (Array.isArray(variant.images)) candidates.push(...variant.images);
    if (variant.image) candidates.push(variant.image);
    if (variant.directImage) candidates.push(variant.directImage);
    return uniqueStrings(candidates.filter(isLocalImagePath));
  }

  function buildCollectionFilter() {
    const values = new Set();
    state.models.forEach(model => model.collections.forEach(value => values.add(value)));
    [...values].sort((a, b) => a.localeCompare(b, 'ru')).forEach(value => {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = value;
      els.collection.append(option);
    });
  }

  function bindEvents() {
    let searchTimer = 0;
    els.search.addEventListener('input', () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(applyFilters, 120);
    });
    els.collection.addEventListener('change', applyFilters);
    els.price.addEventListener('change', applyFilters);
    els.loadMore.addEventListener('click', renderNextPage);
    els.reset.addEventListener('click', () => {
      els.search.value = '';
      els.collection.value = '';
      els.price.value = '';
      applyFilters();
    });
    els.dialogClose.addEventListener('click', closeDialog);
    els.dialog.addEventListener('click', event => {
      if (event.target === els.dialog) closeDialog();
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && els.dialog.open) closeDialog();
    });
  }

  function applyFilters() {
    const query = normalizeText(els.search.value);
    const collection = els.collection.value;
    const priceRange = parsePriceRange(els.price.value);

    state.filtered = state.models.filter(model => {
      if (query && !model.searchable.includes(query)) return false;
      if (collection && !model.collections.includes(collection)) return false;
      if (priceRange && !withinPrice(model.minWholesalePrice, priceRange)) return false;
      return true;
    });

    state.rendered = 0;
    els.grid.replaceChildren();
    els.empty.hidden = state.filtered.length !== 0;
    els.count.textContent = `${formatNumber(state.filtered.length)} ${plural(state.filtered.length, 'модель', 'модели', 'моделей')}`;
    renderNextPage();
  }

  function renderNextPage() {
    const end = Math.min(state.rendered + PAGE_SIZE, state.filtered.length);
    const fragment = document.createDocumentFragment();
    for (let i = state.rendered; i < end; i += 1) fragment.append(createCard(state.filtered[i]));
    els.grid.append(fragment);
    state.rendered = end;
    els.loadMore.hidden = state.rendered >= state.filtered.length;
  }

  function createCard(model) {
    const node = els.template.content.firstElementChild.cloneNode(true);
    const variant = chooseDisplayVariant(model);
    const image = variant?.images?.[0] || '';
    const img = node.querySelector('.card-image');
    img.src = image ? relativeAsset(image) : fallbackSvg();
    img.alt = model.name;
    img.addEventListener('error', () => { img.src = fallbackSvg(); }, { once: true });
    node.querySelector('.card-collection').textContent = model.collections[0] || 'FORMA HOME';
    node.querySelector('.card-name').textContent = model.name;
    node.querySelector('.card-meta').textContent = `${model.variants.length} ${plural(model.variants.length, 'вариант', 'варианта', 'вариантов')}${model.colors?.length ? ` · ${model.colors.length} ${plural(model.colors.length, 'цвет', 'цвета', 'цветов')}` : ''}`;
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
    renderDialog();
    if (typeof els.dialog.showModal === 'function') els.dialog.showModal();
    else els.dialog.setAttribute('open', '');
  }

  function renderDialog() {
    const model = state.activeModel;
    const variant = state.activeVariant;
    if (!model || !variant) return;
    const images = variant.images.length ? variant.images : [''];
    const activeImage = images[0];
    const variantsHtml = model.variants.map((item, index) => {
      const label = item.colorLabel || `Вариант ${index + 1}`;
      const active = item.sourceId === variant.sourceId ? ' active' : '';
      return `<button class="variant-pill${active}" type="button" data-source-id="${escapeAttr(String(item.sourceId ?? index))}">${escapeHtml(label)}</button>`;
    }).join('');
    const thumbs = images.map((src, index) => `<button class="thumb${index === 0 ? ' active' : ''}" type="button" data-image="${escapeAttr(src)}"><img src="${escapeAttr(src ? relativeAsset(src) : fallbackSvg())}" alt="" loading="lazy" decoding="async"></button>`).join('');

    els.dialogContent.innerHTML = `
      <div class="dialog-layout">
        <div class="dialog-gallery">
          <img class="dialog-main-image" id="dialog-main-image" src="${escapeAttr(activeImage ? relativeAsset(activeImage) : fallbackSvg())}" alt="${escapeAttr(model.name)}">
          <div class="thumb-row">${thumbs}</div>
        </div>
        <div class="dialog-info">
          <p class="eyebrow">${escapeHtml(model.collections[0] || 'FORMA HOME')}</p>
          <h2>${escapeHtml(model.name)}</h2>
          <strong class="dialog-price">${escapeHtml(priceText(variant.wholesalePrice || model.minWholesalePrice))}</strong>
          ${positiveNumber(variant.retailPrice) ? `<span class="dialog-retail">Розничная цена: ${formatPrice(variant.retailPrice)}</span>` : ''}
          ${model.variants.length > 1 ? `<p class="variant-title">Цвет / вариант</p><div class="variant-pills">${variantsHtml}</div>` : ''}
          ${variant.specs ? `<div class="specs">${escapeHtml(String(variant.specs))}</div>` : ''}
          <div class="dialog-actions">
            <button class="add-cart" type="button" data-cart-id="${escapeAttr(String(variant.sourceId ?? model.id))}">Добавить в заказ</button>
            <button class="dialog-favorite" type="button" aria-label="Добавить модель в избранное">${state.favorites.has(model.id) ? '♥' : '♡'}</button>
          </div>
        </div>
      </div>`;

    els.dialogContent.querySelectorAll('.variant-pill').forEach((button, index) => {
      button.addEventListener('click', () => {
        const sourceId = button.dataset.sourceId;
        state.activeVariant = model.variants.find((item, itemIndex) => String(item.sourceId ?? itemIndex) === sourceId) || model.variants[index];
        renderDialog();
      });
    });
    els.dialogContent.querySelectorAll('.thumb').forEach(button => {
      button.addEventListener('click', () => {
        const main = els.dialogContent.querySelector('#dialog-main-image');
        main.src = button.dataset.image ? relativeAsset(button.dataset.image) : fallbackSvg();
        els.dialogContent.querySelectorAll('.thumb').forEach(item => item.classList.remove('active'));
        button.classList.add('active');
      });
    });
    els.dialogContent.querySelector('.add-cart')?.addEventListener('click', event => {
      const id = event.currentTarget.dataset.cartId;
      state.cart.add(id);
      saveSet('forma-next-cart', state.cart);
      updateCounters();
      event.currentTarget.textContent = 'Добавлено ✓';
    });
    els.dialogContent.querySelector('.dialog-favorite')?.addEventListener('click', event => {
      toggleFavorite(model.id, event.currentTarget, true);
      event.currentTarget.textContent = state.favorites.has(model.id) ? '♥' : '♡';
    });
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

  function isLocalImagePath(value) {
    const path = String(value || '').trim();
    return path && !/^(?:https?:)?\/\//i.test(path) && !/^data:/i.test(path) && /\.(?:avif|webp|png|jpe?g|gif)(?:\?.*)?$/i.test(path);
  }

  function relativeAsset(path) {
    const clean = String(path).replace(/^\.\//, '').replace(/^\//, '');
    return `../${clean}`;
  }

  function fallbackSvg() {
    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800"><rect width="100%" height="100%" fill="#eeebe4"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#777168" font-family="Arial" font-size="28">FORMA HOME</text></svg>')}`;
  }

  function loadSet(key) {
    try { return new Set(JSON.parse(localStorage.getItem(key) || '[]')); }
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
