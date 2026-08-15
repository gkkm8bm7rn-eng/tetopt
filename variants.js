/*
 * Variant presentation is deliberately derived from the product record in one
 * place. A source variant may carry a single colour, a paired colour scheme,
 * or explicit upholstery/frame axes. Cards and the product sheet consume the
 * same presentation model, so an option cannot silently disappear in one
 * interface while remaining in another.
 */
const SWATCH_PALETTE=[
  {key:'black',label:'чёрный',hex:'#1d1d1b',tokens:['чёрн','черн','black','антрацит']},
  {key:'graphite',label:'графитовый',hex:'#4f5352',tokens:['графит','metallic','металлик']},
  {key:'silver',label:'серебристый',hex:'#afb3b3',tokens:['сереб','сталь','хром','chrome','платин']},
  {key:'light-grey',label:'светло-серый',hex:'#c9cbc9',tokens:['светло-сер','light grey','light-gray']},
  {key:'greige',label:'серо-бежевый',hex:'#aaa092',tokens:['серо-беж','greige','тауп']},
  {key:'dark-grey',label:'тёмно-серый',hex:'#5c5e5d',tokens:['тёмно-сер','темно-сер','dark-grey','dark grey']},
  {key:'grey',label:'серый',hex:'#8b8d8b',tokens:['сер','grey','gray']},
  {key:'white',label:'белый',hex:'#f7f5ef',tokens:['бел','white','вайт']},
  {key:'transparent',label:'прозрачный',hex:'#dfe9ed',tokens:['прозрач','transparent']},
  {key:'milk',label:'молочный',hex:'#eee7da',tokens:['молоч','сливоч']},
  {key:'ivory',label:'айвори',hex:'#eee7d8',tokens:['айвори','ivory','слонов']},
  {key:'cream',label:'кремовый',hex:'#e8d8bb',tokens:['крем']},
  {key:'beige',label:'бежевый',hex:'#cfbea0',tokens:['беж','beige']},
  {key:'sand',label:'песочный',hex:'#c9ad7e',tokens:['песоч']},
  {key:'natural',label:'натуральный',hex:'#bd9c70',tokens:['натурал','natural']},
  {key:'light-brown',label:'светло-коричневый',hex:'#aa8870',tokens:['светло-корич']},
  {key:'brown',label:'коричневый',hex:'#74513e',tokens:['корич','brown']},
  {key:'walnut',label:'ореховый',hex:'#76563e',tokens:['орех','пекан']},
  {key:'oak',label:'дубовый',hex:'#9b744e',tokens:['дуб','oak']},
  {key:'ash',label:'пепельный',hex:'#766556',tokens:['пепел','ash']},
  {key:'cocoa',label:'какао',hex:'#80675d',tokens:['какао']},
  {key:'cappuccino',label:'капучино',hex:'#aa8b70',tokens:['капуч']},
  {key:'coffee',label:'кофейный',hex:'#755747',tokens:['кофе']},
  {key:'cognac',label:'коньячный',hex:'#9a623e',tokens:['коньяч','груша']},
  {key:'green',label:'зелёный',hex:'#4d765e',tokens:['зелён','зелен','green']},
  {key:'olive',label:'оливковый',hex:'#747b55',tokens:['олив','олива']},
  {key:'lime',label:'лайм',hex:'#8fb83e',tokens:['лайм','салат']},
  {key:'emerald',label:'изумрудный',hex:'#286b57',tokens:['изумруд','emerald']},
  {key:'turquoise',label:'бирюзовый',hex:'#268a87',tokens:['тёмно-бирюз','темно-бирюз','бирюз','аквамарин','torquoise','turquoise']},
  {key:'blue',label:'синий',hex:'#3f6287',tokens:['тёмно-син','темно-син','син','blue']},
  {key:'sky',label:'голубой',hex:'#82aabd',tokens:['голуб']},
  {key:'red',label:'красный',hex:'#9f4540',tokens:['красн','red']},
  {key:'burgundy',label:'бордовый',hex:'#743d45',tokens:['бордо','винн','марсал']},
  {key:'coral',label:'коралловый',hex:'#c56f62',tokens:['коралл']},
  {key:'terracotta',label:'терракотовый',hex:'#a85f49',tokens:['терракот','кирпич']},
  {key:'orange',label:'оранжевый',hex:'#c7783e',tokens:['оранж']},
  {key:'yellow',label:'жёлтый',hex:'#d3ae4c',tokens:['жёлт','желт','горч']},
  {key:'pink',label:'розовый',hex:'#d5a8aa',tokens:['розов','пудров','персик']},
  {key:'lavender',label:'лавандовый',hex:'#8f79a5',tokens:['светло-лаванд','лаванд']},
  {key:'violet',label:'фиолетовый',hex:'#7c6485',tokens:['фиолет','лилов','аметист']},
  {key:'gold',label:'золотой',hex:'#b49a61',tokens:['золот','бронз','латун','медов']}
];

const colorText=value=>String(value||'').toLocaleLowerCase('ru-RU').replace(/ё/gu,'е');
const stableColorKey=value=>colorText(value).replace(/[^a-zа-я0-9]+/giu,' ').trim();

function colorsIn(value=''){
  const text=colorText(value),matches=[];
  SWATCH_PALETTE.forEach(color=>color.tokens.forEach(token=>{
    let start=text.indexOf(colorText(token));
    while(start>=0){matches.push({...color,start,length:token.length});start=text.indexOf(colorText(token),start+token.length)}
  }));
  matches.sort((left,right)=>left.start-right.start||right.length-left.length);
  const occupied=[],colors=[];
  matches.forEach(match=>{
    const end=match.start+match.length;
    if(occupied.some(range=>match.start<range.end&&end>range.start)||colors.some(color=>color.key===match.key))return;
    occupied.push({start:match.start,end});
    colors.push({key:match.key,label:match.label,hex:match.hex});
  });
  return colors;
}

function colorFromAxis(axis){
  if(!axis)return null;
  const known=colorsIn(axis.label)[0];
  return {key:known?.key||`axis-${stableColorKey(axis.label)}`,label:axis.label||known?.label||'цвет',hex:axis.hex||known?.hex||'#d8d4ca'};
}

function uniqueColors(colors=[]){
  const seen=new Set;
  return colors.filter(color=>color&&!seen.has(color.key)&&(seen.add(color.key),true));
}

function variantPresentation(variant){
  const detected=colorsIn(`${variant.label||''} ${variant.specs||''}`),explicitSoft=colorFromAxis(variant.axes?.soft),explicitHard=colorFromAxis(variant.axes?.hard);
  let soft=explicitSoft,hard=explicitHard;
  if(!soft&&hard)soft=detected.find(color=>color.key!==hard.key)||null;
  if(!hard&&soft)hard=detected.find(color=>color.key!==soft.key)||null;
  if(!soft&&!hard&&detected.length>1)[soft,hard]=detected;
  const colors=uniqueColors(soft||hard?[soft,hard]:detected);
  return {colors,soft,hard,key:colors.map(color=>color.key).join('+')||`variant-${variant.sourceId}`};
}

function swatchPaint(colors=[]){
  const unique=uniqueColors(colors);
  if(!unique.length)return '#d8d4ca';
  if(unique.length===1)return unique[0].hex;
  const shown=unique.slice(0,3),stops=shown.map((color,index)=>`${color.hex} ${Math.round(index/shown.length*100)}%, ${color.hex} ${Math.round((index+1)/shown.length*100)}%`);
  return `linear-gradient(135deg,${stops.join(',')})`;
}

function choiceLabel(variant,presentation=variantPresentation(variant)){
  return presentation.colors.length?presentation.colors.map(color=>color.label).join(' / '):variantLabel(variant);
}

function productAxisModel(product){
  const variants=product.variants||[];
  // Axes are safe only when each source variant carries structural axis data.
  // Otherwise paired swatches are used, so we never invent combinations.
  if(variants.length<2||variants.some(variant=>!variant.axes?.soft&&!variant.axes?.hard))return null;
  const entries=variants.map(variant=>({variant,presentation:variantPresentation(variant)}));
  if(entries.some(entry=>!entry.presentation.soft||!entry.presentation.hard))return null;
  const unique=type=>[...new Map(entries.map(entry=>[entry.presentation[type].key,entry.presentation[type]])).values()];
  const soft=unique('soft'),hard=unique('hard');
  if(soft.length<2||hard.length<2)return null;
  const softBranches=new Map,hardBranches=new Map;
  entries.forEach(entry=>{
    const {soft:softColor,hard:hardColor}=entry.presentation;
    if(!softBranches.has(softColor.key))softBranches.set(softColor.key,new Set);
    if(!hardBranches.has(hardColor.key))hardBranches.set(hardColor.key,new Set);
    softBranches.get(softColor.key).add(hardColor.key);
    hardBranches.get(hardColor.key).add(softColor.key);
  });
  const independentlySelectable=[...softBranches.values(),...hardBranches.values()].some(values=>values.size>1);
  // Two colours changing together are two finished products, not four
  // imaginary upholstery/frame combinations (for example Belsay).
  return independentlySelectable?{entries,soft,hard}:null;
}

function axisModel(product){return productAxisModel(product)}

function axisVariant(product,variant){
  const model=axisModel(product);
  return model&&(!variantPresentation(variant).soft||!variantPresentation(variant).hard)?model.entries[0].variant:variant;
}

function axisControls(product,variant,context='detail'){
  const model=axisModel(product);
  if(!model)return'';
  const active=axisVariant(product,variant),activePresentation=variantPresentation(active),compact=context==='card';
  const group=(type,title,shape)=>{
    const other=type==='soft'?'hard':'soft';
    return `<div class="axis-group ${compact?'axis-group-compact':''}">${compact?'':`<div class="variant-label"><strong>${title}</strong><span>${escapeHtml(activePresentation[type].label)}</span></div>`}<div class="axis-options">${model[type].map(option=>{
      const available=model.entries.some(entry=>entry.presentation[type].key===option.key&&entry.presentation[other].key===activePresentation[other].key);
      const selected=activePresentation[type].key===option.key;
      return `<button class="axis-swatch ${shape} ${selected?'active':''}" style="--axis-color:${option.hex}" data-axis="${type}" data-axis-value="${escapeAttr(option.key)}" data-product="${escapeAttr(product.id)}" title="${escapeAttr(title+': '+option.label)}" aria-label="${escapeAttr(title+': '+option.label)}" ${available?'':'disabled'}></button>`;
    }).join('')}</div></div>`;
  };
  return `<div class="dual-axes ${compact?'dual-axes-compact':''}">${group('soft','Цвет обивки или подушки','soft-axis')}${group('hard','Цвет каркаса или основания','hard-axis')}</div>`;
}

function selectAxis(product,type,key){
  const model=axisModel(product),current=currentVariant(product,product._selected);
  if(!model)return null;
  const currentPresentation=variantPresentation(current),other=type==='soft'?'hard':'soft';
  const match=model.entries.find(entry=>entry.presentation[type].key===key&&entry.presentation[other].key===currentPresentation[other].key)?.variant;
  if(match)product._selected=match.sourceId;
  return match;
}

function choiceOptions(product,selected){
  const byPresentation=new Map;
  product.variants.forEach(variant=>{
    const presentation=variantPresentation(variant),existing=byPresentation.get(presentation.key);
    // Identical visual executions lead to the least expensive actual source
    // variant. Its full specification remains available in the product sheet.
    if(!existing||Number(variant.wholesalePrice)<Number(existing.variant.wholesalePrice))byPresentation.set(presentation.key,{variant,presentation});
  });
  const selectedPresentation=variantPresentation(selected);
  return [...byPresentation.values()].map(option=>({...option,active:option.presentation.key===selectedPresentation.key}));
}

function variantChoices(product,variant,context='card'){
  if((product.variants||[]).length<2)return'';
  const options=choiceOptions(product,variant),detail=context==='detail';
  const controls=options.map((option,index)=>{
    const {variant:item,presentation,active}=option,label=choiceLabel(item,presentation),paint=swatchPaint(presentation.colors);
    if(!presentation.colors.length){
      const attributes=detail?`data-variant="${item.sourceId}"`:`data-card-variant="${item.sourceId}" data-product="${escapeAttr(product.id)}"`;
      return `<button class="variant-text ${active?'active':''}" ${attributes} title="${escapeAttr(variantLabel(item))}">${escapeHtml(variantLabel(item)||`Вариант ${index+1}`)}</button>`;
    }
    const attributes=detail?`data-variant="${item.sourceId}"`:`data-card-variant="${item.sourceId}" data-product="${escapeAttr(product.id)}"`;
    return `<button class="${detail?'variant-swatch-option':'card-swatch'} ${presentation.colors.length>1?'composite':''} ${active?'active':''}" style="--swatch:${escapeAttr(paint)}" ${attributes} title="${escapeAttr(label)}" aria-label="${escapeAttr('Выбрать: '+label)}"><span class="sr-only">${escapeHtml(label)}</span></button>`;
  }).join('');
  return detail?`<div class="variant-section variant-choice-section"><div class="variant-label"><strong>Цвет и исполнение</strong><span>${escapeHtml(choiceLabel(variant))}</span></div><div class="variant-options variant-swatch-options">${controls}</div></div>`:`<div class="card-variants" aria-label="Доступные цветовые исполнения">${controls}</div>`;
}

function priceTemplate(variant,detail=false){
  const retail=variant.retailPrice>variant.wholesalePrice?`<span class="retail-row">Розничная цена <del>${money(variant.retailPrice)}</del></span>`:'';
  return`<span class="price-stack ${detail?'detail-prices':''}"><span class="price-kind">Оптовая цена</span><strong class="${detail?'detail-price':'product-price'}">${money(variant.wholesalePrice)}</strong>${retail}</span>`;
}

function cardTemplate(product){
  let variant=axisVariant(product,currentVariant(product,product._selected));
  product._selected=variant.sourceId;
  const selectors=axisControls(product,variant,'card')||variantChoices(product,variant),sleepSize=sleepingSize(product,variant);
  return`<article class="product-card"><div class="product-visual" data-card-gallery="${escapeAttr(product.id)}" data-photo-index="0"><div class="product-image-stage" data-open="${escapeAttr(product.id)}" tabindex="0" role="button"><img src="${escapeAttr(imageUrl(variant.primaryImage))}" alt="${escapeAttr(stripModel(product.name))}" loading="lazy"></div><div class="product-visual-controls"><div class="card-photo-pager"><button class="card-photo-nav previous" data-card-photo="-1" aria-label="Предыдущее фото">‹</button><button class="card-photo-nav next" data-card-photo="1" aria-label="Следующее фото">›</button></div><button class="favorite ${state.favorites.includes(product.id)?'active':''}" data-favorite="${escapeAttr(product.id)}" aria-label="${state.favorites.includes(product.id)?'Убрать из избранного':'Добавить в избранное'}">${state.favorites.includes(product.id)?'♥':'♡'}</button></div></div><div class="product-info"><h3 class="product-name">${escapeHtml(stripModel(product.name))}</h3>${product.kindLabel?`<button class="product-type product-category-link" type="button" data-category="${escapeAttr(product.category)}" data-category-link aria-label="Показать категорию «${escapeAttr(product.category)}»">${escapeHtml(product.kindLabel)}</button>`:''}<p class="product-meta">${escapeHtml(variantLabel(variant))}</p>${sleepSize?`<p class="product-sleep-size">Спальное место: <strong>${escapeHtml(sleepSize)}</strong></p>`:''}${selectors}<div class="product-bottom">${priceTemplate(variant)}<button class="quick-add" data-add="${escapeAttr(product.id)}" data-source="${variant.sourceId}">В корзину</button></div></div></article>`;
}

function detailGallery(images,name){
  const navigation=images.length>1?`<div class="gallery-navigation"><button class="gallery-nav previous" type="button" data-gallery-photo="-1" aria-label="Предыдущее фото">‹</button><button class="gallery-nav next" type="button" data-gallery-photo="1" aria-label="Следующее фото">›</button></div>`:'';
  return`<div class="gallery" data-gallery-index="0"><div class="gallery-stage"><img class="gallery-main" id="galleryMain" src="${escapeAttr(imageUrl(images[0]))}" alt="${escapeAttr(stripModel(name))}">${navigation}<span class="sr-only" data-gallery-status aria-live="polite">Фото 1 из ${images.length}</span></div><div class="thumbnails">${images.map((src,i)=>`<button class="thumbnail ${i===0?'active':''}" type="button" data-image="${escapeAttr(imageUrl(src))}" aria-label="Показать фото ${i+1} из ${images.length}"><img src="${escapeAttr(imageUrl(src))}" alt="Фото ${i+1}"></button>`).join('')}</div></div>`;
}

function detailTemplate(product,variant){
  variant=axisVariant(product,variant);
  const images=curateGallery(product,variant),favorite=state.favorites.includes(product.id),selectors=axisControls(product,variant)||variantChoices(product,variant,'detail');
  return`<article class="detail" data-detail-id="${escapeAttr(product.id)}">${detailGallery(images,product.name)}<div class="detail-copy"><p class="eyebrow">${escapeHtml(product.category)}</p><h2>${escapeHtml(stripModel(product.name))}</h2>${priceTemplate(variant,true)}${selectors}<div class="variant-section"><div class="variant-label"><strong>Характеристики и размеры</strong><span>арт. ${variant.sourceId}</span></div><p class="specs">${escapeHtml(variant.specs)}</p></div></div><div class="detail-sticky-actions" role="group" aria-label="Действия с товаром"><button class="detail-favorite ${favorite?'active':''}" type="button" data-favorite="${escapeAttr(product.id)}" data-detail-favorite aria-pressed="${favorite}" aria-label="${favorite?'Убрать из избранного':'Добавить в избранное'}">${favorite?'♥':'♡'}</button><button class="primary-button" type="button" data-add="${escapeAttr(product.id)}" data-source="${variant.sourceId}">Добавить в корзину</button></div></article>`;
}

function auditVariantPresentation(products=state.products){
  const report={products:products.length,variants:0,withoutVisibleChoice:[],legacyHiddenChoices:0};
  products.forEach(product=>{
    const variants=product.variants||[];
    report.variants+=variants.length;
    if(variants.length<2)return;
    const model=axisModel(product),choices=choiceOptions(product,variants[0]);
    if(!model&&choices.some(choice=>!choice.presentation.colors.length))report.withoutVisibleChoice.push(product.id);
    // There is intentionally no visual limit: every distinct presentation is
    // rendered or horizontally reachable, rather than being cut off at eight.
    if(choices.length>8)report.legacyHiddenChoices+=choices.length-8;
  });
  console.info('[FORMA HOME variant audit]',report);
  window.lastVariantPresentationAudit=report;
  return report;
}

window.auditVariantPresentation=auditVariantPresentation;

document.addEventListener('click',async event=>{
  const button=event.target.closest('[data-axis]');
  if(!button)return;
  event.stopPropagation();
  const product=state.products.find(item=>item.id===button.dataset.product),match=product&&selectAxis(product,button.dataset.axis,button.dataset.axisValue);
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

function activateGalleryPhoto(gallery,index){
  const thumbnails=[...gallery.querySelectorAll('.thumbnail')];
  if(!thumbnails.length)return;
  const next=(index+thumbnails.length)%thumbnails.length,button=thumbnails[next],main=gallery.querySelector('.gallery-main');
  main.src=button.dataset.image;
  thumbnails.forEach((thumbnail,thumbnailIndex)=>thumbnail.classList.toggle('active',thumbnailIndex===next));
  gallery.dataset.galleryIndex=String(next);
  gallery.querySelector('[data-gallery-status]').textContent=`Фото ${next+1} из ${thumbnails.length}`;
}

function changeGalleryPhoto(gallery,delta){if(gallery)activateGalleryPhoto(gallery,Number(gallery.dataset.galleryIndex||0)+delta)}
document.addEventListener('click',event=>{
  const button=event.target.closest('[data-gallery-photo],.gallery .thumbnail[data-image]');
  if(!button)return;
  event.preventDefault();event.stopImmediatePropagation();
  const gallery=button.closest('.gallery');
  if(button.dataset.galleryPhoto!==undefined)changeGalleryPhoto(gallery,Number(button.dataset.galleryPhoto));
  else activateGalleryPhoto(gallery,[...gallery.querySelectorAll('.thumbnail')].indexOf(button));
},true);

document.addEventListener('click',event=>{
  const button=event.target.closest('[data-detail-favorite]');
  if(!button)return;
  event.preventDefault();event.stopImmediatePropagation();
  toggleFavorite(button.dataset.favorite);
  const favorite=state.favorites.includes(button.dataset.favorite);
  button.classList.toggle('active',favorite);
  button.setAttribute('aria-pressed',String(favorite));
  button.setAttribute('aria-label',favorite?'Убрать из избранного':'Добавить в избранное');
  button.textContent=favorite?'♥':'♡';
},true);

let detailGallerySwipe=null;
document.addEventListener('pointerdown',event=>{
  const stage=event.target.closest('.gallery-stage');
  if(!stage||event.target.closest('button'))return;
  detailGallerySwipe={stage,x:event.clientX,y:event.clientY};
},{passive:true,capture:true});
document.addEventListener('pointerup',event=>{
  if(!detailGallerySwipe)return;
  const {stage,x,y}=detailGallerySwipe,dx=event.clientX-x,dy=event.clientY-y;
  detailGallerySwipe=null;
  if(Math.abs(dx)<42||Math.abs(dx)<Math.abs(dy))return;
  event.preventDefault();event.stopImmediatePropagation();
  changeGalleryPhoto(stage.closest('.gallery'),dx<0?1:-1);
},true);

document.addEventListener('click',event=>{
  if(!event.target.closest('[data-category-link]'))return;
  requestAnimationFrame(()=>$('#catalog').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'}));
});
