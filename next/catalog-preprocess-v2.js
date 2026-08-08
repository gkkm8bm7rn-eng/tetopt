(() => {
  'use strict';

  const nativeFetch = window.fetch.bind(window);
  const COLOR_NAMES = [
    'светло-серый','темно-серый','слоновая кость','айвори вайт','айвори','антик',
    'черный','чёрный','белый','серый','бежевый','капучино','коричневый',
    'оливковый','зеленый','зелёный','синий','голубой','бирюзовый','изумрудный',
    'красный','бордовый','оранжевый','желтый','жёлтый','розовый','фиолетовый',
    'графит','серебристый','золотой','натуральный','натуральное дерево','орех','дуб','хром','венге',
    'груша','пепел','бетон','мрамор светлый','мрамор черный','мрамор чёрный','дуб вотан','дуб канзас','дуб артисан'
  ];

  window.fetch = async function formaCatalogFetch(input, init) {
    const response = await nativeFetch(input, init);
    const url = typeof input === 'string' ? input : input?.url || '';
    if (!/(?:^|\/)catalog\.json(?:[?#]|$)/i.test(url)) return response;
    try {
      const raw = await response.clone().json();
      const isArray = Array.isArray(raw);
      const products = isArray ? raw : raw?.products;
      if (!Array.isArray(products)) return response;
      const transformed = preprocess(products);
      const output = isArray ? transformed : { ...raw, products: transformed };
      const headers = new Headers(response.headers);
      headers.set('content-type', 'application/json; charset=utf-8');
      return new Response(JSON.stringify(output), { status: response.status, statusText: response.statusText, headers });
    } catch (error) {
      console.warn('[catalog-preprocess-v2] using original catalog', error);
      return response;
    }
  };

  function preprocess(products) {
    const prepared = products.map(product => normalizeColorGroups(structuredCloneSafe(product)));
    return mergeKnownGland(prepared);
  }

  function normalizeColorGroups(product) {
    if (Array.isArray(product.colors)) {
      const rebuilt = [];
      product.colors.forEach(group => {
        const variants = Array.isArray(group.variants) ? group.variants : [];
        variants.forEach(enrichVariantColor);
        const originalLabel = String(group.label || '').trim();
        const generic = !originalLabel || /^(?:основной вариант|вариант товара|исполнение\s*\d*)$/i.test(originalLabel);
        if (!generic) {
          rebuilt.push(group);
          return;
        }
        const byColor = new Map();
        variants.forEach(variant => {
          const color = String(variant.color || colorFromSpecs(variant.specs) || '').trim();
          const key = normalize(color) || '__unknown__';
          if (!byColor.has(key)) byColor.set(key, { ...group, label: color || originalLabel || 'Основной вариант', variants: [] });
          byColor.get(key).variants.push(variant);
        });
        if (byColor.size > 1) rebuilt.push(...byColor.values());
        else rebuilt.push(byColor.values().next().value || group);
      });
      product.colors = rebuilt;
    }
    if (Array.isArray(product.variants)) product.variants.forEach(enrichVariantColor);
    return product;
  }

  function enrichVariantColor(variant) {
    if (!variant || String(variant.color || '').trim()) return;
    const label = colorFromSpecs(variant.specs);
    if (label) variant.color = label;
  }

  function colorFromSpecs(specs) {
    const text = normalize(specs);
    if (!text) return '';
    const hits = [];
    COLOR_NAMES.forEach(name => {
      const normalized = normalize(name);
      let from = 0;
      while (true) {
        const index = text.indexOf(normalized, from);
        if (index < 0) break;
        hits.push({ name: normalized, index, length: normalized.length });
        from = index + normalized.length;
      }
    });
    hits.sort((a,b)=>a.index-b.index || b.length-a.length);
    const chosen=[];
    let end=-1;
    hits.forEach(hit=>{
      if (hit.index < end) return;
      if (!chosen.includes(hit.name)) chosen.push(hit.name);
      end=hit.index+hit.length;
    });
    return chosen.slice(0,3).join('/');
  }

  function mergeKnownGland(products) {
    const matches = products.filter(product => {
      const ids = new Set(flattenVariants(product).map(variant => Number(variant.sourceId)).filter(Number.isFinite));
      return /(?:гленд|gland)/i.test(String(product.name || '')) && [30,31,32,33].some(id => ids.has(id));
    });
    if (matches.length !== 2) return products;
    const variants=[];
    const bySignature=new Map();
    matches.flatMap(flattenVariants).forEach(variant=>{
      const copy={...variant};
      enrichVariantColor(copy);
      const signature=[normalizeSpecs(copy.specs),Number(copy.wholesalePrice)||0,Number(copy.retailPrice)||0,normalize(copy.color||colorFromSpecs(copy.specs))].join('|');
      const existing=bySignature.get(signature);
      if (!existing) {
        copy.images=unique([...(copy.images||[]),copy.image,copy.directImage].filter(Boolean));
        bySignature.set(signature,copy);
        variants.push(copy);
      } else existing.images=unique([...(existing.images||[]),...(copy.images||[]),copy.image,copy.directImage].filter(Boolean));
    });
    const merged={...matches[0],name:'Стол журнальный Гленд/Gland',variants};
    delete merged.colors;
    const ids=new Set(matches.map(product=>product.id));
    const result=[];
    let inserted=false;
    products.forEach(product=>{
      if (!ids.has(product.id)) result.push(product);
      else if (!inserted) { result.push(merged); inserted=true; }
    });
    return result;
  }

  function flattenVariants(product) {
    const variants=[];
    if (Array.isArray(product.colors)) {
      product.colors.forEach(group => (Array.isArray(group.variants)?group.variants:[]).forEach(variant=>variants.push({...variant,color:variant.color||group.label||''})));
    }
    if (!variants.length && Array.isArray(product.variants)) variants.push(...product.variants);
    return variants;
  }

  function normalizeSpecs(value) {
    return normalize(value).replace(/\(?\d+\s*шт\.?\s*(?:в\s*)?упаковк[еи]?\)?/giu,'').replace(/\s+/g,' ').trim();
  }
  function normalize(value) { return String(value||'').toLocaleLowerCase('ru').replace(/ё/g,'е').replace(/\s+/g,' ').trim(); }
  function unique(values) { return [...new Set(values.map(value=>String(value).trim()).filter(Boolean))]; }
  function structuredCloneSafe(value) { if (typeof structuredClone==='function') return structuredClone(value); return JSON.parse(JSON.stringify(value)); }
})();
