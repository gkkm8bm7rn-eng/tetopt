(() => {
  'use strict';

  const PAGE_SIZE = 24;
  const FIRST_EAGER_IMAGES = 4;
  const MAX_CARD_IMAGES = 3;
  const MAX_DIALOG_IMAGES = 6;

  const SOFT_RE = /(велюр|вельвет|букле|ткан|экокож|кожзам|флок|л[её]н|бархат|рогож|шерст|замш|обивк|сидень|подуш)/i;
  const HARD_RE = /(металл|дерев|бук\b|вяз|шпон|пластик|мдф|лдсп|сталь|хром|основан|каркас|ножк|опор|керамик|стекл|мрамор|ротанг)/i;
  const HARD_FINISH_RE = /(хром|орех|натурал|дуб|венге|груша|золот|латун|бронз|мрамор|гранит)/i;

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
    ['слоновая кость','#e5dcc8']
  ]);

  const state = {
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
      if (!Array.isArray(products) || !products.length) throw new Error('empty catalog');

      state.models = products.map(normalizeModel).filter(model => model.variants.length);
      assertCatalog(state.models);

      // catalog.json already contains the restored constructive grouping.
      // Do not fuzzy-merge models again on the client.
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
    const safeAxes = variants.length > 1 && variants.every(v => v.axes.safe && (v.axes.soft || v.axes.hard));

    return {
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
  }

  function inferAxes(variant) {
    const specs = String(variant.specs || '');
    const label = String(variant.colorLabel || '').trim();
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

  function normalizeImages(variant) {
    const candidates = [];
    if (Array.isArray(variant.images)) candidates.push(...variant.images);
    if (variant.image) candidates.push(variant.image);
    if (variant.directImage) candidates.push(variant.directImage);
    return uniqueStrings(candidates.filter(isLocalImagePath));
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
    const categories = uniqueSorted(state.models.flatMap(m => m.categories));
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
    state.page = Math.min(state.page, Math.max(1, Math.ceil(filtered.length / PAGE_SIZE)));
    els.empty.hidden = filtered.length !== 0;
    updateEmptyState();
    els.count.textContent = resultCountText();
    renderPage();
  }

  function merchandiseModels(models) {
    const buckets = { seating: [], tables: [], sofas: [], coffee: [], bar: [], other: [], hangers: [] };
    models.forEach(model => buckets[classifyModel(model)].push(model));
    const output = [];
    const priority = ['seating','tables','sofas','coffee','bar'];
    while (priority.some(key => buckets[key].length)) {
      priority.forEach(key => { if (buckets[key].length) output.push(buckets[key].shift()); });
    }
    return output.concat(buckets.other, buckets.hangers);
  }

  function classifyModel(model) {
    const text = normalizeText(`${model.displayName} ${model.categories.join(' ')}`);
    if (/вешал|hanger|гардеробн.*стойк/.test(text)) return 'hangers';
    if (/диван|банкет|пуф|sofa|bench|ottoman/.test(text)) return 'sofas';
    if (/барн|bar/.test(text)) return 'bar';
    if (/кресл|стул|chair|табур/.test(text)) return 'seating';
    if (/журнальн|кофейн|coffee/.test(text)) return 'coffee';
    if (/стол|table/.test(text)) return 'tables';
    return 'other';
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
    for (let i = start; i < end; i += 1) fragment.append(createCard(state.filtered[i], i - start));
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
    node.querySelector('.card-meta').textContent = `${model.variants.length} ${plural(model.variants.length,'вариант','варианта','вариантов')}`;
    node.querySelectorAll('.card-open').forEach(button => button.addEventListener('click', () => openModel(model, variant)));

    const favorite = node.querySelector('.favorite-button');
    syncFavoriteButton(favorite, model.id);
    favorite.addEventListener('click', event => { event.stopPropagation(); toggleFavorite(model.id, favorite); });
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

    if (!model.safeAxes) {
      if (compact) {
        container.hidden = true;
        return;
      }
      container.hidden = false;
      const title = document.createElement('p');
      title.className = 'axis-label';
      title.textContent = 'Вариант товара';
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

    const soft = uniqueAxisValues(model,'soft');
    const hard = uniqueAxisValues(model,'hard');
    let rendered = false;

    if (soft.length > 1) {
      container.append(makeAxisRow(model,activeVariant,'soft',soft,compact,onSelect));
      rendered = true;
    }
    if (hard.length > 1) {
      container.append(makeAxisRow(model,activeVariant,'hard',hard,compact,onSelect));
      rendered = true;
    }

    if (!compact) {
      const pair = variantsForCurrentAxes(model,activeVariant);
      if (pair.length > 1) {
        const block = document.createElement('div');
        block.className='residual-variants';
        const title=document.createElement('p');
        title.className='axis-label';
        title.textContent='Вариант товара';
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
    const max=compact ? 5 : values.length;
    values.slice(0,max).forEach(value=>{
      const button=document.createElement('button');
      button.type='button';
      button.className=`axis-swatch ${axis === 'soft' ? 'soft' : 'hard'}`;
      if (normalizeText(activeVariant.axes[axis])===normalizeText(value)) button.classList.add('active');
      const available=axisCombinationAvailable(model,activeVariant,axis,value);
      button.disabled=!available;
      const hex=safeColorHex(value);
      if (hex) button.style.setProperty('--swatch',hex);
      else button.dataset.label=initials(value);
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
    if (compact && values.length>max) {
      const more=document.createElement('span');
      more.className='swatch-more';
      more.textContent=`+${values.length-max}`;
      row.append(more);
    }
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
          ${variant.specs?`<div class="specs">${formatSpecs(variant.specs)}</div>`:''}
          <div class="dialog-actions">
            <button class="add-cart" type="button" data-cart-id="${escapeAttr(cartId)}">${inCart?'Перейти к заказу →':'Добавить в заказ'}</button>
            <button class="dialog-favorite" type="button" aria-label="${state.favorites.has(model.id)?'Убрать модель из избранного':'Добавить модель в избранное'}">${state.favorites.has(model.id)?'♥':'♡'}</button>
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
      state.cart.add(id);
      saveSet('forma-next-cart',state.cart);
      updateCounters();
      renderDialog();
    });
    els.dialogContent.querySelector('.remove-cart')?.addEventListener('click',event=>{
      const id=event.currentTarget.dataset.cartId;
      state.cart.delete(id);
      saveSet('forma-next-cart',state.cart);
      updateCounters();
      renderDialog();
      if (state.view==='cart') applyFilters();
    });
    els.dialogContent.querySelector('.dialog-favorite')?.addEventListener('click',event=>{
      toggleFavorite(state.activeModel.id,event.currentTarget,true);
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
    els.cartCount.textContent=state.cart.size;
  }

  function chooseDisplayVariant(model) {
    return model.variants.find(v=>v.images.length && positiveNumber(v.wholesalePrice)) ||
      model.variants.find(v=>v.images.length) || model.variants[0];
  }

  function sameVariant(a,b) { return a && b && a.variantKey===b.variantKey; }

  function customerVariantLabel(variant,index) {
    const specs=cleanVariantText(variant.specs||'');
    if (specs) return compact(specs,86);
    const label=variant.colorLabel && !/основной вариант/i.test(variant.colorLabel) ? variant.colorLabel : '';
    if (label) return label;
    return `Вариант товара${variant.sourceId!=null?` · ID ${variant.sourceId}`:''}`;
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
      .replace(/\s{2,}/g,' ').replace(/\s+([,.;:])/g,'$1').trim();
  }

  function cleanCollection(value) {
    return String(value||'').replace(/\s*\((?:обеденная\s+группа|столовая\s+группа)\)/giu,'').trim();
  }

  function cleanVariantText(value) {
    return String(value||'').replace(/\s*\(?\d+\s*шт\.?\s*(?:в\s*)?упаковк[еи]?\)?/giu,'').replace(/\s{2,}/g,' ').trim();
  }

  function formatSpecs(value) {
    const items=String(value).split(/[,;\n]+/).map(cleanVariantText).filter(Boolean);
    return items.length?`<ul class="spec-list">${items.map(item=>`<li>${escapeHtml(item)}</li>`).join('')}</ul>`:'';
  }

  function initials(value) {
    return String(value||'').split(/\s+/).filter(Boolean).slice(0,2).map(part=>part[0]).join('').toUpperCase();
  }

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

  function saveSet(key,value) {
    try { localStorage.setItem(key,JSON.stringify([...value])); } catch {}
  }

  function escapeHtml(value) {
    return String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[char]));
  }
  function escapeAttr(value) { return escapeHtml(value); }
})();