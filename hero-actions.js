(()=>{
  const style=document.createElement("style");
  style.textContent=`
    .hero-main::after{pointer-events:none}
    .hero-main>*{position:relative;z-index:1}
    #catalog,.results-line{scroll-margin-top:88px}
    .quick-contact-overlay{position:fixed;inset:0;z-index:150;background:rgba(20,19,17,.52);backdrop-filter:blur(5px);display:none;align-items:flex-end;justify-content:center;padding:16px}
    .quick-contact-overlay.show{display:flex}
    .quick-contact-panel{width:min(520px,100%);background:var(--surface,#fff);border-radius:24px;padding:22px;box-shadow:0 28px 90px rgba(0,0,0,.25)}
    .quick-contact-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:16px}
    .quick-contact-head h2{font-family:Georgia,serif;font-size:28px;font-weight:500;margin:0}
    .quick-contact-head p{margin:7px 0 0;color:var(--muted,#706d65);font-size:13px;line-height:1.45}
    .quick-contact-close{width:40px;height:40px;flex:0 0 40px;border:0;border-radius:50%;background:var(--surface-2,#eee9df);font-size:24px;line-height:1}
    .quick-contact-actions{display:grid;grid-template-columns:1fr 1fr;gap:10px}
    .quick-contact-action{min-height:50px;border-radius:999px;padding:13px 16px;text-decoration:none;font-weight:800;display:flex;align-items:center;justify-content:center;text-align:center}
    .quick-contact-whatsapp{background:#1f9d55;color:#fff}
    .quick-contact-telegram{background:#2381cc;color:#fff}
    .quick-contact-phone{background:var(--ink,#201f1b);color:#fff}
    .quick-contact-email{background:var(--surface-2,#eee9df);color:var(--ink,#201f1b)}
    @media(max-width:560px){.quick-contact-actions{grid-template-columns:1fr}.quick-contact-panel{border-radius:22px}}
  `;
  document.head.appendChild(style);

  function smoothScroll(target){
    if(!target)return;
    target.scrollIntoView({behavior:"smooth",block:"start"});
  }

  const heroActions=document.querySelector(".hero-actions");
  const catalogButton=heroActions?.querySelector('a[href="#catalog"]');
  const questionButton=heroActions?.querySelector('a[href="#contacts"]');

  if(catalogButton){
    catalogButton.textContent="Смотреть товары";
    catalogButton.setAttribute("role","button");
    catalogButton.addEventListener("click",event=>{
      event.preventDefault();
      const target=document.querySelector(".results-line")||document.querySelector("#grid")||document.querySelector("#catalog");
      smoothScroll(target);
      try{history.replaceState(null,"",`${location.pathname}${location.search}#catalog`)}catch{}
    });
  }

  document.querySelectorAll('.nav-links a[href="#catalog"],footer a[href="#catalog"]').forEach(link=>{
    link.addEventListener("click",event=>{
      event.preventDefault();
      smoothScroll(document.querySelector("#catalog"));
      try{history.replaceState(null,"",`${location.pathname}${location.search}#catalog`)}catch{}
    });
  });

  const telegramUrl=`https://t.me/share/url?url=${encodeURIComponent(location.href)}&text=${encodeURIComponent("Здравствуйте! У меня вопрос по каталогу FORMA HOME.")}`;
  const overlay=document.createElement("div");
  overlay.className="quick-contact-overlay";
  overlay.id="quickContactOverlay";
  overlay.innerHTML=`
    <section class="quick-contact-panel" role="dialog" aria-modal="true" aria-labelledby="quickContactTitle">
      <div class="quick-contact-head">
        <div><h2 id="quickContactTitle">Задать вопрос</h2><p>Выберите удобный способ связи с FORMA HOME.</p></div>
        <button type="button" class="quick-contact-close" aria-label="Закрыть">×</button>
      </div>
      <div class="quick-contact-actions">
        <a class="quick-contact-action quick-contact-whatsapp" href="https://wa.me/79057267946" target="_blank" rel="noopener">WhatsApp</a>
        <a class="quick-contact-action quick-contact-telegram" href="${telegramUrl}" target="_blank" rel="noopener">Telegram</a>
        <a class="quick-contact-action quick-contact-phone" href="tel:+79057267946">Позвонить</a>
        <a class="quick-contact-action quick-contact-email" href="mailto:postes@mail.ru">Написать на почту</a>
      </div>
    </section>`;
  document.body.appendChild(overlay);

  function openContacts(){
    overlay.classList.add("show");
    document.body.style.overflow="hidden";
    overlay.querySelector(".quick-contact-close")?.focus();
  }

  function closeContacts(){
    overlay.classList.remove("show");
    document.body.style.overflow="";
  }

  if(questionButton){
    questionButton.setAttribute("role","button");
    questionButton.addEventListener("click",event=>{
      event.preventDefault();
      openContacts();
    });
  }

  overlay.querySelector(".quick-contact-close")?.addEventListener("click",closeContacts);
  overlay.addEventListener("click",event=>{if(event.target===overlay)closeContacts()});
  document.addEventListener("keydown",event=>{if(event.key==="Escape"&&overlay.classList.contains("show"))closeContacts()});
})();
