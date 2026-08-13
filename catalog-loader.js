(async()=>{
  try{
    const version=Date.now();
    const assetVersion="20260802-corrected-deferred-batch-28";
    const withAssetVersion=url=>{
      if(typeof url!=="string"||!url||!/^assets\//i.test(url))return url;
      const hashIndex=url.indexOf("#");
      const hash=hashIndex>=0?url.slice(hashIndex):"";
      const base=hashIndex>=0?url.slice(0,hashIndex):url;
      const clean=base.replace(/([?&])v=[^&#]*/g,"$1").replace(/[?&]$/," ").trim();
      return `${clean}${clean.includes("?")?"&":"?"}v=${assetVersion}${hash}`;
    };

    const catalogResponse=await fetch(`catalog-source.html?v=${version}`,{cache:"no-store"});
    if(!catalogResponse.ok)throw new Error(`Catalog HTTP ${catalogResponse.status}`);
    let html=await catalogResponse.text();

    let hiddenConfig={ids:[]};
    try{
      const hiddenResponse=await fetch(`hidden-products.json?v=${version}`,{cache:"no-store"});
      if(hiddenResponse.ok)hiddenConfig=await hiddenResponse.json();
    }catch(error){
      console.warn("FORMA HOME: список скрытых товаров временно недоступен",error);
    }
    const hiddenIds=new Set((hiddenConfig.ids||[]).map(Number).filter(Number.isFinite));

    function readConstArray(name){
      const marker=`    const ${name} = `;
      const start=html.indexOf(marker);
      if(start<0)throw new Error(`Не найден массив ${name}`);
      const valueStart=start+marker.length;
      const end=html.indexOf(';\n',valueStart);
      if(end<0)throw new Error(`Не найден конец массива ${name}`);
      return JSON.parse(html.slice(valueStart,end));
    }
    function writeConstArray(name,value){
      const marker=`    const ${name} = `;
      const start=html.indexOf(marker);
      if(start<0)throw new Error(`Не найден массив ${name}`);
      const valueStart=start+marker.length;
      const end=html.indexOf(';\n',valueStart);
      if(end<0)throw new Error(`Не найден конец массива ${name}`);
      html=html.slice(0,valueStart)+JSON.stringify(value)+html.slice(end);
    }

    const verifiedInteriorImages=new Map([]);
    const isInteriorImage=image=>typeof image==="string"&&/^assets\/interiors\/\d+\.(?:svg|webp|png|jpe?g)(?:\?.*)?$/i.test(image);
    const priorityProductIds=[493,896,189,136,70,1477,33,656,843,1182];
    const priorityOrder=new Map(priorityProductIds.map((id,index)=>[id,index]));
    const categoryBaseScore=new Map([["Кресла и стулья",34],["Столы",32],["Хранение",30],["Диваны",28],["Комплекты",25],["Декор",19],["Вешалки",17],["Спальня",16],["Ротанг",14],["Другое",11],["Комплектующие",7]]);

    function productSearchText(product){return `${product.name||""} ${product.specs||""} ${product.collection||""} ${product.category||""}`.toLowerCase().replace(/ё/g,"е")}
    function commercialScore(product){
      const text=productSearchText(product);let score=categoryBaseScore.get(product.category)||10;
      const signals=[["букле",18],["фактурн",8],["велюр",7],["вельвет",6],["ротанг",6],["керамик",8],["массив",5],["дерево",3],["металл",2],["раздвиж",15],["расклад",13],["трансформ",12],["углов",8],["этажерк",10],["стеллаж",9],["комод",7],["обувниц",9],["банкетк",8],["полубарн",10],["барный стул",8],["комплект",7],["набор столик",7],["журнальн",8],["лаунж",9],["пуф",6],["кресло",6],["стул",4],["стол",4],["бежев",6],["серый",4],["натуральн",5],["черный",4],["оливков",4],["горчич",4],["мрамор",7]];
      signals.forEach(([signal,points])=>{if(text.includes(signal))score+=points});
      if(text.includes("2 шт. в упаковке")||text.includes("2шт.в упаковке")||text.includes("4шт. в упаковке"))score+=5;
      if(text.includes("1 шт. в упаковке")||text.includes("1шт.в упаковке"))score+=2;
      const wholesale=Number(product.wholesalePrice||0);
      if(wholesale>=2500&&wholesale<=12000)score+=18;else if(wholesale>12000&&wholesale<=25000)score+=12;else if(wholesale>=1200&&wholesale<2500)score+=10;else if(wholesale>25000&&wholesale<=45000)score+=4;else if(wholesale>100000)score-=30;else if(wholesale>60000)score-=18;else if(wholesale>45000)score-=8;else if(wholesale>0&&wholesale<1200)score+=3;else score-=8;
      const retail=Number(product.retailPrice||0);if(wholesale&&retail){const ratio=retail/wholesale;if(ratio>=1.48)score+=6;else if(ratio>=1.38)score+=4;else if(ratio>=1.28)score+=2}
      [["подстолье",-12],["матрас для",-10],["надстройка",-12],["комплектующие",-8],["шкафы для книг (набор 3",-18],["300-350-400",-22],["кровать",-6],["стол туалетный",-4]].forEach(([signal,points])=>{if(text.includes(signal))score+=points});
      const images=Array.isArray(product.images)?product.images.filter(Boolean):[];score+=Math.min(images.length,3)*2;if(product.directImage)score+=2;return score;
    }
    function productFamilyKey(product){return String(product.name||"").toLowerCase().replace(/ё/g,"е").replace(/\/\s*\d+\s*шт\.?\s*в упаковке/gi,"").replace(/\(\d+\s*шт\.?\s*в упаковке\)/gi,"").replace(/\([^)]*мод\.[^)]*\)/gi,"").replace(/\s+/g," ").trim().replace(/[ /]+$/g,"")}
    function rankVisibleProducts(products){
      const pinned=products.filter(product=>priorityOrder.has(Number(product.id))).sort((a,b)=>priorityOrder.get(Number(a.id))-priorityOrder.get(Number(b.id)));
      const regular=products.filter(product=>!priorityOrder.has(Number(product.id))).map((product,index)=>({product,index,baseScore:commercialScore(product),adjustedScore:0}));
      regular.sort((a,b)=>b.baseScore-a.baseScore||a.index-b.index);
      const familyCounts=new Map(),categoryCounts=new Map();
      pinned.forEach(product=>{const family=productFamilyKey(product);familyCounts.set(family,(familyCounts.get(family)||0)+1);categoryCounts.set(product.category,(categoryCounts.get(product.category)||0)+1)});
      regular.forEach(entry=>{const family=productFamilyKey(entry.product),familyPosition=familyCounts.get(family)||0;familyCounts.set(family,familyPosition+1);const category=entry.product.category||"",categoryPosition=categoryCounts.get(category)||0;categoryCounts.set(category,categoryPosition+1);entry.adjustedScore=entry.baseScore-familyPosition*16-Math.floor(categoryPosition/6)*3});
      regular.sort((a,b)=>b.adjustedScore-a.adjustedScore||b.baseScore-a.baseScore||a.index-b.index);return [...pinned,...regular.map(entry=>entry.product)];
    }

    const products=readConstArray("PRODUCTS").map(product=>{
      const currentImages=Array.isArray(product.images)?product.images.filter(Boolean):[];
      const productPhotos=currentImages.filter(image=>!isInteriorImage(image));
      if(!productPhotos.length&&product.directImage&&!isInteriorImage(product.directImage))productPhotos.push(product.directImage);
      const interiorImage=verifiedInteriorImages.get(Number(product.id));
      const images=[...new Set([...productPhotos,...(interiorImage?[interiorImage]:[])])].map(withAssetVersion);
      return {...product,images,directImage:images[0]||withAssetVersion(product.directImage)||null};
    });
    const visibleProducts=rankVisibleProducts(products.filter(product=>!hiddenIds.has(Number(product.id))));
    writeConstArray("PRODUCTS",visibleProducts);
    const visibleCollections=new Set(visibleProducts.map(product=>product.collection));
    const visibleCategories=new Set(visibleProducts.map(product=>product.category));
    writeConstArray("COLLECTIONS",readConstArray("COLLECTIONS").filter(name=>visibleCollections.has(name)));
    writeConstArray("CATEGORIES",readConstArray("CATEGORIES").filter(name=>visibleCategories.has(name)));

    html=html.replace('const IMAGE_CACHE_KEY = "formaResolvedPhotosV3";','const IMAGE_CACHE_KEY = "formaResolvedPhotosV8";');
    html=html.replace('const GALLERY_CACHE_KEY = "formaProductGalleriesV1";','const GALLERY_CACHE_KEY = "formaProductGalleriesV6";');
    const formatCount=value=>new Intl.NumberFormat("ru-RU").format(value);
    html=html.replace(/(<div class="stat-card"><div class="stat-number">)[\d\s]+(<\/div><div class="stat-label">товара в каталоге<\/div><\/div>)/,`$1${formatCount(visibleProducts.length)}$2`);
    html=html.replace(/(<div class="stat-card dark"><div class="stat-number">)[\d\s]+(<\/div><div class="stat-label">коллекций мебели<\/div><\/div>)/,`$1${formatCount(visibleCollections.size)}$2`);
    html=html.replace(/\s*<div class="collection-tag">\$\{esc\(p\.collection\)\}<\/div>/g,"");
    html=html.replace("</style>",".collection-tag{display:none!important}</style>");
    if(!html.includes('mobile-two-column-catalog.css'))html=html.replace('</head>','<link rel="stylesheet" href="mobile-two-column-catalog.css?v=3"></head>');

    // Critical Safari change: render the real catalog first. Enhancements are
    // ordinary bottom-of-body scripts, so a failed optional module can no longer
    // prevent catalog-loader.js from opening the catalog.
    const enhancementScripts=[
      'checkout.js?v=2','checkout-contacts.js?v=2','hero-actions.js?v=1','sticky-header-hero-redesign.js?v=8','hero-banner-final.js?v=7',
      'mobile-next-page-card.js?v=2','conversion-ui-upgrade.js?v=1','mobile-modal-header-clearance.js?v=1','smooth-interactions.js?v=2','adaptive-product-ui.js?v=2','responsive-product-modal.js?v=2','catalog-scroll-touch-fix.js?v=4','catalog-type-filter.js?v=4','fixed-site-header.js?v=2','adaptive-catalog-search.js?v=3','gallery-swipe-wheel-fix.js?v=3','catalog-image-click-behavior.js?v=4','product-duplicate-hider.js?v=4','product-dual-variant-selector.js?v=1','product-explicit-text-variants.js?v=1','product-explicit-variant-selector.js?v=1','product-mattress-variant-labels.js?v=4','rainbow-lime-swatch-fix.js?v=2','product-color-swatches.js?v=7','product-auto-groups.js?v=7','product-variant-audit-part1.js?v=1','product-variant-audit-part2.js?v=1','package-duplicate-rule.js?v=4','duplicate-group-conflict-guard.js?v=1','product-dual-variant-groups.js?v=2','product-explicit-variant-groups.js?v=3','product-color-groups-obvious.js?v=7','product-color-groups.js?v=7','catalog-global-name-groups.js?v=1','catalog-group-finalizer.js?v=1','functional-pagination-fix.js?v=3','pagination-render-fix.js?v=1','initial-image-fix.js?v=1','mobile-pagination-hotfix.js?v=1','favorites.js?v=1','recommendation-integrity.js?v=1','cart-recommendations.js?v=1','sales-journey.js?v=2','recently-viewed.js?v=2','catalog-pagination.js?v=4'
    ];
    const scripts=enhancementScripts.map(src=>`<script src="${src}"><\/script>`).join('');
    html=html.replace('</body>',scripts+'</body>');

    document.open();document.write(html);document.close();
    setTimeout(()=>window.dispatchEvent(new CustomEvent('forma:catalog-ready')),0);
  }catch(error){
    document.body.innerHTML='<div style="max-width:760px;margin:80px auto;padding:24px;font:16px system-ui"><strong>FORMA HOME</strong><p>Не удалось открыть каталог. Обновите страницу.</p></div>';
    console.error('FORMA HOME catalog boot failed',error);
  }
})();