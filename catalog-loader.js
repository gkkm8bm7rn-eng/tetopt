(async()=>{
  try{
    const response=await fetch(`catalog-source.html?v=${Date.now()}`,{cache:"no-store"});
    if(!response.ok)throw new Error(`HTTP ${response.status}`);
    let html=await response.text();

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
