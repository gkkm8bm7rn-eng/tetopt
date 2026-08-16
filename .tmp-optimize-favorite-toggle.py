from pathlib import Path

p=Path('app.js')
s=p.read_text(encoding='utf-8')
old="function toggleFavorite(id){state.favorites=state.favorites.includes(id)?state.favorites.filter(x=>x!==id):[...state.favorites,id];storage.write('forma:favorites',state.favorites);updateCounters();applyFilters();renderRecent();toast(state.favorites.includes(id)?'Добавили в избранное':'Убрали из избранного')}"
new="function syncFavoriteButtons(id,active){document.querySelectorAll('[data-favorite]').forEach(button=>{if(String(button.dataset.favorite)!==String(id))return;button.classList.toggle('active',active);button.setAttribute('aria-label',active?'Убрать из избранного':'Добавить в избранное')})}\nfunction toggleFavorite(id){const active=!state.favorites.includes(id);state.favorites=active?[...state.favorites,id]:state.favorites.filter(x=>x!==id);storage.write('forma:favorites',state.favorites);updateCounters();if(state.view==='favorites')applyFilters();renderRecent();syncFavoriteButtons(id,active);toast(active?'Добавили в избранное':'Убрали из избранного')}"
if old not in s:
    raise SystemExit('toggleFavorite pattern not found')
p.write_text(s.replace(old,new,1),encoding='utf-8')
