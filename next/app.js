(() => {
  'use strict';

  const PAGE_SIZE = 24;
  const FIRST_EAGER_IMAGES = 4;
  const MAX_CARD_IMAGES = 3;
  const MAX_DIALOG_IMAGES = 6;

  const state = {
    sourceModelCount: 0,
    sourceVariantCount: 0,
    models: [],
    filtered: [],
    page: 1,
    favorites: loadSet('forma-next-favorites'),
    cart: loadSet('forma-next-cart'),
    view: 'all',
    activeModel: null,
    activeVariant: null,
    activeImageIndex: 0,
  };

  const els = {
    grid: document.querySelector('#product-grid'),
    pagination: document.querySelector('#pagination'),
    status: document.querySelector('#catalog-status'),
    count: document.querySelector('#result-count'),
    modelCount: document.querySelector('#model-count'),
    variantCount: document.querySelector('#variant-count'),
    search: document.querySelector('#search'),
    category: document.querySelector('#category-filter'),
    categoryField: document.querySelector('#category-field'),
    collection: document.querySelector('#collection-filter'),
    price: document.querySelector('#price-filter'),
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
      if (!Array.isArray(products) || products.length === 0) throw new Error('empty catalog');

      const normalized = products.map(normalizeModel).filter(model => model.variants.length > 0);
      assertClientCatalog(normalized);
      state.sourceModelCount = normalized.length;
      state.sourceVariantCount = normalized.reduce((sum, model) => sum + model.variants.length, 0);
      state.models = dedupeKnownGland(normalized);
      els.modelCount.textContent = formatNumber(state.sourceModelCount);
      els.variantCount.textContent = formatNumber(state.sourceVariantCount);
      buildFilters();
      els.status.hidden = true;
      applyFilters();
    } catch (error) {
      console.error('[next-catalog] Failed to load catalog', error);
      els.status.hidden = true;
      els.grid.innerHTML = '<div class="error-box"><strong>Каталог не загрузился</strong><p>Проверьте соединение и попробуйте обновить страницу.</p><button type="button" onclick="location.reload()">Обновить</button></div>';
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
        colorHex: color.hex || variant.colorHex || '',
        colorKey: `color-${colorIndex}`,
        variantKey: String(variant.sourceId ?? `${colorIndex}-${variantIndex}`),
        images: normalizeImages(variant),
      }));
      if (!normalized.length) return;
      colorGroups.push({
        key: `color-${colorIndex}`,
        label: color.label || normalized[0].colorLabel || `Цвет ${colorIndex + 1}`,
        hex: color.hex || normalized[0].colorHex || '',
        variants: normalized,
      });
      variants.push(...normalized);
    });

    if (!variants.length && Array.isArray(model.variants)) {
      model.variants.forEach((variant, variantIndex) => {
        variants.push({
          ...variant,
          colorLabel: variant.color || '',
          colorHex: variant.colorHex || '',
          colorKey: `variant-color-${variantIndex}`,
          variantKey: String(variant.sourceId ?? variantIndex),
          images: normalizeImages(variant),
        });
      });
      variants.forEach((variant, variantIndex) => {
        colorGroups.push({
          key: variant.colorKey,
          label: variant.colorLabel || '',
          hex: variant.colorHex || '',
          variants: [variant],
          synthetic: true,
        });
      });
    }

    const collections = uniqueStrings(Array.isArray(model.collection) ? model.collection : [model.collection]);
    const categories = uniqueStrings([
      ...(Array.isArray(model.category) ? model.category : [model.category]),
      ...variants.map(variant => variant.category),
    ]);
    const first = variants[0] || {};
    const rawName = model.name || first.name || `Модель ${index + 1}`;
    const displayName = cleanCustomerName(rawName);
    return {
      ...model,
      id: String(model.id || `model-${index + 1}`),
      name: rawName,
      displayName,
      collections,
      categories,
      colorGroups,
      variants,
      minWholesalePrice: positiveNumber(model.minWholesalePrice) ?? minPrice(variants, 'wholesalePrice'),
      minRetailPrice: positiveNumber(model.minRetailPrice) ?? minPrice(variants, 'retailPrice'),
      searchable: normalizeText([
        rawName,
        displayName,
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
      if (modelIds.has(model.id)) throw new Error(`duplicate model id ${model.id}`);
      modelIds.add(model.id);
      for (const variant of model.variants) {
        if (variant.sourceId == null) continue;
        const sourceId = String(variant.sourceId);
        if (sourceIds.has(sourceId)) throw new Error(`duplicate sourceId ${sourceId}`);
        sourceIds.add(sourceId);
      }
    }
  }

  function dedupeKnownGland(models) {
    const gland = models.filter(model => {
      const ids = new Set(model.variants.map(v => Number(v.sourceId)).filter(Number.isFinite));
      return [30, 31, 32, 33].some(id => ids.has(id)) && /(?:гленд|gland)/i.test(model.displayName);
    });
    if (gland.length !== 2 || !commerciallyEquivalent(gland[0], gland[1])) return models;

    const merged = mergeModels(gland[0], gland[1]);
    const glandIds = new Set(gland.map(model => model.id));
    const output = [];
    let inserted = false;
    for (const model of models) {
      if (!glandIds.has(model.id)) output.push(model);
      else if (!inserted) {
        output.push(merged);
        inserted = true;
      }
    }
    return output;
  }

  function commerciallyEquivalent(a, b) {
    const categoriesA = [...a.categories].sort().join('|');
    const categoriesB = [...b.categories].sort().join('|');
    const collectionsA = [...a.collections].sort().join('|');
    const collectionsB = [...b.collections].sort().join('|');
    const signature = model => model.variants.map(v => [normalizeText(v.specs), positiveNumber(v.wholesalePrice), positiveNumber(v.retailPrice)].join('~')).sort().join('||');
    return categoriesA === categoriesB && collectionsA === collectionsB && signature(a) === signature(b);
  }

  function mergeModels(a, b) {
    const variants = [...a.variants, ...b.variants];
    const colorGroups = [...a.colorGroups, ...b.colorGroups].map((group, index) => ({ ...group, key: `merged-${index}` }));
    return {
      ...a,
      id: a.id,
      variants,
      colorGroups,
      minWholesalePrice: minPrice(variants, 'wholesalePrice'),
      minRetailPrice: minPrice(variants, 'retailPrice'),
      searchable: `${a.searchable} ${b.searchable}`,
    };
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
      searchTimer = setTimeout(() => applyFilters(true), 120);
    });
    [els.category, els.collection, els.price].forEach(el => el.addEventListener('change', () => applyFilters(true)));
    els.reset.addEventListener('click', resetFilters);
    els.favoritesButton.addEventListener('click', () => setView(state.view === 'favorites' ? 'all' : 'favorites'));
    els.cartButton.addEventListener('click', () => setView(state.view === 'cart' ? 'all' : 'cart'));
    els.dialogClose.addEventListener('click', closeDialog);
    els.dialog.addEventListener('click', event => { if (event.target === els.dialog) closeDialog(); });
    els.dialog.addEventListener('cancel', event => { event.preventDefault(); closeDialog(); });
  }

  function resetFilters() {
    els.search.value = '';
    els.category.value = '';
    els.collection.value = '';
    els.price.value = '';
    state.view = 'all';
    syncViewButtons();
    applyFilters(true);
  }

  function setView(view) {
    state.view = view;
    syncViewButtons();
    applyFilters(true);
    document.querySelector('#catalog')?.scrollIntoView({ block: 'start' });
  }

  function syncViewButtons() {
    els.favoritesButton.classList.toggle('active', state.view === 'favorites');
    els.cartButton.classList.toggle('active', state.view === 'cart');
    els.favoritesButton.setAttribute('aria-pressed', String(state.view === 'favorites'));
    els.cartButton.setAttribute('aria-pressed', String(state.view === 'cart'));
  }

  function applyFilters(resetPage = false) {
    const query = normalizeText(els.search.value);
    const category = els.category.value;
    const collection = els.collection.value;
    const priceRange = parsePriceRange(els.price.value);

    let filtered = state.models.filter(model => {
      if (state.view === 'favorites' && !state.favorites.has(model.id)) return false;
      if (state.view === 'cart' && !model.variants.some(v => state.cart.has(String(v.sourceId ?? model.id)))) return false;
      if (query && !model.searchable.includes(query)) return false;
      if (category && !model.categories.includes(category)) return false;
      if (collection && !model.collections.includes(collection)) return false;
      if (priceRange && !model.variants.some(v => withinPrice(v.wholesalePrice, priceRange))) return false;
      return true;
    });

    const merchandising = state.view === 'all' && !query && !category && !collection && !priceRange;
    if (merchandising) filtered = merchandiseModels(filtered);
    state.filtered = filtered;
    if (resetPage) state.page = 1;
    const pageCount = Math.max(1, Math.ceil(state.filtered.length / PAGE_SIZE));
    state.page = Math.min(state.page, pageCount);
    els.empty.hidden = state.filtered.length !== 0;
    updateEmptyState();
    els.count.textContent = resultCountText();
    renderPage();
  }

  function merchandiseModels(models) {
    const buckets = { seating: [], tables: [], sofas: [], coffee: [], bar: [], other: [], hangers: [] };
    models.forEach(model => buckets[classifyModel(model)].push(model));
    const output = [];
    const priority = ['seating', 'tables', 'sofas', 'coffee', 'bar'];
    while (priority.some(key => buckets[key].length)) {
      priority.forEach(key => { if (buckets[key].length) output.push(buckets[key].shift()); });
    }
    return output.concat(buckets.other, buckets.hangers);
  }

  function classifyModel(model) {
    const text = normalizeText(`${model.displayName} ${model.categories.join(' ')}`);
    if (/вешал|hanger|гардеробн.*стойк/.test(text)) return 'hangers';
    if (/диван|банкет|пуф|sofa|bench|ottoman/.test(text)) return 'sofas';
    if (/кресл|стул|chair|кресло|табур/.test(text)) return 'seating';
    if (/барн|bar/.test(text)) return 'bar';
    if (/журнальн|кофейн|coffee/.test(text)) return 'coffee';
    if (/стол|table/.test(text)) return 'tables';
    return 'other';
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

  function renderPage() {
    els.grid.replaceChildren();
    if (!state.filtered.length) {
      els.pagination.hidden = true;
      return;
    }
    const start = (state.page - 1) * PAGE_SIZE;
    const end = Math.min(start + PAGE_SIZE, state.filtered.length);
    const fragment = document.createDocumentFragment();
    for (let i = start; i < end; i += 1) fragment.append(createCard(state.filtered[i], i - start));
    els.grid.append(fragment);
    renderPagination();
  }

  function renderPagination() {
    const pageCount = Math.ceil(state.filtered.length / PAGE_SIZE);
    els.pagination.replaceChildren();
    els.pagination.hidden = pageCount <= 1;
    if (pageCount <= 1) return;

    const pages = paginationItems(state.page, pageCount);
    els.pagination.append(pageButton('←', state.page - 1, state.page === 1, 'Предыдущая страница'));
    pages.forEach(item => {
      if (item === '…') {
        const span = document.createElement('span');
        span.className = 'pagination-ellipsis';
        span.textContent = '…';
        els.pagination.append(span);
      } else {
        const button = pageButton(String(item), item, false, `Страница ${item}`);
        if (item === state.page) {
          button.classList.add('active');
          button.setAttribute('aria-current', 'page');
        }
        els.pagination.append(button);
      }
    });
    els.pagination.append(pageButton('→', state.page + 1, state.page === pageCount, 'Следующая страница'));
  }

  function pageButton(text, page, disabled, label) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = text;
    button.disabled = disabled;
    button.setAttribute('aria-label', label);
    button.addEventListener('click', () => {
      if (disabled) return;
      state.page = page;
      renderPage();
      document.querySelector('#catalog')?.scrollIntoView({ block: 'start' });
    });
    return button;
  }

  function paginationItems(current, total) {
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
    const items = [1];
    const from = Math.max(2, current - 1);
    const to = Math.min(total - 1, current + 1);
    if (from > 2) items.push('…');
    for (let page = from; page <= to; page += 1) items.push(page);
    if (to < total - 1) items.push('…');
    items.push(total);
    return items;
  }

  function createCard(model, position) {
    const node = els.template.content.firstElementChild.cloneNode(true);
    let variant = chooseDisplayVariant(model);
    let galleryIndex = 0;
    const img = node.querySelector('.card-image');
    const imageWrap = node.querySelector('.image-wrap');
    const price = node.querySelector('.card-price');
    const swatches = node.querySelector('.card-swatches');
    const count = node.querySelector('.card-gallery-count');
    const prev = node.querySelector('.card-prev');
    const next = node.querySelector('.card-next');

    if (position < FIRST_EAGER_IMAGES) {
      img.loading = 'eager';
      img.fetchPriority = 'high';
    }

    const updateCard = () => {
      const images = cardImages(variant);
      galleryIndex = Math.min(galleryIndex, Math.max(0, images.length - 1));
      const src = images[galleryIndex] || '';
      img.src = src ? relativeAsset(src) : fallbackSvg();
      img.alt = model.displayName;
      price.textContent = exactPriceText(variant.wholesalePrice);
      const showGallery = images.length > 1;
      prev.hidden = !showGallery;
      next.hidden = !showGallery;
      count.hidden = !showGallery;
      if (showGallery) count.textContent = `${galleryIndex + 1} / ${images.length}`;
      renderCardSwatches(model, variant, swatches, chosen => {
        variant = chosen;
        galleryIndex = 0;
        updateCard();
      });
    };

    const step = delta => {
      const images = cardImages(variant);
      if (images.length < 2) return;
      galleryIndex = (galleryIndex + delta + images.length) % images.length;
      updateCard();
    };

    prev.addEventListener('click', event => { event.stopPropagation(); step(-1); });
    next.addEventListener('click', event => { event.stopPropagation(); step(1); });
    bindCardSwipe(imageWrap, step);
    img.addEventListener('error', () => { img.src = fallbackSvg(); }, { once: true });

    node.querySelector('.card-collection').textContent = cleanCollection(model.collections[0] || model.categories[0] || 'FORMA HOME');
    node.querySelector('.card-name').textContent = model.displayName;
    node.querySelector('.card-meta').textContent = `${model.variants.length} ${plural(model.variants.length, 'вариант', 'варианта', 'вариантов')}`;
    node.querySelectorAll('.card-open').forEach(button => button.addEventListener('click', () => openModel(model, variant)));

    const favorite = node.querySelector('.favorite-button');
    syncFavoriteButton(favorite, model.id);
    favorite.addEventListener('click', event => { event.stopPropagation(); toggleFavorite(model.id, favorite); });
    updateCard();
    return node;
  }

  function renderCardSwatches(model, activeVariant, container, onSelect) {
    container.replaceChildren();
    const groups = model.colorGroups.filter(group => group.label || validHex(group.hex));
    if (groups.length < 2) {
      container.hidden = true;
      return;
    }
    container.hidden = false;
    groups.slice(0, 6).forEach(group => {
      const variant = group.variants.find(v => v.images.length) || group.variants[0];
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'card-swatch';
      if (group.variants.some(v => sameVariant(v, activeVariant))) button.classList.add('active');
      button.setAttribute('aria-label', group.label || 'Цвет');
      button.title = group.label || '';
      if (validHex(group.hex)) button.style.setProperty('--swatch', group.hex);
      else button.dataset.label = initials(group.label);
      button.addEventListener('click', event => {
        event.stopPropagation();
        onSelect(variant);
      });
      container.append(button);
    });
  }

  function cardImages(variant) {
    return (variant?.images || []).slice(0, MAX_CARD_IMAGES);
  }

  function bindCardSwipe(target, step) {
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
      if (Math.abs(dx) < 40 || Math.abs(dx) <= Math.abs(dy) * 1.1) return;
      step(dx < 0 ? 1 : -1);
    }, { passive: true });
  }

  function openModel(model, preferredVariant = null) {
    state.activeModel = model;
    state.activeVariant = preferredVariant || chooseDisplayVariant(model);
    state.activeImageIndex = 0;
    renderDialog();
    document.body.classList.add('dialog-open');
    if (typeof els.dialog.showModal === 'function') els.dialog.showModal();
    else {
      els.dialog.classList.add('dialog-fallback');
      els.dialog.setAttribute('open', '');
    }
  }

  function renderDialog() {
    const model = state.activeModel;
    const variant = state.activeVariant;
    if (!model || !variant) return;
    const images = (variant.images.length ? variant.images : ['']).slice(0, MAX_DIALOG_IMAGES);
    state.activeImageIndex = Math.min(state.activeImageIndex, images.length - 1);
    const activeImage = images[state.activeImageIndex] || '';
    const currentGroup = model.colorGroups.find(group => group.variants.some(item => sameVariant(item, variant))) || model.colorGroups[0];

    const colorsHtml = model.colorGroups.length > 1 ? model.colorGroups.map(group => {
      const active = group === currentGroup ? ' active' : '';
      const swatch = validHex(group.hex) ? `<span class="swatch" style="--swatch:${escapeAttr(group.hex)}"></span>` : '';
      return `<button class="color-pill${active}" type="button" data-color-key="${escapeAttr(group.key)}">${swatch}<span>${escapeHtml(group.label || 'Исполнение')}</span></button>`;
    }).join('') : '';

    const trueVariants = currentGroup?.variants || [variant];
    const variantsHtml = trueVariants.length > 1 ? trueVariants.map((item, index) => {
      const active = sameVariant(item, variant) ? ' active' : '';
      return `<button class="variant-pill${active}" type="button" data-variant-key="${escapeAttr(item.variantKey)}">${escapeHtml(customerVariantLabel(item, index))}</button>`;
    }).join('') : '';

    const thumbs = images.map((src, index) => `<button class="thumb${index === state.activeImageIndex ? ' active' : ''}" type="button" data-image-index="${index}" aria-label="Фото ${index + 1} из ${images.length}"><img src="${escapeAttr(src ? relativeAsset(src) : fallbackSvg())}" alt="" loading="lazy" decoding="async"></button>`).join('');
    const cartId = String(variant.sourceId ?? model.id);
    const inCart = state.cart.has(cartId);

    els.dialogContent.innerHTML = `
      <div class="dialog-layout">
        <div class="dialog-gallery">
          <div class="main-image-wrap">
            <img class="dialog-main-image" id="dialog-main-image" src="${escapeAttr(activeImage ? relativeAsset(activeImage) : fallbackSvg())}" alt="${escapeAttr(model.displayName)}">
            ${images.length > 1 ? `<span class="dialog-gallery-count">${state.activeImageIndex + 1} / ${images.length}</span><button class="gallery-arrow prev" type="button" data-gallery-step="-1" aria-label="Предыдущее фото">‹</button><button class="gallery-arrow next" type="button" data-gallery-step="1" aria-label="Следующее фото">›</button>` : ''}
          </div>
          ${images.length > 1 ? `<div class="thumb-row" aria-label="Фотографии товара">${thumbs}</div>` : ''}
        </div>
        <div class="dialog-info">
          <p class="eyebrow">${escapeHtml(cleanCollection(model.collections[0] || model.categories[0] || 'FORMA HOME'))}</p>
          <h2>${escapeHtml(model.displayName)}</h2>
          <strong class="dialog-price">${escapeHtml(exactPriceText(variant.wholesalePrice))}</strong>
          ${positiveNumber(variant.retailPrice) ? `<span class="dialog-retail">Розничная цена: ${formatPrice(variant.retailPrice)}</span>` : ''}
          ${colorsHtml ? `<p class="variant-title">Цвет</p><div class="color-pills">${colorsHtml}</div>` : ''}
          ${variantsHtml ? `<p class="variant-title">Исполнение</p><div class="variant-pills">${variantsHtml}</div>` : ''}
          ${variant.specs ? `<div class="specs">${formatSpecs(variant.specs)}</div>` : ''}
          <div class="dialog-actions">
            <button class="add-cart" type="button" data-cart-id="${escapeAttr(cartId)}">${inCart ? 'Перейти к заказу →' : 'Добавить в заказ'}</button>
            <button class="dialog-favorite" type="button" aria-label="${state.favorites.has(model.id) ? 'Убрать модель из избранного' : 'Добавить модель в избранное'}">${state.favorites.has(model.id) ? '♥' : '♡'}</button>
            ${inCart ? `<button class="remove-cart" type="button" data-cart-id="${escapeAttr(cartId)}">Удалить исполнение из заказа</button>` : ''}
          </div>
        </div>
      </div>`;

    bindDialogEvents(images, currentGroup);
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
    els.dialogContent.querySelectorAll('.thumb').forEach(button => button.addEventListener('click', () => showDialogImage(Number(button.dataset.imageIndex), images)));
    els.dialogContent.querySelectorAll('[data-gallery-step]').forEach(button => button.addEventListener('click', () => stepDialogImage(Number(button.dataset.galleryStep), images)));
    const mainWrap = els.dialogContent.querySelector('.main-image-wrap');
    if (mainWrap && images.length > 1) bindDialogSwipe(mainWrap, images);

    els.dialogContent.querySelector('.add-cart')?.addEventListener('click', event => {
      const id = event.currentTarget.dataset.cartId;
      if (state.cart.has(id)) {
        closeDialog();
        setView('cart');
        return;
      }
      state.cart.add(id);
      saveSet('forma-next-cart', state.cart);
      updateCounters();
      renderDialog();
    });
    els.dialogContent.querySelector('.remove-cart')?.addEventListener('click', event => {
      const id = event.currentTarget.dataset.cartId;
      state.cart.delete(id);
      saveSet('forma-next-cart', state.cart);
      updateCounters();
      renderDialog();
      if (state.view === 'cart') applyFilters();
    });
    els.dialogContent.querySelector('.dialog-favorite')?.addEventListener('click', event => {
      toggleFavorite(state.activeModel.id, event.currentTarget, true);
      renderDialog();
    });
  }

  function showDialogImage(index, images) {
    if (!images.length) return;
    const safeIndex = (index + images.length) % images.length;
    state.activeImageIndex = safeIndex;
    const main = els.dialogContent.querySelector('#dialog-main-image');
    if (main) main.src = images[safeIndex] ? relativeAsset(images[safeIndex]) : fallbackSvg();
    const badge = els.dialogContent.querySelector('.dialog-gallery-count');
    if (badge) badge.textContent = `${safeIndex + 1} / ${images.length}`;
    els.dialogContent.querySelectorAll('.thumb').forEach((item, itemIndex) => item.classList.toggle('active', itemIndex === safeIndex));
  }

  function stepDialogImage(step, images) { showDialogImage(state.activeImageIndex + step, images); }

  function bindDialogSwipe(target, images) {
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
    document.body.classList.remove('dialog-open');
    if (typeof els.dialog.close === 'function' && els.dialog.open) els.dialog.close();
    else {
      els.dialog.removeAttribute('open');
      els.dialog.classList.remove('dialog-fallback');
    }
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
    return model.variants.find(variant => variant.images.length && positiveNumber(variant.wholesalePrice)) || model.variants.find(variant => variant.images.length) || model.variants[0];
  }

  function sameVariant(a, b) { return a && b && a.variantKey === b.variantKey; }

  function customerVariantLabel(variant, index) {
    const cleaned = cleanVariantText(variant.specs || variant.colorLabel || '');
    if (cleaned) return cleaned;
    const price = positiveNumber(variant.wholesalePrice);
    return price ? `Исполнение ${index + 1} · ${formatPrice(price)}` : `Исполнение ${index + 1}`;
  }

  function cleanCustomerName(value) {
    return String(value || '')
      .replace(/\s*\((?:мод\.?|model)\s*[^)]*\)/giu, '')
      .replace(/\s*\((?:[A-ZА-Я]{1,5}[-–]?[A-ZА-Я0-9]{2,}(?:[-–][A-ZА-Я0-9]+)*)\)/g, '')
      .replace(/\s*\((?:обеденная\s+группа|столовая\s+группа)\)/giu, '')
      .replace(/\s*\(?\d+\s*шт\.?\s*(?:в\s*)?упаковк[еи]?\)?/giu, '')
      .replace(/\s{2,}/g, ' ')
      .replace(/\s+([,.;:])/g, '$1')
      .trim();
  }

  function cleanCollection(value) {
    return String(value || '').replace(/\s*\((?:обеденная\s+группа|столовая\s+группа)\)/giu, '').trim();
  }

  function cleanVariantText(value) {
    return String(value || '').replace(/\s*\(?\d+\s*шт\.?\s*(?:в\s*)?упаковк[еи]?\)?/giu, '').replace(/\s{2,}/g, ' ').trim();
  }

  function formatSpecs(value) {
    const items = String(value).split(/[,;\n]+/).map(cleanVariantText).filter(Boolean);
    if (!items.length) return '';
    return `<ul class="spec-list">${items.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`;
  }

  function initials(value) {
    return String(value || '').split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase();
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

  function exactPriceText(value) {
    const price = positiveNumber(value);
    return price ? formatPrice(price) : 'Цена по запросу';
  }

  function formatPrice(value) { return `${new Intl.NumberFormat('ru-RU').format(Number(value))} ₽`; }
  function formatNumber(value) { return new Intl.NumberFormat('ru-RU').format(value); }

  function plural(number, one, few, many) {
    const n = Math.abs(number) % 100;
    const n1 = n % 10;
    if (n > 10 && n < 20) return many;
    if (n1 > 1 && n1 < 5) return few;
    if (n1 === 1) return one;
    return many;
  }

  function normalizeText(value) { return String(value || '').toLocaleLowerCase('ru').replace(/ё/g, 'е').replace(/\s+/g, ' ').trim(); }
  function uniqueStrings(values) { return [...new Set(values.filter(Boolean).map(value => String(value).trim()).filter(Boolean))]; }
  function uniqueSorted(values) { return uniqueStrings(values).sort((a, b) => a.localeCompare(b, 'ru')); }

  function isLocalImagePath(value) {
    const path = String(value || '').trim();
    return path && !/^(?:https?:)?\/\//i.test(path) && !/^data:/i.test(path) && /\.(?:avif|webp|png|jpe?g|gif)(?:\?.*)?$/i.test(path);
  }

  function relativeAsset(path) {
    const clean = String(path).replace(/^\.\//, '').replace(/^\//, '');
    return `../${clean}`;
  }

  function validHex(value) { return /^#[0-9a-f]{3,8}$/i.test(String(value || '').trim()); }

  function fallbackSvg() {
    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800"><rect width="100%" height="100%" fill="#eeebe4"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#777168" font-family="Arial" font-size="28">Фотография уточняется</text></svg>')}`;
  }

  function loadSet(key) {
    try { return new Set(JSON.parse(localStorage.getItem(key) || '[]').map(String)); }
    catch { return new Set(); }
  }

  function saveSet(key, value) { try { localStorage.setItem(key, JSON.stringify([...value])); } catch {} }
  function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char])); }
  function escapeAttr(value) { return escapeHtml(value); }
})();
