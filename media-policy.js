const MEDIA_POLICY={requiredHero:'front-three-quarter',sourceIsolation:true,limits:{simple:3,standard:4,complex:6}};

function mediaSourceId(path=''){
  return String(path).match(/assets\/products\/(\d+)\//)?.[1]||'';
}

function mediaComplexity(product,variant){
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
  return unique.slice(0,MEDIA_POLICY.limits[mediaComplexity(product,variant)]);
}
