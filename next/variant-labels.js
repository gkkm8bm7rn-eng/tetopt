(() => {
  'use strict';

  const dialog = document.querySelector('#product-dialog');
  const content = document.querySelector('#dialog-content');
  if (!dialog || !content) return;

  let catalogPromise = null;
  let scheduled = false;

  const catalog = () => {
    if (!catalogPromise) {
      catalogPromise = fetch('../catalog.json')
        .then(response => {
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          return response.json();
        })
        .then(raw => Array.isArray(raw) ? raw : raw.products)
        .then(products => Array.isArray(products) ? products : []);
    }
    return catalogPromise;
  };

  const observer = new MutationObserver(() => scheduleEnhance());
  observer.observe(content, { childList: true, subtree: true });
  dialog.addEventListener('toggle', () => scheduleEnhance());

  function scheduleEnhance() {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(async () => {
      scheduled = false;
      try { await enhanceVariantLabels(); }
      catch (error) { console.warn('[next-variant-labels]', error); }
    });
  }

  async function enhanceVariantLabels() {
    const buttons = [...content.querySelectorAll('.variant-pill')];
    if (!buttons.length) return;

    const title = content.querySelector('.dialog-info h2')?.textContent?.trim();
    if (!title) return;

    const products = await catalog();
    const model = products.find(item => String(item?.name || '').trim() === title);
    if (!model) return;

    const groups = normalizeGroups(model);
    if (!groups.length) return;
    const activeColor = content.querySelector('.color-pill.active span:last-child')?.textContent?.trim() || '';
    const group = chooseGroup(groups, activeColor, buttons.length);
    if (!group || group.variants.length !== buttons.length) return;

    const labels = buildLabels(group.variants);
    buttons.forEach((button, index) => {
      if (!labels[index]) return;
      button.textContent = labels[index];
      button.setAttribute('aria-label', `Выбрать: ${labels[index]}`);
    });
    content.dataset.variantLabelsReady = 'true';
  }

  function normalizeGroups(model) {
    const colors = Array.isArray(model.colors) ? model.colors : [];
    if (colors.length) {
      return colors.map((color, index) => ({
        label: String(color?.label || '').trim(),
        index,
        variants: Array.isArray(color?.variants) ? color.variants : [],
      })).filter(group => group.variants.length);
    }
    const variants = Array.isArray(model.variants) ? model.variants : [];
    return variants.length ? [{ label: '', index: 0, variants }] : [];
  }

  function chooseGroup(groups, activeColor, buttonCount) {
    if (activeColor) {
      const exact = groups.find(group => normalize(group.label) === normalize(activeColor));
      if (exact) return exact;
    }
    const byCount = groups.filter(group => group.variants.length === buttonCount);
    if (byCount.length === 1) return byCount[0];
    return byCount[0] || groups[0];
  }

  function buildLabels(variants) {
    const parsed = variants.map(variant => parseSpecs(variant?.specs));
    const varyingKeys = findVaryingKeys(parsed);
    const labels = variants.map((variant, index) => {
      const parts = [];
      for (const key of varyingKeys) {
        const value = parsed[index].get(key);
        if (!value) continue;
        parts.push(formatPart(key, value));
        if (parts.length >= 2) break;
      }
      if (!parts.length) {
        const fallback = meaningfulSpec(variant?.specs);
        if (fallback) parts.push(fallback);
      }
      return parts.join(' · ');
    });

    addPriceWhereNeeded(labels, variants);
    return labels.map((label, index) => label || priceOnlyLabel(variants[index]) || 'Исполнение');
  }

  function parseSpecs(specs) {
    const map = new Map();
    String(specs || '')
      .split(/\n|;|\|/)
      .map(part => part.trim())
      .filter(Boolean)
      .forEach(part => {
        const match = part.match(/^([^:—–]{2,40})\s*[:—–]\s*(.+)$/);
        if (!match) return;
        const key = cleanKey(match[1]);
        const value = cleanValue(match[2]);
        if (!key || !value || ignoreKey(key)) return;
        if (!map.has(key)) map.set(key, value);
      });
    return map;
  }

  function findVaryingKeys(parsed) {
    const keys = [...new Set(parsed.flatMap(map => [...map.keys()]))];
    return keys
      .filter(key => {
        const values = parsed.map(map => normalize(map.get(key) || '')).filter(Boolean);
        return values.length >= 2 && new Set(values).size > 1;
      })
      .sort((a, b) => priority(a) - priority(b));
  }

  function priority(key) {
    const value = normalize(key);
    const order = [
      /размер|габарит|ширин|длин|высот|глубин|диаметр/,
      /исполн|механизм|основан|база|каркас|ножк|опор/,
      /материал|обивк|ткан|столешниц|наполн/,
      /комплект|количеств/,
    ];
    const index = order.findIndex(pattern => pattern.test(value));
    return index === -1 ? 100 : index;
  }

  function meaningfulSpec(specs) {
    const parts = String(specs || '').split(/\n|;|\|/).map(part => part.trim()).filter(Boolean);
    const preferred = parts.find(part => /размер|габарит|ширин|длин|высот|глубин|диаметр|исполн|механизм|основан|база|каркас|ножк|опор|материал|обивк|ткан/i.test(part));
    return compact(preferred || parts[0] || '', 72);
  }

  function addPriceWhereNeeded(labels, variants) {
    const normalized = labels.map(normalize);
    const duplicateIndexes = new Set();
    normalized.forEach((label, index) => {
      if (!label || normalized.filter(item => item === label).length > 1) duplicateIndexes.add(index);
    });
    if (!duplicateIndexes.size) return;

    const prices = variants.map(variant => Number(variant?.wholesalePrice) || 0);
    const distinctPrices = new Set(prices.filter(Boolean));
    if (distinctPrices.size <= 1) return;
    duplicateIndexes.forEach(index => {
      if (!prices[index]) return;
      const price = formatPrice(prices[index]);
      labels[index] = labels[index] ? `${labels[index]} · ${price}` : price;
    });
  }

  function priceOnlyLabel(variant) {
    const price = Number(variant?.wholesalePrice) || 0;
    return price ? formatPrice(price) : '';
  }

  function formatPart(key, value) {
    const conciseKey = key.replace(/^(характеристика|параметр)\s+/i, '').trim();
    return compact(`${conciseKey}: ${value}`, 72);
  }

  function cleanKey(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function cleanValue(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function ignoreKey(key) {
    return /цвет|артикул|код|id|sku|цена|фото|изображ/i.test(normalize(key));
  }

  function compact(value, max) {
    const text = String(value || '').replace(/\s+/g, ' ').trim();
    return text.length <= max ? text : `${text.slice(0, max - 1).trim()}…`;
  }

  function normalize(value) {
    return String(value || '').toLocaleLowerCase('ru').replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
  }

  function formatPrice(value) {
    return `${new Intl.NumberFormat('ru-RU').format(Number(value))} ₽`;
  }
})();
