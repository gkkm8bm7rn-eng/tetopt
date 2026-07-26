(()=>{
  if(typeof renderCart!=="function" || typeof openProduct!=="function")return;

  const style=document.createElement("style");
  style.textContent=`
    .cart-item[data-cart-product]{cursor:pointer;border-radius:14px;transition:background .18s ease}
    .cart-item[data-cart-product]:hover{background:rgba(93,107,79,.07)}
    .cart-item[data-cart-product]:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
    .cart-item[data-cart-product] .cart-thumb,.cart-item[data-cart-product] .cart-name{cursor:pointer}
    .cart-open-hint{display:block;margin-top:5px;font-size:11px;color:var(--accent);font-weight:700}
  `;
  document.head.appendChild(style);

  function decorateCartItems(){
    document.querySelectorAll("#cartItems .cart-item").forEach(item=>{
      const control=item.querySelector("[data-cart][data-id]");
      const id=control?.dataset.id;
      if(!id)return;
      item.dataset.cartProduct=id;
      item.tabIndex=0;
      item.setAttribute("role","button");
      item.setAttribute("aria-label","Открыть характеристики товара");
      const meta=item.querySelector(".cart-meta");
      if(meta && !item.querySelector(".cart-open-hint")){
        meta.insertAdjacentHTML("afterend",'<span class="cart-open-hint">Посмотреть характеристики</span>');
      }
    });
  }

  const originalRenderCart=renderCart;
  renderCart=function(){
    originalRenderCart();
    decorateCartItems();
  };

  function openFromCart(item){
    const id=item?.dataset.cartProduct;
    if(!id)return;
    closeAll();
    openProduct(id);
  }

  const cartItems=document.getElementById("cartItems");
  cartItems?.addEventListener("click",event=>{
    if(event.target.closest("[data-cart]"))return;
    const item=event.target.closest(".cart-item[data-cart-product]");
    if(item)openFromCart(item);
  });

  cartItems?.addEventListener("keydown",event=>{
    if(event.target.closest("[data-cart]"))return;
    if(event.key!=="Enter" && event.key!==" ")return;
    const item=event.target.closest(".cart-item[data-cart-product]");
    if(!item)return;
    event.preventDefault();
    openFromCart(item);
  });

  decorateCartItems();
})();