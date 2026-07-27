(async()=>{
  try{
    const version=Date.now();
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

    const products=readConstArray("PRODUCTS");
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

    const formatCount=value=>new Intl.NumberFormat("ru-RU").format(value);
    html=html.replace(
      /(<div class="stat-card"><div class="stat-number">)[\d\s]+(<\/div><div class="stat-label">товара в каталоге<\/div><\/div>)/,
      `$1${formatCount(visibleProducts.length)}$2`
    );
    html=html.replace(
      /(<div class="stat-card dark"><div class="stat-number">)[\d\s]+(<\/div><div class="stat-label">коллекций мебели<\/div><\/div>)/,
      `$1${formatCount(visibleCollections.size)}$2`
    );

    html=html.replace(
      '</body>',
      '<script src="checkout.js?v=2"></script><script src="checkout-contacts.js?v=2"></script></body>'
    );
    document.open();
    document.write(html);
    document.close();
  }catch(error){
    document.body.innerHTML='<div class="boot"><div><strong>FORMA HOME</strong><span>Не удалось открыть каталог. Обновите страницу.</span></div></div>';
    console.error(error);
  }
})();