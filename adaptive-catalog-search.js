(()=>{
  const RU='йцукенгшщзхъфывапролджэячсмитьбю';
  const EN='qwertyuiop[]asdfghjkl;\'zxcvbnm,.';
  const ruToEn=new Map([...RU].map((c,i)=>[c,EN[i]]));
  const enToRu=new Map([...EN].map((c,i)=>[c,RU[i]]));
  const translitMap={а:'a',б:'b',в:'v',г:'g',д:'d',е:'e',ё:'e',ж:'zh',з:'z',и:'i',й:'y',к:'k',л:'l',м:'m',н:'n',о:'o',п:'p',р:'r',с:'s',т:'t',у:'u',ф:'f',х:'h',ц:'ts',ч:'ch',ш:'sh',щ:'sch',ъ:'',ы:'y',ь:'',э:'e',ю:'yu',я:'ya'};
  let products=[];
  let index=[];
  let box=null;
  let input=null;
  let timer=0;
  let applying=false;

  const norm=value=>String(value||'').toLowerCase().replace(/ё/g,'е').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zа-я0-9]+/g,' ').trim().replace(/\s+/g,' ');
  const swap=(value,map)=>[...String(value||'').toLowerCase()].map(c=>map.get(c)||c).join('');
  const translit=value=>[...String(value||'').toLowerCase()].map(c=>translitMap[c]??c).join('');
  const variants=value=>[...new Set([norm(value),norm(swap(value,ruToEn)),norm(swap(value,enToRu)),norm(translit(value))].filter(Boolean))];

  function distance(a,b,limit=4){
    if(a===b)return 0;
    if(Math.abs(a.length-b.length)>limit)return limit+1;
    let prev=Array.from({length:b.length+1},(_,i)=>i);
    for(let i=1;i<=a.length;i++){
      const cur=[i]; let rowMin=i;
      for(let j=1;j<=b.length;j++){
        const value=Math.min(cur[j-1]+1,prev[j]+1,prev[j-1]+(a[i-1]===b[j-1]?0:1));
        cur[j]=value; if(value<rowMin)rowMin=value;
      }
      if(rowMin>limit)return limit+1;
      prev=cur;
    }
    return prev[b.length];
  }

  function score(query,item){
    let best=Infinity;
    const qvars=variants(query);
    for(const q of qvars){
      for(const text of item.variants){
        if(text===q)best=Math.min(best,0);
        else if(text.startsWith(q))best=Math.min(best,0.15);
        else if(text.includes(q))best=Math.min(best,0.3);
        const qWords=q.split(' ');
        const words=text.split(' ');
        let total=0;
        for(const qw of qWords){
          let wordBest=99;
          for(const w of words){
            if(w.startsWith(qw))wordBest=Math.min(wordBest,0.1);
            else if(w.includes(qw))wordBest=Math.min(wordBest,0.25);
            else wordBest=Math.min(wordBest,distance(qw,w,Math.max(2,Math.floor(qw.length*.34))));
          }
          total+=wordBest;
        }
        best=Math.min(best,total/qWords.length);
      }
    }
    return best;
  }

  function suggestions(query){
    if(norm(query).length<2)return [];
    return index.map(item=>({item,score:score(query,item)}))
      .filter(x=>x.score<=Math.max(1.8,norm(query).length*.22))
      .sort((a,b)=>a.score-b.score||a.item.name.localeCompare(b.item.name,'ru'))
      .filter((x,i,arr)=>arr.findIndex(y=>norm(y.item.name)===norm(x.item.name))===i)
      .slice(0,6);
  }

  function ensureBox(){
    if(box&&box.isConnected)return box;
    box=document.createElement('div');
    box.className='adaptive-search-suggestions';
    box.setAttribute('role','listbox');
    box.style.cssText='position:absolute;left:0;right:0;top:calc(100% + 6px);z-index:80;background:#fff;border:1px solid #ded8cc;border-radius:14px;box-shadow:0 16px 42px rgba(47,42,33,.16);overflow:hidden;display:none';
    const field=input.closest('.field')||input.parentElement;
    if(field){field.style.position='relative';field.appendChild(box)}
    return box;
  }

  function apply(value){
    if(!input||!value)return;
    applying=true;
    input.value=value;
    input.dispatchEvent(new Event('input',{bubbles:true}));
    input.dispatchEvent(new Event('change',{bubbles:true}));
    applying=false;
    if(box)box.style.display='none';
  }

  function show(query){
    const found=suggestions(query);
    const target=ensureBox();
    if(!found.length){target.style.display='none';return}
    target.innerHTML=found.map(({item})=>`<button type="button" role="option" data-search-value="${item.name.replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;')}" style="display:block;width:100%;border:0;border-bottom:1px solid #eee9df;background:#fff;text-align:left;padding:11px 14px;color:#201f1b"><strong>${item.name}</strong><span style="display:block;margin-top:3px;font-size:12px;color:#706d65">${item.category||item.collection||''}</span></button>`).join('');
    target.style.display='block';
  }

  function maybeCorrect(query){
    const count=document.querySelector('#resultCount')?.textContent||'';
    if(!/Найдено:\s*0\b/.test(count))return;
    const found=suggestions(query);
    if(found.length&&found[0].score<=1.05)apply(found[0].item.name);
  }

  function attach(){
    const candidates=[...document.querySelectorAll('.filter-panel input')];
    input=candidates.find(el=>/поиск|назван|товар/i.test(el.placeholder||el.getAttribute('aria-label')||''))||candidates[0];
    if(!input||input.dataset.adaptiveSearch==='1')return false;
    input.dataset.adaptiveSearch='1';
    input.setAttribute('autocomplete','off');
    input.addEventListener('input',()=>{
      if(applying)return;
      clearTimeout(timer);
      const query=input.value;
      timer=setTimeout(()=>{show(query);setTimeout(()=>maybeCorrect(query),80)},220);
    });
    input.addEventListener('keydown',event=>{
      if(event.key==='Enter'){
        const first=box?.querySelector('[data-search-value]');
        if(first){event.preventDefault();apply(first.dataset.searchValue)}
      }
      if(event.key==='Escape'&&box)box.style.display='none';
    });
    document.addEventListener('pointerdown',event=>{if(box&&!box.contains(event.target)&&event.target!==input)box.style.display='none'});
    document.addEventListener('click',event=>{
      const button=event.target.closest?.('[data-search-value]');
      if(button)apply(button.dataset.searchValue);
    });
    return true;
  }

  async function loadIndex(){
    try{
      const text=await fetch(`catalog-source.html?adaptive-search=${Date.now()}`,{cache:'no-store'}).then(r=>r.text());
      const marker='    const PRODUCTS = ';
      const start=text.indexOf(marker);
      if(start<0)return;
      const valueStart=start+marker.length;
      const end=text.indexOf(';\n',valueStart);
      products=JSON.parse(text.slice(valueStart,end));
      index=products.map(p=>{
        const full=`${p.name||''} ${p.specs||''} ${p.collection||''} ${p.category||''}`;
        return {name:p.name||'',category:p.category||'',collection:p.collection||'',variants:[...new Set(variants(full))]};
      });
    }catch(error){console.warn('Adaptive search index failed',error)}
  }

  loadIndex();
  const observer=new MutationObserver(()=>attach());
  observer.observe(document.documentElement,{childList:true,subtree:true});
  const poll=setInterval(()=>{if(attach()&&index.length)clearInterval(poll)},300);
  setTimeout(()=>clearInterval(poll),20000);
})();