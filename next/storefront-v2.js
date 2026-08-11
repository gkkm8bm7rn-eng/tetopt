(() => {
  'use strict';

  const PAGE_SIZE = 24;
  const FIRST_EAGER_IMAGES = 4;
  const MAX_CARD_IMAGES = 3;
  const MAX_DIALOG_IMAGES = 6;
  const CATALOG_URL = '../catalog.json';
  const FAVORITES_KEY = 'formaFavoritesV1';
  const CART_KEY = 'formaCart';
  const RECENT_KEY = 'formaRecentlyViewedV1';

  const SHOP_CATEGORIES = Object.freeze({
    chairs: 'Стулья',
    armchairs: 'Кресла',
    tables: 'Столы',
    sofas: 'Диваны и мягкая мебель',
    coffee: 'Журнальные и кофейные столики',
    bar: 'Барная мебель',
    storage: 'Хранение',
    other: 'Декор и прочее',
  });

  const FEATURED_SOURCE_IDS = Object.freeze([
    276, 284, 34, 838, 29, 490, 298, 36, 845, 30, 502, 307, 41, 851, 1304, 542,
    310, 45, 897, 1398, 546, 319, 51, 899, 560, 320, 56, 908, 1399, 564, 324, 62,
    912, 1440, 593, 625, 63, 1294, 1557, 611, 626, 1313, 1491, 853, 1441, 1558, 866, 892,
  ]);

  const state = {
    status: 'loading',
    models: [],
    filtered: [],
    page: 1,
    query: '',
    view: 'all',
    selectedByModel: new Map(),
    favorites: loadFavorites(),
    cart: loadCart(),
    recent: loadRecent(),
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
    searchButton: document.querySelector('#search-submit'),
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
    migrateLegacyStorage();
    bindEvents();
    updateCounters();
    setCatalogStatus('loading');

    try {
      const response = await fetch(CATALOG_URL, { cache: 'no-cache' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const raw = await response.json();
      const products = Array.isArray(raw) ? raw : raw.products;
      if (!Array.isArray(products) || !products.length) throw new Error('empty catalog');

      const models = products.map(normalizeModel).filter(model => model.variants.length);
      assertCatalog(models);
      state.models = models.map((model, sourceOrder) => Object.freeze({ ...model, sourceOrder }));
      state.filtered = state.models;
      state.status = 'ready';

      if (els.modelCount) els.modelCount.textContent = formatNumber(state.models.length);
      if (els.variantCount) els.variantCount.textContent = formatNumber(state.models.reduce((sum, model) => sum + model.variants.length, 0));
      buildFilters();
      setCatalogStatus('ready');
      applyFilters(true);
    } catch (error) {
      console.error('[forma-storefront-v2]', error);
      state.status = 'error';
      setCatalogStatus('error', error);
    }
  }

  function normalizeModel(model, index) {
    const rawVariants = Array.isArray(model.variants) ? model.variants : flattenLegacyColors(model.colors);
    const variants = rawVariants.map((variant, variantIndex) => normalizeVariant(variant, variantIndex));
    const collections = uniqueStrings(Array.isArray(model.collection) ? model.collection : [model.collection]);
    const categories = uniqueStrings([
      ...(Array.isArray(model.category) ? model.category : [model.category]),
      ...variants.map(variant => variant.category),
    ]);
    const rawName = String(model.name || variants[0]?.name || `Модель ${index + 1}`);
    const displayName = cleanCustomerName(rawName);
    const normalized = {
      id: String(model.id || `model-${index + 1}`),
      rawName,
      displayName,
      collections,
      categories,
      variants,
      searchable: normalizeText([
        rawName,
        displayName,
        collections.join(' '),
        categories.join(' '),
        variants.map(variant => `${variant.name || ''} ${variant.specs || ''} ${variant.sourceId || ''}`).join(' '),
      ].join(' ')),
    };
    normalized.shopCategory = classifyModel(normalized);
    return normalized;
  }

  function flattenLegacyColors(colors) {
    if (!Array.isArray(colors)) return [];
    return colors.flatMap(color => (Array.isArray(color?.variants) ? color.variants : []).map(variant => ({
      ...variant,
      colorLabel: variant.colorLabel || color.label || '',
      swatchHex: variant.swatchHex || color.hex || '',
    })));
  }

  function normalizeVariant(variant, index) {
    const sourceId = String(variant.sourceId ?? variant.id ?? `variant-${index}`);
    const images = normalizeImages(variant);

    // Only explicit prepared fields are allowed to drive visual color markers.
    // We never infer upholstery/base from arbitrary specs in the browser.
    const execution = Object.freeze({
      colorLabel: cleanText(variant.colorLabel || variant.color || ''),
      swatchHex: validHex(variant.swatchHex || variant.colorHex || ''),
      upholsteryColor: cleanText(variant.upholsteryColor || ''),
      upholsteryHex: validHex(variant.upholsteryHex || ''),
      baseColor: cleanText(variant.baseColor || ''),
      baseHex: validHex(variant.baseHex || ''),
    });

    return Object.freeze({
      ...variant,
      sourceId,
      variantKey: sourceId,
      favoriteId: String(variant.favoriteId || `source:${sourceId}`),
      cartSourceId: String(variant.cartSourceId || sourceId),
      images,
      execution,
      wholesalePrice: Number(variant.wholesalePrice ?? variant.wholesale ?? 0) || 0,
      retailPrice: Number(variant.retailPrice ?? variant.retail ?? 0) || 0,
    });
  }

  function normalizeImages(variant) {
    const candidates = [];
    if (Array.isArray(variant.localImages)) candidates.push(...variant.localImages);
    if (Array.isArray(variant.images)) candidates.push(...variant.images);
    if (variant.image) candidates.push(variant.image);
    if (variant.directImage) candidates.push(variant.directImage);
    return uniqueStrings(candidates).filter(isLocalImagePath);
  }

  function assertCatalog(models) {
    const modelIds = new Set();
    const sourceIds = new Set();
    for (const model of models) {
      if (modelIds.has(model.id)) throw new Error(`duplicate model id ${model.id}`);
      modelIds.add(model.id);
      if (!model.variants.length) throw new Error(`model without variants ${model.id}`);
      for (const variant of model.variants) {
        if (sourceIds.has(variant.sourceId)) throw new Error(`duplicate sourceId ${variant.sourceId}`);
        sourceIds.add(variant.sourceId);
        if (!Number.isFinite(variant.wholesalePrice) || variant.wholesalePrice < 0) {
          throw new Error(`invalid wholesale price ${variant.sourceId}`);
        }
      }
    }
  }

  function bindEvents() {
    els.searchButton?.addEventListener('click', () => runSearch());
    els.search?.addEventListener('keydown', event => {
      if (event.key === 'Enter') {
        event.preventDefault();
        runSearch();
      }
    });
    [els.category, els.collection, els.price].forEach(element => {
      element?.addEventListener('change', () => applyFilters(true));
    });
    els.reset?.addEventListener('click', resetFilters);
    els.favoritesButton?.addEventListener('click', () => setView(state.view === 'favorites' ? 'all' : 'favorites'));
    els.cartButton?.addEventListener('click', () => setView(state.view === 'cart' ? 'all' : 'cart'));
    els.dialogClose?.addEventListener('click', closeDialog);
    els.dialog?.addEventListener('click', event => { if (event.target === els.dialog) closeDialog(); });
    els.dialog?.addEventListener('cancel', event => { event.preventDefault(); closeDialog(); });
  }

  function runSearch() {
    state.query = normalizeText(els.search?.value || '');
    applyFilters(true);
  }

  function resetFilters() {
    if (els.search) els.search.value = '';
    if (els.category) els.category.value = '';
    if (els.collection) els.collection.value = '';
    if (els.price) els.price.value = '';
    state.query = '';
    state.view = 'all';
    state.page = 1;
    syncViewButtons();
    applyFilters(true);
    document.querySelector('#catalog')?.scrollIntoView({ block: 'start' });
  }

  function setView(view) {
    state.view = view;
    state.page = 1;
    syncViewButtons();
    applyFilters(true);
    document.querySelector('#catalog')?.scrollIntoView({ block: 'start' });
  }

  function syncViewButtons() {
    els.favoritesButton?.classList.toggle('active', state.view === 'favorites');
    els.cartButton?.classList.toggle('active', state.view === 'cart');
    els.favoritesButton?.setAttribute('aria-pressed', String(state.view === 'favorites'));
    els.cartButton?.setAttribute('aria-pressed', String(state.view === 'cart'));
  }

  function buildFilters() {
    fillSelect(els.collection, uniqueSorted(state.models.flatMap(model => model.collections)));
    const available = new Set(state.models.map(model => model.shopCategory));
    const categories = Object.values(SHOP_CATEGORIES).filter(category => available.has(category));
    if (categories.length) fillSelect(els.category, categories);
    else if (els.categoryField) els.categoryField.hidden = true;
  }

  function fillSelect(select, values) {
    if (!select) return;
    values.forEach(value => {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = value;
      select.append(option);
    });
  }

  function applyFilters(resetPage = false) {
    if (state.status !== 'ready') return;
    const query = state.query;
    const category = els.category?.value || '';
    const collection = els.collection?.value || '';
    const priceRange = parsePriceRange(els.price?.value || '');

    let filtered = state.models.filter(model => {
      if (state.view === 'favorites' && !model.variants.some(variant => state.favorites.has(variant.favoriteId))) return false;
      if (state.view === 'cart' && !model.variants.some(variant => cartQuantity(variant.cartSourceId) > 0)) return false;
      if (query && !model.searchable.includes(query)) return false;
      if (category && model.shopCategory !== category) return false;
      if (collection && !model.collections.includes(collection)) return false;
      if (priceRange && !model.variants.some(variant => withinPrice(variant.wholesalePrice, priceRange))) return false;
      return true;
    });

    const useMerchandising = state.view === 'all' && !query && !category && !collection && !priceRange;
    if (useMerchandising) filtered = merchandiseModels(filtered);
    state.filtered = filtered;
    if (resetPage) state.page = 1;
    const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    state.page = Math.min(state.page, pages);

    if (els.empty) els.empty.hidden = filtered.length !== 0;
    updateEmptyState();
    if (els.count) els.count.textContent = resultCountText();
    renderPage();
  }

  function merchandiseModels(models) {
    const rank = new Map(FEATURED_SOURCE_IDS.map((sourceId, index) => [String(sourceId), index]));
    return [...models].sort((a, b) => {
      const aRank = Math.min(...a.variants.map(variant => rank.get(variant.sourceId) ?? Infinity));
      const bRank = Math.min(...b.variants.map(variant => rank.get(variant.sourceId) ?? Infinity));
      if (aRank !== bRank) return aRank - bRank;
      return merchandisingPriority(a) - merchandisingPriority(b) || a.sourceOrder - b.sourceOrder;
    });
  }

  function merchandisingPriority(model) {
    const base = {
      [SHOP_CATEGORIES.chairs]: 0,
      [SHOP_CATEGORIES.armchairs]: 4,
      [SHOP_CATEGORIES.tables]: 14,
      [SHOP_CATEGORIES.sofas]: 25,
      [SHOP_CATEGORIES.coffee]: 34,
      [SHOP_CATEGORIES.bar]: 70,
      [SHOP_CATEGORIES.storage]: 100,
      [SHOP_CATEGORIES.other]: 115,
    }[model.shopCategory] ?? 115;
    let score = base;
    const text = normalizeText(`${model.displayName} ${model.categories.join(' ')}`);
    if (/обеденн|dining|кресло|armchair/.test(text)) score -= 8;
    if (/полубар|барн|bar/.test(text)) score += 12;
    if (/вешал/.test(text)) score += 90;
    if (!chooseDisplayVariant(model).images.length) score += 25;
    return score;
  }

  function renderPage() {
    if (!els.grid) return;
    els.grid.replaceChildren();
    if (!state.filtered.length) {
      if (els.pagination) els.pagination.hidden = true;
      return;
    }
    const start = (state.page - 1) * PAGE_SIZE;
    const end = Math.min(start + PAGE_SIZE, state.filtered.length);
    const fragment = document.createDocumentFragment();
    for (let i = start; i < end; i += 1) {
      fragment.append(createCard(state.filtered[i], i - start));
    }
    els.grid.append(fragment);
    renderPagination();
  }

  function createCard(model, position) {
    const node = els.template.content.firstElementChild.cloneNode(true);
    let variant = selectedVariant(model);
    let galleryIndex = 0;
    const img = node.querySelector('.card-image');
    const imageWrap = node.querySelector('.image-wrap');
    const price = node.querySelector('.card-price');
    const executions = node.querySelector('.card-swatches');
    const count = node.querySelector('.card-gallery-count');
    const prev = node.querySelector('.card-prev');
    const next = node.querySelector('.card-next');
    const retail = node.querySelector('.card-retail');

    if (position < FIRST_EAGER_IMAGES) {
      img.loading = 'eager';
      img.fetchPriority = 'high';
    }

    const updateCard = () => {
      state.selectedByModel.set(model.id, variant.sourceId);
      const images = cardImages(variant);
      galleryIndex = Math.min(galleryIndex, Math.max(0, images.length - 1));
      img.src = images[galleryIndex] ? relativeAsset(images[galleryIndex]) : fallbackSvg();
      img.alt = model.displayName;
      price.textContent = exactPriceText(variant.wholesalePrice);
      renderRetail(retail, variant);
      renderExecutionSelectors(model, variant, executions, chosen => {
        variant = chosen;
        galleryIndex = 0;
        updateCard();
        syncFavoriteButton(favorite, variant);
      }, true);
      const hasGallery = images.length > 1;
      prev.hidden = !hasGallery;
      next.hidden = !hasGallery;
      count.hidden = !hasGallery;
      if (hasGallery) count.textContent = `${galleryIndex + 1} / ${images.length}`;
    };

    const step = delta => {
      const images = cardImages(variant);
      if (images.length < 2) return;
      galleryIndex = (galleryIndex + delta + images.length) % images.length;
      updateCard();
    };

    prev.addEventListener('click', event => { event.stopPropagation(); step(-1); });
    next.addEventListener('click', event => { event.stopPropagation(); step(1); });
    bindSwipe(imageWrap, step, 40);
    img.addEventListener('error', () => { img.src = fallbackSvg(); }, { once: true });

    node.querySelector('.card-collection').textContent = cleanCollection(model.collections[0] || model.categories[0] || 'FORMA HOME');
    node.querySelector('.card-name').textContent = model.displayName;
    node.querySelector('.card-meta').textContent = '';
    node.querySelectorAll('.card-open').forEach(button => button.addEventListener('click', () => openModel(model, variant)));

    const favorite = node.querySelector('.favorite-button');
    syncFavoriteButton(favorite, variant);
    favorite.addEventListener('click', event => {
      event.stopPropagation();
      toggleFavorite(variant, favorite);
    });

    updateCard();
    return node;
  }

  function renderExecutionSelectors(model, activeVariant, container, onSelect, compactMode) {
    container.replaceChildren();
    if (model.variants.length < 2) {
      container.hidden = true;
      return;
    }
    container.hidden = false;
    container.classList.add('execution-selectors');
    container.setAttribute('role', 'group');
    container.setAttribute('aria-label', 'Реальные исполнения товара');

    model.variants.forEach((variant, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'execution-option';
      if (sameVariant(variant, activeVariant)) button.classList.add('active');
      button.setAttribute('aria-pressed', String(sameVariant(variant, activeVariant)));
      button.dataset.sourceId = variant.sourceId;
      button.title = executionLongLabel(variant, index);
      button.setAttribute('aria-label', `Исполнение: ${executionLongLabel(variant, index)}`);

      const visual = explicitExecutionVisual(variant);
      if (visual) {
        button.classList.add('has-visual');
        button.append(visual);
      } else {
        const label = document.createElement('span');
        label.className = 'execution-text';
        label.textContent = executionShortLabel(variant, index, compactMode);
        button.append(label);
      }

      button.addEventListener('click', event => {
        event.stopPropagation();
        onSelect(variant);
      });
      container.append(button);
    });
  }

  function explicitExecutionVisual(variant) {
    const execution = variant.execution;
    const hasUpholstery = execution.upholsteryColor && execution.upholsteryHex;
    const hasBase = execution.baseColor && execution.baseHex;
    const hasSingle = execution.colorLabel && execution.swatchHex;
    if (!hasUpholstery && !hasBase && !hasSingle) return null;

    const wrap = document.createElement('span');
    wrap.className = 'execution-visual';

    if (hasUpholstery) {
      const circle = document.createElement('span');
      circle.className = 'execution-marker upholstery';
      circle.style.setProperty('--execution-color', execution.upholsteryHex);
      circle.setAttribute('aria-hidden', 'true');
      wrap.append(circle);
    }
    if (hasBase) {
      const square = document.createElement('span');
      square.className = 'execution-marker base';
      square.style.setProperty('--execution-color', execution.baseHex);
      square.setAttribute('aria-hidden', 'true');
      wrap.append(square);
    }
    if (!hasUpholstery && !hasBase && hasSingle) {
      const single = document.createElement('span');
      single.className = 'execution-marker single';
      single.style.setProperty('--execution-color', execution.swatchHex);
      single.setAttribute('aria-hidden', 'true');
      wrap.append(single);
    }
    return wrap;
  }

  function executionShortLabel(variant, index, compactMode) {
    const explicit = variant.execution.colorLabel;
    if (explicit) return compact(explicit, compactMode ? 22 : 42);

    // Safe fallback required by the master prompt: show source execution text,
    // never invent a beige/grey marker and never replace unknown values by letters.
    const specs = cleanVariantText(variant.specs || '');
    if (!specs) return `Вариант ${index + 1}`;
    const parts = specs.split(/[,;\n]+/).map(cleanText).filter(Boolean);
    const label = parts.slice(0, compactMode ? 2 : 4).join(', ');
    return compact(label || specs, compactMode ? 30 : 74);
  }

  function executionLongLabel(variant, index) {
    const explicit = variant.execution.colorLabel;
    const specs = cleanVariantText(variant.specs || '');
    return explicit || specs || `Вариант ${index + 1}`;
  }

  function openModel(model, preferredVariant = null) {
    state.activeModel = model;
    state.activeVariant = preferredVariant || selectedVariant(model);
    state.activeImageIndex = 0;
    state.selectedByModel.set(model.id, state.activeVariant.sourceId);
    addRecent(state.activeVariant.sourceId);
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
    state.activeImageIndex = Math.min(state.activeImageIndex, Math.max(0, images.length - 1));
    const activeImage = images[state.activeImageIndex] || '';
    const thumbs = images.map((src, index) => `
      <button class="thumb${index === state.activeImageIndex ? ' active' : ''}" type="button" data-image-index="${index}" aria-label="Фото ${index + 1} из ${images.length}">
        <img src="${escapeAttr(src ? relativeAsset(src) : fallbackSvg())}" alt="" loading="lazy" decoding="async">
      </button>`).join('');

    const cartId = variant.cartSourceId;
    const quantity = cartQuantity(cartId);
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
          ${retailHtml(variant)}
          <div class="dialog-executions"></div>
          ${variant.specs ? `<div class="specs">${formatSpecs(variant.specs)}</div>` : ''}
          <div class="dialog-actions">
            <button class="add-cart" type="button" data-cart-id="${escapeAttr(cartId)}">${quantity > 0 ? `В корзине · ${quantity}` : 'Добавить в корзину'}</button>
            <button class="dialog-favorite" type="button" aria-label="${state.favorites.has(variant.favoriteId) ? 'Убрать исполнение из избранного' : 'Добавить исполнение в избранное'}">${state.favorites.has(variant.favoriteId) ? '♥' : '♡'}</button>
            ${quantity > 0 ? `<button class="remove-cart" type="button" data-cart-id="${escapeAttr(cartId)}">Удалить из корзины</button>` : ''}
          </div>
        </div>
      </div>`;

    const selectorHost = els.dialogContent.querySelector('.dialog-executions');
    renderExecutionSelectors(model, variant, selectorHost, chosen => {
      state.activeVariant = chosen;
      state.activeImageIndex = 0;
      state.selectedByModel.set(model.id, chosen.sourceId);
      addRecent(chosen.sourceId);
      renderDialog();
    }, false);

    bindDialogEvents(images);
  }

  function bindDialogEvents(images) {
    els.dialogContent.querySelectorAll('.thumb').forEach(button => {
      button.addEventListener('click', () => showDialogImage(Number(button.dataset.imageIndex), images));
    });
    els.dialogContent.querySelectorAll('[data-gallery-step]').forEach(button => {
      button.addEventListener('click', () => stepDialogImage(Number(button.dataset.galleryStep), images));
    });
    const mainWrap = els.dialogContent.querySelector('.main-image-wrap');
    if (mainWrap && images.length > 1) bindSwipe(mainWrap, step => stepDialogImage(step, images), 44);

    els.dialogContent.querySelector('.add-cart')?.addEventListener('click', () => {
      const id = state.activeVariant.cartSourceId;
      state.cart[id] = cartQuantity(id) + 1;
      saveCart();
      updateCounters();
      renderDialog();
    });
    els.dialogContent.querySelector('.remove-cart')?.addEventListener('click', () => {
      const id = state.activeVariant.cartSourceId;
      delete state.cart[id];
      saveCart();
      updateCounters();
      renderDialog();
      if (state.view === 'cart') applyFilters();
    });
    els.dialogContent.querySelector('.dialog-favorite')?.addEventListener('click', event => {
      toggleFavorite(state.activeVariant, event.currentTarget, true);
      renderDialog();
    });
  }

  function showDialogImage(index, images) {
    if (!images.length) return;
    const safe = (index + images.length) % images.length;
    state.activeImageIndex = safe;
    const main = els.dialogContent.querySelector('#dialog-main-image');
    if (main) main.src = images[safe] ? relativeAsset(images[safe]) : fallbackSvg();
    const badge = els.dialogContent.querySelector('.dialog-gallery-count');
    if (badge) badge.textContent = `${safe + 1} / ${images.length}`;
    els.dialogContent.querySelectorAll('.thumb').forEach((item, itemIndex) => item.classList.toggle('active', itemIndex === safe));
  }

  function stepDialogImage(step, images) {
    showDialogImage(state.activeImageIndex + step, images);
  }

  function closeDialog() {
    document.body.classList.remove('dialog-open');
    if (typeof els.dialog.close === 'function' && els.dialog.open) els.dialog.close();
    else {
      els.dialog.removeAttribute('open');
      els.dialog.classList.remove('dialog-fallback');
    }
  }

  function renderPagination() {
    if (!els.pagination) return;
    const pageCount = Math.ceil(state.filtered.length / PAGE_SIZE);
    els.pagination.replaceChildren();
    els.pagination.hidden = pageCount <= 1;
    if (pageCount <= 1) return;

    const items = paginationItems(state.page, pageCount);
    els.pagination.append(pageButton('←', state.page - 1, state.page === 1, 'Предыдущая страница'));
    items.forEach(item => {
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
    if (total <= 7) return Array.from({ length: total }, (_, index) => index + 1);
    const items = [1];
    const from = Math.max(2, current - 1);
    const to = Math.min(total - 1, current + 1);
    if (from > 2) items.push('…');
    for (let page = from; page <= to; page += 1) items.push(page);
    if (to < total - 1) items.push('…');
    items.push(total);
    return items;
  }

  function selectedVariant(model) {
    const storedId = state.selectedByModel.get(model.id);
    return model.variants.find(variant => variant.sourceId === storedId) || chooseDisplayVariant(model);
  }

  function chooseDisplayVariant(model) {
    return model.variants.find(variant => variant.images.length && positiveNumber(variant.wholesalePrice)) ||
      model.variants.find(variant => variant.images.length) || model.variants[0];
  }

  function cardImages(variant) {
    return (variant?.images || []).slice(0, MAX_CARD_IMAGES);
  }

  function toggleFavorite(variant, button, dialogButton = false) {
    const id = variant.favoriteId;
    if (state.favorites.has(id)) state.favorites.delete(id);
    else state.favorites.add(id);
    saveFavorites();
    updateCounters();
    if (!dialogButton) syncFavoriteButton(button, variant);
    if (state.view === 'favorites' && !state.favorites.has(id)) applyFilters();
  }

  function syncFavoriteButton(button, variant) {
    const active = state.favorites.has(variant.favoriteId);
    button.classList.toggle('active', active);
    button.textContent = active ? '♥' : '♡';
    button.setAttribute('aria-label', active ? 'Убрать исполнение из избранного' : 'Добавить исполнение в избранное');
  }

  function updateCounters() {
    if (els.favCount) els.favCount.textContent = state.favorites.size;
    if (els.cartCount) els.cartCount.textContent = Object.values(state.cart).reduce((sum, quantity) => sum + (Number(quantity) || 0), 0);
  }

  function updateEmptyState() {
    if (!els.emptyTitle || !els.emptyCopy) return;
    if (state.view === 'favorites') {
      els.emptyTitle.textContent = 'В избранном пока пусто';
      els.emptyCopy.textContent = 'Отмечайте понравившиеся исполнения сердцем — они останутся здесь.';
    } else if (state.view === 'cart') {
      els.emptyTitle.textContent = 'В корзине пока ничего нет';
      els.emptyCopy.textContent = 'Откройте товар и добавьте подходящее исполнение.';
    } else {
      els.emptyTitle.textContent = 'Ничего не нашли';
      els.emptyCopy.textContent = 'Измените запрос или сбросьте фильтры.';
    }
  }

  function resultCountText() {
    const prefix = state.view === 'favorites' ? 'Избранное: ' : state.view === 'cart' ? 'В корзине: ' : '';
    if (!state.query && state.view === 'all' && !(els.category?.value || els.collection?.value || els.price?.value)) return '';
    return `${prefix}${formatNumber(state.filtered.length)} ${plural(state.filtered.length, 'модель', 'модели', 'моделей')}`;
  }

  function setCatalogStatus(status, error = null) {
    if (!els.status || !els.grid) return;
    if (status === 'loading') {
      els.status.hidden = false;
      els.status.innerHTML = '<span class="spinner" aria-hidden="true"></span> Подбираем товары…';
      return;
    }
    els.status.hidden = true;
    if (status === 'error') {
      els.grid.innerHTML = `<div class="error-box"><strong>Каталог не загрузился</strong><p>Не удалось проверить данные каталога.</p><button type="button" id="catalog-retry">Повторить</button></div>`;
      document.querySelector('#catalog-retry')?.addEventListener('click', () => location.reload());
      if (error) console.error(error);
    }
  }

  function classifyModel(model) {
    const text = normalizeText(`${model.displayName} ${model.categories.join(' ')}`);
    if (/барн|полубар|\bbar\b/.test(text)) return SHOP_CATEGORIES.bar;
    if (/журнальн|кофейн|кофейный|coffee/.test(text)) return SHOP_CATEGORIES.coffee;
    if (/диван|банкет|пуф|sofa|bench|ottoman|комплект для отдыха|лаундж сет/.test(text)) return SHOP_CATEGORIES.sofas;
    if (/\bстул|табур|chair/.test(text)) return SHOP_CATEGORIES.chairs;
    if (/кресл|armchair/.test(text)) return SHOP_CATEGORIES.armchairs;
    if (/\bстол|table/.test(text)) return SHOP_CATEGORIES.tables;
    if (/шкаф|комод|тумб|этажерк|полк|стеллаж|вешал|корзин|хранен|hanger/.test(text)) return SHOP_CATEGORIES.storage;
    return SHOP_CATEGORIES.other;
  }

  function bindSwipe(target, step, minDistance = 40) {
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
      if (Math.abs(dx) < minDistance || Math.abs(dx) <= Math.abs(dy) * 1.1) return;
      step(dx < 0 ? 1 : -1);
    }, { passive: true });
  }

  function renderRetail(element, variant) {
    const wholesale = positiveNumber(variant.wholesalePrice);
    const retail = positiveNumber(variant.retailPrice);
    if (element && retail && wholesale && retail > wholesale) {
      element.hidden = false;
      element.textContent = `Розничная цена: ${formatPrice(retail)}`;
    } else if (element) {
      element.hidden = true;
      element.textContent = '';
    }
  }

  function retailHtml(variant) {
    const wholesale = positiveNumber(variant.wholesalePrice);
    const retail = positiveNumber(variant.retailPrice);
    return retail && wholesale && retail > wholesale
      ? `<del class="dialog-retail">Розничная цена: ${escapeHtml(formatPrice(retail))}</del>`
      : '';
  }

  function formatSpecs(value) {
    const items = String(value).split(/[,;\n]+/).map(cleanVariantText).filter(Boolean);
    return items.length ? `<ul class="spec-list">${items.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>` : '';
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
    return String(value || '')
      .replace(/\s*\(?\d+\s*шт\.?\s*(?:в\s*)?упаковк[еи]?\)?/giu, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  function cleanText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function validHex(value) {
    const hex = String(value || '').trim();
    return /^#[0-9a-f]{6}$/i.test(hex) ? hex : '';
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

  function positiveNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : null;
  }

  function exactPriceText(value) {
    const price = positiveNumber(value);
    return price ? formatPrice(price) : 'Цена по запросу';
  }

  function formatPrice(value) {
    return `${new Intl.NumberFormat('ru-RU').format(Number(value))} ₽`;
  }

  function formatNumber(value) {
    return new Intl.NumberFormat('ru-RU').format(value);
  }

  function compact(value, max) {
    const text = String(value || '').replace(/\s+/g, ' ').trim();
    return text.length <= max ? text : `${text.slice(0, max - 1).trim()}…`;
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
    return Boolean(path) && !/^(?:https?:)?\/\//i.test(path) && !/^data:/i.test(path) && /\.(?:avif|webp|png|jpe?g|gif)(?:\?.*)?$/i.test(path);
  }

  function relativeAsset(path) {
    const clean = String(path).replace(/^\.\//, '').replace(/^\//, '');
    return `../${clean}`;
  }

  function fallbackSvg() {
    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800"><rect width="100%" height="100%" fill="#eeebe4"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#777168" font-family="Arial" font-size="28">Фотография уточняется</text></svg>')}`;
  }

  function sameVariant(a, b) {
    return Boolean(a && b && a.sourceId === b.sourceId);
  }

  function cartQuantity(sourceId) {
    return Math.max(0, Number(state.cart[String(sourceId)]) || 0);
  }

  function loadFavorites() {
    try {
      const parsed = JSON.parse(localStorage.getItem(FAVORITES_KEY) || '[]');
      return new Set(Array.isArray(parsed) ? parsed.map(String) : []);
    } catch {
      return new Set();
    }
  }

  function saveFavorites() {
    try { localStorage.setItem(FAVORITES_KEY, JSON.stringify([...state.favorites])); } catch {}
  }

  function loadCart() {
    try {
      const parsed = JSON.parse(localStorage.getItem(CART_KEY) || '{}');
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
      if (Array.isArray(parsed)) return Object.fromEntries(parsed.map(id => [String(id), 1]));
      return {};
    } catch {
      return {};
    }
  }

  function saveCart() {
    try { localStorage.setItem(CART_KEY, JSON.stringify(state.cart)); } catch {}
  }

  function loadRecent() {
    try {
      const parsed = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
      return Array.isArray(parsed) ? parsed.map(String).slice(0, 12) : [];
    } catch {
      return [];
    }
  }

  function addRecent(sourceId) {
    const id = String(sourceId);
    state.recent = [id, ...state.recent.filter(item => item !== id)].slice(0, 12);
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(state.recent)); } catch {}
  }

  function migrateLegacyStorage() {
    try {
      if (!localStorage.getItem(FAVORITES_KEY)) {
        const legacy = JSON.parse(localStorage.getItem('forma-next-favorites') || '[]');
        if (Array.isArray(legacy)) localStorage.setItem(FAVORITES_KEY, JSON.stringify(legacy.map(String)));
      }
      if (!localStorage.getItem(CART_KEY)) {
        const legacy = JSON.parse(localStorage.getItem('forma-next-cart') || '[]');
        if (Array.isArray(legacy)) localStorage.setItem(CART_KEY, JSON.stringify(Object.fromEntries(legacy.map(id => [String(id), 1]))));
      }
    } catch {}
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));
  }

  function escapeAttr(value) {
    return escapeHtml(value);
  }
})();
