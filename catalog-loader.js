(async()=>{
  try{
    const version=Date.now();
    const assetVersion="20260731-0759-b04-manzana-exact";
    const withAssetVersion=url=>{
      if(typeof url!=="string" || !url || !/^assets\//i.test(url))return url;
      const hashIndex=url.indexOf("#");
      const hash=hashIndex>=0?url.slice(hashIndex):"";
      const base=hashIndex>=0?url.slice(0,hashIndex):url;
      const clean=base.replace(/([?&])v=[^&#]*/g,"$1").replace(/[?&]$/," ").trim();
      return `${clean}${clean.includes("?")?"&":"?"}v=${assetVersion}${hash}`;
    };
    const [catalogResponse,hiddenResponse]=await Promise.all([
      fetch(`catalog-source.html?v=${version}`,{cache:"no-store"}),
      fetch(`hidden-products.json?v=${version}`,{cache:"no-store"})
    ]);
    if(!catalogResponse.ok)throw new Error(`Catalog HTTP ${catalogResponse.status}`);
    if(!hiddenResponse.ok)throw new Error(`Hidden products HTTP ${hiddenResponse.status}`);

    let html=await catalogResponse.text();
    const hiddenConfig=await hiddenResponse.json();
    const hiddenIds=new Set((hiddenConfig.ids||[]).map(Number).filter(Number.isFinite));

    function readConstArray(name){
      const marker=`    const ${name} = `;
      const start=html.indexOf(marker);
      const valueStart=start+marker.length;
      const end=html.indexOf(';\n',valueStart);
      if(start<0||end<0)throw new Error(`Не найден массив ${name}`);
      return JSON.parse(html.slice(valueStart,end));
    }

    function writeConstArray(name,value){
      const marker=`    const ${name} = `;
      const start=html.indexOf(marker);
      const valueStart=start+marker.length;
      const end=html.indexOf(';\n',valueStart);
      if(start<0||end<0)throw new Error(`Не найден массив ${name}`);
      html=html.slice(0,valueStart)+JSON.stringify(value)+html.slice(end);
    }

    // Сюда попадают только интерьерные визуализации, вручную сверенные с точной моделью.
    const verifiedInteriorImages=new Map([]);
    const isInteriorImage=image=>typeof image==="string"&&/^assets\/interiors\/\d+\.(?:svg|webp|png|jpe?g)(?:\?.*)?$/i.test(image);

    const products=readConstArray("PRODUCTS").map(product=>{
      const currentImages=Array.isArray(product.images)?product.images.filter(Boolean):[];
      // Порядок в product.images меняется только после завершения всей партии и двойной проверки сайта.
      const productPhotos=currentImages.filter(image=>!isInteriorImage(image));
      if(!productPhotos.length && product.directImage && !isInteriorImage(product.directImage))productPhotos.push(product.directImage);
      const interiorImage=verifiedInteriorImages.get(Number(product.id));
      const images=[...new Set([...productPhotos,...(interiorImage?[interiorImage]:[])])].map(withAssetVersion);
      return {
        ...product,
        images,
        directImage:images[0]||withAssetVersion(product.directImage)||null
      };
    });
    const visibleProducts=products.filter(product=>!hiddenIds.has(Number(product.id)));
    const matchedHiddenCount=products.length-visibleProducts.length;
    if(matchedHiddenCount!==hiddenIds.size){
      console.warn(`Скрыто ${matchedHiddenCount} из ${hiddenIds.size} указанных товаров`);
    }
    writeConstArray("PRODUCTS",visibleProducts);

    const visibleCollections=new Set(visibleProducts.map(product=>product.collection));
    const visibleCategories=new Set(visibleProducts.map(product=>product.category));
    writeConstArray("COLLECTIONS",readConstArray("COLLECTIONS").filter(name=>visibleCollections.has(name)));
    writeConstArray("CATEGORIES",readConstArray("CATEGORIES").filter(name=>visibleCategories.has(name)));

    html=html.replace('const IMAGE_CACHE_KEY = "formaResolvedPhotosV3";','const IMAGE_CACHE_KEY = "formaResolvedPhotosV8";');
    html=html.replace('const GALLERY_CACHE_KEY = "formaProductGalleriesV1";','const GALLERY_CACHE_KEY = "formaProductGalleriesV6";');

    const formatCount=value=>new Intl.NumberFormat("ru-RU").format(value);
    html=html.replace(
      /(<div class="stat-card"><div class="stat-number">)[\d\s]+(<\/div><div class="stat-label">товара в каталоге<\/div><\/div>)/,
      `$1${formatCount(visibleProducts.length)}$2`
    );
    html=html.replace(
      /(<div class="stat-card dark"><div class="stat-number">)[\d\s]+(<\/div><div class="stat-label">коллекций мебели<\/div><\/div>)/,
      `$1${formatCount(visibleCollections.size)}$2`
    );

    html=html.replace(/\s*<div class="collection-tag">\$\{esc\(p\.collection\)\}<\/div>/g,"");
    html=html.replace("</style>",".collection-tag{display:none!important}</style>");
    html=html.replace(
      '</body>',
      '<script src="checkout.js?v=2"></script><script src="checkout-contacts.js?v=2"></script><script src="hero-actions.js?v=1"></script></body>'
    );
    document.open();
    document.write(html);
    document.close();
  }catch(error){
    document.body.innerHTML='<div class="boot"><div><strong>FORMA HOME</strong><span>Не удалось открыть каталог. Обновите страницу.</span></div></div>';
    console.error(error);
  }
})();
