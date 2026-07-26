(()=>{
  const DRAFT_KEY="formaCheckoutDraftV1";
  const ORDER_LOG_KEY="formaCheckoutHistoryV1";

  const style=document.createElement("style");
  style.textContent=`
    .checkout-overlay{position:fixed;inset:0;background:rgba(20,19,17,.52);backdrop-filter:blur(5px);z-index:120;display:none;align-items:center;justify-content:center;padding:18px}
    .checkout-overlay.show{display:flex}
    .checkout-panel{width:min(560px,100%);max-height:min(760px,calc(100vh - 36px));overflow:auto;background:var(--surface,#fff);border-radius:24px;box-shadow:0 28px 90px rgba(0,0,0,.24);padding:24px}
    .checkout-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:18px}
    .checkout-head h2{font-family:Georgia,serif;font-size:30px;font-weight:500;margin:0}
    .checkout-head p{margin:7px 0 0;color:var(--muted,#706d65);font-size:13px;line-height:1.45}
    .checkout-close{width:40px;height:40px;border:0;border-radius:50%;background:var(--surface-2,#eee9df);font-size:24px;line-height:1}
    .checkout-summary{background:var(--surface-2,#eee9df);border-radius:16px;padding:14px 16px;margin-bottom:16px;font-size:13px;line-height:1.5}
    .checkout-summary strong{display:block;font-size:15px;margin-bottom:4px}
    .checkout-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
    .checkout-field{display:flex;flex-direction:column;gap:6px}
    .checkout-field.full{grid-column:1/-1}
    .checkout-field label{font-size:12px;font-weight:700;color:var(--muted,#706d65)}
    .checkout-field input,.checkout-field textarea{width:100%;border:1px solid var(--line,#ded8cc);border-radius:14px;background:#fff;color:var(--ink,#201f1b);padding:13px 14px;font:inherit;outline:none}
    .checkout-field textarea{min-height:92px;resize:vertical}
    .checkout-field input:focus,.checkout-field textarea:focus{border-color:var(--accent,#5d6b4f);box-shadow:0 0 0 3px rgba(93,107,79,.12)}
    .checkout-error{min-height:20px;margin:10px 0 0;color:var(--danger,#a34036);font-size:12px}
    .checkout-actions{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:4px}
    .checkout-action{border:0;border-radius:999px;padding:14px 16px;font-weight:800;font:inherit;cursor:pointer}
    .checkout-whatsapp{background:#1f9d55;color:#fff}
    .checkout-telegram{background:#2381cc;color:#fff}
    .checkout-copy{grid-column:1/-1;background:var(--ink,#201f1b);color:#fff}
    .checkout-note{margin:13px 0 0;color:var(--muted,#706d65);font-size:11px;line-height:1.45;text-align:center}
    @media(max-width:620px){.checkout-panel{padding:20px;border-radius:20px}.checkout-grid,.checkout-actions{grid-template-columns:1fr}.checkout-field.full,.checkout-copy{grid-column:auto}}
  `;
  document.head.appendChild(style);

  const oldButton=document.getElementById("copyOrder");
  if(!oldButton)return;
  const checkoutButton=oldButton.cloneNode(true);
  checkoutButton.id="checkoutOrder";
  checkoutButton.textContent="Оформить заказ";
  oldButton.replaceWith(checkoutButton);

  const oldNote=document.querySelector(".checkout-note");
  if(oldNote)oldNote.textContent="Заполните контакты и отправьте готовый заказ через удобный мессенджер.";

  const overlay=document.createElement("div");
  overlay.className="checkout-overlay";
  overlay.id="checkoutOverlay";
  overlay.innerHTML=`
    <section class="checkout-panel" role="dialog" aria-modal="true" aria-labelledby="checkoutTitle">
      <div class="checkout-head">
        <div><h2 id="checkoutTitle">Оформление заказа</h2><p>Проверьте контактные данные — товары, количество и сумма добавятся автоматически.</p></div>
        <button type="button" class="checkout-close" aria-label="Закрыть">×</button>
      </div>
      <div class="checkout-summary" id="checkoutSummary"></div>
      <form id="checkoutForm" novalidate>
        <div class="checkout-grid">
          <div class="checkout-field"><label for="checkoutName">Имя *</label><input id="checkoutName" name="name" autocomplete="name" required></div>
          <div class="checkout-field"><label for="checkoutPhone">Телефон *</label><input id="checkoutPhone" name="phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="+7 ___ ___-__-__" required></div>
          <div class="checkout-field full"><label for="checkoutCity">Город *</label><input id="checkoutCity" name="city" autocomplete="address-level2" required></div>
          <div class="checkout-field full"><label for="checkoutComment">Комментарий</label><textarea id="checkoutComment" name="comment" placeholder="Удобное время для связи, вопросы по доставке или наличие"></textarea></div>
        </div>
        <div class="checkout-error" id="checkoutError" aria-live="polite"></div>
        <div class="checkout-actions">
          <button type="button" class="checkout-action checkout-whatsapp" data-checkout-send="whatsapp">Отправить в WhatsApp</button>
          <button type="button" class="checkout-action checkout-telegram" data-checkout-send="telegram">Отправить в Telegram</button>
          <button type="button" class="checkout-action checkout-copy" data-checkout-send="copy">Скопировать заказ</button>
        </div>
        <p class="checkout-note">Мессенджер откроется с готовым текстом. До привязки контакта магазина выберите получателя вручную.</p>
      </form>
    </section>`;
  document.body.appendChild(overlay);

  const form=overlay.querySelector("#checkoutForm");
  const summary=overlay.querySelector("#checkoutSummary");
  const errorBox=overlay.querySelector("#checkoutError");
  const fields={
    name:overlay.querySelector("#checkoutName"),
    phone:overlay.querySelector("#checkoutPhone"),
    city:overlay.querySelector("#checkoutCity"),
    comment:overlay.querySelector("#checkoutComment")
  };

  function cartEntries(){
    try{
      return Object.entries(cart).map(([id,qty])=>({p:productById(id),qty:Number(qty)||0})).filter(x=>x.p&&x.qty>0);
    }catch{return []}
  }

  function cartTotal(entries=cartEntries()){
    return entries.reduce((sum,{p,qty})=>sum+sellingPrice(p)*qty,0);
  }

  function productLink(id){
    const url=new URL(location.href);
    url.searchParams.set("product",String(id));
    return url.toString();
  }

  function formData(){
    return Object.fromEntries(Object.entries(fields).map(([key,input])=>[key,input.value.trim()]));
  }

  function saveDraft(){
    try{localStorage.setItem(DRAFT_KEY,JSON.stringify(formData()))}catch{}
  }

  function restoreDraft(){
    try{
      const saved=JSON.parse(localStorage.getItem(DRAFT_KEY)||"{}");
      Object.entries(fields).forEach(([key,input])=>{if(saved[key])input.value=saved[key]});
    }catch{}
  }

  function validate(){
    const data=formData();
    const digits=data.phone.replace(/\D/g,"");
    if(!data.name){errorBox.textContent="Укажите имя.";fields.name.focus();return null}
    if(digits.length<7){errorBox.textContent="Укажите корректный телефон.";fields.phone.focus();return null}
    if(!data.city){errorBox.textContent="Укажите город доставки.";fields.city.focus();return null}
    if(!cartEntries().length){errorBox.textContent="Корзина пуста.";return null}
    errorBox.textContent="";
    saveDraft();
    return data;
  }

  function orderText(data){
    const entries=cartEntries();
    const lines=[
      "Здравствуйте! Хочу оформить заказ в FORMA HOME:",
      "",
      ...entries.map(({p,qty},index)=>`${index+1}. ${p.name}\n${qty} шт. × ${formatPrice(sellingPrice(p))} = ${formatPrice(sellingPrice(p)*qty)}\n${productLink(p.id)}`),
      "",
      `Итого: ${formatPrice(cartTotal(entries))}`,
      "",
      `Имя: ${data.name}`,
      `Телефон: ${data.phone}`,
      `Город: ${data.city}`,
      data.comment?`Комментарий: ${data.comment}`:""
    ].filter(Boolean);
    return lines.join("\n");
  }

  function recordOrder(channel,text){
    try{
      const history=JSON.parse(localStorage.getItem(ORDER_LOG_KEY)||"[]");
      history.unshift({date:new Date().toISOString(),channel,text});
      localStorage.setItem(ORDER_LOG_KEY,JSON.stringify(history.slice(0,20)));
    }catch{}
  }

  function openCheckout(){
    const entries=cartEntries();
    if(!entries.length){showToast("Корзина пуста");return}
    summary.innerHTML=`<strong>${entries.length} ${entries.length===1?"позиция":"позиций"} · ${formatPrice(cartTotal(entries))}</strong>Количество товаров: ${entries.reduce((sum,x)=>sum+x.qty,0)}`;
    errorBox.textContent="";
    overlay.classList.add("show");
    document.body.style.overflow="hidden";
    setTimeout(()=>fields.name.focus(),50);
  }

  function closeCheckout(){
    overlay.classList.remove("show");
    document.body.style.overflow="";
    saveDraft();
  }

  async function copyText(text){
    try{await navigator.clipboard.writeText(text)}catch{
      const area=document.createElement("textarea");
      area.value=text;area.style.position="fixed";area.style.opacity="0";
      document.body.appendChild(area);area.select();document.execCommand("copy");area.remove();
    }
  }

  async function send(channel){
    const data=validate();
    if(!data)return;
    const text=orderText(data);
    recordOrder(channel,text);
    if(channel==="whatsapp"){
      window.open(`https://wa.me/?text=${encodeURIComponent(text)}`,"_blank","noopener");
      showToast("Заказ подготовлен в WhatsApp");
      return;
    }
    if(channel==="telegram"){
      const base=new URL(location.href);base.searchParams.delete("product");
      window.open(`https://t.me/share/url?url=${encodeURIComponent(base.toString())}&text=${encodeURIComponent(text)}`,"_blank","noopener");
      showToast("Заказ подготовлен в Telegram");
      return;
    }
    await copyText(text);
    showToast("Заказ скопирован");
  }

  restoreDraft();
  Object.values(fields).forEach(input=>input.addEventListener("input",saveDraft));
  checkoutButton.addEventListener("click",openCheckout);
  overlay.querySelector(".checkout-close").addEventListener("click",closeCheckout);
  overlay.addEventListener("click",event=>{if(event.target===overlay)closeCheckout()});
  overlay.addEventListener("click",event=>{
    const button=event.target.closest("[data-checkout-send]");
    if(button)send(button.dataset.checkoutSend);
  });
  form.addEventListener("submit",event=>{event.preventDefault();send("whatsapp")});
  document.addEventListener("keydown",event=>{if(event.key==="Escape"&&overlay.classList.contains("show"))closeCheckout()});
})();
