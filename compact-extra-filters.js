(()=>{
  const KEEP=['тип товара','цвет','материал'];

  const norm=value=>String(value||'').toLowerCase().replace(/ё/g,'е').replace(/\s+/g,' ').trim();

  function findHeading(){
    return [...document.querySelectorAll('h2,h3,h4,strong,button,div')]
      .find(el=>norm(el.textContent)==='дополнительные фильтры')||null;
  }

  function findPanel(heading){
    return heading?.closest('.extra-filters,.additional-filters,.filter-extra')
      ||heading?.parentElement
      ||null;
  }

  function fieldLabel(field){
    const label=field.querySelector('label,.field-label,strong,b');
    if(label)return norm(label.textContent);
    const previous=field.previousElementSibling;
    return norm(previous?.textContent||'');
  }

  function isKeptField(field){
    const label=fieldLabel(field);
    return KEEP.some(name=>label===name||label.startsWith(name));
  }

  function cleanPanel(panel){
    const fields=[...panel.querySelectorAll('.field')];
    fields.forEach(field=>{
      if(!isKeptField(field))field.remove();
      else field.style.display='';
    });

    [...panel.querySelectorAll('p,small,.hint,.note')].forEach(el=>{
      const text=norm(el.textContent);
      if(text.includes('статуса склада')||text.includes('уточнить наличие'))el.remove();
    });

    [...panel.querySelectorAll('label')].forEach(label=>{
      const field=label.closest('.field');
      if(!field&&KEEP.every(name=>!norm(label.textContent).startsWith(name)))label.remove();
    });
  }

  function setup(){
    const heading=findHeading();
    const panel=findPanel(heading);
    if(!heading||!panel)return false;

    cleanPanel(panel);

    let toggle=heading;
    if(!toggle.matches('button')){
      const button=document.createElement('button');
      button.type='button';
      button.className=heading.className;
      heading.replaceWith(button);
      toggle=button;
    }

    toggle.innerHTML='<span>Дополнительные фильтры</span><span data-filter-symbol aria-hidden="true">+</span>';
    toggle.type='button';
    toggle.setAttribute('aria-expanded','false');
    toggle.style.cssText+='width:100%;display:flex;justify-content:space-between;align-items:center;border:0;background:transparent;text-align:left;';

    let body=panel.querySelector('.compact-extra-filters-body');
    if(!body){
      body=document.createElement('div');
      body.className='compact-extra-filters-body';
      const kept=[...panel.querySelectorAll('.field')].filter(isKeptField);
      kept.forEach(field=>body.appendChild(field));
      const reset=[...panel.querySelectorAll('button,a')]
        .find(el=>el!==toggle&&norm(el.textContent).includes('сбросить все фильтры'));
      if(reset)body.appendChild(reset);
      panel.appendChild(body);
    }

    cleanPanel(body);
    body.hidden=true;
    toggle.setAttribute('aria-expanded','false');
    const symbol=toggle.querySelector('[data-filter-symbol]');
    if(symbol)symbol.textContent='+';

    if(toggle.dataset.compactBound!=='3'){
      toggle.dataset.compactBound='3';
      toggle.addEventListener('click',()=>{
        const open=toggle.getAttribute('aria-expanded')==='true';
        toggle.setAttribute('aria-expanded',String(!open));
        const icon=toggle.querySelector('[data-filter-symbol]');
        if(icon)icon.textContent=open?'+':'−';
        body.hidden=open;
      });
    }

    panel.dataset.compactExtraFilters='3';
    return true;
  }

  const observer=new MutationObserver(()=>setup());
  observer.observe(document.documentElement,{childList:true,subtree:true});
  const poll=setInterval(()=>{if(setup())clearInterval(poll)},250);
  setTimeout(()=>clearInterval(poll),20000);
})();