(()=>{
  const VERSION='5';
  const KEEP=['тип товара','цвет','материал'];
  const norm=value=>String(value||'').toLowerCase().replace(/ё/g,'е').replace(/\s+/g,' ').trim();

  function findHeading(){
    return document.querySelector('[data-forma-extra-toggle]')||
      [...document.querySelectorAll('h2,h3,h4,strong,button,div')]
        .find(el=>norm(el.textContent).replace(/[+−-]\s*$/,'').trim()==='дополнительные фильтры')||null;
  }

  function findPanel(heading){
    return heading?.closest('.extra-filters,.additional-filters,.filter-extra,[data-extra-filters]')||heading?.parentElement||null;
  }

  function fieldLabel(field){
    const label=field.querySelector('label,.field-label,.filter-label,strong,b');
    if(label)return norm(label.textContent);
    const control=field.querySelector('select,input');
    return norm(control?.getAttribute('aria-label')||control?.name||field.previousElementSibling?.textContent||'');
  }

  function isKeptField(field){
    const label=fieldLabel(field);
    return KEEP.some(name=>label===name||label.startsWith(name));
  }

  function fieldsIn(root){
    const explicit=[...root.querySelectorAll('.field,.filter-field,.form-field,[data-filter-field]')];
    if(explicit.length)return explicit.filter((field,index,list)=>!list.some((other,i)=>i!==index&&other.contains(field)));
    return [...root.children].filter(el=>el.querySelector?.('select,input')&&fieldLabel(el));
  }

  function cleanPanel(panel){
    fieldsIn(panel).forEach(field=>{
      if(isKeptField(field))field.style.display='';
      else field.remove();
    });
    [...panel.querySelectorAll('p,small,.hint,.note')].forEach(el=>{
      const text=norm(el.textContent);
      if(text.includes('статуса склада')||text.includes('уточнить наличие'))el.remove();
    });
  }

  function setOpen(toggle,body,open){
    toggle.setAttribute('aria-expanded',String(open));
    body.hidden=!open;
    body.style.display=open?'':'none';
    const symbol=toggle.querySelector('[data-filter-symbol]');
    if(symbol)symbol.textContent=open?'−':'+';
  }

  function setup(){
    const heading=findHeading();
    const panel=findPanel(heading);
    if(!heading||!panel)return false;

    let toggle=heading;
    if(!toggle.matches('button')){
      const button=document.createElement('button');
      button.type='button';
      button.className=heading.className;
      heading.replaceWith(button);
      toggle=button;
    }

    toggle.dataset.formaExtraToggle='true';
    toggle.innerHTML='<span>Дополнительные фильтры</span><span data-filter-symbol aria-hidden="true">+</span>';
    toggle.type='button';
    toggle.style.cssText+='width:100%;display:flex;justify-content:space-between;align-items:center;border:0;background:transparent;text-align:left;cursor:pointer;';

    let body=panel.querySelector(':scope > .compact-extra-filters-body');
    if(!body){
      body=document.createElement('div');
      body.className='compact-extra-filters-body';
      const currentFields=fieldsIn(panel).filter(field=>field!==toggle&&isKeptField(field));
      currentFields.forEach(field=>body.appendChild(field));
      const reset=[...panel.querySelectorAll('button,a')].find(el=>el!==toggle&&norm(el.textContent).includes('сбросить все фильтры'));
      if(reset)body.appendChild(reset);
      panel.appendChild(body);
    }

    cleanPanel(body);
    fieldsIn(panel).filter(field=>!body.contains(field)).forEach(field=>field.remove());

    const initialized=panel.dataset.compactExtraFilters===VERSION;
    const open=initialized&&toggle.getAttribute('aria-expanded')==='true';
    setOpen(toggle,body,open);

    if(toggle.dataset.compactBound!==VERSION){
      toggle.dataset.compactBound=VERSION;
      toggle.addEventListener('click',event=>{
        event.preventDefault();
        event.stopPropagation();
        setOpen(toggle,body,toggle.getAttribute('aria-expanded')!=='true');
      });
    }

    panel.dataset.compactExtraFilters=VERSION;
    return true;
  }

  const observer=new MutationObserver(()=>setup());
  observer.observe(document.documentElement,{childList:true,subtree:true});
  const poll=setInterval(()=>{if(setup())clearInterval(poll)},250);
  setTimeout(()=>clearInterval(poll),20000);
})();