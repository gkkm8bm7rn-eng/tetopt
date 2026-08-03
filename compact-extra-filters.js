(()=>{
  const KEEP=['тип товара','цвет','материал'];
  const REMOVE=['ширина','высота','наличие','модель или артикул'];

  function norm(value){return String(value||'').toLowerCase().replace(/ё/g,'е').replace(/\s+/g,' ').trim()}

  function findPanel(){
    const heading=[...document.querySelectorAll('h2,h3,h4,strong,button,div')]
      .find(el=>norm(el.textContent)==='дополнительные фильтры');
    if(!heading)return null;
    return heading.closest('.extra-filters,.additional-filters,.filter-extra,.filter-panel')||heading.parentElement;
  }

  function fieldLabel(field){
    const label=field.querySelector('label,.field-label,strong,b');
    if(label)return norm(label.textContent);
    const previous=field.previousElementSibling;
    return norm(previous?.textContent||'');
  }

  function removeUnwanted(panel){
    const candidates=[...panel.querySelectorAll('.field,label')];
    candidates.forEach(node=>{
      const field=node.classList.contains('field')?node:node.closest('.field')||node.parentElement;
      if(!field||field===panel)return;
      const label=fieldLabel(field);
      if(REMOVE.some(name=>label.startsWith(name)))field.remove();
    });

    [...panel.querySelectorAll('p,small,.hint,.note')].forEach(el=>{
      const text=norm(el.textContent);
      if(text.includes('статуса склада')||text.includes('уточнить наличие'))el.remove();
    });

    const reset=[...panel.querySelectorAll('button,a')].find(el=>norm(el.textContent).includes('сбросить все фильтры'));
    const controls=[...panel.querySelectorAll('.field')].filter(field=>KEEP.some(name=>fieldLabel(field).startsWith(name)));
    controls.forEach(field=>field.style.display='');
    if(reset)reset.style.display='';
  }

  function setup(){
    const panel=findPanel();
    if(!panel||panel.dataset.compactExtraFilters==='2')return false;
    panel.dataset.compactExtraFilters='2';
    removeUnwanted(panel);

    const heading=[...panel.querySelectorAll('h2,h3,h4,strong,button,div')]
      .find(el=>norm(el.textContent)==='дополнительные фильтры');
    if(!heading)return true;

    let body=[...panel.children].find(el=>el!==heading&&el.querySelector?.('select,input'));
    if(!body){
      const fields=[...panel.querySelectorAll('.field')];
      if(fields.length){
        body=document.createElement('div');
        body.className='compact-extra-filters-body';
        fields.forEach(field=>body.appendChild(field));
        const reset=[...panel.querySelectorAll('button,a')].find(el=>norm(el.textContent).includes('сбросить все фильтры'));
        if(reset)body.appendChild(reset);
        panel.appendChild(body);
      }
    }
    if(!body)return true;

    const toggle=heading.matches('button')?heading:document.createElement('button');
    if(toggle!==heading){
      toggle.type='button';
      toggle.className=heading.className;
      toggle.innerHTML='<span>Дополнительные фильтры</span><span aria-hidden="true">+</span>';
      heading.replaceWith(toggle);
    }else if(!toggle.querySelector('[data-filter-symbol]')){
      toggle.innerHTML='<span>Дополнительные фильтры</span><span data-filter-symbol aria-hidden="true">+</span>';
    }
    toggle.type='button';
    toggle.setAttribute('aria-expanded','false');
    toggle.style.cssText+='width:100%;display:flex;justify-content:space-between;align-items:center;border:0;background:transparent;text-align:left;';
    body.hidden=true;

    toggle.addEventListener('click',()=>{
      const open=toggle.getAttribute('aria-expanded')==='true';
      toggle.setAttribute('aria-expanded',String(!open));
      const symbol=toggle.querySelector('[data-filter-symbol]')||toggle.lastElementChild;
      if(symbol)symbol.textContent=open?'+':'−';
      body.hidden=open;
    });
    return true;
  }

  const observer=new MutationObserver(()=>setup());
  observer.observe(document.documentElement,{childList:true,subtree:true});
  const poll=setInterval(()=>{if(setup())clearInterval(poll)},250);
  setTimeout(()=>clearInterval(poll),20000);
})();