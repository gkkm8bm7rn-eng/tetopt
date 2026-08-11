(() => {
  'use strict';

  const EN = "qwertyuiop[]asdfghjkl;'zxcvbnm,.";
  const RU = 'йцукенгшщзхъфывапролджэячсмитьбю';
  const EN_TO_RU = new Map([...EN].map((char, index) => [char, RU[index]]));
  const RU_TO_EN = new Map([...RU].map((char, index) => [char, EN[index]]));
  const PROTECTED_NEAR = new Set(['стол|стул', 'стул|стол']);

  const ALIASES = new Map(Object.entries({
    'тумбочка': ['тумба'], 'тумбочки': ['тумба'], 'тумбочку': ['тумба'],
    'прикроватная': ['тумба'], 'прикроватный': ['тумба'],
    'стулья': ['стул'], 'стульев': ['стул'], 'стульчик': ['стул'],
    'кресла': ['кресло'], 'кресел': ['кресло'],
    'столы': ['стол'], 'столик': ['стол'], 'столики': ['стол'],
    'кофейный': ['журнальный'], 'кофейные': ['журнальный'],
    'диваны': ['диван'], 'пуфы': ['пуф'], 'банкетки': ['банкетка'],
    'вешалки': ['вешалка'], 'гардеробная': ['вешалка'],
    'шкафы': ['шкаф'], 'комоды': ['комод'], 'стеллажи': ['стеллаж'],
    'черная': ['черный'], 'чёрная': ['черный'], 'черное': ['черный'], 'чёрное': ['черный'],
    'белая': ['белый'], 'белое': ['белый'], 'серые': ['серый'], 'серая': ['серый'],
  }));

  const ALTERNATIVES = [
    {
      triggers: ['тумба', 'тумбочка', 'прикроватный'],
      choices: [
        { query: 'журнальный столик', label: 'Журнальные столики', reason: 'заменят поверхность, но не место хранения' },
        { query: 'этажерка', label: 'Этажерки', reason: 'дадут открытое хранение рядом с кроватью' },
      ],
    },
    {
      triggers: ['комод', 'шкаф'],
      choices: [
        { query: 'стеллаж', label: 'Стеллажи', reason: 'подойдут для открытого хранения' },
        { query: 'этажерка', label: 'Этажерки', reason: 'компактная замена для небольших вещей' },
      ],
    },
    {
      triggers: ['консоль'],
      choices: [
        { query: 'журнальный столик', label: 'Журнальные столики', reason: 'могут заменить небольшую декоративную поверхность' },
        { query: 'тумба', label: 'Тумбы', reason: 'добавят поверхность и хранение' },
      ],
    },
    {
      triggers: ['табурет'],
      choices: [{ query: 'стул', label: 'Стулья', reason: 'ближайшая замена для посадочного места' }],
    },
    {
      triggers: ['пуф'],
      choices: [
        { query: 'банкетка', label: 'Банкетки', reason: 'подойдут как дополнительное посадочное место' },
        { query: 'кресло', label: 'Кресла', reason: 'более полноценное посадочное место' },
      ],
    },
    {
      triggers: ['кровать'],
      choices: [{ query: 'диван', label: 'Диваны', reason: 'могут дать дополнительное спальное место' }],
    },
  ];

  let index = new Map();

  function build(models) {
    index = new Map(models.map((model) => [String(model.id), makeDocument(model)]));
    return index.size;
  }

  function rank(models, rawQuery) {
    if (!index.size || models.some((model) => !index.has(String(model.id)))) build(models);
    const variants = queryVariants(rawQuery);
    if (!variants.length) return [];
    const results = [];
    for (const model of models) {
      const document = index.get(String(model.id)) || makeDocument(model);
      let best = null;
      for (const query of variants) {
        const score = scoreDocument(document, query);
        if (score && (!best || score.value > best.value)) best = score;
      }
      if (best) results.push({ model, score: best.value, reason: best.reason, normalizedQuery: best.query });
    }
    return results.sort((a, b) => b.score - a.score || sourceOrder(a.model) - sourceOrder(b.model));
  }

  function makeDocument(model) {
    const variants = Array.isArray(model.variants) ? model.variants : [];
    const sourceIds = variants.map((variant) => String(variant.sourceId ?? '')).filter(Boolean);
    const name = normalize([model.name, model.displayName].filter(Boolean).join(' '));
    const text = normalize([
      name,
      ...(model.collections || asArray(model.collection)),
      ...(model.categories || asArray(model.category)),
      model.shopCategory,
      ...variants.flatMap((variant) => [
        variant.name,
        variant.specs,
        variant.color,
        variant.colorLabel,
        ...(variant.dimensions || []),
        variant.sourceId,
      ]),
    ].filter(Boolean).join(' '));
    return { id: String(model.id), name, text, tokens: tokenize(text), nameTokens: tokenize(name), sourceIds };
  }

  function queryVariants(rawQuery) {
    const base = normalize(rawQuery).slice(0, 120);
    if (!base) return [];
    const rawVariants = [
      { value: base, kind: 'original' },
      { value: switchLayout(base, EN_TO_RU), kind: 'layout' },
      { value: switchLayout(base, RU_TO_EN), kind: 'layout' },
      { value: transliterateToRussian(base), kind: 'transliteration' },
    ];
    const output = [];
    const seen = new Set();
    for (const item of rawVariants) {
      const value = normalize(item.value);
      if (!value || seen.has(value)) continue;
      seen.add(value);
      output.push({ value, tokens: expandAliases(tokenize(value)), kind: item.kind });
    }
    return output;
  }

  function scoreDocument(document, query) {
    const value = query.value;
    const penalty = query.kind === 'original' ? 0 : query.kind === 'layout' ? 8 : 12;
    if (document.sourceIds.includes(value)) return { value: 140 - penalty, reason: 'код товара', query: value };
    if (document.name === value) return { value: 128 - penalty, reason: 'точное название', query: value };
    if (document.name.includes(value)) return { value: 112 - penalty, reason: 'название', query: value };
    if (document.text.includes(value)) return { value: 100 - penalty, reason: 'точная фраза', query: value };

    const tokens = query.tokens;
    if (!tokens.length) return null;
    let total = 0;
    let fuzzy = 0;
    for (const token of tokens) {
      const tokenScore = bestTokenScore(token, document);
      if (!tokenScore) return null;
      total += tokenScore.value;
      if (tokenScore.fuzzy) fuzzy += 1;
    }
    const coverageBonus = tokens.length > 1 ? 12 : 0;
    const result = Math.round(total / tokens.length + coverageBonus - penalty);
    if (result < 42) return null;
    return { value: result, reason: fuzzy ? 'исправление опечатки' : 'слова запроса', query: value };
  }

  function bestTokenScore(token, document) {
    if (document.nameTokens.includes(token)) return { value: 92, fuzzy: false };
    if (document.tokens.includes(token)) return { value: 82, fuzzy: false };
    if (token.length >= 3) {
      if (document.nameTokens.some((candidate) => candidate.startsWith(token) || token.startsWith(candidate))) {
        return { value: 76, fuzzy: false };
      }
      if (document.tokens.some((candidate) => candidate.startsWith(token) || token.startsWith(candidate))) {
        return { value: 66, fuzzy: false };
      }
    }
    if (token.length < 4 || /^\d+$/.test(token)) return null;
    let best = Infinity;
    for (const candidate of document.tokens) {
      if (Math.abs(candidate.length - token.length) > 2 || PROTECTED_NEAR.has(`${token}|${candidate}`)) continue;
      const distance = damerauLevenshtein(token, candidate, typoLimit(token));
      if (distance < best) best = distance;
      if (best === 1) break;
    }
    if (best <= typoLimit(token)) return { value: best === 1 ? 58 : 46, fuzzy: true };
    return null;
  }

  function alternatives(rawQuery, models) {
    const variants = queryVariants(rawQuery);
    const words = new Set(variants.flatMap((variant) => variant.tokens));
    const group = ALTERNATIVES.find((item) => item.triggers.some((trigger) => words.has(trigger)));
    if (!group) return [];
    return group.choices.map((choice) => {
      const count = rank(models, choice.query).length;
      return { ...choice, count };
    }).filter((choice) => choice.count > 0).slice(0, 3);
  }

  function decorateEmptyState({ container, input, models, onApply }) {
    container?.querySelector('.search-alternatives')?.remove();
    const query = String(input?.value || '').trim();
    if (!container || !query) return;
    const choices = alternatives(query, models);
    if (!choices.length) return;
    const section = document.createElement('section');
    section.className = 'search-alternatives';
    const heading = document.createElement('h4');
    heading.textContent = 'Может заменить';
    section.append(heading);
    for (const choice of choices) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'search-alternative';
      button.innerHTML = `<strong>${escapeHtml(choice.label)}</strong><span>${escapeHtml(choice.reason)} · ${choice.count}</span>`;
      button.addEventListener('click', () => onApply(choice.query));
      section.append(button);
    }
    container.append(section);
  }

  function expandAliases(tokens) {
    return [...new Set(tokens.flatMap((token) => {
      if (/^тумбоч/.test(token)) return ['тумба'];
      return ALIASES.get(token) || [token];
    }))];
  }

  function switchLayout(value, mapping) {
    return [...value].map((char) => mapping.get(char) || char).join('');
  }

  function transliterateToRussian(value) {
    const pairs = [
      ['shch', 'щ'], ['yo', 'ё'], ['zh', 'ж'], ['kh', 'х'], ['ts', 'ц'], ['ch', 'ч'],
      ['sh', 'ш'], ['yu', 'ю'], ['ya', 'я'], ['ye', 'е'], ['a', 'а'], ['b', 'б'], ['v', 'в'],
      ['g', 'г'], ['d', 'д'], ['e', 'е'], ['z', 'з'], ['i', 'и'], ['j', 'й'], ['k', 'к'],
      ['l', 'л'], ['m', 'м'], ['n', 'н'], ['o', 'о'], ['p', 'п'], ['r', 'р'], ['s', 'с'],
      ['t', 'т'], ['u', 'у'], ['f', 'ф'], ['h', 'х'], ['c', 'к'], ['y', 'ы'], ['x', 'кс'],
    ];
    let output = value;
    for (const [latin, russian] of pairs) output = output.replaceAll(latin, russian);
    return output;
  }

  function damerauLevenshtein(a, b, limit = Infinity) {
    if (a === b) return 0;
    if (Math.abs(a.length - b.length) > limit) return limit + 1;
    let previousPrevious = null;
    let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
    for (let i = 1; i <= a.length; i += 1) {
      const current = [i];
      let rowMin = i;
      for (let j = 1; j <= b.length; j += 1) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        let value = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + cost);
        if (previousPrevious && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
          value = Math.min(value, previousPrevious[j - 2] + 1);
        }
        current[j] = value;
        rowMin = Math.min(rowMin, value);
      }
      if (rowMin > limit) return limit + 1;
      previousPrevious = previous;
      previous = current;
    }
    return previous[b.length];
  }

  function typoLimit(token) { return token.length >= 8 ? 2 : 1; }
  function tokenize(value) { return normalize(value).split(/[^a-zа-я0-9+-]+/i).filter(Boolean); }
  function normalize(value) { return String(value || '').toLocaleLowerCase('ru').replace(/ё/g, 'е').replace(/\s+/g, ' ').trim(); }
  function asArray(value) { return Array.isArray(value) ? value : value ? [value] : []; }
  function sourceOrder(model) { return Number.isFinite(model.sourceOrder) ? model.sourceOrder : Number.MAX_SAFE_INTEGER; }
  function escapeHtml(value) { return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char])); }

  window.FormaSearch = Object.freeze({ build, rank, alternatives, decorateEmptyState, normalize, queryVariants });
})();
