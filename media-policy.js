const MEDIA_POLICY={requiredHero:'front-three-quarter',sourceIsolation:true,limits:{simple:3,standard:4,computer:4}};

function mediaSourceId(path=''){
  return String(path).match(/assets\/products\/(\d+)\//)?.[1]||'';
}

function mediaComplexity(product,variant){
  // Computer chairs always keep the complete source-isolated gallery: the rear,
  // mechanism and base views are purchase-critical even when the model is low-cost.
  if(isComputerChair(product))return'computer';
  const text=`${product.category||''} ${product.name||''}`.toLocaleLowerCase('ru-RU');
  if(/диван|кровать|шкаф|витрин|комод|гарнитур|комплект|остров|библиотек/.test(text)||variant.wholesalePrice>=30000)return'complex';
  if(/стул|кресло|вешалк|табурет|пуф|декор|подставк|стакан|тарелк/.test(text)&&variant.wholesalePrice<15000)return'simple';
  return'standard';
}

function mediaRank(path,primary){
  const name=String(path).split('/').pop().toLocaleLowerCase('ru-RU');
  if(/00-front|front-?3|three-quarter|3q/.test(name))return 0;
  if(/00-main/.test(name))return 1;
  if(path===primary)return 2;
  if(/(^|\/)01\./.test(path))return 3;
  if(/(^|\/)02\./.test(path))return 4;
  return 5;
}

function curateGallery(product,variant){
  const sourceId=String(variant.sourceId),all=(variant.images?.length?variant.images:[variant.primaryImage]).filter(Boolean);
  const own=all.filter(path=>mediaSourceId(path)===sourceId);
  const isolated=own.length?own:all;
  const unique=[...new Set(isolated)];
  unique.sort((a,b)=>mediaRank(a,variant.primaryImage)-mediaRank(b,variant.primaryImage));
  const complexity=mediaComplexity(product,variant);
  // Technical drawings in a complex product's source folder must never be
  // cut off by a gallery limit. Current source folders contain 2–4 images,
  // so this keeps the site light while preserving every available detail.
  return complexity==='complex'?unique:unique.slice(0,MEDIA_POLICY.limits[complexity]);
}
