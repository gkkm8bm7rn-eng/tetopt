(() => {
  'use strict';

  const PAGE_SIZE = 24;
  const FIRST_EAGER_IMAGES = 4;
  const MAX_CARD_IMAGES = 3;
  const MAX_DIALOG_IMAGES = 6;
  const STORE_PHONE = '79057267946';
  const STORE_EMAIL = 'postes@mail.ru';
  const SHOP_CATEGORIES = Object.freeze({
    chairs: 'Стулья', armchairs: 'Кресла', tables: 'Столы', sofas: 'Диваны и мягкая мебель',
    coffee: 'Журнальные и кофейные столики', bar: 'Барная мебель', storage: 'Хранение', other: 'Декор и прочее',
  });
  const FEATURED_SOURCE_IDS = Object.freeze([
    276,284,34,838,29,490,298,36,845,30,502,307,41,851,1304,542,310,45,897,1398,546,319,51,899,
    560,320,56,908,1399,564,324,62,912,1440,593,625,63,1294,1557,611,626,1313,1491,853,1441,1558,866,892,
  ]);
  const COVER_IMAGE_PRIORITY = new Map([
    ['944', 'assets/products/944/01.webp'],
    ['970', 'assets/products/970/01.webp'],
  ]);

  const SOFT_RE = /(велюр|вельвет|букле|ткан|экокож|кожзам|флок|л[её]н|бархат|рогож|шерст|замш|обивк|сидень|подуш)/i;
  const HARD_RE = /(металл|дерев|массив|сосн|бук\b|вяз|шпон|пластик|мдф|лдсп|сталь|хром|основан|каркас|ножк|опор|керамик|стекл|мрамор|ротанг)/i;
  const HARD_FINISH_RE = /(хром|орех|натурал|дуб|венге|груша|золот|латун|бронз|мрамор|гранит|антик)/i;

  const TRUSTED_HEX = new Map([
    ['черный','#171717'], ['чёрный','#171717'], ['белый','#f5f3ee'],
    ['серый','#8b8b86'], ['светло-серый','#c7c7c2'], ['темно-серый','#565854'], ['тёмно-серый','#565854'],
    ['бежевый','#cbbb9f'], ['капучино','#a98b70'], ['коричневый','#76533e'],
    ['оливковый','#7c8060'], ['зеленый','#55745b'], ['зелёный','#55745b'], ['светло-зеленый','#8ca78c'], ['светло-зелёный','#8ca78c'],
    ['синий','#51657a'], ['голубой','#93aec0'], ['бирюзовый','#4f8f8a'], ['изумрудный','#356c5b'],
    ['красный','#9b4c44'], ['бордовый','#743f43'], ['оранжевый','#c47745'], ['желтый','#c6a64b'], ['жёлтый','#c6a64b'],
    ['розовый','#c7959d'], ['фиолетовый','#796984'], ['графит','#545650'],
    ['серебристый','#aaa9a3'], ['золотой','#b59555'], ['натуральный','#b99b71'],
    ['орех','#76563e'], ['дуб','#a9865f'], ['хром','#b9bab8'], ['венге','#49372f'],
    ['слоновая кость','#e5dcc8'], ['айвори','#eee4cf'], ['кремовый','#e7d8bd'],
    ['какао','#80665d'], ['песочный','#c8ad85'], ['горчичный','#b58c35'], ['коньячный','#9a633f'],
    ['антик','#866b54'], ['пепел','#aaa59c'], ['бетон','#99958c'], ['лайм','#9aaa4d'], ['салатовый','#8fbf70']
  ]);

  const state = {
    models: [],
    filtered: [],
    page: 1,
    favorites: loadSet('forma-next-favorites'),
    cart: loadCart('forma-next-cart'),
    view: 'all',
    activeModel: null,
    activeVariant: null,
    activeImageIndex: 0,
    sharedOrder: new Map(),
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
    orderScreen: document.querySelector('#order-screen'),
    checkout: document.querySelector('#checkout-dialog'),
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
      if (!Array.isArray(products) || !products.length) throw new Error('empty catalog');

      const normalized = products.map(normalizeModel).filter(model => model.variants.length);
      assertCatalog(normalized);
      state.models = dedupeKnownGland(normalized);
      state.models = state.models.map((model, sourceOrder) => ({ ...model, sourceOrder }));
      migrateStoredState();
      restoreSharedOrder();

      // Only the proven Gland duplicate is merged client-side. All other models remain separate.
      els.modelCount.textContent = formatNumber(state.models.length);
      els.variantCount.textContent = formatNumber(state.models.reduce((sum, model) => sum + model.variants.length, 0));
      buildFilters();
      els.status.hidden = true;
      applyFilters(true);
    } catch (error) {
      console.error('[next-catalog]', error);
      els.status.hidden = true;
      els.grid.innerHTML = '<div class="error-box"><strong>Каталог не загрузился</strong><p>Проверьте соединение и обновите страницу.</p><button type="button" onclick="location.reload()">Обновить</button></div>';
    }
  }

  function normalizeModel(model, index) {
    const variants = [];
    const colors = Array.isArray(model.colors) ? model.colors : [];

    colors.forEach((color, colorIndex) => {
      const items = Array.isArray(color.variants) ? color.variants : [];
      items.forEach((variant, variantIndex) => {
        const normalized = {
          ...variant,
          colorLabel: String(color.label || variant.color || '').trim(),
          colorHex: String(color.hex || variant.colorHex || '').trim(),
          colorKey: `color-${colorIndex}`,
          variantKey: String(variant.sourceId ?? `${colorIndex}-${variantIndex}`),
          images: normalizeImages(variant),
        };
        normalized.axes = inferAxes(normalized);
        variants.push(normalized);
      });
    });

    if (!variants.length && Array.isArray(model.variants)) {
      model.variants.forEach((variant, variantIndex) => {
        const normalized = {
          ...variant,
          colorLabel: String(variant.color || '').trim(),
          colorHex: String(variant.colorHex || '').trim(),
          colorKey: `variant-${variantIndex}`,
          variantKey: String(variant.sourceId ?? variantIndex),
          images: normalizeImages(variant),
        };
        normalized.axes = inferAxes(normalized);
        variants.push(normalized);
      });
    }

    const collections = uniqueStrings(Array.isArray(model.collection) ? model.collection : [model.collection]);
    const categories = uniqueStrings([
      ...(Array.isArray(model.category) ? model.category : [model.category]),
      ...variants.map(v => v.category),
    ]);
    const rawName = model.name || variants[0]?.name || `Модель ${index + 1}`;
    const displayName = cleanCustomerName(rawName);
    const safeAxes = variants.length > 1 && variants.some(v => v.axes.safe && (v.axes.soft || v.axes.hard));

    const normalizedModel = {
      ...model,
      id: String(model.id || `model-${index + 1}`),
      name: rawName,
      displayName,
      collections,
      categories,
      variants,
      safeAxes,
      searchable: normalizeText([
        rawName, displayName, collections.join(' '), categories.join(' '),
        variants.map(v => `${v.specs || ''} ${v.colorLabel || ''}`).join(' ')
      ].join(' ')),
    };
    normalizedModel.shopCategory = classifyModel(normalizedModel);
    return normalizedModel;
  }

  function inferAxes(variant) {
    const specs = String(variant.specs || '');
    const explicitLabel = String(variant.colorLabel || '').trim();
    const label = explicitLabel || extractTrustedColorLabel(specs);
    const parts = splitColorParts(label);
    const hasSoft = SOFT_RE.test(specs);
    const hasHard = HARD_RE.test(specs);

    if (!label || /основной вариант/i.test(label)) {
      return { soft: '', hard: '', safe: false };
    }

    if (parts.length === 1) {
      if (hasSoft && !hasHard) return { soft: parts[0], hard: '', safe: true };
      if (hasHard && !hasSoft) return { soft: '', hard: parts[0], safe: true };
      if (hasSoft && hasHard) {
        const needle = normalizeText(parts[0]);
        const haystack = normalizeText(specs);
        if (needle && haystack.split(needle).length - 1 >= 2) {
          return { soft: parts[0], hard: parts[0], safe: true };
        }
        const softScore = contextScore(specs, parts[0], SOFT_RE);
        const hardScore = contextScore(specs, parts[0], HARD_RE);
        if (softScore >= hardScore + 2) return { soft: parts[0], hard: '', safe: true };
        if (hardScore >= softScore + 2) return { soft: '', hard: parts[0], safe: true };
      }
      return { soft: '', hard: '', safe: false };
    }

    if (hasSoft && !hasHard) return { soft: label, hard: '', safe: true };
    if (hasHard && !hasSoft) return { soft: '', hard: label, safe: true };
    if (!hasSoft || !hasHard) return { soft: '', hard: '', safe: false };

    const softScores = parts.map(part => contextScore(specs, part, SOFT_RE) - contextScore(specs, part, HARD_RE));
    const hardScores = parts.map(part => contextScore(specs, part, HARD_RE) - contextScore(specs, part, SOFT_RE));
    let softIndex = indexOfStrongest(softScores, 2);
    let hardIndex = indexOfStrongest(hardScores, 2);

    if (softIndex < 0) {
      const hardFinishIndexes = parts.map((part, i) => HARD_FINISH_RE.test(normalizeText(part)) ? i : -1).filter(i => i >= 0);
      if (hardFinishIndexes.length && hardFinishIndexes.length < parts.length) {
        const remaining = parts.map((_, i) => i).filter(i => !hardFinishIndexes.includes(i));
        if (remaining.length === 1) softIndex = remaining[0];
      }
    }

    if (parts.length === 2 && (softIndex < 0 || hardIndex < 0)) {
      const materialOrder = leadingMaterialKinds(specs);
      if (materialOrder.length >= 2) {
        if (materialOrder[0] === 'soft' && materialOrder[1] === 'hard') {
          softIndex = 0; hardIndex = 1;
        } else if (materialOrder[0] === 'hard' && materialOrder[1] === 'soft') {
          hardIndex = 0; softIndex = 1;
        }
      }
    }

    if (softIndex >= 0) {
      const hardParts = parts.filter((_, i) => i !== softIndex);
      if (hardParts.length) return { soft: parts[softIndex], hard: hardParts.join(' / '), safe: true };
    }
    if (hardIndex >= 0) {
      const softParts = parts.filter((_, i) => i !== hardIndex);
      if (softParts.length) return { soft: softParts.join(' / '), hard: parts[hardIndex], safe: true };
    }

    return { soft: '', hard: '', safe: false };
  }

  function splitColorParts(label) {
    return String(label || '').split(/\s*\/\s*/).map(part => part.trim()).filter(Boolean);
  }

  function leadingMaterialKinds(specs) {
    const lead = String(specs || '').split(/,\s*(?=\d|[а-яё-]+\s*\/)/i)[0];
    return lead.split('/').map(part => {
      if (SOFT_RE.test(part)) return 'soft';
      if (HARD_RE.test(part)) return 'hard';
      return 'other';
    }).filter(kind => kind !== 'other');
  }

  function contextScore(specs, color, pattern) {
    const text = normalizeText(specs);
    const needle = normalizeText(color).replace(/\s*\([^)]*\)/g, '').trim();
    if (!needle) return 0;
    let score = 0;
    let from = 0;
    while (true) {
      const pos = text.indexOf(needle, from);
      if (pos < 0) break;
      const window = text.slice(Math.max(0, pos - 28), Math.min(text.length, pos + needle.length + 28));
      if (pattern.test(window)) score += 3;
      from = pos + needle.length;
    }
    return score;
  }

  function indexOfStrongest(scores, threshold) {
    if (!scores.length) return -1;
    const max = Math.max(...scores);
    if (max < threshold) return -1;
    const indexes = scores.map((value, i) => value === max ? i : -1).filter(i => i >= 0);
    return indexes.length === 1 ? indexes[0] : -1;
  }


  function extractTrustedColorLabel(specs) {
    const text = normalizeText(specs);
    const hits = [];
    for (const name of TRUSTED_HEX.keys()) {
      const normalized = normalizeText(name);
      const index = text.indexOf(normalized);
      if (index >= 0) hits.push({ name, index, length: normalized.length });
    }
    hits.sort((a, b) => a.index - b.index || b.length - a.length);
    const selected = [];
    let lastEnd = -1;
    for (const hit of hits) {
      if (hit.index < lastEnd) continue;
      const canonical = hit.name.replace(/ё/g, 'е');
      if (!selected.some(item => normalizeText(item.name) === normalizeText(canonical))) {
        selected.push({ ...hit, name: canonical });
      }
      lastEnd = hit.index + hit.length;
    }
    return selected.slice(0, 3).map(item => item.name).join('/');
  }

  function dedupeKnownGland(models) {
    const gland = models.filter(model => {
      const ids = new Set(model.variants.map(v => Number(v.sourceId)).filter(Number.isFinite));
      return [30, 31, 32, 33].some(id => ids.has(id)) && /(?:гленд|gland)/i.test(model.displayName);
    });
    if (gland.length !== 2) return models;

    const mergedVariants = [...gland[0].variants, ...gland[1].variants];
    const uniqueVariants = [];
    const seen = new Set();
    for (const variant of mergedVariants) {
      const key = String(variant.sourceId ?? variant.variantKey);
      if (seen.has(key)) continue;
      seen.add(key);
      uniqueVariants.push(variant);
    }
    const merged = {
      ...gland[0],
      displayName: 'Стол журнальный Гленд/Gland',
      name: 'Стол журнальный Гленд/Gland',
      variants: uniqueVariants,
      safeAxes: uniqueVariants.length > 1 && uniqueVariants.every(v => v.axes.safe && (v.axes.soft || v.axes.hard)),
      searchable: `${gland[0].searchable} ${gland[1].searchable}`,
    };
    const ids = new Set(gland.map(model => model.id));
    const output = [];
    let inserted = false;
    for (const model of models) {
      if (!ids.has(model.id)) output.push(model);
      else if (!inserted) {
        output.push(merged);
        inserted = true;
      }
    }
    return output;
  }

  function normalizeImages(variant) {
    const candidates = [];
    if (Array.isArray(variant.images)) candidates.push(...variant.images);
    if (variant.image) candidates.push(variant.image);
    if (variant.directImage) candidates.push(variant.directImage);
    const images = uniqueStrings(candidates.filter(isLocalImagePath));
    const preferred = COVER_IMAGE_PRIORITY.get(String(variant.sourceId));
    return preferred && images.includes(preferred) ? [preferred, ...images.filter(image => image !== preferred)] : images;
  }

  function assertCatalog(models) {
    const modelIds = new Set();
    const sourceIds = new Set();
    models.forEach(model => {
      if (modelIds.has(model.id)) throw new Error(`duplicate model id ${model.id}`);
      modelIds.add(model.id);
      model.variants.forEach(variant => {
        if (variant.sourceId == null) return;
        const id = String(variant.sourceId);
        if (sourceIds.has(id)) throw new Error(`duplicate sourceId ${id}`);
        sourceIds.add(id);
      });
    });
  }

  function buildFilters() {
    fillSelect(els.collection, uniqueSorted(state.models.flatMap(m => m.collections)));
    const available = new Set(state.models.map(model => model.shopCategory));
    const categories = Object.values(SHOP_CATEGORIES).filter(category => available.has(category));
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
    let timer = 0;
    els.search.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(() => applyFilters(true), 120);
    });
    [els.category, els.collection, els.price].forEach(el => el.addEventListener('change', () => applyFilters(true)));
    els.reset.addEventListener('click', resetFilters);
    els.favoritesButton.addEventListener('click', () => setView(state.view === 'favorites' ? 'all' : 'favorites'));
    els.cartButton.addEventListener('click', () => setView(state.view === 'cart' ? 'all' : 'cart'));
    els.dialogClose.addEventListener('click', closeDialog);
    els.dialog.addEventListener('click', event => { if (event.target === els.dialog) closeDialog(); });
    els.dialog.addEventListener('cancel', event => { event.preventDefault(); closeDialog(); });
    document.querySelector('#checkout-close').addEventListener('click',closeCheckout);
    els.checkout.addEventListener('cancel',event=>{event.preventDefault();closeCheckout();});
    document.querySelectorAll('[data-checkout]').forEach(button=>button.addEventListener('click',()=>sendCheckout(button.dataset.checkout)));
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
    if (state.view === 'cart' || state.view === 'shared') {
      state.filtered = [];
      els.grid.hidden = true;
      els.pagination.hidden = true;
      els.empty.hidden = true;
      els.controls = els.controls || document.querySelector('.controls');
      els.controls.hidden = true;
      const quantity=orderQuantity(activeOrder());
      els.count.textContent = `${quantity} ${plural(quantity,'товар','товара','товаров')}`;
      renderOrder();
      return;
    }
    els.grid.hidden = false;
    els.orderScreen.hidden = true;
    (els.controls || document.querySelector('.controls')).hidden = false;
    const query = normalizeText(els.search.value);
    const category = els.category.value;
    const collection = els.collection.value;
    const priceRange = parsePriceRange(els.price.value);

    if (state.view === 'favorites') {
      const records=[...state.favorites].map(variantRecord).filter(Boolean);
      state.filtered=records;
      if(resetPage)state.page=1;
      state.page=Math.min(state.page,Math.max(1,Math.ceil(records.length/PAGE_SIZE)));
      els.empty.hidden=records.length!==0;
      els.count.textContent=`Избранное: ${records.length} ${plural(records.length,'товар','товара','товаров')}`;
      renderPage();
      return;
    }
    let filtered = state.models.filter(model => {
      if (query && !model.searchable.includes(query)) return false;
      if (category && model.shopCategory !== category) return false;
      if (collection && !model.collections.includes(collection)) return false;
      if (priceRange && !model.variants.some(v => withinPrice(v.wholesalePrice, priceRange))) return false;
      return true;
    });

    const merchandising = state.view === 'all' && !query && !category && !collection && !priceRange;
    if (merchandising) filtered = merchandiseModels(filtered);
    state.filtered = filtered;
    if (resetPage) state.page = 1;
    state.page = Math.min(state.page, Math.max(1, Math.ceil(filtered.length / PAGE_SIZE)));
    els.empty.hidden = filtered.length !== 0;
    updateEmptyState();
    els.count.textContent = resultCountText();
    renderPage();
  }

  function merchandiseModels(models) {
    const featuredRank = new Map(FEATURED_SOURCE_IDS.map((sourceId, index) => [String(sourceId), index]));
    return [...models].sort((a, b) => {
      const aFeatured = featuredModelRank(a, featuredRank), bFeatured = featuredModelRank(b, featuredRank);
      if (aFeatured !== bFeatured) return aFeatured - bFeatured;
      return merchandisingPriority(a) - merchandisingPriority(b) || a.sourceOrder - b.sourceOrder;
    });
  }

  function featuredModelRank(model, ranks) {
    const rank = Math.min(...model.variants.map(variant => ranks.get(String(variant.sourceId)) ?? Infinity));
    return Number.isFinite(rank) ? rank : FEATURED_SOURCE_IDS.length + 1;
  }

  function merchandisingPriority(model) {
    const kind = model.shopCategory;
    const base = {
      [SHOP_CATEGORIES.chairs]: 0, [SHOP_CATEGORIES.armchairs]: 4, [SHOP_CATEGORIES.tables]: 14,
      [SHOP_CATEGORIES.sofas]: 25, [SHOP_CATEGORIES.coffee]: 34, [SHOP_CATEGORIES.bar]: 70,
      [SHOP_CATEGORIES.storage]: 100, [SHOP_CATEGORIES.other]: 115,
    }[kind];
    const text = normalizeText(`${model.displayName} ${model.categories.join(' ')}`);
    let score = base;
    if (/обеденн|dining|кресло|armchair/.test(text)) score -= 8;
    if (/кож|leather|декор|аксессуар|матрац|подуш|корзин|цветочниц|этажерк|ложк|ваза|статуэт/.test(text)) score += 35;
    if (/полубар|барн|bar/.test(text)) score += 12;
    if (/надстройк|сист.*блок|страйк|геймер|компьютерн|ремеш|матрас|матрац|подуш|комплектующ/.test(text)) score += 70;
    if (!chooseDisplayVariant(model).images.length) score += 25;
    if (!positiveNumber(chooseDisplayVariant(model).wholesalePrice)) score += 8;
    score += Math.min(model.sourceOrder / 10000, .99);
    return score;
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

  function resultCountText() {
    const prefix = state.view === 'favorites' ? 'Избранное: ' : state.view === 'cart' ? 'В заказе: ' : '';
    return `${prefix}${formatNumber(state.filtered.length)} ${plural(state.filtered.length,'модель','модели','моделей')}`;
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
    for (let i = start; i < end; i += 1) {
      const item=state.filtered[i];
      if(state.view==='favorites')fragment.append(createCard(item.model,i-start,item.variant));
      else fragment.append(createCard(item,i-start));
    }
    els.grid.append(fragment);
    renderPagination();
  }

  function renderPagination() {
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
          button.setAttribute('aria-current','page');
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

  function paginationItems(current,total) {
    if (total <= 7) return Array.from({length:total},(_,i)=>i+1);
    const items=[1], from=Math.max(2,current-1), to=Math.min(total-1,current+1);
    if (from>2) items.push('…');
    for (let p=from;p<=to;p+=1) items.push(p);
    if (to<total-1) items.push('…');
    items.push(total);
    return items;
  }

  function createCard(model, position, preferredVariant = null) {
    const node = els.template.content.firstElementChild.cloneNode(true);
    let variant = preferredVariant || chooseDisplayVariant(model);
    let galleryIndex = 0;
    const img = node.querySelector('.card-image');
    const imageWrap = node.querySelector('.image-wrap');
    const price = node.querySelector('.card-price');
    const swatches = node.querySelector('.card-swatches');
    const count = node.querySelector('.card-gallery-count');
    const prev = node.querySelector('.card-prev');
    const next = node.querySelector('.card-next');
    const body = node.querySelector('.card-body');
    let retail = node.querySelector('.card-retail');
    if (!retail) {
      retail = document.createElement('del');
      retail.className = 'card-retail';
      price.insertAdjacentElement('afterend', retail);
    }

    if (position < FIRST_EAGER_IMAGES) {
      img.loading = 'eager';
      img.fetchPriority = 'high';
    }

    const updateCard = () => {
      const images = cardImages(variant);
      galleryIndex = Math.min(galleryIndex, Math.max(0, images.length - 1));
      img.src = images[galleryIndex] ? relativeAsset(images[galleryIndex]) : fallbackSvg();
      img.alt = model.displayName;
      price.textContent = exactPriceText(variant.wholesalePrice);
      renderRetail(retail, variant);
      renderAxisSelectors(model, variant, swatches, {
        compact: true,
        onSelect: chosen => {
          variant = chosen;
          galleryIndex = 0;
          updateCard();
        }
      });
      if (favorite) syncFavoriteButton(favorite,String(variant.sourceId));
      const showGallery = images.length > 1;
      prev.hidden = !showGallery;
      next.hidden = !showGallery;
      count.hidden = !showGallery;
      if (showGallery) count.textContent = `${galleryIndex + 1} / ${images.length}`;
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
    img.addEventListener('error', () => { img.src = fallbackSvg(); }, { once:true });

    node.querySelector('.card-collection').textContent = cleanCollection(model.collections[0] || model.categories[0] || 'FORMA HOME');
    node.querySelector('.card-name').textContent = model.displayName;
    node.querySelector('.card-meta').textContent = model.variants.length > 1 ? 'Доступно несколько исполнений' : '';
    node.querySelectorAll('.card-open').forEach(button => button.addEventListener('click', () => openModel(model, variant)));

    const favorite = node.querySelector('.favorite-button');
    const favoriteId = () => String(variant.sourceId);
    syncFavoriteButton(favorite, favoriteId());
    favorite.addEventListener('click', event => { event.stopPropagation(); toggleFavorite(favoriteId(), favorite); });
    updateCard();
    return node;
  }

  function renderAxisSelectors(model, activeVariant, container, options = {}) {
    container.replaceChildren();
    const compact = Boolean(options.compact);
    const onSelect = options.onSelect || (()=>{});
    if (model.variants.length < 2) {
      container.hidden = true;
      return;
    }

    const parsedVariants = model.variants.filter(v => v.axes.safe && (v.axes.soft || v.axes.hard));
    const soft = uniqueStrings(parsedVariants.map(v => v.axes.soft));
    const hard = uniqueStrings(parsedVariants.map(v => v.axes.hard));
    const hasUsefulAxes = soft.length > 1 || hard.length > 1;

    if (!hasUsefulAxes) {
      if (compact) {
        container.hidden = true;
        return;
      }
      container.hidden = false;
      const title = document.createElement('p');
      title.className = 'axis-label';
      title.textContent = 'Выберите исполнение';
      const row = document.createElement('div');
      row.className = 'fallback-variants';
      model.variants.forEach((variant,index) => {
        const button = document.createElement('button');
        button.type='button';
        button.className='variant-pill fallback-variant';
        if (sameVariant(variant,activeVariant)) button.classList.add('active');
        button.textContent = customerVariantLabel(variant,index);
        button.addEventListener('click', event => {
          event.stopPropagation();
          onSelect(variant);
        });
        row.append(button);
      });
      container.append(title,row);
      return;
    }

    let rendered = false;

    if (soft.length > 1) {
      container.append(makeAxisRow(model,activeVariant,'soft',soft,compact,onSelect));
      rendered = true;
    }
    const allParsedHaveHard = parsedVariants.length > 0 && parsedVariants.every(v => v.axes.hard);
    if (hard.length > 1 && (activeVariant.axes.hard || allParsedHaveHard)) {
      container.append(makeAxisRow(model,activeVariant,'hard',hard,compact,onSelect));
      rendered = true;
    }

    const unresolved = model.variants.filter(v => !v.axes.safe || (!v.axes.soft && !v.axes.hard));
    if (!compact) {
      const pair = uniqueVariants(unresolved).filter(item=>!sameVariant(item,activeVariant));
      if (pair.length) {
        const block = document.createElement('div');
        block.className='residual-variants';
        const title=document.createElement('p');
        title.className='axis-label';
        title.textContent='Другие доступные исполнения';
        const row=document.createElement('div');
        row.className='variant-pills';
        pair.forEach((variant,index)=>{
          const button=document.createElement('button');
          button.type='button';
          button.className='variant-pill';
          if (sameVariant(variant,activeVariant)) button.classList.add('active');
          button.textContent=customerVariantLabel(variant,index);
          button.addEventListener('click',()=>onSelect(variant));
          row.append(button);
        });
        block.append(title,row);
        container.append(block);
        rendered = true;
      }
    }

    container.hidden = !rendered;
  }

  function makeAxisRow(model,activeVariant,axis,values,compact,onSelect) {
    const wrapper=document.createElement(compact ? 'span' : 'div');
    wrapper.className=`axis-row axis-${axis}${compact ? ' compact' : ''}`;
    if (!compact) {
      const label=document.createElement('p');
      label.className='axis-label';
      label.textContent=axisTitle(model,axis);
      wrapper.append(label);
    }
    const row=document.createElement('span');
    row.className='axis-swatches';
    values.forEach(value=>{
      const button=document.createElement('button');
      button.type='button';
      button.className=`axis-swatch ${axis === 'soft' ? 'soft' : 'hard'}`;
      if (normalizeText(activeVariant.axes[axis])===normalizeText(value)) button.classList.add('active');
      const available=axisCombinationAvailable(model,activeVariant,axis,value);
      button.disabled=!available;
      const hex=safeColorHex(value);
      if (!hex) {
        const textButton=document.createElement('button');
        textButton.type='button';
        textButton.className=`variant-pill${normalizeText(activeVariant.axes[axis])===normalizeText(value)?' active':''}`;
        textButton.textContent=value;
        textButton.disabled=!available;
        textButton.addEventListener('click',event=>{event.stopPropagation();const chosen=selectAxisVariant(model,activeVariant,axis,value);if(chosen)onSelect(chosen);});
        row.append(textButton);
        return;
      }
      button.style.setProperty('--swatch',hex);
      button.title=value;
      button.setAttribute('aria-label',`${axisTitle(model,axis)}: ${value}`);
      button.addEventListener('click',event=>{
        event.stopPropagation();
        if (button.disabled) return;
        const chosen=selectAxisVariant(model,activeVariant,axis,value);
        if (chosen) onSelect(chosen);
      });
      row.append(button);
    });
    wrapper.append(row);
    return wrapper;
  }

  function uniqueAxisValues(model,axis) {
    return uniqueStrings(model.variants.map(v=>v.axes[axis]));
  }

  function axisTitle(model,axis) {
    const specs=normalizeText(model.variants.map(v=>v.specs||'').join(' '));
    if (axis==='soft') {
      if (/подуш/.test(specs)) return 'Цвет подушки';
      if (/сидень/.test(specs) && !/обивк/.test(specs)) return 'Цвет сиденья';
      if (/ткан/.test(specs) && !/обивк/.test(specs)) return 'Цвет ткани';
      return 'Цвет обивки';
    }
    if (/ножк/.test(specs)) return 'Цвет ножек';
    if (/каркас/.test(specs)) return 'Цвет каркаса';
    if (/опор/.test(specs)) return 'Цвет опоры';
    return 'Цвет основания';
  }

  function axisCombinationAvailable(model,current,axis,value) {
    const other=axis==='soft'?'hard':'soft';
    const otherValue=current.axes[other];
    if (!otherValue) return model.variants.some(v=>normalizeText(v.axes[axis])===normalizeText(value));
    return model.variants.some(v =>
      normalizeText(v.axes[axis])===normalizeText(value) &&
      normalizeText(v.axes[other])===normalizeText(otherValue)
    );
  }

  function selectAxisVariant(model,current,axis,value) {
    const other=axis==='soft'?'hard':'soft';
    const otherValue=current.axes[other];
    const exact=model.variants.filter(v =>
      normalizeText(v.axes[axis])===normalizeText(value) &&
      (!otherValue || normalizeText(v.axes[other])===normalizeText(otherValue))
    );
    if (exact.length) {
      const sameResidual=exact.find(v=>normalizeText(v.specs)===normalizeText(current.specs));
      return sameResidual || exact.find(v=>v.images.length) || exact[0];
    }
    const candidates=model.variants.filter(v=>normalizeText(v.axes[axis])===normalizeText(value));
    return candidates.find(v=>v.images.length) || candidates[0] || null;
  }

  function variantsForCurrentAxes(model,current) {
    return model.variants.filter(v =>
      (!current.axes.soft || normalizeText(v.axes.soft)===normalizeText(current.axes.soft)) &&
      (!current.axes.hard || normalizeText(v.axes.hard)===normalizeText(current.axes.hard))
    );
  }

  function cardImages(variant) {
    return (variant?.images || []).slice(0,MAX_CARD_IMAGES);
  }

  function bindSwipe(target,step,minDistance=40) {
    let startX=0,startY=0;
    target.addEventListener('touchstart',event=>{
      const t=event.changedTouches[0]; startX=t.clientX; startY=t.clientY;
    },{passive:true});
    target.addEventListener('touchend',event=>{
      const t=event.changedTouches[0], dx=t.clientX-startX, dy=t.clientY-startY;
      if (Math.abs(dx)<minDistance || Math.abs(dx)<=Math.abs(dy)*1.1) return;
      step(dx<0?1:-1);
    },{passive:true});
  }

  function openModel(model,preferredVariant=null) {
    state.activeModel=model;
    state.activeVariant=preferredVariant || chooseDisplayVariant(model);
    state.activeImageIndex=0;
    renderDialog();
    document.body.classList.add('dialog-open');
    if (typeof els.dialog.showModal==='function') els.dialog.showModal();
    else { els.dialog.classList.add('dialog-fallback'); els.dialog.setAttribute('open',''); }
  }

  function renderDialog() {
    const model=state.activeModel, variant=state.activeVariant;
    if (!model || !variant) return;
    const images=(variant.images.length?variant.images:['']).slice(0,MAX_DIALOG_IMAGES);
    state.activeImageIndex=Math.min(state.activeImageIndex,Math.max(0,images.length-1));
    const activeImage=images[state.activeImageIndex]||'';
    const thumbs=images.map((src,index)=>`<button class="thumb${index===state.activeImageIndex?' active':''}" type="button" data-image-index="${index}" aria-label="Фото ${index+1} из ${images.length}"><img src="${escapeAttr(src?relativeAsset(src):fallbackSvg())}" alt="" loading="lazy" decoding="async"></button>`).join('');
    const cartId=String(variant.sourceId ?? model.id);
    const inCart=state.cart.has(cartId);
    const retail=retailHtml(variant);

    els.dialogContent.innerHTML=`
      <div class="dialog-layout">
        <div class="dialog-gallery">
          <div class="main-image-wrap">
            <img class="dialog-main-image" id="dialog-main-image" src="${escapeAttr(activeImage?relativeAsset(activeImage):fallbackSvg())}" alt="${escapeAttr(model.displayName)}">
            ${images.length>1?`<span class="dialog-gallery-count">${state.activeImageIndex+1} / ${images.length}</span><button class="gallery-arrow prev" type="button" data-gallery-step="-1" aria-label="Предыдущее фото">‹</button><button class="gallery-arrow next" type="button" data-gallery-step="1" aria-label="Следующее фото">›</button>`:''}
          </div>
          ${images.length>1?`<div class="thumb-row" aria-label="Фотографии товара">${thumbs}</div>`:''}
        </div>
        <div class="dialog-info">
          <p class="eyebrow">${escapeHtml(cleanCollection(model.collections[0]||model.categories[0]||'FORMA HOME'))}</p>
          <h2>${escapeHtml(model.displayName)}</h2>
          <strong class="dialog-price">${escapeHtml(exactPriceText(variant.wholesalePrice))}</strong>
          ${retail}
          <div class="dialog-axis-selectors"></div>
          ${variant.specs?`<div class="specs">${formatSpecs(variant.specs,variant)}</div>`:''}
          ${dimensionsHtml(variant)}
          <div class="dialog-actions">
            <button class="add-cart" type="button" data-cart-id="${escapeAttr(cartId)}">${inCart?'Перейти к заказу →':'Добавить в заказ'}</button>
            <button class="dialog-favorite" type="button" aria-label="${state.favorites.has(cartId)?'Убрать из избранного':'Добавить в избранное'}">${state.favorites.has(cartId)?'♥':'♡'}</button>
            ${inCart?`<button class="remove-cart" type="button" data-cart-id="${escapeAttr(cartId)}">Удалить вариант из заказа</button>`:''}
          </div>
        </div>
      </div>`;

    const selectors=els.dialogContent.querySelector('.dialog-axis-selectors');
    renderAxisSelectors(model,variant,selectors,{
      compact:false,
      onSelect:chosen=>{
        state.activeVariant=chosen;
        state.activeImageIndex=0;
        renderDialog();
      }
    });
    bindDialogEvents(images);
  }

  function bindDialogEvents(images) {
    els.dialogContent.querySelectorAll('.thumb').forEach(button=>button.addEventListener('click',()=>showDialogImage(Number(button.dataset.imageIndex),images)));
    els.dialogContent.querySelectorAll('[data-gallery-step]').forEach(button=>button.addEventListener('click',()=>stepDialogImage(Number(button.dataset.galleryStep),images)));
    const mainWrap=els.dialogContent.querySelector('.main-image-wrap');
    if (mainWrap && images.length>1) bindSwipe(mainWrap,step=>stepDialogImage(step,images),44);

    els.dialogContent.querySelector('.add-cart')?.addEventListener('click',event=>{
      const id=event.currentTarget.dataset.cartId;
      if (state.cart.has(id)) { closeDialog(); setView('cart'); return; }
      state.cart.set(id,1);
      saveCart();
      updateCounters();
      renderDialog();
    });
    els.dialogContent.querySelector('.remove-cart')?.addEventListener('click',event=>{
      const id=event.currentTarget.dataset.cartId;
      state.cart.delete(id);
      saveCart();
      updateCounters();
      renderDialog();
      if (state.view==='cart') applyFilters();
    });
    els.dialogContent.querySelector('.dialog-favorite')?.addEventListener('click',event=>{
      toggleFavorite(String(state.activeVariant.sourceId),event.currentTarget,true);
      renderDialog();
    });
  }

  function showDialogImage(index,images) {
    if (!images.length) return;
    const safe=(index+images.length)%images.length;
    state.activeImageIndex=safe;
    const main=els.dialogContent.querySelector('#dialog-main-image');
    if (main) main.src=images[safe]?relativeAsset(images[safe]):fallbackSvg();
    const badge=els.dialogContent.querySelector('.dialog-gallery-count');
    if (badge) badge.textContent=`${safe+1} / ${images.length}`;
    els.dialogContent.querySelectorAll('.thumb').forEach((item,i)=>item.classList.toggle('active',i===safe));
  }

  function stepDialogImage(step,images) { showDialogImage(state.activeImageIndex+step,images); }

  function closeDialog() {
    document.body.classList.remove('dialog-open');
    if (typeof els.dialog.close==='function' && els.dialog.open) els.dialog.close();
    else { els.dialog.removeAttribute('open'); els.dialog.classList.remove('dialog-fallback'); }
  }

  function toggleFavorite(id,button,dialogButton=false) {
    if (state.favorites.has(id)) state.favorites.delete(id); else state.favorites.add(id);
    saveSet('forma-next-favorites',state.favorites);
    updateCounters();
    if (!dialogButton) syncFavoriteButton(button,id);
    if (state.view==='favorites' && !state.favorites.has(id)) applyFilters();
  }

  function syncFavoriteButton(button,id) {
    const active=state.favorites.has(id);
    button.classList.toggle('active',active);
    button.textContent=active?'♥':'♡';
    button.setAttribute('aria-label',active?'Убрать из избранного':'Добавить в избранное');
  }

  function updateCounters() {
    els.favCount.textContent=state.favorites.size;
    els.cartCount.textContent=cartQuantity();
  }

  function variantRecord(sourceId) {
    for (const model of state.models) {
      const variant=model.variants.find(item=>String(item.sourceId)===String(sourceId));
      if (variant) return {model,variant};
    }
    return null;
  }

  function migrateStoredState() {
    const migrated=new Set();
    state.favorites.forEach(id=>{
      const direct=variantRecord(id);
      if (direct) migrated.add(String(direct.variant.sourceId));
      else {
        const model=state.models.find(item=>item.id===String(id));
        const variant=model&&chooseDisplayVariant(model);
        if (variant?.sourceId!=null) migrated.add(String(variant.sourceId));
      }
    });
    state.favorites=migrated;
    saveSet('forma-next-favorites',state.favorites);
    const clean=new Map();
    state.cart.forEach((quantity,id)=>{if(variantRecord(id))clean.set(String(id),clampQuantity(quantity));});
    state.cart=clean;
    saveCart();
    updateCounters();
  }

  function restoreSharedOrder() {
    const encoded=new URL(location.href).searchParams.get('order');
    if (!encoded) return;
    const restored=new Map();
    encoded.split(',').slice(0,100).forEach(pair=>{
      const [id,rawQuantity]=pair.split('.');
      const quantity=Number(rawQuantity);
      if (/^\d+$/.test(id||'')&&Number.isInteger(quantity)&&quantity>0&&quantity<=999&&variantRecord(id)) restored.set(id,quantity);
    });
    if (restored.size) { state.sharedOrder=restored; state.view='shared'; syncViewButtons(); }
  }

  function activeOrder(){return state.view==='shared'?state.sharedOrder:state.cart;}
  function orderQuantity(order) { return [...order.values()].reduce((sum,value)=>sum+value,0); }
  function orderTotal(order) { return [...order].reduce((sum,[id,quantity])=>sum+(positiveNumber(variantRecord(id)?.variant.wholesalePrice)||0)*quantity,0); }
  function cartQuantity(){return orderQuantity(state.cart);}
  function cartTotal(){return orderTotal(state.cart);}
  function clampQuantity(value){return Math.max(1,Math.min(999,Math.floor(Number(value)||1)));}
  function saveCart() { try { localStorage.setItem('forma-next-cart',JSON.stringify(Object.fromEntries(state.cart))); } catch {} }

  function renderOrder() {
    els.orderScreen.hidden=false;
    const shared=state.view==='shared', order=activeOrder(), title=shared?'Заказ по ссылке':'Ваш заказ';
    if (!order.size) { els.orderScreen.innerHTML=`<div class="order-heading"><div><p class="eyebrow">Заказ</p><h2 id="order-title">${title}</h2></div><button type="button" data-back>← Вернуться в каталог</button></div><div class="empty-state"><h3>В заказе пока ничего нет</h3></div>`;els.orderScreen.querySelector('[data-back]').addEventListener('click',()=>setView('all'));return; }
    const rows=[...order].map(([id,quantity])=>{
      const record=variantRecord(id); if(!record)return '';
      const {model,variant}=record, image=variant.images[0];
      return `<article class="order-item" data-order-item="${escapeAttr(id)}"><img src="${escapeAttr(image?relativeAsset(image):fallbackSvg())}" alt=""><div><h3>${escapeHtml(model.displayName)}</h3><p>${escapeHtml(variantExecutionLabel(variant))}</p>${dimensionsHtml(variant)}${formatSpecs(variant.specs,variant)?`<div class="order-specs">${formatSpecs(variant.specs,variant)}</div>`:''}<strong>${escapeHtml(formatPrice((positiveNumber(variant.wholesalePrice)||0)*quantity))}</strong></div><div class="quantity" aria-label="Количество"><button type="button" data-qty="-1" aria-label="Уменьшить количество">−</button><b>${quantity}</b><button type="button" data-qty="1" aria-label="Увеличить количество">+</button><button class="order-remove" type="button" data-remove aria-label="Удалить позицию">Удалить</button></div></article>`;
    }).join('');
    els.orderScreen.innerHTML=`<div class="order-heading"><div><p class="eyebrow">Заказ</p><h2 id="order-title">${title}</h2></div><button type="button" data-back>← Вернуться в каталог</button></div><div class="order-list">${rows}</div><div class="order-summary"><p>Всего товаров: <strong>${orderQuantity(order)}</strong></p><p>Итого: <strong>${formatPrice(orderTotal(order))}</strong></p><div>${shared?'<button class="save-shared" type="button">Добавить в мой заказ</button>':'<button class="share-order" type="button">Поделиться заказом</button><button class="checkout-order" type="button">Оформить заказ</button>'}</div><small class="order-feedback" aria-live="polite"></small></div>`;
    els.orderScreen.querySelector('[data-back]').addEventListener('click',()=>setView('all'));
    if(!shared)els.orderScreen.querySelectorAll('.order-item').forEach(row=>{
      const id=row.dataset.orderItem;
      row.querySelectorAll('[data-qty]').forEach(button=>button.addEventListener('click',()=>{const next=(state.cart.get(id)||1)+Number(button.dataset.qty);if(next>0)state.cart.set(id,clampQuantity(next));else state.cart.delete(id);saveCart();updateCounters();applyFilters();}));
      row.querySelector('[data-remove]').addEventListener('click',()=>{state.cart.delete(id);saveCart();updateCounters();applyFilters();});
    });
    els.orderScreen.querySelector('.share-order')?.addEventListener('click',shareOrder);
    els.orderScreen.querySelector('.checkout-order')?.addEventListener('click',openCheckout);
    els.orderScreen.querySelector('.save-shared')?.addEventListener('click',()=>{state.sharedOrder.forEach((q,id)=>state.cart.set(id,clampQuantity((state.cart.get(id)||0)+q)));saveCart();updateCounters();setView('cart');});
  }

  function orderUrl() {
    const url=new URL(location.href); url.search=''; url.hash='catalog';
    url.searchParams.set('order',[...state.cart].map(([id,q])=>`${id}.${clampQuantity(q)}`).join(','));
    return url.href;
  }
  async function shareOrder() {
    const data={title:'Заказ FORMA HOME',text:`Заказ FORMA HOME: ${cartQuantity()} шт.`,url:orderUrl()};
    try {
      if(navigator.share){await navigator.share(data);showOrderFeedback('Заказ отправлен');}
      else{await navigator.clipboard.writeText(data.url);showOrderFeedback('Ссылка на заказ скопирована');}
    } catch(error) { if(error?.name!=='AbortError')showOrderFeedback('Не удалось поделиться заказом'); }
  }
  function openCheckout(){
    document.querySelector('#checkout-summary').textContent=`${cartQuantity()} ${plural(cartQuantity(),'товар','товара','товаров')} · ${formatPrice(cartTotal())}`;
    document.querySelector('#checkout-error').textContent='';
    if(typeof els.checkout.showModal==='function')els.checkout.showModal();else els.checkout.setAttribute('open','');
  }
  function closeCheckout(){if(typeof els.checkout.close==='function'&&els.checkout.open)els.checkout.close();else els.checkout.removeAttribute('open');}
  function checkoutCustomer(){return {name:document.querySelector('#checkout-name').value.trim(),phone:document.querySelector('#checkout-phone').value.trim(),city:document.querySelector('#checkout-city').value.trim(),comment:document.querySelector('#checkout-comment').value.trim()};}
  function validateCheckout(){
    const data=checkoutCustomer(),error=document.querySelector('#checkout-error');
    if(!data.name){error.textContent='Укажите имя.';return null;}
    if(data.phone.replace(/\D/g,'').length<7){error.textContent='Укажите корректный телефон.';return null;}
    if(!data.city){error.textContent='Укажите город доставки.';return null;}
    error.textContent='';return data;
  }
  function checkoutText(data){
    return ['Здравствуйте! Хочу оформить заказ в FORMA HOME:','',...[...state.cart].map(([id,q],index)=>{const {model,variant}=variantRecord(id),price=positiveNumber(variant.wholesalePrice)||0;return `${index+1}. ${model.displayName}\nИсполнение: ${variantExecutionLabel(variant)}\n${q} шт. × ${formatPrice(price)} = ${formatPrice(price*q)}`;}),'',`Итого: ${formatPrice(cartTotal())}`,'',`Имя: ${data.name}`,`Телефон: ${data.phone}`,`Город: ${data.city}`,data.comment?`Комментарий: ${data.comment}`:'',`Ссылка на заказ: ${orderUrl()}`].filter(Boolean).join('\n');
  }
  async function sendCheckout(channel){
    const data=validateCheckout();if(!data)return;
    const message=checkoutText(data);
    if(channel==='whatsapp'){window.open(`https://wa.me/${STORE_PHONE}?text=${encodeURIComponent(message)}`,'_blank','noopener');return;}
    if(channel==='email'){window.open(`mailto:${STORE_EMAIL}?subject=${encodeURIComponent('Заказ с сайта FORMA HOME')}&body=${encodeURIComponent(message)}`,'_self');return;}
    if(channel==='telegram'){window.open(`https://t.me/+${STORE_PHONE}?text=${encodeURIComponent(message)}`,'_blank','noopener');return;}
    try{await navigator.clipboard.writeText(message);document.querySelector('#checkout-error').textContent='Заказ скопирован';}catch{document.querySelector('#checkout-error').textContent='Не удалось скопировать заказ';}
  }
  function showOrderFeedback(message){const item=els.orderScreen.querySelector('.order-feedback');if(item)item.textContent=message;}

  function chooseDisplayVariant(model) {
    return model.variants.find(v=>v.images.length && positiveNumber(v.wholesalePrice)) ||
      model.variants.find(v=>v.images.length) || model.variants[0];
  }

  function sameVariant(a,b) { return a && b && a.variantKey===b.variantKey; }

  function uniqueVariants(items) {
    const seen = new Set();
    return items.filter(item => {
      if (!item) return false;
      const key = item.variantKey || String(item.sourceId || '');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function customerVariantLabel(variant,index) {
    const specs=cleanVariantText(variant.specs||'');
    if (specs) return compact(specs,86);
    const label=variant.colorLabel && !/основной вариант/i.test(variant.colorLabel) ? variant.colorLabel : '';
    if (label) return label;
    return `Исполнение · ${exactPriceText(variant.wholesalePrice)}`;
  }
  function variantExecutionLabel(variant){return uniqueStrings([variant.axes?.soft,variant.axes?.hard,variant.colorLabel]).join(' / ')||'Выбранное исполнение';}

  function dimensionsHtml(variant) {
    const own=extractDimensions(variant.specs);
    if (own) return `<section class="dimensions"><h3>Размеры</h3><p>${escapeHtml(own)}</p></section>`;
    return '';
  }

  function extractDimensions(value) {
    return dimensionMatches(value).map(item=>item.replace(/\s*[xх*]\s*/gi,' × ').replace(/\s*×\s*/g,' × ')).join(' · ');
  }
  function dimensionMatches(value){
    const pattern=/(?:\b(?:стол|стул|диван|кресло|пуф|ширина|высота|глубина|диаметр)\s*:?\s*)?(?:(?:\([^)]*\)|[ДDØ]?\d+(?:[.,]\d+)?(?:-\d+(?:[.,]\d+)?)?)(?:\s*(?:[xх×*\/])\s*(?:[ДDØ]?\d+(?:[.,]\d+)?(?:-\d+(?:[.,]\d+)?|\([^)]*\))?|\([^)]*\)))*(?:\s*(?:см|мм))?|\b(?:диаметр|Ø)\s*\d+(?:[.,]\d+)?\s*(?:см|мм)?)/giu;
    return [...String(value||'').matchAll(pattern)].map(match=>match[0].trim()).filter(item=>hasDimensions(item));
  }

  function hasDimensions(value) {
    return /(?:\d|\))\s*(?:x|х|×|\*)\s*(?:\d|\()|\b(?:ширина|высота|глубина|диаметр)\b|(?:^|\s)[ДDØ]\s*\d+/i.test(String(value || ''));
  }

  function renderRetail(element,variant) {
    const wholesale=positiveNumber(variant.wholesalePrice), retail=positiveNumber(variant.retailPrice);
    if (retail && wholesale && retail>wholesale) {
      element.hidden=false;
      element.textContent=`Розничная цена: ${formatPrice(retail)}`;
    } else {
      element.hidden=true;
      element.textContent='';
    }
  }

  function retailHtml(variant) {
    const wholesale=positiveNumber(variant.wholesalePrice), retail=positiveNumber(variant.retailPrice);
    return retail && wholesale && retail>wholesale
      ? `<del class="dialog-retail">Розничная цена: ${escapeHtml(formatPrice(retail))}</del>` : '';
  }

  function safeColorHex(label) {
    const normalized=normalizeText(label).replace(/\([^)]*\)/g,'').trim();
    if (TRUSTED_HEX.has(normalized)) return TRUSTED_HEX.get(normalized);
    const direct=[...TRUSTED_HEX.entries()].find(([name])=>normalized===name || normalized.startsWith(`${name} `));
    return direct ? direct[1] : '';
  }

  function cleanCustomerName(value) {
    return String(value||'')
      .replace(/\s*\((?:мод\.?|model)\s*[^)]*\)/giu,'')
      .replace(/\s*\((?:[A-ZА-Я]{1,5}[-–]?[A-ZА-Я0-9]{2,}(?:[-–][A-ZА-Я0-9]+)*)\)/g,'')
      .replace(/\s*\((?:обеденная\s+группа|столовая\s+группа)\)/giu,'')
      .replace(/\s*\(?\d+\s*шт\.?\s*(?:в\s*)?упаковк[еи]?\)?/giu,'')
      .replace(/\s*\(?\d+\s*шт\.?\s*в?\s*\d*(?:-?х)?\s*упаковк(?:ах|е|и)?\)?/giu,'')
      .replace(/\s{2,}/g,' ').replace(/\s+([,.;:])/g,'$1').trim();
  }

  function cleanCollection(value) {
    return String(value||'').replace(/\s*\((?:обеденная\s+группа|столовая\s+группа)\)/giu,'').trim();
  }

  function cleanVariantText(value) {
    return String(value||'').replace(/\s*\(?\d+\s*шт\.?\s*(?:в\s*)?упаковк[еи]?\)?/giu,'').replace(/\s{2,}/g,' ').trim();
  }

  function formatSpecs(value,variant) {
    let text=String(value);
    dimensionMatches(value).forEach(item=>{text=text.replace(item,' ');});
    [variant?.axes?.soft,variant?.axes?.hard].filter(Boolean).forEach(color=>{text=text.replace(new RegExp(`(?:цвет\\s*)?${escapeRegExp(color)}`,'giu'),' ');});
    const items=text.split(/[;\n]+|,\s+(?=[^\d])/).map(cleanVariantText).map(item=>item.replace(/^[\s,\/]+|[\s,\/]+$/g,'')).filter(item=>item&&!/^(?:цвет|обивка|каркас|основание|ножки?)\s*[:—-]?\s*$/i.test(item));
    return items.length?`<ul class="spec-list">${items.map(item=>`<li>${escapeHtml(item)}</li>`).join('')}</ul>`:'';
  }
  function escapeRegExp(value){return String(value).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');}

  function parsePriceRange(value) {
    if (!value) return null;
    const [min,max]=value.split('-');
    return {min:Number(min)||0,max:max==='inf'?Infinity:Number(max)};
  }

  function withinPrice(price,range) {
    const value=positiveNumber(price);
    return value!==null && value>=range.min && value<range.max;
  }

  function positiveNumber(value) {
    const number=Number(value);
    return Number.isFinite(number) && number>0 ? number : null;
  }

  function exactPriceText(value) {
    const price=positiveNumber(value);
    return price?formatPrice(price):'Цена по запросу';
  }

  function compact(value,max) {
    const text=String(value||'').replace(/\s+/g,' ').trim();
    return text.length<=max?text:`${text.slice(0,max-1).trim()}…`;
  }

  function formatPrice(value) { return `${new Intl.NumberFormat('ru-RU').format(Number(value))} ₽`; }
  function formatNumber(value) { return new Intl.NumberFormat('ru-RU').format(value); }

  function plural(number,one,few,many) {
    const n=Math.abs(number)%100, n1=n%10;
    if (n>10 && n<20) return many;
    if (n1>1 && n1<5) return few;
    if (n1===1) return one;
    return many;
  }

  function normalizeText(value) {
    return String(value||'').toLocaleLowerCase('ru').replace(/ё/g,'е').replace(/\s+/g,' ').trim();
  }

  function uniqueStrings(values) {
    return [...new Set(values.filter(Boolean).map(value=>String(value).trim()).filter(Boolean))];
  }

  function uniqueSorted(values) { return uniqueStrings(values).sort((a,b)=>a.localeCompare(b,'ru')); }

  function isLocalImagePath(value) {
    const path=String(value||'').trim();
    return path && !/^(?:https?:)?\/\//i.test(path) && !/^data:/i.test(path) && /\.(?:avif|webp|png|jpe?g|gif)(?:\?.*)?$/i.test(path);
  }

  function relativeAsset(path) {
    const clean=String(path).replace(/^\.\//,'').replace(/^\//,'');
    return `../${clean}`;
  }

  function fallbackSvg() {
    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800"><rect width="100%" height="100%" fill="#eeebe4"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#777168" font-family="Arial" font-size="28">Фотография уточняется</text></svg>')}`;
  }

  function loadSet(key) {
    try { return new Set(JSON.parse(localStorage.getItem(key)||'[]').map(String)); }
    catch { return new Set(); }
  }

  function loadCart(key) {
    try {
      const value=JSON.parse(localStorage.getItem(key)||'{}');
      if(Array.isArray(value))return new Map(value.map(id=>[String(id),1]));
      return new Map(Object.entries(value||{}).map(([id,q])=>[String(id),Number(q)||1]));
    } catch { return new Map(); }
  }

  function saveSet(key,value) {
    try { localStorage.setItem(key,JSON.stringify([...value])); } catch {}
  }

  function escapeHtml(value) {
    return String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[char]));
  }
  function escapeAttr(value) { return escapeHtml(value); }
})();
