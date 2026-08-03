(()=>{
  document.addEventListener("click",event=>{
    const visual=event.target.closest?.("#grid .visual");
    if(!visual)return;
    if(event.target.closest("button, [data-card-photo], .favorite-btn, [data-favorite]"))return;

    const card=visual.closest("[data-product]");
    if(!card)return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    card.dispatchEvent(new MouseEvent("click",{
      bubbles:true,
      cancelable:true,
      view:window
    }));
  },true);
})();
