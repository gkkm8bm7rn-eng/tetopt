(() => {
  'use strict';

  const nativeFetch = window.fetch.bind(window);
  const ONE_CARD = [[30,32],[31,33],[51,52],[63,64],[69,70],[71,72],[74,75],[77,78,79],[80,81],[87,88],[89,90],[91,93],[97,99],[101,102,103],[118,119],[123,124,125],[127,128,129,130],[131,132],[133,134],[135,136,137,138],[139,140,141,142],[147,149],[148,150],[151,153],[152,154],[157,160],[158,161],[159,162],[176,177],[181,182],[184,187],[185,186,188,191],[192,193,194,195],[197,198,199,200],[201,203],[202,204],[222,223],[224,225],[226,227],[231,233],[239,240],[241,242],[244,245,247],[246,248],[249,250],[251,252],[257,258],[259,261],[260,262],[264,265],[266,267],[268,269],[270,271],[276,277],[278,279,280],[281,282,283],[286,287],[298,300,301,302,303,304,305,306],[307,308,309],[310,311,312,314,315,316,317],[320,322],[331,337,340],[332,338,341,344],[333,339,342],[347,348],[350,354,355,357,363],[351,352,356],[19,20,21],[145,146],[163,164],[165,166],[325,326,327,328,329,330,331,332,333,334,335,336,337,338,339,340,341,342,343,344,345]];
  const PROTECTED = [[273,275],[288,290,291,292,293,294,295,296],[126,523,524,525,526,527,528,529,530,531,532,533,534,535,536,537,538,539,540,541],[155,156,173,414,415,416,417,418,419,421,423,424,425,426,427,428,431,432,433,434,440,441,442,443,444,445,446,447,452],[490,491,492,493,494,495,496,497,498,499,500,501,622]];
  const EXTRA_CONFIRMED = [[30,31,32,33]];
  const COLOR_NAMES = [
    'светло-серый','темно-серый','светло-зеленый','светло-зелёный','темно-зеленый','темно-зелёный','светло-бежевый','серо-бежевый','темно-синий','тёмно-синий',
    'слоновая кость','айвори вайт','морская волна','мрамор светлый','мрамор черный','мрамор чёрный','натуральное дерево','дуб вотан','дуб канзас','дуб артисан',
    'айвори','антик','кремовый','молочный','песочный','коралловый','какао','горчичный','коньячный','золото','лайм','салатовый','прозрачный','аметист',
    'черный','чёрный','белый','серый','бежевый','капучино','коричневый','оливковый','зеленый','зелёный','синий','голубой','бирюзовый','изумрудный',
    'красный','бордовый','оранжевый','желтый','жёлтый','розовый','фиолетовый','графит','серебристый','золотой','натуральный','орех','дуб','хром','венге','груша','пепел','бетон'
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
      let transformed = products.map(product => normalizeColorGroups(clone(product)));
      for (const group of ONE_CARD) transformed = mergeSourceGroup(transformed, group, false);
      for (const group of EXTRA_CONFIRMED) transformed = mergeSourceGroup(transformed, group, true);
      const output = isArray ? transformed : { ...raw, products: transformed };
      const headers = new Headers(response.headers);
      headers.set('content-type', 'application/json; charset=utf-8');
      return new Response(JSON.stringify(output), { status: response.status, statusText: response.statusText, headers });
    } catch (error) {
      console.warn('[catalog-preprocess-v3] using original catalog', error);
      return response;
    }
  };

  function normalizeColorGroups(product) {
    if (Array.isArray(product.colors)) {
      const rebuilt = [];
      product.colors.forEach(group => {
        const variants = Array.isArray(group.variants) ? group.variants : [];
        variants.forEach(enrichVariantColor);
        const original = String(group.label || '').trim();
        const generic = !original || /^(?:основной вариант|вариант товара|исполнение\s*\d*)$/i.test(original);
        if (!generic) { rebuilt.push(group); return; }
        const byColor = new Map();
        variants.forEach(variant => {
          const color = String(variant.color || colorFromSpecs(variant.specs) || '').trim();
          const key = normalize(color) || '__unknown__';
          if (!byColor.has(key)) byColor.set(key, { ...group, label: color || original || 'Основной вариант', variants: [] });
          byColor.get(key).variants.push(variant);
        });
        rebuilt.push(...(byColor.size > 1 ? byColor.values() : [byColor.values().next().value || group]));
      });
      product.colors = rebuilt;
    }
    if (Array.isArray(product.variants)) product.variants.forEach(enrichVariantColor);
    return product;
  }

  function enrichVariantColor(variant) {
    if (!variant || String(variant.color || '').trim()) return;
    const color = colorFromSpecs(variant.specs);
    if (color) variant.color = color;
  }

  function colorFromSpecs(specs) {
    const text = normalize(specs);
    if (!text) return '';
    const hits = [];
    COLOR_NAMES.forEach(name => {
      const value = normalize(name);
      let from = 0;
      while (true) {
        const index = text.indexOf(value, from);
        if (index < 0) break;
        hits.push({ name: value, index, length: value.length });
        from = index + value.length;
      }
    });
    hits.sort((a,b) => a.index - b.index || b.length - a.length);
    const chosen = [];
    let end = -1;
    hits.forEach(hit => {
      if (hit.index < end) return;
      if (!chosen.includes(hit.name)) chosen.push(hit.name);
      end = hit.index + hit.length;
    });
    return chosen.slice(0, 3).join('/');
  }

  function mergeSourceGroup(products, sourceIds, force) {
    const wanted = new Set(sourceIds.map(Number));
    const matches = products.filter(product => flatten(product).some(v => wanted.has(Number(v.sourceId))));
    if (matches.length <= 1) return products;
    if (!force && crossesProtected(matches)) return products;

    const variants = [];
    const seen = new Set();
    matches.forEach(product => flatten(product).forEach(variant => {
      const id = Number(variant.sourceId);
      if (!wanted.has(id) || seen.has(id)) return;
      seen.add(id);
      const copy = { ...variant };
      enrichVariantColor(copy);
      copy.images = unique([...(copy.images || []), copy.image, copy.directImage].filter(Boolean));
      variants.push(copy);
    }));
    if (variants.length < 2) return products;

    const merged = { ...matches[0], variants };
    delete merged.colors;
    if (force && sourceIds.includes(30) && sourceIds.includes(31)) merged.name = 'Стол журнальный Гленд/Gland';
    const ids = new Set(matches.map(product => product.id));
    const result = [];
    let inserted = false;
    products.forEach(product => {
      if (!ids.has(product.id)) result.push(product);
      else if (!inserted) { result.push(merged); inserted = true; }
    });
    return result;
  }

  function crossesProtected(matches) {
    const ids = new Set(matches.flatMap(product => flatten(product).map(v => Number(v.sourceId))));
    return PROTECTED.some(group => group.filter(id => ids.has(Number(id))).length >= 2);
  }

  function flatten(product) {
    const variants = [];
    if (Array.isArray(product.colors)) product.colors.forEach(group => (Array.isArray(group.variants) ? group.variants : []).forEach(v => variants.push({ ...v, color: v.color || group.label || '' })));
    if (!variants.length && Array.isArray(product.variants)) variants.push(...product.variants);
    return variants;
  }

  function normalize(value) { return String(value || '').toLocaleLowerCase('ru').replace(/ё/g,'е').replace(/\s+/g,' ').trim(); }
  function unique(values) { return [...new Set(values.map(value => String(value).trim()).filter(Boolean))]; }
  function clone(value) { return typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value)); }
})();
