from pathlib import Path

# app.js: same-origin media, reusable startup data request, and card index passed at render time.
p=Path('app.js'); s=p.read_text()
changes=[
("ASSET_BASE='https://gkkm8bm7rn-eng.github.io/tetopt/'", "ASSET_BASE='./'"),
("fetch(DATA_BASE+'catalog-index.json',{cache:'no-cache'}),fetch(DATA_BASE+'category-assignments.json',{cache:'no-cache'})", "fetch(DATA_BASE+'catalog-index.json'),fetch(DATA_BASE+'category-assignments.json')"),
("els.grid.innerHTML=list.map(cardTemplate).join('');", "els.grid.innerHTML=list.map((product,index)=>cardTemplate(product,index)).join('');"),
("if(p&&card&&String(p._selected)!==next){p._selected=next;card.outerHTML=cardTemplate(p)}", "if(p&&card&&String(p._selected)!==next){const cardIndex=card.parentElement?[...card.parentElement.children].indexOf(card):-1;p._selected=next;card.outerHTML=cardTemplate(p,cardIndex)}")]
for old,new in changes:
    assert old in s, old[:90]
    s=s.replace(old,new,1)
p.write_text(s)

# variants.js: declare image priority when the card is created rather than mutating it later.
p=Path('variants.js'); s=p.read_text()
old="function cardTemplate(product){\n  let variant=axisVariant(product,currentVariant(product,product._selected));\n  product._selected=variant.sourceId;\n  const selectors=axisControls(product,variant,'card')||variantChoices(product,variant),sleepSize=sleepingSize(product,variant);"
new="function cardTemplate(product,cardIndex=Number.POSITIVE_INFINITY){\n  let variant=axisVariant(product,currentVariant(product,product._selected));\n  product._selected=variant.sourceId;\n  const selectors=axisControls(product,variant,'card')||variantChoices(product,variant),sleepSize=sleepingSize(product,variant);\n  const mobile=window.matchMedia&&window.matchMedia('(max-width:640px)').matches,highCount=mobile?2:3,high=Number.isFinite(cardIndex)&&cardIndex>=0&&cardIndex<highCount;"
assert old in s; s=s.replace(old,new,1)
old='<img src="${escapeAttr(imageUrl(variant.primaryImage))}" alt="${escapeAttr(stripModel(product.name))}" loading="lazy" decoding="async">'
new='<img src="${escapeAttr(imageUrl(variant.primaryImage))}" alt="${escapeAttr(stripModel(product.name))}" loading="${high?\'eager\':\'lazy\'}" fetchpriority="${high?\'high\':\'low\'}" decoding="async">'
assert old in s; s=s.replace(old,new,1)
old="if(card)card.outerHTML=cardTemplate(product);"
new="if(card){const cardIndex=card.parentElement?[...card.parentElement.children].indexOf(card):-1;card.outerHTML=cardTemplate(product,cardIndex)}"
assert old in s; s=s.replace(old,new,1)
p.write_text(s)

# cart-feedback.js: remove duplicate post-render media URL/priority layer; keep SW registration unchanged.
p=Path('cart-feedback.js'); s=p.read_text()
start=s.index('/* Product media should come from the same Cloudflare-served origin')
end=s.index('/* Header question shortcut.',start)
registration="""/* Card media URLs and priorities are declared at render time. */\nif('serviceWorker' in navigator){\n  navigator.serviceWorker.register('./sw.js',{scope:'./',updateViaCache:'none'}).catch(function(error){\n    console.warn('[service-worker] registration skipped',error);\n  });\n}\n\n"""
s=s[:start]+registration+s[end:]
assert 'prioritizeImages' not in s and 'localizeMedia' not in s
p.write_text(s)

# index.html: start catalog JSON early and keep analytics out of the critical path.
p=Path('index.html'); s=p.read_text()
old='  <link rel="preconnect" href="https://gkkm8bm7rn-eng.github.io">\n'
new='  <link rel="preload" href="./data/catalog-index.json" as="fetch" crossorigin="anonymous">\n  <link rel="preload" href="./data/category-assignments.json" as="fetch" crossorigin="anonymous">\n'
assert old in s; s=s.replace(old,new,1)
old="""  const beacon = document.createElement('script');\n  beacon.type = 'module';\n  beacon.src = 'https://static.cloudflareinsights.com/beacon.min.js';\n  beacon.dataset.cfBeacon = JSON.stringify({\n    token: '59ed2c9fa549420491736b3635615cef',\n    spa: true,\n  });\n  document.head.appendChild(beacon);"""
new="""  const loadBeacon = () => {\n    const beacon = document.createElement('script');\n    beacon.type = 'module';\n    beacon.src = 'https://static.cloudflareinsights.com/beacon.min.js';\n    beacon.dataset.cfBeacon = JSON.stringify({ token: '59ed2c9fa549420491736b3635615cef', spa: true });\n    document.head.appendChild(beacon);\n  };\n  if (document.readyState === 'complete') window.setTimeout(loadBeacon, 0);\n  else window.addEventListener('load', loadBeacon, { once: true });"""
assert old in s; s=s.replace(old,new,1)
p.write_text(s)
