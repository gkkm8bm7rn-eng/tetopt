from pathlib import Path

app = Path('app.js')
text = app.read_text(encoding='utf-8')
marker = "  const mobileSections=CATEGORY_TREE.map"
if marker not in text:
    raise SystemExit('mobile sections marker not found')
reset_block = '''  const mobileResetSelected=state.view==='catalog'&&state.categoryMain==='all'&&state.categoryCode==='all'&&!state.search.trim()&&!state.min&&!state.max&&!state.multi;\n  const mobileReset=`<section class="mobile-category-section mobile-category-reset-section ${mobileResetSelected?'selected':''}"><button class="mobile-category-trigger mobile-category-reset" type="button" data-reset-all-products${mobileResetSelected?' aria-current="true"':''}><span class="mobile-category-icon" aria-hidden="true"><svg viewBox="0 0 24 24" width="24" height="24" fill="none"><path d="M6.5 7.5h11M6.5 12h11M6.5 16.5h11" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="4" cy="7.5" r="1" fill="currentColor"/><circle cx="4" cy="12" r="1" fill="currentColor"/><circle cx="4" cy="16.5" r="1" fill="currentColor"/></svg></span><span class="mobile-category-name">Все товары</span><small>${categoryVariantCount()}</small><span class="mobile-category-chevron" aria-hidden="true">›</span></button></section>`;\n'''
text = text.replace(marker, reset_block + marker, 1)
old_mobile = 'aria-label="Категории каталога">${mobileSections}</div>'
new_mobile = 'aria-label="Категории каталога">${mobileReset}${mobileSections}</div>'
if old_mobile not in text:
    raise SystemExit('mobile accordion marker not found')
text = text.replace(old_mobile, new_mobile, 1)
old_click = "document.addEventListener('click',async e=>{const b=e.target.closest('button,[data-open]');if(!b)return;if(b.dataset.mobileCategoryToggle!==undefined){"
new_click = "document.addEventListener('click',async e=>{const b=e.target.closest('button,[data-open]');if(!b)return;if(b.dataset.resetAllProducts!==undefined){e.preventDefault();resetFilters();requestAnimationFrame(()=>instantScroll($('#catalog')));return}if(b.dataset.mobileCategoryToggle!==undefined){"
if old_click not in text:
    raise SystemExit('main click handler marker not found')
text = text.replace(old_click, new_click, 1)
app.write_text(text, encoding='utf-8')

cart = Path('cart-feedback.js')
ctext = cart.read_text(encoding='utf-8')
if "getElementById('questionButton')" in ctext:
    raise SystemExit('question UI already present')
question = r'''

/* Header question shortcut. It mirrors the cart sharing model: the shopper
   writes one question, then opens WhatsApp, Telegram or email with that
   text already prepared. No external UI library or network request is added. */
(function(){
'use strict';
const actions=document.querySelector('.site-header .header-actions');
const delivery=actions&&actions.querySelector('.delivery-payment-button');
if(!actions||!delivery||document.getElementById('questionButton'))return;

const style=document.createElement('style');
style.id='formaQuestionStyles';
style.textContent=`
.site-header .question-button{display:grid;width:46px;min-width:46px;height:46px;min-height:46px;padding:0;place-items:center;border:1px solid #d7dfd3;border-radius:14px;background:#fff;color:#314d32;box-shadow:0 6px 18px rgba(49,77,50,.08);cursor:pointer;-webkit-tap-highlight-color:transparent}
.site-header .question-button:hover,.site-header .question-button:focus-visible{background:#eff4ed;border-color:#b8c9b3;outline:none}
.site-header .question-button:focus-visible{box-shadow:0 0 0 2px #f7f5f0,0 0 0 4px #435d41}
.site-header .question-button svg{display:block;width:25px;height:25px}
.question-dialog{width:min(620px,calc(100vw - 24px));max-height:min(86svh,720px);padding:0;border:0;border-radius:24px;background:#f7f5f0;color:#201f1b;box-shadow:0 28px 80px rgba(24,27,22,.24);overflow:auto}
.question-dialog::backdrop{background:rgba(25,27,23,.48);backdrop-filter:blur(2px)}
.question-dialog-shell{padding:25px 26px 26px;background:radial-gradient(560px 280px at 95% 0%,rgba(185,201,176,.22),rgba(185,201,176,0) 70%),#f7f5f0}
.question-dialog-head{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:16px;align-items:start;padding-bottom:18px;border-bottom:1px solid rgba(67,93,65,.13)}
.question-dialog-kicker{margin:0 0 7px;color:#5f7859;font:750 10px/1.2 ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif;letter-spacing:.15em;text-transform:uppercase}
.question-dialog-title{margin:0;color:#201f1b;font:400 clamp(30px,5vw,40px)/1 Georgia,serif;letter-spacing:-.03em}
.question-close{display:grid;width:42px;height:42px;min-width:42px;padding:0;place-items:center;border:1px solid rgba(67,93,65,.18);border-radius:999px;background:rgba(255,255,255,.86);color:#435d41;box-shadow:0 5px 16px rgba(49,77,50,.08);cursor:pointer}
.question-close svg{width:18px;height:18px}
.question-close:hover,.question-close:focus-visible{background:#eff4ed;border-color:#b8c9b3;outline:none}
.question-field{display:grid;gap:8px;margin-top:18px;color:#314d32;font:750 12px/1.25 ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif}
.question-field textarea{width:100%;min-height:138px;resize:vertical;padding:14px 15px;border:1px solid #cfd8ca;border-radius:15px;background:rgba(255,255,255,.9);color:#242520;font:500 15px/1.5 ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif;box-sizing:border-box}
.question-field textarea:focus{outline:none;border-color:#657c62;box-shadow:0 0 0 3px rgba(67,93,65,.13)}
.question-field textarea::placeholder{color:#90938c}
.question-dialog-hint{margin:13px 0 0;color:#6a6c65;font:500 12px/1.45 ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif}
.question-actions{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px;margin-top:15px}
.question-channel{min-height:48px;padding:10px 12px;border:1px solid #cfd8ca;border-radius:12px;background:#fff;color:#314d32;font:800 12px/1.15 ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif;cursor:pointer}
.question-channel:hover,.question-channel:focus-visible{background:#eff4ed;border-color:#9caf98;outline:none}
.question-channel.primary{background:#435d41;border-color:#435d41;color:#fff}
.question-channel.primary:hover,.question-channel.primary:focus-visible{background:#365137;border-color:#365137}
.question-error{margin:10px 0 0;color:#a54434;font:700 11px/1.4 ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif}
@media(max-width:640px){
  .site-header .question-button{width:42px;min-width:42px;height:42px;min-height:42px;border-radius:13px}
  .site-header .question-button svg{width:23px;height:23px}
  .question-dialog{width:calc(100vw - 20px);max-height:88svh;border-radius:21px}
  .question-dialog-shell{padding:21px 18px 20px}
  .question-dialog-title{font-size:31px}
  .question-actions{grid-template-columns:1fr;gap:8px}
  .question-channel{min-height:46px}
}
@media(max-width:390px){
  .site-header{padding-left:10px!important;padding-right:10px!important}
  .site-header .header-actions{gap:4px!important}
  .site-header .brand-line{font-size:10.5px!important;letter-spacing:.04em!important}
  .site-header .question-button{width:36px;min-width:36px;height:40px;min-height:40px}
  .site-header .question-button svg{width:21px;height:21px}
  .site-header .delivery-payment-button{width:68px!important;min-width:68px!important;height:40px!important;min-height:40px!important;padding:0 6px!important}
  .site-header .favorites-button,.site-header .cart-button{width:38px!important;min-width:38px!important;height:40px!important;min-height:40px!important}
}
@media(max-width:340px){
  .site-header{padding-left:8px!important;padding-right:8px!important}
  .site-header .header-actions{gap:3px!important}
  .site-header .brand-line{font-size:9px!important;letter-spacing:.025em!important}
  .site-header .question-button{width:32px;min-width:32px;height:36px;min-height:36px;border-radius:11px}
  .site-header .question-button svg{width:19px;height:19px}
  .site-header .delivery-payment-button{width:60px!important;min-width:60px!important;height:36px!important;min-height:36px!important;padding:0 5px!important}
  .site-header .delivery-payment-icon{width:17px!important;height:17px!important}
  .site-header .delivery-payment-slash{font-size:14px!important}
  .site-header .favorites-button,.site-header .cart-button{width:34px!important;min-width:34px!important;height:36px!important;min-height:36px!important}
}
`;
document.head.appendChild(style);

const questionIcon='<svg aria-hidden="true" viewBox="0 0 28 28" fill="none"><circle cx="14" cy="14" r="10.2" stroke="currentColor" stroke-width="1.8"/><path d="M10.9 10.7a3.35 3.35 0 0 1 6.35 1.5c0 2.45-3.25 2.75-3.25 5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="14" cy="20.2" r="1" fill="currentColor"/></svg>';
const closeIcon='<svg aria-hidden="true" viewBox="0 0 24 24" fill="none"><path d="M7 7l10 10M17 7 7 17" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
const trigger=document.createElement('button');
trigger.id='questionButton';
trigger.className='question-button';
trigger.type='button';
trigger.setAttribute('aria-label','Задать вопрос');
trigger.setAttribute('title','Задать вопрос');
trigger.setAttribute('aria-haspopup','dialog');
trigger.setAttribute('aria-controls','questionDialog');
trigger.innerHTML=questionIcon+'<span class="sr-only">Задать вопрос</span>';
actions.insertBefore(trigger,delivery);

const dialog=document.createElement('dialog');
dialog.id='questionDialog';
dialog.className='question-dialog';
dialog.setAttribute('aria-labelledby','questionDialogTitle');
dialog.innerHTML='<div class="question-dialog-shell"><div class="question-dialog-head"><div><p class="question-dialog-kicker">FORMA HOME</p><h2 class="question-dialog-title" id="questionDialogTitle">Задать вопрос</h2></div><button class="question-close" type="button" data-close-question aria-label="Закрыть">'+closeIcon+'</button></div><label class="question-field" for="questionText">Ваш вопрос<textarea id="questionText" maxlength="1200" placeholder="Напишите, что хотите уточнить о товаре, доставке, оплате или заказе"></textarea></label><p class="question-dialog-hint">Выберите удобный способ отправки. Сообщение откроется уже заполненным — как при оформлении заказа из корзины.</p><div class="question-actions"><button class="question-channel primary" type="button" data-question-channel="whatsapp">Отправить в WhatsApp</button><button class="question-channel" type="button" data-question-channel="telegram">Отправить в Telegram</button><button class="question-channel" type="button" data-question-channel="email">Отправить на почту</button></div><p class="question-error" id="questionError" hidden>Сначала напишите вопрос.</p></div>';
document.body.appendChild(dialog);

const textarea=dialog.querySelector('#questionText');
const error=dialog.querySelector('#questionError');
let previousOverflow='';
function questionText(){return (textarea.value||'').trim()}
function payload(question){
  const page=location.href;
  const intro='Здравствуйте! Хочу задать вопрос по FORMA HOME:';
  return {page,body:`${intro}\n\n${question}\n\nСтраница: ${page}`,telegram:`${intro}\n\n${question}`};
}
function openQuestion(){
  previousOverflow=document.body.style.overflow;
  if(!dialog.open)dialog.showModal();
  document.body.style.overflow='hidden';
  requestAnimationFrame(()=>{try{textarea.focus({preventScroll:true})}catch{textarea.focus()}});
}
trigger.addEventListener('click',openQuestion);
dialog.querySelector('[data-close-question]').addEventListener('click',()=>dialog.close());
dialog.addEventListener('click',event=>{if(event.target===dialog)dialog.close()});
dialog.addEventListener('close',()=>{document.body.style.overflow=previousOverflow;try{trigger.focus({preventScroll:true})}catch{trigger.focus()}});
textarea.addEventListener('input',()=>{if(questionText())error.hidden=true});
dialog.addEventListener('click',event=>{
  const button=event.target.closest('[data-question-channel]');
  if(!button)return;
  const question=questionText();
  if(!question){error.hidden=false;textarea.focus();return}
  error.hidden=true;
  const data=payload(question),channel=button.dataset.questionChannel;
  let url='';
  if(channel==='whatsapp')url='https://wa.me/?text='+encodeURIComponent(data.body);
  if(channel==='telegram')url='https://t.me/share/url?url='+encodeURIComponent(data.page)+'&text='+encodeURIComponent(data.telegram);
  if(channel==='email')url='mailto:'+ORDER_EMAIL+'?subject='+encodeURIComponent('Вопрос FORMA HOME')+'&body='+encodeURIComponent(data.body);
  if(!url)return;
  if(channel==='email')location.href=url;
  else window.open(url,'_blank','noopener');
});
})();
'''
cart.write_text(ctext + question, encoding='utf-8')

assert app.read_text(encoding='utf-8').count('data-reset-all-products') == 2
assert "actions.insertBefore(trigger,delivery)" in cart.read_text(encoding='utf-8')
