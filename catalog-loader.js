(async()=>{
  try{
    const response=await fetch(`catalog-source.html?v=${Date.now()}`,{cache:"no-store"});
    if(!response.ok)throw new Error(`HTTP ${response.status}`);
    let html=await response.text();

    const placeholderFooter=`      <div><div class="logo">FORMA <span>HOME</span></div><p>Демонстрационная версия интернет-магазина на основе загруженного каталога товаров.</p></div>
      <div id="delivery"><h4>Покупателям</h4><p><a href="#">Доставка и оплата</a><br><a href="#">Гарантия и возврат</a><br><a href="#">Политика конфиденциальности</a></p></div>
      <div id="contacts"><h4>Контакты</h4><p>Телефон: +7 (___) ___-__-__<br>E-mail: hello@example.ru<br>Ежедневно, 10:00–20:00</p></div>`;

    const realFooter=`      <div><div class="logo">FORMA <span>HOME</span></div><p>Мебель и предметы интерьера. Оптовые цены, удобный подбор и оформление заказа онлайн.</p></div>
      <div id="delivery"><h4>Покупателям</h4><p><a href="#catalog">Перейти в каталог</a><br><a href="#contacts">Связаться с нами</a></p></div>
      <div id="contacts"><h4>Контакты</h4><p>Телефон: <a href="tel:+79057267946">+7 (905) 726-79-46</a><br><a href="https://wa.me/79057267946" target="_blank" rel="noopener">WhatsApp</a> · <a href="https://t.me/+79057267946" target="_blank" rel="noopener">Telegram</a><br>E-mail: <a href="mailto:postes@mail.ru">postes@mail.ru</a><br>Ежедневно, 10:00–20:00</p></div>`;

    html=html.replace(placeholderFooter,realFooter);
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
