'use strict';
// Regression guard for the shared TETOpt product-card contract.
// Run with: node scripts/check-card-layout.cjs
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const ROOT = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(ROOT, name), 'utf8');
const sourceNames = JSON.parse(read('styles/manifest.json')).sources;
const compiled = sourceNames.map(name => '/* Source: ' + name + ' */\n' + read(name)).join('\n');
assert.equal(read('storefront.css'), compiled, 'Published CSS must exactly match source cascade');
const css = read('ui.css');
const axes = read('axes.css');
const js = read('variants.js');
assert(css.includes('.product-card .product-info{display:flex;flex-direction:column;flex:1 1 auto'),
  'Card body must stretch vertically');
assert(css.includes('.product-card .product-bottom{margin-top:auto'),
  'Card actions must stay at the bottom');
assert(!css.includes('height:clamp(272px,calc((100vh - 128px)/2),340px)'),
  'Fixed card heights must not hide content');
assert(css.includes('grid-template-columns:repeat(5,minmax(0,1fr))'),
  'Five visible options per variant row');
assert(css.includes('white-space:normal!important;overflow:visible!important;text-overflow:clip!important'),
  'Long product titles and specifications must not be truncated');
assert(axes.includes('.dual-axes-compact{display:flex;align-items:flex-start;flex-wrap:wrap'),
  'Independent fabric and frame options must wrap');
const start = js.indexOf('function variantChoices(');
const end = js.indexOf('\nconst isSoldOut=', start);
assert(start >= 0 && end > start, 'Variant renderer must be present');
// Isolate only the real card variant renderer; dependencies are stable test doubles.
const choice = new Function(
  'choiceOptions', 'escapeAttr', 'escapeHtml', 'choiceLabel', 'swatchPaint', 'variantLabel',
  js.slice(start, end) + '\nreturn variantChoices;'
)(
  (product, selected) => product.variants.map(variant => ({
    variant, presentation: {colors: ['#abcdef']},
    active: variant.sourceId === selected.sourceId, sameColor: false
  })),
  String, String, variant => String(variant.sourceId),
  colors => colors[0], variant => String(variant.sourceId)
);
for (const count of [1, 2, 5, 6, 9, 10, 11, 12, 20]) {
  const product = {id: 'test-product', variants: Array.from(
    {length: count}, (_, i) => ({sourceId: i + 1, specs: 'Test specification'})
  )};
  for (const selected of [1, count]) {
    const current = product.variants[selected - 1];
    const card = choice(product, current, 'card');
    const detail = choice(product, current, 'detail');
    const visible = (card.match(/class="card-swatch /g) || []).length;
    const all = (detail.match(/class="variant-swatch-option /g) || []).length;
    const expected = count < 2 ? 0 : count > 10 ? 9 : count;
    assert.equal(visible, expected, 'Compact variant count ' + count);
    assert.equal(all, count < 2 ? 0 : count, 'Full variant count ' + count);
    assert.equal((card.match(/class="card-more-variants"/g) || []).length,
      count > 10 ? 1 : 0, 'Detail shortcut ' + count);
    if (count > 10) {
      assert(card.includes('data-card-variant="' + selected + '"'),
        'Active option must remain visible');
      assert(card.includes('+' + (count - 9)), 'Remaining option count');
      assert(card.includes('data-open="' + product.id + '"'),
        'Detail shortcut must open product');
    }
  }
}
console.log('PASS: stable card layout, full variant access and release CSS');
