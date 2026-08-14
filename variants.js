const SWATCH_PALETTE=[
  [['чёрн','черн'],'#171717'],[['графит'],'#4f5352'],[['антрацит'],'#484b4b'],
  [['тёмно-сер','темно-сер'],'#5c5e5d'],[['светло-сер'],'#c9cbc9'],[['серо-беж'],'#aaa092'],[['сер'],'#8b8d8b'],
  [['светло-корич'],'#aa8870'],[['корич'],'#74513e'],[['какао'],'#80675d'],[['капуч'],'#aa8b70'],[['кофе'],'#755747'],
  [['горч'],'#b58a32'],[['крем'],'#e8d8bb'],[['беж'],'#cfbea0'],[['айвори','слонов'],'#eee7d8'],
  [['олив'],'#747b55'],[['изумруд'],'#286b57'],[['бирюз'],'#268a87'],[['мятн','минт'],'#83a99a'],[['лайм'],'#94a94a'],
  [['хаки'],'#777454'],[['зелён','зелен'],'#4d765e'],[['тёмно-син','темно-син'],'#314b69'],[['син'],'#3f6287'],[['голуб'],'#82aabd'],
  [['бордо','винн'],'#743d45'],[['красн'],'#9f4540'],[['оранж'],'#c7783e'],[['жёлт','желт'],'#d3ae4c'],
  [['терракот'],'#a85f49'],[['кирпич'],'#9a5543'],[['персик'],'#dc9c78'],[['пудров'],'#d1a6a2'],[['розов'],'#d5a8aa'],
  [['фиолет','лилов'],'#7c6485'],[['золот'],'#b49a61'],[['бронз'],'#8c7048'],[['сереб'],'#a7aaa9'],
  [['коньяч'],'#9a623e'],[['медов'],'#bd8b47'],[['песоч'],'#c9ad7e'],[['тауп'],'#8e8278'],[['молоч'],'#eee7da'],
  [['бел'],'#f4f2eb'],[['натуральн'],'#bd9c70'],[['орех'],'#76563e']
];

function trustedColor(text=''){
  const value=String(text).toLocaleLowerCase('ru-RU');
  const match=SWATCH_PALETTE.find(([tokens])=>tokens.some(token=>value.includes(token)));
  return match?.[1]||null;
}

function axisModel(product){
  const variants=product.variants.filter(v=>v.axes?.soft&&v.axes?.hard);
  if(variants.length<2)return null;
  const unique=type=>[...new Map(variants.map(v=>[v.axes[type].label,v.axes[type]])).values()];
  const soft=unique('soft'),hard=unique('hard');
  return soft.length>1||hard.length>1?{variants,soft,hard}:null;
}

function axisVariant(product,variant){
  const model=axisModel(product);
  return model&&(!variant.axes?.soft||!variant.axes?.hard)?model.variants[0]:variant;
}

function axisControls(product,variant){
  const model=axisModel(product);
  if(!model)return'';
  variant=axisVariant(product,variant);
  const group=(type,title,shape)=>{
    if(model[type].length<2)return'';
    const other=type==='soft'?'hard':'soft';
    return`<div class="axis-group"><div class="variant-label"><strong>${title}</strong><span>${escapeHtml(variant.axes[type].label)}</span></div><div class="axis-options">${model[type].map(option=>{
      const available=model.variants.some(v=>v.axes[type].label===option.label&&v.axes[other].label===variant.axes[other].label);
      return`<button class="axis-swatch ${shape} ${variant.axes[type].label===option.label?'active':''}" style="--axis-color:${option.hex}" data-axis="${type}" data-axis-value="${escapeAttr(option.label)}" data-product="${escapeAttr(product.id)}" title="${escapeAttr(option.label)}" aria-label="${escapeAttr(title+': '+option.label)}" ${available?'':'disabled'}></button>`;
    }).join('')}</div></div>`;
  };
  const controls=group('soft','Цвет обивки или подушки','soft-axis')+group('hard','Цвет каркаса или основания','hard-axis');
  return controls?`<div class="dual-axes">${controls}</div>`:'';
}

function selectAxis(product,type,value){
  const current=axisVariant(product,currentVariant(product,product._selected)),other=type==='soft'?'hard':'soft';
  const match=product.variants.find(v=>v.axes?.[type]?.label===value&&v.axes?.[other]?.label===current.axes?.[other]?.label);
  if(match)product._selected=match.sourceId;
  return match;
}

function variantChoices(product,variant){
  if(product.variants.length<2)return'';
  const seenColors=new Set();
  const choices=product.variants.filter(item=>{
    const color=trustedColor(variantLabel(item));
    if(!color)return true;
    if(seenColors.has(color))return false;
    seenColors.add(color);
    return true;
  }).slice(0,8);
  return`<div class="card-variants">${choices.map((item,index)=>{
    const label=variantLabel(item),color=trustedColor(label),active=String(item.sourceId)===String(variant.sourceId)?'active':'';
    return color
      ?`<button class="card-swatch ${active}" style="--swatch:${color}" data-card-variant="${item.sourceId}" data-product="${escapeAttr(product.id)}" title="${escapeAttr(label)}" aria-label="${escapeAttr('Цвет: '+label)}"></button>`
      :`<button class="variant-text ${active}" data-card-variant="${item.sourceId}" data-product="${escapeAttr(product.id)}" title="${escapeAttr(label)}">${escapeHtml(label||`Вариант ${index+1}`)}</button>`;
  }).join('')}</div>`;
}

function priceTemplate(variant,detail=false){
  const retail=variant.retailPrice>variant.wholesalePrice?`<span class="retail-row">Розничная цена <del>${money(variant.retailPrice)}</del></span>`:'';
  return`<span class="price-stack ${detail?'detail-prices':''}"><span class="price-kind">Оптовая цена</span><strong class="${detail?'detail-price':'product-price'}">${money(variant.wholesalePrice)}</strong>${retail}</span>`;
}

function cardTemplate(product){
  let variant=axisVariant(product,currentVariant(product,product._selected));
  product._selected=variant.sourceId;
  const selectors=axisControls(product,variant)||variantChoices(product,variant);
  return`<article class="product-card"><div class="product-visual" data-open="${escapeAttr(product.id)}" data-card-gallery="${escapeAttr(product.id)}" data-photo-index="0" tabindex="0" role="button"><img src="${escapeAttr(imageUrl(variant.primaryImage))}" alt="${escapeAttr(stripModel(product.name))}" loading="lazy"><button class="card-photo-nav previous" data-card-photo="-1" aria-label="Предыдущее фото">‹</button><button class="card-photo-nav next" data-card-photo="1" aria-label="Следующее фото">›</button><span class="card-photo-position" aria-hidden="true"></span><button class="favorite ${state.favorites.includes(product.id)?'active':''}" data-favorite="${escapeAttr(product.id)}" aria-label="Избранное">${state.favorites.includes(product.id)?'♥':'♡'}</button></div><div class="product-info"><h3 class="product-name">${escapeHtml(stripModel(product.name))}</h3><p class="product-meta">${escapeHtml(variantLabel(variant))}</p>${selectors}<div class="product-bottom">${priceTemplate(variant)}<button class="quick-add" data-add="${escapeAttr(product.id)}" data-source="${variant.sourceId}">В корзину</button></div></div></article>`;
}

function detailTemplate(product,variant){
  variant=axisVariant(product,variant);
  const images=curateGallery(product,variant);
  return`<article class="detail" data-detail-id="${escapeAttr(product.id)}"><div class="gallery"><img class="gallery-main" id="galleryMain" src="${escapeAttr(imageUrl(images[0]))}" alt="${escapeAttr(stripModel(product.name))}"><div class="thumbnails">${images.map((src,i)=>`<button class="thumbnail ${i===0?'active':''}" data-image="${escapeAttr(imageUrl(src))}"><img src="${escapeAttr(imageUrl(src))}" alt="Фото ${i+1}"></button>`).join('')}</div></div><div class="detail-copy"><p class="eyebrow">${escapeHtml(product.category)}</p><h2>${escapeHtml(stripModel(product.name))}</h2>${priceTemplate(variant,true)}${axisControls(product,variant)||(product.variants.length>1?`<div class="variant-options">${product.variants.map(v=>`<button class="variant-option ${String(v.sourceId)===String(variant.sourceId)?'active':''}" data-variant="${v.sourceId}">${escapeHtml(variantLabel(v))}</button>`).join('')}</div>`:'')}<div class="variant-section"><div class="variant-label"><strong>Характеристики и размеры</strong><span>арт. ${variant.sourceId}</span></div><p class="specs">${escapeHtml(variant.specs)}</p></div><div class="detail-actions"><button class="primary-button" data-add="${escapeAttr(product.id)}" data-source="${variant.sourceId}">Добавить в корзину</button><button class="share-button" data-share-product="${escapeAttr(product.id)}" data-source="${variant.sourceId}">Поделиться</button></div></div></article>`;
}

function renderCart(){
  const rows=cartRows();
  els.cartItems.innerHTML=rows.length?`<div class="cart-list">${rows.map(({product,variant,key,qty})=>`<article class="cart-item"><img src="${escapeAttr(imageUrl(variant.primaryImage))}" alt=""><div><h3>${escapeHtml(stripModel(product.name))}</h3><p>${escapeHtml(variantLabel(variant))}<br>арт. ${variant.sourceId}</p><div class="qty"><button data-qty="${key}" data-delta="-1">−</button><span>${qty}</span><button data-qty="${key}" data-delta="1">+</button></div></div><div><strong>${money(variant.wholesalePrice*qty)}</strong><button class="remove" data-remove="${key}">Удалить</button></div></article>`).join('')}</div>`:'<div class="cart-empty"><h3>Корзина пока пуста</h3></div>';
  const total=rows.reduce((sum,row)=>sum+row.variant.wholesalePrice*row.qty,0),share=cartShareUrl(),plain=orderText(rows,total)+'\n'+share,message=encodeURIComponent(plain),subject=encodeURIComponent('Заказ с сайта FORMA HOME');
  els.cartFooter.innerHTML=rows.length?`<div class="cart-total"><span>Итого</span><span>${money(total)}</span></div><div class="checkout-actions"><a class="primary-button" href="https://wa.me/?text=${message}" target="_blank" rel="noopener">Заказать в WhatsApp</a><a class="messenger-button" href="https://t.me/share/url?url=${encodeURIComponent(share)}&text=${encodeURIComponent(orderText(rows,total))}" target="_blank" rel="noopener">Заказать в Telegram</a><a class="messenger-button" href="https://max.ru/:share?text=${message}" target="_blank" rel="noopener">Заказать в MAX</a><a class="messenger-button" href="mailto:?subject=${subject}&body=${message}">Заказать по электронной почте</a><button class="share-button" data-share-cart>Поделиться корзиной</button></div>`:'';
}

document.addEventListener('click',async event=>{
  const button=event.target.closest('[data-axis]');
  if(!button)return;
  event.stopPropagation();
  const product=state.products.find(p=>p.id===button.dataset.product),match=selectAxis(product,button.dataset.axis,button.dataset.axisValue);
  if(!match)return;
  if(button.closest('[data-detail-id]')){
    const full=await getFullProduct(product);
    full._selected=match.sourceId;
    els.detail.innerHTML=detailTemplate(full,currentVariant(full,match.sourceId));
  }else renderCatalog();
},true);

async function changeCardPhoto(visual,delta){
  const product=state.products.find(item=>item.id===visual.dataset.cardGallery);
  if(!product)return;
  const full=await getFullProduct(product),variant=currentVariant(full,product._selected),images=curateGallery(full,variant);
  if(images.length<2)return;
  const current=Number(visual.dataset.photoIndex||0),next=(current+delta+images.length)%images.length;
  visual.dataset.photoIndex=String(next);
  visual.querySelector('img').src=imageUrl(images[next]);
  const position=visual.querySelector('.card-photo-position');
  position.textContent=`${next+1}/${images.length}`;
}

document.addEventListener('click',event=>{
  const button=event.target.closest('[data-card-photo]');
  if(!button)return;
  event.preventDefault();event.stopImmediatePropagation();
  changeCardPhoto(button.closest('[data-card-gallery]'),Number(button.dataset.cardPhoto));
},true);

let cardSwipe=null;
document.addEventListener('pointerdown',event=>{
  const visual=event.target.closest('[data-card-gallery]');
  if(!visual||event.target.closest('button'))return;
  cardSwipe={visual,x:event.clientX,y:event.clientY};
},{passive:true,capture:true});
document.addEventListener('pointerup',event=>{
  if(!cardSwipe)return;
  const dx=event.clientX-cardSwipe.x,dy=event.clientY-cardSwipe.y,visual=cardSwipe.visual;
  cardSwipe=null;
  if(Math.abs(dx)<42||Math.abs(dx)<Math.abs(dy))return;
  event.preventDefault();event.stopImmediatePropagation();
  visual.dataset.suppressOpen='true';
  setTimeout(()=>delete visual.dataset.suppressOpen,350);
  changeCardPhoto(visual,dx<0?1:-1);
},true);
document.addEventListener('click',event=>{
  const visual=event.target.closest('[data-card-gallery][data-suppress-open]');
  if(!visual)return;
  event.preventDefault();event.stopImmediatePropagation();
},true);
