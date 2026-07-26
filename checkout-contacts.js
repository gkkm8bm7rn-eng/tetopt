(()=>{
  const STORE_PHONE="79057267946";
  const STORE_PHONE_DISPLAY="+7 (905) 726-79-46";
  const STORE_EMAIL="postes@mail.ru";

  if(!document.querySelector('script[data-advanced-filters]')){
    const filtersScript=document.createElement("script");
    filtersScript.src="advanced-filters.js?v=1";
    filtersScript.dataset.advancedFilters="1";
    document.body.appendChild(filtersScript);
  }

  if(!document.querySelector('script[data-cart-product-links]')){
    const cartLinksScript=document.createElement("script");
    cartLinksScript.src="cart-product-links.js?v=1";
    cartLinksScript.dataset.cartProductLinks="1";
    document.body.appendChild(cartLinksScript);
  }

  const contacts=document.querySelector("#contacts p");
  if(contacts){
    contacts.innerHTML=`Телефон: <a href="tel:+${STORE_PHONE}">${STORE_PHONE_DISPLAY}</a><br><a href="https://wa.me/${STORE_PHONE}" target="_blank" rel="noopener">WhatsApp</a> · <a href="https://t.me/+${STORE_PHONE}" target="_blank" rel="noopener">Telegram</a><br>E-mail: <a href="mailto:${STORE_EMAIL}">${STORE_EMAIL}</a><br>Ежедневно, 10:00–20:00`;
  }

  const overlay=document.getElementById("checkoutOverlay");
  if(!overlay)return;

  const actions=overlay.querySelector(".checkout-actions");
  if(actions && !actions.querySelector('[data-checkout-send="email"]')){
    const emailButton=document.createElement("button");
    emailButton.type="button";
    emailButton.className="checkout-action checkout-email";
    emailButton.dataset.checkoutSend="email";
    emailButton.textContent="Отправить по e-mail";
    emailButton.style.cssText="grid-column:1/-1;background:#6b5d91;color:#fff";
    const copyButton=actions.querySelector('[data-checkout-send="copy"]');
    actions.insertBefore(emailButton,copyButton||null);
  }

  const note=overlay.querySelector(".checkout-note");
  if(note)note.textContent=`Заказ будет адресован магазину: ${STORE_PHONE_DISPLAY} или ${STORE_EMAIL}.`;

  function entries(){
    try{
      return Object.entries(cart).map(([id,qty])=>({p:productById(id),qty:Number(qty)||0})).filter(x=>x.p&&x.qty>0);
    }catch{return []}
  }

  function customer(){
    return {
      name:overlay.querySelector("#checkoutName")?.value.trim()||"",
      phone:overlay.querySelector("#checkoutPhone")?.value.trim()||"",
      city:overlay.querySelector("#checkoutCity")?.value.trim()||"",
      comment:overlay.querySelector("#checkoutComment")?.value.trim()||""
    };
  }

  function error(message,selector){
    const box=overlay.querySelector("#checkoutError");
    if(box)box.textContent=message;
    overlay.querySelector(selector)?.focus();
  }

  function validate(){
    const data=customer();
    if(!data.name){error("Укажите имя.","#checkoutName");return null}
    if(data.phone.replace(/\D/g,"").length<7){error("Укажите корректный телефон.","#checkoutPhone");return null}
    if(!data.city){error("Укажите город доставки.","#checkoutCity");return null}
    if(!entries().length){error("Корзина пуста.","#checkoutName");return null}
    const box=overlay.querySelector("#checkoutError");
    if(box)box.textContent="";
    return data;
  }

  function productUrl(id){
    const url=new URL(location.href);
    url.searchParams.set("product",String(id));
    return url.toString();
  }

  function orderText(data){
    const items=entries();
    const total=items.reduce((sum,{p,qty})=>sum+sellingPrice(p)*qty,0);
    return [
      "Здравствуйте! Хочу оформить заказ в FORMA HOME:",
      "",
      ...items.map(({p,qty},i)=>`${i+1}. ${p.name}\n${qty} шт. × ${formatPrice(sellingPrice(p))} = ${formatPrice(sellingPrice(p)*qty)}\n${productUrl(p.id)}`),
      "",
      `Итого: ${formatPrice(total)}`,
      "",
      `Имя: ${data.name}`,
      `Телефон: ${data.phone}`,
      `Город: ${data.city}`,
      data.comment?`Комментарий: ${data.comment}`:""
    ].filter(Boolean).join("\n");
  }

  overlay.addEventListener("click",event=>{
    const button=event.target.closest("[data-checkout-send]");
    if(!button)return;
    const channel=button.dataset.checkoutSend;
    if(!["whatsapp","telegram","email"].includes(channel))return;

    event.preventDefault();
    event.stopImmediatePropagation();

    const data=validate();
    if(!data)return;
    const text=orderText(data);

    if(channel==="whatsapp"){
      window.open(`https://wa.me/${STORE_PHONE}?text=${encodeURIComponent(text)}`,"_blank","noopener");
      showToast("Открываем WhatsApp");
      return;
    }

    if(channel==="telegram"){
      window.open(`https://t.me/+${STORE_PHONE}?text=${encodeURIComponent(text)}`,"_blank","noopener");
      showToast("Открываем Telegram");
      return;
    }

    const subject="Заказ с сайта FORMA HOME";
    location.href=`mailto:${STORE_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`;
    showToast("Открываем почту");
  },true);
})();