from pathlib import Path

# Keep the production data/cache semantics unchanged. The performance change is
# intentionally limited to card-media delivery and one source of image priority.

# app.js: pass each visible card's page index into the template, including local
# variant swaps. No catalog fetch/cache behavior or URL scheme is changed here.
p=Path('app.js'); s=p.read_text()
changes=[
("els.grid.innerHTML=list.map(cardTemplate).join('');", "els.grid.innerHTML=list.map((product,index)=>cardTemplate(product,index)).join('');"),
("if(p&&card&&String(p._selected)!==next){p._selected=next;card.outerHTML=cardTemplate(p)}", "if(p&&card&&String(p._selected)!==next){const cardIndex=card.parentElement?[...card.parentElement.children].indexOf(card):-1;p._selected=next;card.outerHTML=cardTemplate(p,cardIndex)}")]
for old,new in changes:
    assert old in s, old[:90]
    s=s.replace(old,new,1)
p.write_text(s)

# variants.js: declare priority at card creation time. Only the first two mobile
# cards / first three wider cards are elevated. All later images remain normal
# browser-managed lazy images; do not force fetchpriority=low after scrolling.
p=Path('variants.js'); s=p.read_text()
old="function cardTemplate(product){\n  let variant=axisVariant(product,currentVariant(product,product._selected));\n  product._selected=variant.sourceId;\n  const selectors=axisControls(product,variant,'card')||variantChoices(product,variant),sleepSize=sleepingSize(product,variant);"
new="function cardTemplate(product,cardIndex=Number.POSITIVE_INFINITY){\n  let variant=axisVariant(product,currentVariant(product,product._selected));\n  product._selected=variant.sourceId;\n  const selectors=axisControls(product,variant,'card')||variantChoices(product,variant),sleepSize=sleepingSize(product,variant);\n  const mobile=window.matchMedia&&window.matchMedia('(max-width:640px)').matches,highCount=mobile?2:3,high=Number.isFinite(cardIndex)&&cardIndex>=0&&cardIndex<highCount;"
assert old in s; s=s.replace(old,new,1)
old='<img src="${escapeAttr(imageUrl(variant.primaryImage))}" alt="${escapeAttr(stripModel(product.name))}" loading="lazy" decoding="async">'
new='<img src="${escapeAttr(imageUrl(variant.primaryImage))}" alt="${escapeAttr(stripModel(product.name))}" loading="${high?\'eager\':\'lazy\'}"${high?\' fetchpriority="high"\':\'\'} decoding="async">'
assert old in s; s=s.replace(old,new,1)
old="if(card)card.outerHTML=cardTemplate(product);"
new="if(card){const cardIndex=card.parentElement?[...card.parentElement.children].indexOf(card):-1;card.outerHTML=cardTemplate(product,cardIndex)}"
assert old in s; s=s.replace(old,new,1)
p.write_text(s)

# cart-feedback.js currently re-walks the same product DOM after every render to
# rewrite image URLs/priorities. On the production GitHub host the URL rewrite is
# a no-op, and the priority pass competes with the template. Remove only that
# duplicate observer layer. Keep immediate service-worker registration exactly.
p=Path('cart-feedback.js'); s=p.read_text()
start=s.index('/* Product media should come from the same Cloudflare-served origin')
end=s.index('/* Header question shortcut.',start)
registration="""/* Product-card media priority is declared once by cardTemplate. */\nif('serviceWorker' in navigator){\n  navigator.serviceWorker.register('./sw.js',{scope:'./',updateViaCache:'none'}).catch(function(error){\n    console.warn('[service-worker] registration skipped',error);\n  });\n}\n\n"""
s=s[:start]+registration+s[end:]
assert 'prioritizeImages' not in s and 'localizeMedia' not in s
p.write_text(s)
