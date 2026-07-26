(()=>{
  if(typeof PRODUCTS==="undefined" || typeof state==="undefined" || typeof filtered!=="function")return;

  const COLOR_GROUPS=[
    ["Белый",["белый","white","айвори","ivory"]],
    ["Чёрный",["черный","чёрный","black"]],
    ["Серый",["серый","grey","gray"]],
    ["Бежевый",["бежевый","beige"]],
    ["Коричневый",["коричневый","brown"]],
    ["Натуральный",["натуральный","natural"]],
    ["Орех",["орех","walnut"]],
    ["Графит",["графит","graphite"]],
    ["Зелёный",["зеленый","зелёный","green"]],
    ["Синий",["синий","blue"]],
    ["Голубой",["голубой"]],
    ["Красный",["красный","red"]],
    ["Розовый",["розовый","pink"]],
    ["Жёлтый",["желтый","жёлтый","yellow"]],
    ["Оранжевый",["оранжевый","orange"]],
    ["Золотой",["золотой","золото","gold"]],
    ["Серебристый",["серебристый","silver"]],
    ["Хром",["хром","chrome"]],
    ["Капучино",["капучино","cappuccino"]],
    ["Кремовый",["кремовый","cream"]]
  ];

  const MATERIAL_GROUPS=[
    ["Металл",["металл","metal"]],
    ["Дерево",["дерево","wood"]],
    ["Массив дерева",["массив"]],
    ["МДФ",["мдф","mdf"]],
    ["ЛДСП",["лдсп","ldsp"]],
    ["Стекло",["стекло","glass"]],
    ["Пластик",["пластик","plastic"]],
    ["Велюр",["велюр","velour"]],
    ["Ткань",["ткань","fabric"]],
    ["Экокожа",["экокожа","эко-кожа"]],
    ["Кожа",["кожа","leather"]],
    ["Ротанг",["ротанг","rattan"]],
    ["Шпон",["шпон","veneer"]],
    ["Мрамор",["мрамор","marble"]],
    ["Керамика",["керамика","ceramic"]],
    ["Палисандр",["палисандр"]],
    ["Гевея",["гевея"]],
    ["Бук",["бук"]],
    ["Сосна",["сосна"]],
    ["Вяз",["вяз"]],
    ["Дуб",["дуб"]],
    ["Фанера",["фанера"]]
  ];

  const RANGE_OPTIONS=[
    ["","Любой размер"],
    ["0-50","до 50 см"],
    ["50-80","50–80 см"],
    ["80-120","80–120 см"],
    ["120-180","120–180 см"],
    ["180-9999","от 180 см"]
  ];

  const advanced={color:"",material:"",width:"",height:"",availability:"",model:""};
  const originalFiltered=filtered;
  const originalRender=render;

  const style=document.createElement("style");
  style.textContent=`
    .advanced-filter-box{margin-top:14px;border-top:1px solid var(--line);padding-top:14px}
    .advanced-filter-box summary{cursor:pointer;font-weight:800;font-size:14px;color:var(--ink);list-style:none;display:flex;align-items:center;justify-content:space-between;gap:12px}
    .advanced-filter-box summary::-webkit-details-marker{display:none}
    .advanced-filter-box summary:after{content:"＋";font-size:18px;font-weight:500;color:var(--muted)}
    .advanced-filter-box[open] summary:after{content:"−"}
    .advanced-filter-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-top:14px}
    .advanced-filter-grid .field label{display:block;margin:0 0 6px;font-size:11px;font-weight:800;letter-spacing:.04em;color:var(--muted)}
    .active-filters{display:none;align-items:center;gap:8px;flex-wrap:wrap;margin:0 0 18px;padding:12px 14px;background:rgba(255,255,255,.7);border:1px solid var(--line);border-radius:16px}
    .active-filters.show{display:flex}
    .active-filters-title{font-size:12px;font-weight:800;color:var(--muted);margin-right:2px}
    .active-filter-chip{border:1px solid var(--line);background:#fff;border-radius:999px;padding:7px 10px;font-size:12px;color:var(--ink);display:inline-flex;align-items:center;gap:7px}
    .active-filter-chip span{font-size:16px;line-height:1;color:var(--muted)}
    .reset-filters{border:0;background:transparent;color:var(--accent);font-weight:800;font-size:12px;padding:7px 8px;margin-left:auto}
    .filter-data-note{grid-column:1/-1;margin:-2px 0 0;font-size:11px;color:var(--muted);line-height:1.4}
    .reset-filters-inline{grid-column:1/-1;justify-self:start;border:1px solid var(--line);background:#fff;color:var(--accent);border-radius:999px;padding:10px 14px;font-weight:800;font-size:12px}
    @media(max-width:900px){.advanced-filter-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
    @media(max-width:620px){.advanced-filter-grid{grid-template-columns:1fr}.reset-filters{width:100%;margin-left:0;text-align:left}}
  `;
  document.head.appendChild(style);

  const panel=document.querySelector(".filter-panel");
  const resultsLine=document.querySelector(".results-line");
  if(!panel || !resultsLine)return;

  const details=document.createElement("details");
  details.className="advanced-filter-box";
  details.open=true;
  details.innerHTML=`
    <summary>Дополнительные фильтры</summary>
    <div class="advanced-filter-grid">
      <div class="field"><label for="filterType">Тип товара</label><select id="filterType"><option value="">Все типы</option></select></div>
      <div class="field"><label for="filterColor">Цвет</label><select id="filterColor"><option value="">Все цвета</option></select></div>
      <div class="field"><label for="filterMaterial">Материал</label><select id="filterMaterial"><option value="">Все материалы</option></select></div>
      <div class="field"><label for="filterWidth">Ширина</label><select id="filterWidth"></select></div>
      <div class="field"><label for="filterHeight">Высота</label><select id="filterHeight"></select></div>
      <div class="field"><label for="filterAvailability">Наличие</label><select id="filterAvailability"><option value="">Любое наличие</option></select></div>
      <div class="field" style="grid-column:1/-1"><label for="filterModel">Модель или артикул</label><input id="filterModel" type="search" placeholder="Например: GH-8606, T1001 или CW-6374"></div>
      <p class="filter-data-note" id="availabilityNote"></p>
      <button type="button" class="reset-filters-inline" id="resetAllFilters">Сбросить все фильтры</button>
    </div>`;
  panel.appendChild(details);

  const activeBox=document.createElement("div");
  activeBox.className="active-filters";
  activeBox.id="activeFilters";
  resultsLine.parentNode.insertBefore(activeBox,resultsLine);

  const controls={
    type:details.querySelector("#filterType"),
    color:details.querySelector("#filterColor"),
    material:details.querySelector("#filterMaterial"),
    width:details.querySelector("#filterWidth"),
    height:details.querySelector("#filterHeight"),
    availability:details.querySelector("#filterAvailability"),
    model:details.querySelector("#filterModel")
  };

  function textOf(p){return `${p.name||""} ${p.specs||""} ${p.collection||""}`.toLowerCase()}
  function containsAlias(p,aliases){const text=textOf(p);return aliases.some(alias=>text.includes(alias))}
  function option(select,value,label){const item=document.createElement("option");item.value=value;item.textContent=label;select.appendChild(item)}

  [...new Set(PRODUCTS.map(p=>p.category).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"ru")).forEach(value=>option(controls.type,value,value));

  COLOR_GROUPS.map(([label,aliases])=>[label,aliases,PRODUCTS.filter(p=>containsAlias(p,aliases)).length])
    .filter(([, ,count])=>count>0)
    .forEach(([label,,count])=>option(controls.color,label,`${label} (${count})`));

  MATERIAL_GROUPS.map(([label,aliases])=>[label,aliases,PRODUCTS.filter(p=>containsAlias(p,aliases)).length])
    .filter(([, ,count])=>count>0)
    .forEach(([label,,count])=>option(controls.material,label,`${label} (${count})`));

  RANGE_OPTIONS.forEach(([value,label])=>{option(controls.width,value,label);option(controls.height,value,label)});

  function availabilityOf(p){
    const raw=String(p.availability||p.stockStatus||p.stock||p.status||"").trim().toLowerCase();
    if(!raw)return "Уточнить наличие";
    if(raw.includes("в наличии") || raw==="available" || raw==="in_stock")return "В наличии";
    if(raw.includes("под заказ") || raw.includes("ожида") || raw==="preorder")return "Под заказ";
    return "Уточнить наличие";
  }

  const availabilityValues=[...new Set(PRODUCTS.map(availabilityOf))];
  availabilityValues.forEach(value=>option(controls.availability,value,value));
  const hasRealAvailability=PRODUCTS.some(p=>p.availability||p.stockStatus||p.stock||p.status);
  details.querySelector("#availabilityNote").textContent=hasRealAvailability
    ? "Наличие показывается по данным каталога."
    : "В текущем прайсе нет статуса склада, поэтому для товаров указано «Уточнить наличие».";

  function parseNumberPart(part){
    const values=String(part||"").replace(/,/g,".").split(/\s*[-–—]\s*/).map(Number).filter(Number.isFinite);
    return values.length?Math.max(...values):null;
  }

  function dimensionsOf(p){
    const source=String(p.specs||"").replace(/[×xX*]/g,"х");
    const match=source.match(/(\d+(?:[.,]\d+)?(?:\s*[-–—]\s*\d+(?:[.,]\d+)?)?)\s*х\s*(\d+(?:[.,]\d+)?(?:\s*[-–—]\s*\d+(?:[.,]\d+)?)?)(?:\s*х\s*(\d+(?:[.,]\d+)?(?:\s*[-–—]\s*\d+(?:[.,]\d+)?)?))?/i);
    if(!match)return {width:null,height:null};
    return {width:parseNumberPart(match[1]),height:parseNumberPart(match[3]||match[2])};
  }

  function valueInRange(value,range){
    if(!range)return true;
    if(!Number.isFinite(value))return false;
    const [min,max]=range.split("-").map(Number);
    return value>=min && value<=max;
  }

  function selectedAliases(groups,label){return groups.find(([name])=>name===label)?.[1]||[]}

  filtered=function(){
    return originalFiltered().filter(p=>{
      if(advanced.color && !containsAlias(p,selectedAliases(COLOR_GROUPS,advanced.color)))return false;
      if(advanced.material && !containsAlias(p,selectedAliases(MATERIAL_GROUPS,advanced.material)))return false;
      if(advanced.model && !String(p.name||"").toLowerCase().includes(advanced.model))return false;
      if(advanced.availability && availabilityOf(p)!==advanced.availability)return false;
      const dimensions=dimensionsOf(p);
      if(!valueInRange(dimensions.width,advanced.width))return false;
      if(!valueInRange(dimensions.height,advanced.height))return false;
      return true;
    });
  };

  render=function(){originalRender();renderActiveFilters()};

  function setCategory(value){
    state.category=value||"Все";
    controls.type.value=state.category==="Все"?"":state.category;
    document.querySelectorAll("#chips [data-category]").forEach(chip=>chip.classList.toggle("active",chip.dataset.category===state.category));
  }

  function resetAll(){
    state.search="";state.collection="";state.price="";state.sort="popular";setCategory("Все");
    advanced.color="";advanced.material="";advanced.width="";advanced.height="";advanced.availability="";advanced.model="";
    const search=document.querySelector("#search");if(search)search.value="";
    const collection=document.querySelector("#collection");if(collection)collection.value="";
    const price=document.querySelector("#price");if(price)price.value="";
    const sort=document.querySelector("#sort");if(sort)sort.value="popular";
    Object.entries(controls).forEach(([key,control])=>{if(key!=="type")control.value=""});
    resetAndRender();
  }

  function removeFilter(key){
    if(key==="search"){state.search="";document.querySelector("#search").value=""}
    if(key==="collection"){state.collection="";document.querySelector("#collection").value=""}
    if(key==="price"){state.price="";document.querySelector("#price").value=""}
    if(key==="category")setCategory("Все");
    if(Object.prototype.hasOwnProperty.call(advanced,key)){advanced[key]="";controls[key].value=""}
    resetAndRender();
  }

  function addActiveChip(key,label){
    const button=document.createElement("button");
    button.type="button";button.className="active-filter-chip";button.dataset.clearFilter=key;
    button.append(document.createTextNode(label));
    const close=document.createElement("span");close.textContent="×";close.setAttribute("aria-hidden","true");button.appendChild(close);
    activeBox.appendChild(button);
  }

  function selectedLabel(select){return select.options[select.selectedIndex]?.textContent||""}

  function renderActiveFilters(){
    activeBox.replaceChildren();
    const items=[];
    if(state.search)items.push(["search",`Поиск: ${document.querySelector("#search")?.value||state.search}`]);
    if(state.collection)items.push(["collection",`Коллекция: ${state.collection}`]);
    if(state.category!=="Все")items.push(["category",`Тип: ${state.category}`]);
    if(state.price)items.push(["price",`Цена: ${selectedLabel(document.querySelector("#price"))}`]);
    if(advanced.color)items.push(["color",`Цвет: ${advanced.color}`]);
    if(advanced.material)items.push(["material",`Материал: ${advanced.material}`]);
    if(advanced.width)items.push(["width",`Ширина: ${selectedLabel(controls.width)}`]);
    if(advanced.height)items.push(["height",`Высота: ${selectedLabel(controls.height)}`]);
    if(advanced.availability)items.push(["availability",`Наличие: ${advanced.availability}`]);
    if(advanced.model)items.push(["model",`Модель: ${controls.model.value.trim()}`]);
    activeBox.classList.toggle("show",items.length>0);
    if(!items.length)return;
    const title=document.createElement("span");title.className="active-filters-title";title.textContent="Выбрано:";activeBox.appendChild(title);
    items.forEach(([key,label])=>addActiveChip(key,label));
    const reset=document.createElement("button");reset.type="button";reset.className="reset-filters";reset.textContent="Сбросить все фильтры";reset.addEventListener("click",resetAll);activeBox.appendChild(reset);
  }

  details.querySelector("#resetAllFilters").addEventListener("click",resetAll);
  controls.type.addEventListener("change",()=>{setCategory(controls.type.value);resetAndRender()});
  ["color","material","width","height","availability"].forEach(key=>controls[key].addEventListener("change",()=>{advanced[key]=controls[key].value;resetAndRender()}));
  controls.model.addEventListener("input",()=>{advanced.model=controls.model.value.trim().toLowerCase();resetAndRender()});
  activeBox.addEventListener("click",event=>{const button=event.target.closest("[data-clear-filter]");if(button)removeFilter(button.dataset.clearFilter)});

  ["#search","#collection","#price","#sort"].forEach(selector=>document.querySelector(selector)?.addEventListener("input",()=>setTimeout(renderActiveFilters,0)));
  document.querySelector("#chips")?.addEventListener("click",()=>setTimeout(()=>{controls.type.value=state.category==="Все"?"":state.category;renderActiveFilters()},0));

  renderActiveFilters();
})();